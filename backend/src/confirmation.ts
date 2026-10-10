// Confirmação do sacado, SIMULADA (§3.9, §4.5, §5.10–5.13 e §6.3 do contrato v1.1).
// Não há verificação de identidade: quem tem o link responde pelo sacado.
import { createHash, randomBytes } from "node:crypto";
import { anchorMemo, resumeAnchor } from "./chain/anchor.js";
import { buildConfirmationMemo, confirmationHash, explorerTxUrl } from "./chain/payload.js";
import { CHAIN_ERROR_MESSAGES, ChainFailure, ChainUnavailableError, type ChainGateway, type Confirmed } from "./chain/solana.js";
import { ApiError, chainUnavailable, invalidState, notFound } from "./errors.js";
import { getReceivable, makeEvent } from "./receivables.js";
import { CONFIRM_TIMEOUT_MS } from "./registration.js";
import type { ConfirmationToken, Store } from "./store.js";
import type { ChainErrorCode, ConfirmationSummary, DebtorConfirmationRequest, Receivable } from "./types.js";

export const CONFIRMATION_DISCLAIMER = "Simulação — sem verificação de identidade do sacado.";
const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const now = () => new Date().toISOString();
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
// Chave da ancoragem no store, separada da chave do registro do recebível.
const anchorKey = (id: string) => `dc:${id}`;

function summary(r: Receivable, t: ConfirmationToken): ConfirmationSummary {
  return {
    isSimulated: true,
    disclaimer: CONFIRMATION_DISCLAIMER,
    reference: r.reference,
    distributor: r.distributor,
    product: r.product,
    amountCents: r.amountCents,
    currency: r.currency,
    dueDate: r.dueDate,
    status: r.debtorConfirmation.status,
    expiresAt: t.expiresAt,
    registryId: r.registry.registryId,
    paymentDomicile: r.registry.paymentDomicile,
  };
}

export class ConfirmationService {
  // Ancoragens em andamento, por recebível. Os testes aguardam estas promessas.
  readonly inflight = new Map<string, Promise<void>>();

  constructor(
    private readonly store: Store,
    private readonly chain: ChainGateway,
    private readonly timeoutMs = CONFIRM_TIMEOUT_MS,
    private readonly log: (msg: string, err?: unknown) => void = () => {},
  ) {}

  // §5.10: gera um link novo e invalida o anterior.
  request(id: string): DebtorConfirmationRequest {
    const r = getReceivable(this.store, id);
    if (r.status !== "registered") {
      throw invalidState("A confirmação do sacado fica disponível depois do registro na Devnet e antes da seleção da oferta.");
    }
    if (r.debtorConfirmation.status === "confirmed") throw invalidState("O sacado já confirmou este recebível.");

    const token = randomBytes(32).toString("base64url");
    const at = now();
    const expiresAt = new Date(Date.now() + LINK_TTL_MS).toISOString();
    this.store.putConfirmationToken(hashToken(token), { receivableId: id, expiresAt, state: "active" });

    r.debtorConfirmation = { ...r.debtorConfirmation, status: "requested", requestedAt: at, expiresAt, respondedAt: null, chain: null };
    r.events.push(makeEvent("debtor_confirmation_requested", "Confirmação solicitada ao sacado (simulação)", { expiresAt }, { occurredAt: at }));
    r.updatedAt = at;
    this.store.put(r);
    return { token, confirmationPath: `/confirmar/${token}`, expiresAt, receivable: r };
  }

  // Resolve o token. `forAnswer` exige link ainda não usado.
  private resolve(token: string, forAnswer: boolean) {
    const hash = hashToken(token);
    const t = this.store.getConfirmationToken(hash);
    const r = t && this.store.get(t.receivableId);
    if (!t || !r) throw notFound("Link de confirmação não encontrado.");
    const expired = t.state === "revoked" || (t.state === "active" && Date.parse(t.expiresAt) < Date.now());
    if (expired) throw new ApiError(410, "CONFIRMATION_LINK_EXPIRED", "Este link de confirmação venceu ou foi substituído por um mais novo.");
    if (forAnswer && t.state === "used") {
      throw new ApiError(409, "CONFIRMATION_ALREADY_ANSWERED", "Este link de confirmação já foi usado.");
    }
    return { hash, t, r };
  }

  // §5.11
  getSummary(token: string): ConfirmationSummary {
    const { t, r } = this.resolve(token, false);
    return summary(r, t);
  }

  // §5.12: o sacado confirma. O memo vai para a Devnet de forma assíncrona.
  confirm(token: string): ConfirmationSummary {
    const { hash, t, r } = this.resolve(token, true);
    if (r.status !== "registered" || r.debtorConfirmation.status !== "requested") throw invalidState();
    this.store.markConfirmationToken(hash, "used");

    const respondedAt = now();
    const ch = confirmationHash(r, respondedAt);
    r.debtorConfirmation = {
      ...r.debtorConfirmation,
      status: "confirmed",
      respondedAt,
      chain: { status: "pending", signature: null, explorerUrl: null, memo: buildConfirmationMemo(r, ch), confirmationHash: ch, error: null },
    };
    r.updatedAt = respondedAt;
    this.store.put(r);
    this.track(r.id, this.run(r.id));
    return summary(r, t);
  }

