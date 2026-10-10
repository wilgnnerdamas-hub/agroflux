// Cessão tokenizada + liquidação atômica, SIMULADAS na Devnet (§3.10, §4.6, §4.7, §5.14 e §6.4 do contrato v1.1).
// Token e moeda sem valor; carteiras de demonstração controladas pelo backend. Não é cessão jurídica.
import { AssignmentFailure, ASSIGNMENT_ERROR_MESSAGES, type AssignmentGateway } from "./chain/assignment.js";
import { explorerTxUrl } from "./chain/payload.js";
import { ChainUnavailableError, type Confirmed } from "./chain/solana.js";
import { chainUnavailable, invalidState } from "./errors.js";
import { getReceivable, makeEvent } from "./receivables.js";
import { CONFIRM_TIMEOUT_MS } from "./registration.js";
import type { Store } from "./store.js";
import type { AssignmentErrorCode, Receivable } from "./types.js";

const now = () => new Date().toISOString();
export const explorerAddressUrl = (address: string) => `https://explorer.solana.com/address/${address}?cluster=devnet`;
// Chaves no store: última assinatura enviada de cada etapa (e a mint ainda não confirmada).
const keys = (id: string) => ({ mintSig: `as-mint:${id}`, mintAddr: `as-mintaddr:${id}`, settleSig: `as-settle:${id}` });
const CAN_START: Receivable["status"][] = ["offer_selected", "assignment_failed"];

export class AssignmentService {
  readonly inflight = new Map<string, Promise<void>>();

  constructor(
    private readonly store: Store,
    private readonly gateway: AssignmentGateway,
    private readonly timeoutMs = CONFIRM_TIMEOUT_MS,
    private readonly log: (msg: string, err?: unknown) => void = () => {},
  ) {}

  // §5.14: aceita o pedido (202) e liquida de forma assíncrona.
  async request(id: string, idempotencyKey?: string): Promise<Receivable> {
    const { store } = this;
    const key = idempotencyKey ? `as:${idempotencyKey}` : undefined;
    const sameClick = () => !!key && store.getIdempotency(key) === id;

    if (sameClick()) return getReceivable(store, id);
    const check = (r: Receivable) => {
      if (!CAN_START.includes(r.status)) throw invalidState("A cessão fica disponível depois da seleção de uma oferta simulada.");
    };
    check(getReceivable(store, id));
    try {
      await this.gateway.ping();
    } catch (e) {
      throw chainUnavailable(e instanceof ChainUnavailableError ? e.message : undefined);
    }
    const r = getReceivable(store, id);
    if (sameClick()) return r;
    check(r);

    const offer = store.getOffers(id)?.find((o) => o.id === r.selectedOfferId);
    if (!offer) throw invalidState("A oferta selecionada não foi encontrada.");
    const at = now();
    const { parties } = this.gateway;
    r.status = "assignment_pending";
    r.assignment = {
      ...r.assignment,
      status: "pending",
      offerId: offer.id,
      settlementAmount: offer.netAmountCents,
      settlementMint: parties.settlementMint,
      distributorWallet: parties.distributorWallet,
      funderWallet: parties.funderWallet,
      escrowProgramId: parties.escrowProgramId,
      submittedAt: at,
      error: null,
    };
    r.events.push(
      makeEvent("assignment_requested", "Cessão tokenizada solicitada (simulação na Devnet)", { offerId: offer.id, settlementAmount: offer.netAmountCents }, { occurredAt: at }),
    );
    r.updatedAt = at;
    store.put(r);
    if (key) store.putIdempotency(key, id);
    this.track(id, this.run(id));
    return r;
  }

  resumePending() {
    for (const r of this.store.all()) if (r.status === "assignment_pending") this.track(r.id, this.run(r.id));
  }

  async settle(id?: string) {
    if (id) await this.inflight.get(id);
    else await Promise.all([...this.inflight.values()]);
  }

  private track(id: string, p: Promise<void>) {
    this.inflight.set(id, p.finally(() => this.inflight.delete(id)));
  }

  // Uma assinatura enviada antes (TIMEOUT ou reinício) pode ter entrado na rede: confere antes de enviar outra.
  private async landed(signature: string | undefined): Promise<Confirmed | null> {
    return signature ? this.gateway.checkSignature(signature).catch(() => null) : null;
  }

