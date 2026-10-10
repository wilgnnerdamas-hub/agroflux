// Cessão tokenizada + liquidação atômica, SIMULADAS na Devnet (§3.10, §4.6, §4.7, §5.14, §5.22 e §6.4–6.5 do contrato v1.2).
// Token e moeda sem valor; carteiras de demonstração controladas pelo backend. Não é cessão jurídica.
import { AssignmentFailure, ASSIGNMENT_ERROR_MESSAGES, type AssignmentGateway } from "./chain/assignment.js";
import { explorerTxUrl } from "./chain/payload.js";
import { ChainUnavailableError, type Confirmed } from "./chain/solana.js";
import { chainUnavailable, invalidState } from "./errors.js";
import { FUNDER_IDS, funderDef, isFunderId } from "./funders.js";
import { getReceivable, makeEvent } from "./receivables.js";
import { CONFIRM_TIMEOUT_MS } from "./registration.js";
import type { Store } from "./store.js";
import type { AssignmentErrorCode, DoubleSpendProof, FunderId, Receivable } from "./types.js";

const now = () => new Date().toISOString();
export const explorerAddressUrl = (address: string) => `https://explorer.solana.com/address/${address}?cluster=devnet`;
// Chaves no store: última assinatura enviada de cada etapa (e a mint ainda não confirmada).
const keys = (id: string) => ({ mintSig: `as-mint:${id}`, mintAddr: `as-mintaddr:${id}`, settleSig: `as-settle:${id}` });
const CAN_START: Receivable["status"][] = ["offer_selected", "assignment_failed"];
// Valor simbólico da tentativa de segunda cessão (1,00 tBRL-DEMO); o escrow recusa antes de transferir qualquer coisa.
const DOUBLE_SPEND_AMOUNT = 100;