  // §5.12: o sacado recusa. A recusa não vai on-chain.
  decline(token: string): ConfirmationSummary {
    const { hash, t, r } = this.resolve(token, true);
    if (r.status !== "registered" || r.debtorConfirmation.status !== "requested") throw invalidState();
    this.store.markConfirmationToken(hash, "used");
    const at = now();
    r.debtorConfirmation = { ...r.debtorConfirmation, status: "declined", respondedAt: at };
    r.events.push(makeEvent("debtor_declined", "Sacado recusou o recebível (simulação)", {}, { actor: "system", occurredAt: at }));
    r.updatedAt = at;
    this.store.put(r);
    return summary(r, t);
  }

  // §5.13: repete o registro on-chain de uma confirmação que falhou.
  async retryRegister(id: string, idempotencyKey?: string): Promise<Receivable> {
    const { store } = this;
    const key = idempotencyKey ? `dc:${idempotencyKey}` : undefined;
    const sameClick = () => !!key && store.getIdempotency(key) === id;
    const canRetry = (r: Receivable) => r.debtorConfirmation.status === "confirmed" && r.debtorConfirmation.chain?.status === "failed";

    if (sameClick()) return getReceivable(store, id);
    if (!canRetry(getReceivable(store, id))) throw invalidState("Não há registro de confirmação com falha para repetir.");
    try {
      await this.chain.ping();
    } catch (e) {
      throw chainUnavailable(e instanceof ChainUnavailableError ? e.message : undefined);
    }
    const r = getReceivable(store, id);
    if (sameClick()) return r;
    if (!canRetry(r)) throw invalidState("Não há registro de confirmação com falha para repetir.");

    r.debtorConfirmation.chain = { ...r.debtorConfirmation.chain!, status: "pending", signature: null, explorerUrl: null, error: null };
    r.updatedAt = now();
    store.put(r);
    if (key) store.putIdempotency(key, id);
    this.track(id, this.run(id));
    return r;
  }

  // Ao subir o servidor: ancoragens que ficaram pendentes voltam a ser acompanhadas.
  resumePending() {
    for (const r of this.store.all()) {
      if (r.debtorConfirmation.chain?.status === "pending") this.track(r.id, this.resume(r.id));
    }
  }

  private track(id: string, p: Promise<void>) {
    const tracked = p.finally(() => this.inflight.delete(id));
    this.inflight.set(id, tracked);
  }

  async settle(id?: string) {
    if (id) await this.inflight.get(id);
    else await Promise.all([...this.inflight.values()]);
  }

  private async run(id: string) {
    try {
      const memo = getReceivable(this.store, id).debtorConfirmation.chain!.memo!;
      this.markConfirmed(id, await anchorMemo(this.store, this.chain, anchorKey(id), memo, this.timeoutMs));
    } catch (e) {
      if (!(e instanceof ChainFailure)) this.log("Erro inesperado ao registrar a confirmação do sacado", e);
      const f = e instanceof ChainFailure ? e : new ChainFailure("TX_FAILED");
      this.markFailed(id, f.code, f.signature);
    }
  }

  private async resume(id: string) {
    const { confirmed, signature } = await resumeAnchor(this.store, this.chain, anchorKey(id), this.timeoutMs);
    if (confirmed) this.markConfirmed(id, confirmed);
    else this.markFailed(id, "TIMEOUT", signature);
  }

  // Os dois métodos abaixo ignoram recebíveis apagados (ex.: /demo/reset no meio da ancoragem).
  private markConfirmed(id: string, c: Confirmed) {
    const r = this.store.get(id);
    const chain = r?.debtorConfirmation.chain;
    if (!r || chain?.status !== "pending") return;
    const explorerUrl = explorerTxUrl(c.signature);
    const at = now();
    r.debtorConfirmation.chain = { ...chain, status: "confirmed", signature: c.signature, explorerUrl, error: null };
    r.events.push(
      makeEvent(
        "debtor_confirmed",
        "Confirmação do sacado registrada na Solana Devnet (simulação)",
        { signature: c.signature, confirmationHash: chain.confirmationHash },
        { actor: "system", onChain: true, chain: { signature: c.signature, explorerUrl }, occurredAt: at },
      ),
    );
    r.updatedAt = at;
    this.store.put(r);
  }

  private markFailed(id: string, code: ChainErrorCode, signature: string | null) {
    const r = this.store.get(id);
    const chain = r?.debtorConfirmation.chain;
    if (!r || chain?.status !== "pending") return;
    const message = CHAIN_ERROR_MESSAGES[code];
    r.debtorConfirmation.chain = { ...chain, status: "failed", signature, explorerUrl: signature ? explorerTxUrl(signature) : null, error: { code, message } };
    r.events.push(makeEvent("debtor_confirmation_chain_failed", "Falha ao registrar a confirmação do sacado na Devnet", { code, message }, { actor: "system" }));
    r.updatedAt = now();
    this.store.put(r);
  }
}