  private async run(id: string) {
    const k = keys(id);
    try {
      let r = this.store.get(id);
      if (!r || r.status !== "assignment_pending") return;

      // Etapa 1: token da cessão (reaproveitado numa nova tentativa).
      if (!r.assignment.tokenMint) {
        const prevMint = this.store.getSubmission(k.mintAddr);
        const prev = prevMint ? await this.landed(this.store.getSubmission(k.mintSig)) : null;
        const minted = prev && prevMint
          ? { ...prev, mint: prevMint }
          : await this.gateway.mintAssetToken(
              { reference: r.reference, payloadHash: r.chain.payloadHash ?? "" },
              {
                timeoutMs: this.timeoutMs,
                onSubmitted: (sig, mint) => {
                  this.store.putSubmission(k.mintSig, sig);
                  this.store.putSubmission(k.mintAddr, mint);
                },
              },
            );
        if (!this.markMinted(id, minted)) return;
        r = this.store.get(id)!;
      }

      // Etapa 2: liquidação atômica pelo escrow.
      const a = r.assignment;
      const settled =
        (await this.landed(this.store.getSubmission(k.settleSig))) ??
        (await this.gateway.settle(
          { assetMint: a.tokenMint!, amount: a.settlementAmount! },
          { timeoutMs: this.timeoutMs, onSubmitted: (sig) => this.store.putSubmission(k.settleSig, sig) },
        ));
      this.markSettled(id, settled);
    } catch (e) {
      if (!(e instanceof AssignmentFailure)) this.log("Erro inesperado na cessão tokenizada", e);
      const f = e instanceof AssignmentFailure ? e : new AssignmentFailure("TX_FAILED");
      this.markFailed(id, f.code);
    }
  }

  // Os métodos abaixo ignoram recebíveis apagados ou fora de `assignment_pending` (ex.: /demo/reset no meio).
  private markMinted(id: string, m: Confirmed & { mint: string }): boolean {
    const r = this.store.get(id);
    if (!r || r.status !== "assignment_pending") return false;
    const at = now();
    const txUrl = explorerTxUrl(m.signature);
    r.assignment = {
      ...r.assignment,
      tokenMint: m.mint,
      mintSignature: m.signature,
      explorerUrls: { ...r.assignment.explorerUrls, tokenMint: explorerAddressUrl(m.mint), mint: txUrl },
    };
    r.events.push(
      makeEvent("assignment_token_minted", "Token da cessão criado na Solana Devnet (Token-2022, supply 1)", { tokenMint: m.mint, signature: m.signature }, {
        actor: "system",
        onChain: true,
        chain: { signature: m.signature, explorerUrl: txUrl },
        occurredAt: at,
      }),
    );
    r.updatedAt = at;
    this.store.put(r);
    return true;
  }

  private markSettled(id: string, c: Confirmed) {
    const r = this.store.get(id);
    if (!r || r.status !== "assignment_pending") return;
    const at = now();
    const txUrl = explorerTxUrl(c.signature);
    r.status = "assigned";
    r.assignment = {
      ...r.assignment,
      status: "settled",
      settlementSignature: c.signature,
      settledAt: c.blockTime ?? at,
      explorerUrls: { ...r.assignment.explorerUrls, settlement: txUrl },
      error: null,
    };
    r.events.push(
      makeEvent(
        "assignment_settled",
        "Liquidação atômica confirmada na Solana Devnet (simulação, tBRL-DEMO sem valor)",
        { signature: c.signature, settlementAmount: r.assignment.settlementAmount, settlementAsset: "tBRL-DEMO" },
        { actor: "system", onChain: true, chain: { signature: c.signature, explorerUrl: txUrl }, occurredAt: at },
      ),
    );
    r.updatedAt = at;
    this.store.put(r);
  }

  private markFailed(id: string, code: AssignmentErrorCode) {
    const r = this.store.get(id);
    if (!r || r.status !== "assignment_pending") return;
    const message = ASSIGNMENT_ERROR_MESSAGES[code];
    r.status = "assignment_failed";
    r.assignment = { ...r.assignment, status: "failed", error: { code, message } };
    r.events.push(makeEvent("assignment_failed", "Falha na cessão tokenizada (nenhuma transferência foi feita)", { code, message }, { actor: "system" }));
    r.updatedAt = now();
    this.store.put(r);
  }
}
