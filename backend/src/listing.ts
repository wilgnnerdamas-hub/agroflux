// Publicação para financiadores com termo de coobrigação SIMULADO (§3.12, §5.15–5.17 e §6.6 do contrato v1.2).
// registered (+ aceite do sacado on-chain) ──publish──▶ published. O hash do termo vai para a Devnet por memo.
import { anchorMemo, resumeAnchor } from "./chain/anchor.js";
import { buildTermsMemo, explorerTxUrl, termsHash } from "./chain/payload.js";
import { CHAIN_ERROR_MESSAGES, ChainFailure, ChainUnavailableError, type ChainGateway, type Confirmed } from "./chain/solana.js";
import { ApiError, chainUnavailable, invalidState } from "./errors.js";
import { generateAutomaticOffers } from "./offers.js";
import { getReceivable, makeEvent, sha256Hex } from "./receivables.js";
import { CONFIRM_TIMEOUT_MS } from "./registration.js";
import type { PricingService } from "./pricing/service.js";
import type { Store } from "./store.js";
import type { ChainErrorCode, Receivable, Terms } from "./types.js";

export const TERMS_VERSION = "coobrigacao-demo-v1";
export const TERMS_TEXT = [
  "TERMO DE COOBRIGAÇÃO — DEMONSTRAÇÃO (SIMULADO, SEM VALOR JURÍDICO)",
  "1. A Distribuidora Demo declara que este recebível corresponde a uma venda de insumos (nesta demonstração, fictícia), registrada na Registradora Demo (simulada) e aceita pelo sacado.",
  "2. A Distribuidora Demo se compromete a não ceder, vender ou dar em garantia este mesmo recebível a terceiros, dentro ou fora da AgroFlux.",
  "3. Se o recebível for cedido, a Distribuidora Demo responde solidariamente pela existência do crédito e pelo pagamento (coobrigação), e o sacado passa a pagar ao credor indicado pela registradora.",
  "4. A Distribuidora Demo reconhece que ceder o mesmo título duas vezes configura fraude.",
  "Este termo é uma simulação feita para o hackathon Crypto World's Fair (Colosseum). Não cria nenhuma obrigação jurídica.",
].join("\n");
export const TERMS_TEXT_SHA256 = sha256Hex(TERMS_TEXT);

export const getTerms = (): Terms => ({ isSimulated: true, version: TERMS_VERSION, text: TERMS_TEXT, textSha256: TERMS_TEXT_SHA256 });

const now = () => new Date().toISOString();
const anchorKey = (id: string) => `ls:${id}`;

export class ListingService {
  readonly inflight = new Map<string, Promise<void>>();

  constructor(
    private readonly store: Store,
    private readonly chain: ChainGateway,
    private readonly pricing: PricingService,
    private readonly timeoutMs = CONFIRM_TIMEOUT_MS,
    private readonly log: (msg: string, err?: unknown) => void = () => {},
  ) {}

  // §5.16
  async publish(id: string, body: unknown, idempotencyKey?: string): Promise<Receivable> {
    const { store } = this;
    const key = idempotencyKey ? `ls:${idempotencyKey}` : undefined;
    const sameClick = () => !!key && store.getIdempotency(key) === id;
    if (sameClick()) return getReceivable(store, id);

    const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    if (b.acceptTerms !== true || b.termsVersion !== TERMS_VERSION) {
      throw new ApiError(422, "VALIDATION_ERROR", "Alguns campos precisam de ajuste.", {
        acceptTerms: "Para publicar, aceite o termo de coobrigação (simulado) na versão atual.",
      });
    }
    const check = (r: Receivable) => {
      if (r.status !== "registered") {
        throw invalidState(r.status === "published" ? "Este recebível já está publicado." : "A publicação fica disponível depois do registro na Devnet.");
      }
      const dc = r.debtorConfirmation;
      if (dc.status !== "confirmed" || dc.chain?.status !== "confirmed") {
        throw new ApiError(
          409,
          "DEBTOR_CONFIRMATION_REQUIRED",
          dc.status === "confirmed"
            ? "O aceite do sacado ainda está sendo registrado na Devnet."
            : "Antes de publicar, o sacado precisa aceitar o título na registradora (simulada).",
        );
      }
    };
    check(getReceivable(store, id));
    try {
      await this.chain.ping();
    } catch (e) {
      throw chainUnavailable(e instanceof ChainUnavailableError ? e.message : undefined);
    }
    // O preço das propostas automáticas usa o CDI do dia (consulta externa com cache).
    await this.pricing.reference();
    const r = getReceivable(store, id);
    if (sameClick()) return r;
    check(r);

    const acceptedAt = now();
    const terms = { version: TERMS_VERSION, textSha256: TERMS_TEXT_SHA256, acceptedAt };
    const th = termsHash(r, terms);
    r.status = "published";
    r.listing = {
      status: "published",
      publishedAt: acceptedAt,
      terms: { ...terms, termsHash: th },
      chain: { status: "pending", signature: null, explorerUrl: null, memo: buildTermsMemo(r, th), error: null },
    };
    r.events.push(
      makeEvent("listing_published", "Publicado para financiadores com termo de coobrigação aceito (simulação)", { termsHash: th, termsVersion: TERMS_VERSION }, { occurredAt: acceptedAt }),
    );
    r.updatedAt = acceptedAt;
    store.put(r);
    await generateAutomaticOffers(store, this.pricing, r);
    store.put(r);
    if (key) store.putIdempotency(key, id);
    this.track(id, this.run(id));
    return r;
  }

