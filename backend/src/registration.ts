// Registro do recebível na Solana Devnet (§5.5 e §6 do contrato).
// created | registration_failed ──register──▶ registration_pending ──▶ registered | registration_failed
import { buildMemo, explorerTxUrl, MEMO_PROGRAM_ID, payloadHash } from "./chain/payload.js";
import { CHAIN_ERROR_MESSAGES, ChainFailure, ChainUnavailableError, type ChainGateway, type Confirmed } from "./chain/solana.js";
import { chainUnavailable, invalidState } from "./errors.js";
import { getReceivable, makeEvent } from "./receivables.js";
import type { Store } from "./store.js";
import type { ChainErrorCode, Receivable } from "./types.js";

export const CONFIRM_TIMEOUT_MS = 60_000;
const RESUME_POLL_MS = 2_000;
const now = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function assertCanRegister(r: Receivable) {
  if (r.status !== "created" && r.status !== "registration_failed") {
    throw invalidState(
      r.status === "registration_pending"
        ? "O registro deste recebível já está em andamento."
        : "Este recebível já foi registrado na Devnet.",
    );
  }
}

export class Registrar {
  // Tentativas em andamento, por recebível. Os testes aguardam estas promessas.
  readonly inflight = new Map<string, Promise<void>>();

  constructor(
    private readonly store: Store,
    private readonly chain: ChainGateway,
    private readonly timeoutMs = CONFIRM_TIMEOUT_MS,
    private readonly log: (msg: string, err?: unknown) => void = () => {},
  ) {}

  async register(id: string, idempotencyKey?: string): Promise<Receivable> {
    const { store } = this;
    const sameClick = () => !!idempotencyKey && store.getIdempotency(idempotencyKey) === id;

    if (sameClick()) return getReceivable(store, id);
    assertCanRegister(getReceivable(store, id));

    try {
      await this.chain.ping();
    } catch (e) {
      // RPC fora antes do envio: o estado não muda.
      throw chainUnavailable(e instanceof ChainUnavailableError ? e.message : undefined);
    }

    // Revalida depois do await: outra requisição pode ter passado na frente.
    const r = getReceivable(store, id);
    if (sameClick()) return r;
    assertCanRegister(r);

    const ph = payloadHash(r);
    r.status = "registration_pending";
    r.chain = {
      status: "pending",
      cluster: "devnet",
      signature: null,
      slot: null,
      blockTime: null,
      explorerUrl: null,
      programId: MEMO_PROGRAM_ID,
      memo: buildMemo(r, ph),
      payloadHash: ph,
      submittedAt: now(),
      confirmedAt: null,
      error: null,
    };
    r.events.push(makeEvent("chain_registration_requested", "Registro na Solana Devnet solicitado", { payloadHash: ph }));
    r.updatedAt = now();
    store.put(r);
    if (idempotencyKey) store.putIdempotency(idempotencyKey, id);

    this.track(id, this.run(id));
    return r;
  }

  // Ao subir o servidor: recebíveis que ficaram pendentes voltam a ser acompanhados.
  resumePending() {
    for (const r of this.store.all()) {
      if (r.status === "registration_pending") this.track(r.id, this.resume(r.id));
    }
  }

  private track(id: string, p: Promise<void>) {
    const tracked = p.finally(() => this.inflight.delete(id));
    this.inflight.set(id, tracked);
  }

  private async run(id: string) {
    const { store, chain } = this;
    try {
      // Uma tentativa anterior pode ter dado TIMEOUT e entrado na rede depois: confere antes de enviar outra.
      const previous = store.getSubmission(id);
      const landed = previous ? await chain.checkSignature(previous).catch(() => null) : null;
      const confirmed =
        landed ??
        (await chain.sendMemo(getReceivable(store, id).chain.memo!, {
          timeoutMs: this.timeoutMs,
          onSubmitted: (sig) => store.putSubmission(id, sig),
        }));
      this.markConfirmed(id, confirmed);
    } catch (e) {
      if (!(e instanceof ChainFailure)) this.log("Erro inesperado no registro on-chain", e);
      const f = e instanceof ChainFailure ? e : new ChainFailure("TX_FAILED");
      this.markFailed(id, f.code, f.signature);
    }
  }

  // Espera as tentativas em andamento (usado pelo seed da demo e pelos testes).
  async settle(id?: string) {
    if (id) await this.inflight.get(id);
    else await Promise.all([...this.inflight.values()]);
  }

  private async resume(id: string) {
    const signature = this.store.getSubmission(id);
    const deadline = Date.now() + this.timeoutMs;
    while (signature && Date.now() < deadline) {
      const confirmed = await this.chain.checkSignature(signature).catch(() => null);
      if (confirmed) return this.markConfirmed(id, confirmed);
      await sleep(RESUME_POLL_MS);
    }
    this.markFailed(id, "TIMEOUT", signature ?? null);
  }

  // Os dois métodos abaixo ignoram recebíveis que sumiram (por exemplo, apagados por /demo/reset no meio da tentativa).
  private markConfirmed(id: string, c: Confirmed) {
    const r = this.store.get(id);
    if (r?.status !== "registration_pending") return;
    const explorerUrl = explorerTxUrl(c.signature);
    const at = now();
    r.status = "registered";
    r.chain = { ...r.chain, status: "confirmed", signature: c.signature, slot: c.slot, blockTime: c.blockTime, explorerUrl, confirmedAt: at, error: null };
    r.events.push(
      makeEvent(
        "chain_registration_confirmed",
        "Registro confirmado na Solana Devnet",
        { signature: c.signature, slot: c.slot },
        { actor: "system", onChain: true, chain: { signature: c.signature, explorerUrl }, occurredAt: at },
      ),
    );
    r.updatedAt = at;
    this.store.put(r);
  }

  private markFailed(id: string, code: ChainErrorCode, signature: string | null) {
    const r = this.store.get(id);
    if (r?.status !== "registration_pending") return;
    const message = CHAIN_ERROR_MESSAGES[code];
    r.status = "registration_failed";
    r.chain = {
      ...r.chain,
      status: "failed",
      signature,
      explorerUrl: signature ? explorerTxUrl(signature) : null,
      error: { code, message },
    };
    r.events.push(makeEvent("chain_registration_failed", "Falha no registro na Solana Devnet", { code, message }, { actor: "system" }));
    r.updatedAt = now();
    this.store.put(r);
  }
}
