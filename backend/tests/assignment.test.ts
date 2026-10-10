import { describe, expect, it, vi } from "vitest";
import { AssignmentFailure, classifySettleError, type AssignmentGateway } from "../src/chain/assignment.js";
import { ChainUnavailableError } from "../src/chain/solana.js";
import { createConfirmed, fakeChain, makeApp } from "./helpers.js";

const MINT = "AssetMint1111111111111111111111111111111111";
const SIG = (n: string) => `TestSig${n}`.padEnd(88, "1");

// Dublê da cessão: nada vai para a Solana.
function fakeAssignment(over: Partial<AssignmentGateway> = {}): AssignmentGateway & { calls: { mint: number; settle: number } } {
  const calls = { mint: 0, settle: 0 };
  return {
    calls,
    parties: { distributorWallet: "Distributor111", funderWallet: "Funder111", settlementMint: "TbrlMint111", escrowProgramId: "Escrow111" },
    ping: async () => {},
    mintAssetToken: async (_input, opts) => {
      calls.mint++;
      opts.onSubmitted?.(SIG("Mint"), MINT);
      return { signature: SIG("Mint"), slot: 1, blockTime: "2026-10-11T12:00:00.000Z", mint: MINT };
    },
    settle: async (_input, opts) => {
      calls.settle++;
      opts.onSubmitted?.(SIG("Settle"));
      return { signature: SIG("Settle"), slot: 2, blockTime: "2026-10-11T12:00:05.000Z" };
    },
    checkSignature: async () => null,
    ...over,
  };
}

const ENABLED = { ASSIGNMENT_ENABLED: "true" };
const enabledApp = (gateway: AssignmentGateway) => makeApp(fakeChain(), { env: ENABLED, assignmentGateway: gateway });

// Recebível confirmado pelo sacado e com oferta selecionada: pronto para a cessão.
async function withSelectedOffer(gateway: AssignmentGateway) {
  const built = await enabledApp(gateway);
  const r = await createConfirmed(built);
  const offers = (await built.app.inject({ method: "GET", url: `/api/v1/receivables/${r.id}/offers` })).json();
  const offer = offers.items[0];
  await built.app.inject({ method: "POST", url: `/api/v1/receivables/${r.id}/offers/${offer.id}/select` });
  return { built, id: r.id, offer };
}

const post = (built: Awaited<ReturnType<typeof withSelectedOffer>>["built"], id: string, key?: string) =>
  built.app.inject({ method: "POST", url: `/api/v1/receivables/${id}/assignment`, headers: key ? { "idempotency-key": key } : {} });

