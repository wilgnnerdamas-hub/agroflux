import { describe, expect, it, vi } from "vitest";
import { buildMemo, canonicalPayload, payloadHash } from "../src/chain/payload.js";
import { ChainFailure, ChainUnavailableError, classifySendError, type Confirmed } from "../src/chain/solana.js";
import type { Receivable } from "../src/types.js";
import { createOne, fakeChain, makeApp, settle, sha, TEST_SIGNATURE } from "./helpers.js";

const register = (app: Awaited<ReturnType<typeof makeApp>>["app"], id: string, key?: string) =>
  app.inject({ method: "POST", url: `/api/v1/receivables/${id}/register`, headers: key ? { "idempotency-key": key } : {} });

const get = async (app: Awaited<ReturnType<typeof makeApp>>["app"], id: string): Promise<Receivable> =>
  (await app.inject({ method: "GET", url: `/api/v1/receivables/${id}` })).json();

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

describe("payload canônico e memo (§6.2)", () => {
  const r = {
    id: "rcv_01J9Z3K7Q2",
    amountCents: 15_000_000,
    cropSeason: "2026/27",
    currency: "BRL",
    dueDate: "2027-03-15",
    issueDate: "2026-10-09",
    product: { category: "fertilizer", description: "Fertilizante NPK 20-05-20" },
    debtor: { alias: "Produtor Demo 01", state: "MT" },
    documents: [{ sha256: "a".repeat(64) }],
  } as unknown as Receivable;

  it("segue a ordem alfabética e não tem espaços", () => {
    expect(canonicalPayload(r)).toBe(
      `{"amountCents":15000000,"cropSeason":"2026/27","currency":"BRL","documentSha256":"${"a".repeat(64)}","dueDate":"2027-03-15","id":"rcv_01J9Z3K7Q2","issueDate":"2026-10-09","productCategory":"fertilizer"}`,
    );
    expect(payloadHash(r)).toBe(sha(Buffer.from(canonicalPayload(r))));
  });

  it("memo tem só hashes e ids, na ordem do contrato", () => {
    const memo = buildMemo(r);
    expect(memo).toBe(`{"app":"agroflux","v":1,"evt":"receivable_registered","rid":"rcv_01J9Z3K7Q2","doc":"${"a".repeat(64)}","ph":"${payloadHash(r)}"}`);
    expect(memo).not.toMatch(/Produtor|MT|15000000|Fertilizante/);
  });
});