export const DOUBLE_SPEND_REASON =
  "Documento já cedido: a trava on-chain deste documento já existe. A Solana recusou a segunda cessão e nenhuma transferência foi feita.";

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
      if (!CAN_START.includes(r.status)) throw invalidState("A cessão fica disponível depois que uma proposta é aceita.");
    };
    check(getReceivable(store, id));
    await this.ping();
    const r = getReceivable(store, id);
    if (sameClick()) return r;
    check(r);

    const offer = store.getOffers(id)?.find((o) => o.id === r.selectedOfferId);
    if (!offer) throw invalidState("A proposta aceita não foi encontrada.");
    // Dados antigos (v1.1) não têm o id do financiador: o financiador A responde por eles.
    const funderId: FunderId = isFunderId(offer.funder.id) ? offer.funder.id : "fnd_a";
    const at = now();
    const { parties } = this.gateway;
    const documentLock = this.gateway.documentLockAddress(r.documents[0].sha256);
    r.status = "assignment_pending";
    r.assignment = {
      ...r.assignment,
      status: "pending",
      offerId: offer.id,
      settlementAmount: offer.netAmountCents,
      settlementMint: parties.settlementMint,
      distributorWallet: parties.distributorWallet,
      funderWallet: parties.funderWallets[funderId] ?? null,
      funderId,
      funderName: funderDef(funderId).name,
      escrowProgramId: parties.escrowProgramId,
      documentLock,
      explorerUrls: { ...r.assignment.explorerUrls, documentLock: explorerAddressUrl(documentLock) },
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

  // §5.22: prova de recusa. Cria outro token para o mesmo documento e tenta liquidá-lo com outro financiador.
  async requestDoubleSpendProof(id: string): Promise<Receivable> {
    const check = (r: Receivable) => {
      if (r.status !== "assigned") throw invalidState("A prova de recusa fica disponível depois da cessão liquidada.");
      const p = r.assignment.doubleSpendProof;
      if (p && p.status !== "error") throw invalidState(p.status === "pending" ? "A prova de recusa já está em andamento." : "A prova de recusa já foi feita.");
    };
    check(getReceivable(this.store, id));
    await this.ping();
    const r = getReceivable(this.store, id);
    check(r);
    const funderId = FUNDER_IDS.find((f) => f !== r.assignment.funderId && this.gateway.parties.funderWallets[f]) ?? null;
    r.assignment.doubleSpendProof = {
      status: "pending",
      attemptedAt: now(),
      tokenMint: null,
      funderId,
      signature: null,
      explorerUrl: null,
      reason: null,
      error: null,
    };
    r.updatedAt = now();
    this.store.put(r);
    this.track(`ds:${id}`, this.runDoubleSpend(id));
    return r;
  }

  resumePending() {
    for (const r of this.store.all()) {
      if (r.status === "assignment_pending") this.track(r.id, this.run(r.id));
      // Uma prova interrompida por reinício não é retomada: fica em erro e pode ser refeita.
      if (r.assignment.doubleSpendProof?.status === "pending") this.markProof(r.id, { status: "error", error: this.err("TIMEOUT") });
    }
  }

  async settle(id?: string) {
    if (id) await Promise.all([this.inflight.get(id), this.inflight.get(`ds:${id}`)]);
    else await Promise.all([...this.inflight.values()]);
  }

  private async ping() {
    try {
      await this.gateway.ping();
    } catch (e) {
      throw chainUnavailable(e instanceof ChainUnavailableError ? e.message : undefined);
    }
  }

  private track(id: string, p: Promise<void>) {
    this.inflight.set(id, p.finally(() => this.inflight.delete(id)));
  }

  private err(code: AssignmentErrorCode, message = ASSIGNMENT_ERROR_MESSAGES[code]) {
    return { code, message };
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

      // Etapa 2: liquidação atômica pelo escrow, com a trava do documento.
      const a = r.assignment;
      const settled =
        (await this.landed(this.store.getSubmission(k.settleSig))) ??
        (await this.gateway.settle(
          { assetMint: a.tokenMint!, amount: a.settlementAmount!, funderId: a.funderId ?? "fnd_a", documentSha256: r.documents[0].sha256 },
          { timeoutMs: this.timeoutMs, onSubmitted: (sig) => this.store.putSubmission(k.settleSig, sig) },
        ));
      this.markSettled(id, settled);
    } catch (e) {
      if (!(e instanceof AssignmentFailure)) this.log("Erro inesperado na cessão tokenizada", e);
      const f = e instanceof AssignmentFailure ? e : new AssignmentFailure("TX_FAILED");
      this.markFailed(id, f.code);
    }
  }

  private async runDoubleSpend(id: string) {
    try {
      const r = this.store.get(id);
      const proof = r?.assignment.doubleSpendProof;
      if (!r || proof?.status !== "pending") return;
      if (!proof.funderId) throw new AssignmentFailure("ESCROW_REJECTED");
      const minted = await this.gateway.mintAssetToken(
        { reference: `${r.reference}-T`, payloadHash: r.chain.payloadHash ?? "" },
        { timeoutMs: this.timeoutMs, onSubmitted: (_sig, mint) => this.markProof(id, { tokenMint: mint }) },
      );
      this.markProof(id, { tokenMint: minted.mint });
      const attempt = await this.gateway.attemptDoubleSettle(
        { assetMint: minted.mint, amount: DOUBLE_SPEND_AMOUNT, funderId: proof.funderId, documentSha256: r.documents[0].sha256 },
        { timeoutMs: this.timeoutMs, onSubmitted: (sig) => this.markProof(id, { signature: sig, explorerUrl: explorerTxUrl(sig) }) },
      );
      const explorerUrl = explorerTxUrl(attempt.signature);
      if (attempt.rejectedByDocumentLock) {
        this.markProof(id, { status: "rejected", signature: attempt.signature, explorerUrl, reason: DOUBLE_SPEND_REASON }, true);
      } else {
        // Recusada por outro motivo, ou (defeito) aceita: a prova não vale.
        const message = attempt.landedWithError
          ? "A segunda tentativa falhou por outro motivo, não pela trava do documento. A prova não foi concluída."
          : "ATENÇÃO: a segunda liquidação foi aceita pela rede. A trava do documento não funcionou.";
        this.markProof(id, { status: "error", signature: attempt.signature, explorerUrl, error: this.err("TX_FAILED", message) });
      }
    } catch (e) {
      if (!(e instanceof AssignmentFailure)) this.log("Erro inesperado na prova de recusa", e);
      const f = e instanceof AssignmentFailure ? e : new AssignmentFailure("TX_FAILED");
      this.markProof(id, { status: "error", error: this.err(f.code) });
    }
  }

  private markProof(id: string, patch: Partial<DoubleSpendProof>, withEvent = false) {
    const r = this.store.get(id);
    const proof = r?.assignment.doubleSpendProof;
    if (!r || !proof || proof.status !== "pending") return;
    const next = { ...proof, ...patch };
    r.assignment.doubleSpendProof = next;
    if (withEvent && next.signature) {
      r.events.push(
        makeEvent(
          "double_assignment_rejected",
          "Prova de recusa: a Solana recusou uma segunda cessão do mesmo documento",
          { signature: next.signature, tokenMint: next.tokenMint, funderId: next.funderId },
          { actor: "system", onChain: true, chain: { signature: next.signature, explorerUrl: next.explorerUrl! } },
        ),
      );
    }
    r.updatedAt = now();
    this.store.put(r);
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
    // §5.14 (v1.2): a registradora simulada passa o crédito ao financiador e atualiza o domicílio de pagamento.
    const funderName = r.assignment.funderName ?? "Financiador demo";
    r.registry = {
      ...r.registry,
      creditor: { kind: "funder", name: funderName, wallet: r.assignment.funderWallet },
      paymentDomicile: {
        payeeName: funderName,
        instruction: `Pagar ao credor atual: ${funderName} (simulado). Pagamentos à distribuidora não quitam este título.`,
        updatedAt: at,
      },
    };
    r.events.push(
      makeEvent(
        "registry_creditor_updated",
        `Registradora (simulada): credor atualizado para ${funderName} e domicílio de pagamento alterado`,
        { registryId: r.registry.registryId, funderId: r.assignment.funderId, funderName },
        { actor: "system", occurredAt: at },
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