describe("cessão tokenizada (função B)", () => {
  it("sem ASSIGNMENT_ENABLED a rota não existe e o health diz assignment: false", async () => {
    const built = await makeApp(fakeChain());
    const r = await createConfirmed(built);
    expect((await built.app.inject({ method: "POST", url: `/api/v1/receivables/${r.id}/assignment` })).statusCode).toBe(404);
    expect((await built.app.inject({ method: "GET", url: "/api/v1/health" })).json().features.assignment).toBe(false);
  });

  it("ligada mas sem configuração completa: continua desligada", async () => {
    const built = await makeApp(fakeChain(), { env: ENABLED });
    expect(built.assignments).toBeNull();
    expect((await built.app.inject({ method: "GET", url: "/api/v1/health" })).json().features.assignment).toBe(false);
  });

  it("caminho feliz: 202, token criado, liquidação atômica e status assigned", async () => {
    const gw = fakeAssignment();
    const { built, id, offer } = await withSelectedOffer(gw);
    expect((await built.app.inject({ method: "GET", url: "/api/v1/health" })).json().features.assignment).toBe(true);

    const res = await post(built, id, "k1");
    expect(res.statusCode).toBe(202);
    const pending = res.json().receivable;
    expect(pending.status).toBe("assignment_pending");
    expect(pending.assignment).toMatchObject({ status: "pending", offerId: offer.id, settlementAmount: offer.netAmountCents, settlementAsset: "tBRL-DEMO", isSimulated: true });

    await built.assignments!.settle();
    const r = (await built.app.inject({ method: "GET", url: `/api/v1/receivables/${id}` })).json();
    expect(r.status).toBe("assigned");
    expect(r.assignment).toMatchObject({
      status: "settled",
      tokenMint: MINT,
      mintSignature: SIG("Mint"),
      settlementSignature: SIG("Settle"),
      settlementMint: "TbrlMint111",
      distributorWallet: "Distributor111",
      funderWallet: "Funder111",
      escrowProgramId: "Escrow111",
      error: null,
    });
    expect(r.assignment.explorerUrls.tokenMint).toBe(`https://explorer.solana.com/address/${MINT}?cluster=devnet`);
    expect(r.assignment.explorerUrls.settlement).toContain(SIG("Settle"));
    expect(r.events.map((e: { type: string }) => e.type).slice(-3)).toEqual(["assignment_requested", "assignment_token_minted", "assignment_settled"]);
    expect(r.events.at(-1)).toMatchObject({ onChain: true, data: { settlementAmount: offer.netAmountCents, settlementAsset: "tBRL-DEMO" } });

    const list = (await built.app.inject({ method: "GET", url: "/api/v1/receivables" })).json();
    expect(list.totals.assignedCount).toBe(1);
    // Depois de liquidada, não há nova cessão.
    expect((await post(built, id)).json().error.code).toBe("INVALID_STATE");
  });

  it("antes da seleção da oferta: 409 INVALID_STATE", async () => {
    const built = await enabledApp(fakeAssignment());
    const r = await createConfirmed(built);
    const res = await built.app.inject({ method: "POST", url: `/api/v1/receivables/${r.id}/assignment` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("INVALID_STATE");
  });

  it("financiador sem tBRL: falha por inteiro, e a nova tentativa reaproveita o token", async () => {
    let fail = true;
    const gw = fakeAssignment();
    const okSettle = gw.settle;
    gw.settle = async (input, opts) => {
      if (fail) {
        gw.calls.settle++;
        throw new AssignmentFailure("INSUFFICIENT_TEST_TOKENS");
      }
      return okSettle(input, opts);
    };
    const { built, id } = await withSelectedOffer(gw);
    await post(built, id);
    await built.assignments!.settle();
    let r = (await built.app.inject({ method: "GET", url: `/api/v1/receivables/${id}` })).json();
    expect(r.status).toBe("assignment_failed");
    expect(r.assignment.status).toBe("failed");
    expect(r.assignment.error.code).toBe("INSUFFICIENT_TEST_TOKENS");
    expect(r.assignment.tokenMint).toBe(MINT);
    expect(r.assignment.settlementSignature).toBeNull();
    expect(r.events.at(-1).type).toBe("assignment_failed");

    fail = false;
    expect((await post(built, id)).statusCode).toBe(202);
    await built.assignments!.settle();
    r = (await built.app.inject({ method: "GET", url: `/api/v1/receivables/${id}` })).json();
    expect(r.status).toBe("assigned");
    expect(gw.calls.mint).toBe(1);
  });

  it("TIMEOUT na liquidação: a nova tentativa confere a assinatura antes de enviar outra", async () => {
    const gw = fakeAssignment();
    let first = true;
    gw.settle = async (_i, opts) => {
      gw.calls.settle++;
      opts.onSubmitted?.(SIG("Late"));
      if (first) {
        first = false;
        throw new AssignmentFailure("TIMEOUT", SIG("Late"));
      }
      throw new Error("não deveria reenviar");
    };
    gw.checkSignature = async (sig) => (sig === SIG("Late") && !first ? { signature: sig, slot: 9, blockTime: null } : null);
    const { built, id } = await withSelectedOffer(gw);
    await post(built, id);
    await built.assignments!.settle();
    expect((await built.app.inject({ method: "GET", url: `/api/v1/receivables/${id}` })).json().assignment.error.code).toBe("TIMEOUT");

    await post(built, id);
    await built.assignments!.settle();
    const r = (await built.app.inject({ method: "GET", url: `/api/v1/receivables/${id}` })).json();
    expect(r.status).toBe("assigned");
    expect(r.assignment.settlementSignature).toBe(SIG("Late"));
    expect(gw.calls.settle).toBe(1);
  });

  it("mesmo Idempotency-Key não dispara duas cessões", async () => {
    const gw = fakeAssignment();
    const { built, id } = await withSelectedOffer(gw);
    const a = await post(built, id, "same");
    const b = await post(built, id, "same");
    expect(a.statusCode).toBe(202);
    expect(b.statusCode).toBe(202);
    await built.assignments!.settle();
    expect(gw.calls.mint).toBe(1);
    expect(gw.calls.settle).toBe(1);
  });

  it("rede fora do ar: 503 CHAIN_UNAVAILABLE e nada muda", async () => {
    const gw = fakeAssignment({
      ping: vi.fn(async () => {
        throw new ChainUnavailableError("A rede Solana Devnet não respondeu. Tente novamente.");
      }),
    });
    const { built, id } = await withSelectedOffer(gw);
    const res = await post(built, id);
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("CHAIN_UNAVAILABLE");
    expect((await built.app.inject({ method: "GET", url: `/api/v1/receivables/${id}` })).json().status).toBe("offer_selected");
  });

  it("classifica os erros da liquidação", () => {
    const err = (message: string, logs: string[] = []) => Object.assign(new Error(message), { logs });
    expect(classifySettleError(err("custom program error: 0x1", ["Program log: Error: insufficient funds"]))).toBe("INSUFFICIENT_TEST_TOKENS");
    expect(classifySettleError(err("custom program error: 0x1772", ["Program log: AnchorError occurred. Error Code: MintAuthorityNotRevoked."]))).toBe("ESCROW_REJECTED");
    expect(classifySettleError(err("custom program error: 0x0", ["Allocate: account Address { address: X } already in use"]))).toBe("ESCROW_REJECTED");
    expect(classifySettleError(err("Attempt to debit an account but found no record of a prior credit."))).toBe("INSUFFICIENT_FUNDS");
    expect(classifySettleError(err("fetch failed"))).toBe("RPC_UNAVAILABLE");
    expect(classifySettleError(err("custom program error: 0x1770a"))).toBe("TX_FAILED");
  });
});
