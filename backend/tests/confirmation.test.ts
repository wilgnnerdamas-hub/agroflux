import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildConfirmationMemo, confirmationHash, confirmationPayload } from "../src/chain/payload.js";
import { ChainFailure, ChainUnavailableError, type Confirmed } from "../src/chain/solana.js";
import type { Receivable } from "../src/types.js";
import { createOne, createRegistered, fakeChain, makeApp, sha } from "./helpers.js";

type Built = Awaited<ReturnType<typeof makeApp>>;
const post = (b: Built, url: string, headers: Record<string, string> = {}) => b.app.inject({ method: "POST", url: `/api/v1${url}`, headers });
const getJson = async (b: Built, url: string) => (await b.app.inject({ method: "GET", url: `/api/v1${url}` })).json();
const rcv = (b: Built, id: string): Promise<Receivable> => getJson(b, `/receivables/${id}`);
const requestLink = async (b: Built, id: string) => (await post(b, `/receivables/${id}/debtor-confirmation`)).json();

describe("payload e memo da confirmação (§6.3)", () => {
  const r = { id: "rcv_01J9Z3K7Q2", chain: { payloadHash: "b".repeat(64) } } as unknown as Receivable;
  it("segue a ordem alfabética, sem espaços, e o memo do contrato", () => {
    const at = "2026-10-10T13:02:11.000Z";
    expect(confirmationPayload(r, at)).toBe(
      `{"confirmedAt":"${at}","receivableId":"rcv_01J9Z3K7Q2","receivablePayloadHash":"${"b".repeat(64)}","response":"confirmed"}`,
    );
    const ch = confirmationHash(r, at);
    expect(ch).toBe(sha(Buffer.from(confirmationPayload(r, at))));
    expect(buildConfirmationMemo(r, ch)).toBe(`{"app":"agroflux","v":1,"evt":"debtor_confirmed","rid":"rcv_01J9Z3K7Q2","ch":"${ch}"}`);
  });
});