  // §5.17
  async retryRegister(id: string, idempotencyKey?: string): Promise<Receivable> {
    const { store } = this;
    const key = idempotencyKey ? `lsr:${idempotencyKey}` : undefined;
    const sameClick = () => !!key && store.getIdempotency(key) === id;
    const canRetry = (r: Receivable) => r.listing.status === "published" && r.listing.chain?.status === "failed";
    if (sameClick()) return getReceivable(store, id);
    if (!canRetry(getReceivable(store, id))) throw invalidState("Não há registro do termo com falha para repetir.");
    try {
      await this.chain.ping();
    } catch (e) {
      throw chainUnavailable(e instanceof ChainUnavailableError ? e.message : undefined);
    }
    const r = getReceivable(store, id);
    if (sameClick()) return r;
    if (!canRetry(r)) throw invalidState("Não há registro do termo com falha para repetir.");
    r.listing.chain = { ...r.listing.chain!, status: "pending", signature: null, explorerUrl: null, error: null };
    r.updatedAt = now();
    store.put(r);
    if (key) store.putIdempotency(key, id);
    this.track(id, this.run(id));
    return r;
  }

  resumePending() {
    for (const r of this.store.all()) {
      if (r.listing.chain?.status === "pending") this.track(r.id, this.resume(r.id));
    }
  }

  async settle(id?: string) {
    if (id) await this.inflight.get(id);
    else await Promise.all([...this.inflight.values()]);
  }

  private track(id: string, p: Promise<void>) {
    this.inflight.set(id, p.finally(() => this.inflight.delete(id)));
  }

  private async run(id: string) {
    try {
      const memo = getReceivable(this.store, id).listing.chain!.memo!;
      this.markConfirmed(id, await anchorMemo(this.store, this.chain, anchorKey(id), memo, this.timeoutMs));
    } catch (e) {
      if (!(e instanceof ChainFailure)) this.log("Erro inesperado ao registrar o termo de coobrigação", e);
      const f = e instanceof ChainFailure ? e : new ChainFailure("TX_FAILED");
      this.markFailed(id, f.code, f.signature);
    }
  }

  private async resume(id: string) {
    const { confirmed, signature } = await resumeAnchor(this.store, this.chain, anchorKey(id), this.timeoutMs);
    if (confirmed) this.markConfirmed(id, confirmed);
    else this.markFailed(id, "TIMEOUT", signature);
  }

  private markConfirmed(id: string, c: Confirmed) {
    const r = this.store.get(id);
    const chain = r?.listing.chain;
    if (!r || chain?.status !== "pending") return;
    const explorerUrl = explorerTxUrl(c.signature);
    const at = now();
    r.listing.chain = { ...chain, status: "confirmed", signature: c.signature, explorerUrl, error: null };
    r.events.push(
      makeEvent("listing_terms_anchored", "Termo de coobrigação registrado na Solana Devnet (simulação)", { signature: c.signature, termsHash: r.listing.terms?.termsHash }, {
        actor: "system",
        onChain: true,
        chain: { signature: c.signature, explorerUrl },
        occurredAt: at,
      }),
    );
    r.updatedAt = at;
    this.store.put(r);
  }

  private markFailed(id: string, code: ChainErrorCode, signature: string | null) {
    const r = this.store.get(id);
    const chain = r?.listing.chain;
    if (!r || chain?.status !== "pending") return;
    const message = CHAIN_ERROR_MESSAGES[code];
    r.listing.chain = { ...chain, status: "failed", signature, explorerUrl: signature ? explorerTxUrl(signature) : null, error: { code, message } };
    r.events.push(makeEvent("listing_chain_failed", "Falha ao registrar o termo de coobrigação na Devnet", { code, message }, { actor: "system" }));
    r.updatedAt = now();
    this.store.put(r);
  }
}