describe("POST /api/v1/receivables/:id/register", () => {
  it("fica pendente e depois confirma com a assinatura vinda da rede", async () => {
    const send = deferred<Confirmed>();
    const sendMemo = vi.fn(async () => send.promise);
    const { app, registrar } = await makeApp(fakeChain({ sendMemo }));
    const created = await createOne(app);

    const res = await register(app, created.id, "k1");
    expect(res.statusCode).toBe(202);
    const pending = res.json().receivable as Receivable;
    expect(pending.status).toBe("registration_pending");
    expect(pending.chain).toMatchObject({ status: "pending", signature: null, programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" });
    expect(pending.chain.payloadHash).toBe(payloadHash(pending));
    expect(pending.chain.memo).toBe(buildMemo(pending));
    expect(pending.events.at(-1)).toMatchObject({ type: "chain_registration_requested", onChain: false, data: { payloadHash: pending.chain.payloadHash } });
    expect(sendMemo).toHaveBeenCalledWith(pending.chain.memo, expect.objectContaining({ timeoutMs: 60_000 }));

    const list = (await app.inject({ method: "GET", url: "/api/v1/receivables" })).json();
    expect(list.totals.pendingCount).toBe(1);

    send.resolve({ signature: TEST_SIGNATURE, slot: 4242, blockTime: "2026-10-09T15:00:00.000Z" });
    await settle(registrar);

    const done = await get(app, created.id);
    expect(done.status).toBe("registered");
    expect(done.chain).toMatchObject({
      status: "confirmed",
      signature: TEST_SIGNATURE,
      slot: 4242,
      blockTime: "2026-10-09T15:00:00.000Z",
      explorerUrl: `https://explorer.solana.com/tx/${TEST_SIGNATURE}?cluster=devnet`,
      error: null,
    });
    expect(done.chain.confirmedAt).toBeTruthy();
    expect(done.events.at(-1)).toMatchObject({
      type: "chain_registration_confirmed",
      actor: "system",
      onChain: true,
      chain: { signature: TEST_SIGNATURE, explorerUrl: done.chain.explorerUrl },
      data: { signature: TEST_SIGNATURE, slot: 4242 },
    });
    const totals = (await app.inject({ method: "GET", url: "/api/v1/receivables" })).json().totals;
    expect(totals).toMatchObject({ registeredCount: 1, pendingCount: 0 });
  });

  it("clique duplo com a mesma Idempotency-Key não cria segunda transação", async () => {
    const sendMemo = vi.fn(fakeChain().sendMemo);
    const { app, registrar } = await makeApp(fakeChain({ sendMemo }));
    const { id } = await createOne(app);
    const [a, b] = await Promise.all([register(app, id, "same"), register(app, id, "same")]);
    expect([a.statusCode, b.statusCode]).toEqual([202, 202]);
    await settle(registrar);
    expect(sendMemo).toHaveBeenCalledTimes(1);
    expect((await get(app, id)).events.filter((e) => e.type === "chain_registration_requested")).toHaveLength(1);
  });

  it("duas requisições sem chave: uma passa, a outra recebe 409", async () => {
    const sendMemo = vi.fn(fakeChain().sendMemo);
    const { app, registrar } = await makeApp(fakeChain({ sendMemo }));
    const { id } = await createOne(app);
    const codes = (await Promise.all([register(app, id), register(app, id)])).map((r) => r.statusCode).sort();
    expect(codes).toEqual([202, 409]);
    await settle(registrar);
    expect(sendMemo).toHaveBeenCalledTimes(1);
  });

  it("409 quando já está registrado; 404 quando não existe", async () => {
    const { app, registrar } = await makeApp();
    const { id } = await createOne(app);
    await register(app, id);
    await settle(registrar);
    const again = await register(app, id);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("INVALID_STATE");
    expect((await register(app, "rcv_nao_existe")).statusCode).toBe(404);
  });

  it("503 CHAIN_UNAVAILABLE quando o RPC está fora antes do envio, sem mudar o estado", async () => {
    const sendMemo = vi.fn();
    const { app } = await makeApp(fakeChain({ ping: async () => { throw new ChainUnavailableError("A rede Solana Devnet não respondeu. Tente novamente."); }, sendMemo }));
    const created = await createOne(app);
    const res = await register(app, created.id, "k");
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("CHAIN_UNAVAILABLE");
    expect(await get(app, created.id)).toEqual(created);
    expect(sendMemo).not.toHaveBeenCalled();
  });

  it("falha por falta de saldo e permite tentar de novo", async () => {
    let fail = true;
    const sendMemo = vi.fn(async (memo: string, opts: Parameters<ReturnType<typeof fakeChain>["sendMemo"]>[1]) => {
      if (fail) throw new ChainFailure("INSUFFICIENT_FUNDS");
      return fakeChain().sendMemo(memo, opts);
    });
    const { app, registrar } = await makeApp(fakeChain({ sendMemo }));
    const { id } = await createOne(app);

    await register(app, id, "try-1");
    await settle(registrar);
    const failed = await get(app, id);
    expect(failed.status).toBe("registration_failed");
    expect(failed.chain).toMatchObject({
      status: "failed",
      signature: null,
      error: { code: "INSUFFICIENT_FUNDS", message: "A carteira de demonstração está sem saldo na Devnet." },
    });
    expect(failed.events.at(-1)).toMatchObject({ type: "chain_registration_failed", onChain: false, data: { code: "INSUFFICIENT_FUNDS" } });

    fail = false;
    expect((await register(app, id, "try-2")).statusCode).toBe(202);
    await settle(registrar);
    const ok = await get(app, id);
    expect(ok.status).toBe("registered");
    expect(ok.chain.error).toBeNull();
  });

  it("depois de TIMEOUT, reaproveita a transação que entrou na rede em vez de enviar outra", async () => {
    const late = "LateSig11111111111111111111111111111111111111111111111111111111111";
    const sendMemo = vi.fn(async (_m: string, opts: { onSubmitted?: (s: string) => void }) => {
      opts.onSubmitted?.(late);
      throw new ChainFailure("TIMEOUT", late);
    });
    const checkSignature = vi.fn(async (sig: string) => (sig === late ? { signature: late, slot: 99, blockTime: null } : null));
    const { app, registrar, dataDir } = await makeApp(fakeChain({ sendMemo, checkSignature: async () => null }));
    const { id } = await createOne(app);
    await register(app, id);
    await settle(registrar);
    const timedOut = await get(app, id);
    expect(timedOut.chain).toMatchObject({ status: "failed", signature: late, error: { code: "TIMEOUT" } });

    // Mesmo armazenamento, agora a rede confirma a assinatura antiga.
    const { app: app2, registrar: reg2 } = await makeApp(fakeChain({ sendMemo, checkSignature }), { dataDir });
    await register(app2, id);
    await settle(reg2);
    const ok = await get(app2, id);
    expect(ok.status).toBe("registered");
    expect(ok.chain.signature).toBe(late);
    expect(sendMemo).toHaveBeenCalledTimes(1);
  });

  it("retoma registros pendentes quando o servidor reinicia", async () => {
    const stuck = "StuckSig111111111111111111111111111111111111111111111111111111111";
    const { app, dataDir } = await makeApp(
      fakeChain({ sendMemo: (_m, opts) => { opts.onSubmitted?.(stuck); return new Promise<Confirmed>(() => {}); } }),
    );
    const { id } = await createOne(app);
    await register(app, id);
    expect((await get(app, id)).status).toBe("registration_pending");

    const { app: app2, registrar: reg2 } = await makeApp(
      fakeChain({ checkSignature: async (s) => (s === stuck ? { signature: stuck, slot: 7, blockTime: null } : null) }),
      { dataDir },
    );
    await settle(reg2);
    const ok = await get(app2, id);
    expect(ok.status).toBe("registered");
    expect(ok.chain.signature).toBe(stuck);
  });

  it("pendente sem assinatura enviada vira TIMEOUT ao reiniciar", async () => {
    const { app, dataDir } = await makeApp(fakeChain({ sendMemo: () => new Promise<Confirmed>(() => {}) }));
    const { id } = await createOne(app);
    await register(app, id);
    const { app: app2, registrar: reg2 } = await makeApp(fakeChain(), { dataDir, confirmTimeoutMs: 50 });
    await settle(reg2);
    expect((await get(app2, id)).chain.error?.code).toBe("TIMEOUT");
  });
});

describe("classifySendError", () => {
  it("separa saldo, rede e rejeição", () => {
    expect(classifySendError(new Error("Attempt to debit an account but found no record of a prior credit."))).toBe("INSUFFICIENT_FUNDS");
    expect(classifySendError(new TypeError("fetch failed"))).toBe("RPC_UNAVAILABLE");
    expect(classifySendError(new Error("429 Too Many Requests"))).toBe("RPC_UNAVAILABLE");
    expect(classifySendError(new Error("Transaction simulation failed: invalid instruction data"))).toBe("TX_FAILED");
  });
});