describe("POST /receivables/:id/debtor-confirmation", () => {
  it("gera link de uso único com validade de 7 dias e evento", async () => {
    const b = await makeApp();
    const { id } = await createRegistered(b);
    const res = await post(b, `/receivables/${id}/debtor-confirmation`);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.confirmationPath).toBe(`/confirmar/${body.token}`);
    const days = (Date.parse(body.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    expect(body.receivable.debtorConfirmation).toMatchObject({ status: "requested", isSimulated: true, expiresAt: body.expiresAt, chain: null });
    expect(body.receivable.events.at(-1)).toMatchObject({ type: "debtor_confirmation_requested", onChain: false, data: { expiresAt: body.expiresAt } });
  });

  it("o token não aparece no passaporte nem no arquivo de dados", async () => {
    const b = await makeApp();
    const { id } = await createRegistered(b);
    const { token } = await requestLink(b, id);
    expect(JSON.stringify(await rcv(b, id))).not.toContain(token);
    expect(fs.readFileSync(path.join(b.dataDir, "db.json"), "utf8")).not.toContain(token);
  });

  it("409 antes do registro na Devnet", async () => {
    const b = await makeApp();
    const created = await createOne(b.app);
    const res = await post(b, `/receivables/${created.id}/debtor-confirmation`);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("INVALID_STATE");
  });

  it("um novo pedido invalida o link anterior (410)", async () => {
    const b = await makeApp();
    const { id } = await createRegistered(b);
    const first = await requestLink(b, id);
    const second = await requestLink(b, id);
    const old = await b.app.inject({ method: "GET", url: `/api/v1/confirmations/${first.token}` });
    expect(old.statusCode).toBe(410);
    expect(old.json().error.code).toBe("CONFIRMATION_LINK_EXPIRED");
    expect((await b.app.inject({ method: "GET", url: `/api/v1/confirmations/${second.token}` })).statusCode).toBe(200);
  });
});

describe("GET /confirmations/:token", () => {
  it("devolve só o resumo mínimo, sem pseudônimo, UF, ids nem documento", async () => {
    const b = await makeApp();
    const { id } = await createRegistered(b);
    const { token } = await requestLink(b, id);
    const s = await getJson(b, `/confirmations/${token}`);
    expect(Object.keys(s).sort()).toEqual(
      ["amountCents", "currency", "disclaimer", "distributor", "dueDate", "expiresAt", "isSimulated", "product", "reference", "status"].sort(),
    );
    expect(s).toMatchObject({ isSimulated: true, reference: "AGF-0001", distributor: { name: "Distribuidora Demo" }, status: "requested" });
    expect(s.disclaimer).toBe("Simulação — sem verificação de identidade do sacado.");
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/Produtor Demo|"MT"|rcv_|sha256|nf-teste/);
  });

  it("404 para token desconhecido e 410 para link vencido", async () => {
    const b = await makeApp();
    expect((await b.app.inject({ method: "GET", url: "/api/v1/confirmations/naoexiste" })).statusCode).toBe(404);

    const { id } = await createRegistered(b);
    const { token } = await requestLink(b, id);
    vi.useFakeTimers({ now: Date.now() + 8 * 86_400_000, toFake: ["Date"] });
    try {
      const res = await b.app.inject({ method: "GET", url: `/api/v1/confirmations/${token}` });
      expect(res.statusCode).toBe(410);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("POST /confirmations/:token/confirm e /decline", () => {
  it("confirma (202), registra o memo e entra o evento on-chain", async () => {
    // Segura o memo da confirmação até o teste conferir o estado pendente.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const base = fakeChain();
    const send = vi.fn(async (memo: string, opts: Parameters<typeof base.sendMemo>[1]) => {
      if (memo.includes("debtor_confirmed")) await gate;
      return base.sendMemo(memo, opts);
    });
    const b = await makeApp(fakeChain({ sendMemo: send, fetchMemo: base.fetchMemo }));
    const { id } = await createRegistered(b);
    const { token } = await requestLink(b, id);

    const res = await post(b, `/confirmations/${token}/confirm`);
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe("confirmed");
    const pending = await rcv(b, id);
    expect(pending.debtorConfirmation.status).toBe("confirmed");
    expect(pending.debtorConfirmation.chain).toMatchObject({ status: "pending", signature: null });
    expect(pending.debtorConfirmation.chain!.confirmationHash).toBe(confirmationHash(pending, pending.debtorConfirmation.respondedAt!));

    release();
    await b.confirmations.settle();
    const done = await rcv(b, id);
    const c = done.debtorConfirmation.chain!;
    expect(c.status).toBe("confirmed");
    expect(c.signature).toBeTruthy();
    expect(c.explorerUrl).toBe(`https://explorer.solana.com/tx/${c.signature}?cluster=devnet`);
    expect(send).toHaveBeenLastCalledWith(c.memo, expect.anything());
    expect(c.memo).not.toMatch(/Produtor|MT|15000000/);
    expect(done.events.at(-1)).toMatchObject({
      type: "debtor_confirmed",
      onChain: true,
      chain: { signature: c.signature, explorerUrl: c.explorerUrl },
      data: { signature: c.signature, confirmationHash: c.confirmationHash },
    });
    expect((await getJson(b, "/receivables")).totals.debtorConfirmedCount).toBe(1);

    // A verificação passa a conferir a confirmação também.
    const v = await getJson(b, `/receivables/${id}/verification`);
    expect(v.verified).toBe(true);
    expect(v.checks.at(-1)).toEqual({ name: "debtor_confirmation_matches", passed: true, label: "Confirmação do sacado confere on-chain" });
  });

  it("o link é de uso único (409) e continua mostrando o resultado no GET", async () => {
    const b = await makeApp();
    const { id } = await createRegistered(b);
    const { token } = await requestLink(b, id);
    await post(b, `/confirmations/${token}/confirm`);
    await b.confirmations.settle();
    for (const action of ["confirm", "decline"]) {
      const again = await post(b, `/confirmations/${token}/${action}`);
      expect(again.statusCode).toBe(409);
      expect(again.json().error.code).toBe("CONFIRMATION_ALREADY_ANSWERED");
    }
    expect((await getJson(b, `/confirmations/${token}`)).status).toBe("confirmed");
    // Depois de confirmado, não dá para pedir outro link.
    expect((await post(b, `/receivables/${id}/debtor-confirmation`)).statusCode).toBe(409);
  });

  it("recusa (200) fica fora da rede; dá para pedir um link novo depois", async () => {
    const send = vi.fn(fakeChain().sendMemo);
    const b = await makeApp(fakeChain({ sendMemo: send }));
    const { id } = await createRegistered(b);
    const calls = send.mock.calls.length;
    const { token } = await requestLink(b, id);
    const res = await post(b, `/confirmations/${token}/decline`);
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("declined");
    const r = await rcv(b, id);
    expect(r.debtorConfirmation).toMatchObject({ status: "declined", chain: null });
    expect(r.events.at(-1)).toMatchObject({ type: "debtor_declined", onChain: false });
    expect(send.mock.calls.length).toBe(calls);

    const again = await post(b, `/receivables/${id}/debtor-confirmation`);
    expect(again.statusCode).toBe(201);
    expect(again.json().receivable.debtorConfirmation.status).toBe("requested");
  });

  it("falha no memo: G1 continua bloqueando e o retry registra", async () => {
    let fail = true;
    const base = fakeChain();
    const b = await makeApp(
      fakeChain({
        sendMemo: async (memo, opts) => {
          if (fail && memo.includes("debtor_confirmed")) throw new ChainFailure("RPC_UNAVAILABLE");
          return base.sendMemo(memo, opts);
        },
        fetchMemo: base.fetchMemo,
      }),
    );
    const { id } = await createRegistered(b);
    const { token } = await requestLink(b, id);
    await post(b, `/confirmations/${token}/confirm`);
    await b.confirmations.settle();

    const failed = await rcv(b, id);
    expect(failed.debtorConfirmation.chain).toMatchObject({ status: "failed", error: { code: "RPC_UNAVAILABLE" } });
    expect(failed.events.at(-1)).toMatchObject({ type: "debtor_confirmation_chain_failed", onChain: false });

    const offers = await getJson(b, `/receivables/${id}/offers`);
    const sel = await post(b, `/receivables/${id}/offers/${offers.items[0].id}/select`);
    expect(sel.json().error.code).toBe("DEBTOR_CONFIRMATION_REQUIRED");

    fail = false;
    const retry = await post(b, `/receivables/${id}/debtor-confirmation/register`, { "idempotency-key": "r1" });
    expect(retry.statusCode).toBe(202);
    await b.confirmations.settle();
    expect((await rcv(b, id)).debtorConfirmation.chain?.status).toBe("confirmed");
    expect((await post(b, `/receivables/${id}/offers/${offers.items[0].id}/select`)).statusCode).toBe(200);
  });

  it("retry: 409 sem falha para repetir e 503 com a rede fora", async () => {
    const b = await makeApp();
    const { id } = await createRegistered(b);
    expect((await post(b, `/receivables/${id}/debtor-confirmation/register`)).json().error.code).toBe("INVALID_STATE");

    const down = await makeApp(
      fakeChain({
        sendMemo: async (memo, opts) => {
          if (memo.includes("debtor_confirmed")) throw new ChainFailure("TIMEOUT");
          return fakeChain().sendMemo(memo, opts);
        },
      }),
    );
    const r = await createRegistered(down);
    const { token } = await requestLink(down, r.id);
    await post(down, `/confirmations/${token}/confirm`);
    await down.confirmations.settle();
    const downNow = await makeApp(fakeChain({ ping: async () => { throw new ChainUnavailableError("fora"); } }), { dataDir: down.dataDir });
    const res = await post(downNow, `/receivables/${r.id}/debtor-confirmation/register`);
    expect(res.statusCode).toBe(503);
  });

  it("retoma a ancoragem pendente quando o servidor reinicia", async () => {
    const stuck = "DcStuck1111111111111111111111111111111111111111111111111111111111";
    const base = fakeChain();
    const b = await makeApp(
      fakeChain({
        sendMemo: (memo, opts) => {
          if (!memo.includes("debtor_confirmed")) return base.sendMemo(memo, opts);
          opts.onSubmitted?.(stuck);
          return new Promise<Confirmed>(() => {});
        },
      }),
    );
    const { id } = await createRegistered(b);
    const { token } = await requestLink(b, id);
    await post(b, `/confirmations/${token}/confirm`);

    const b2 = await makeApp(fakeChain({ checkSignature: async (s) => (s === stuck ? { signature: stuck, slot: 9, blockTime: null } : null) }), { dataDir: b.dataDir });
    await b2.confirmations.settle();
    const r = await rcv(b2, id);
    expect(r.debtorConfirmation.chain).toMatchObject({ status: "confirmed", signature: stuck });
  });
});
