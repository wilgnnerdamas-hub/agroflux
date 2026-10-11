import { describe, expect, it, vi } from "vitest";
import { AssignmentFailure, classifySettleError, type AssignmentGateway, type SettleInput } from "../src/chain/assignment.js";
import { ChainUnavailableError } from "../src/chain/solana.js";
import { createConfirmed, createPublished, fakeChain, makeApp } from "./helpers.js";

const MINT = "AssetMint1111111111111111111111111111111111";
const SIG = (n: string) => `TestSig${n}`.padEnd(88, "1");

const WALLETS = { fnd_a: "FunderA111", fnd_b: "FunderB111", fnd_c: "FunderC111" };
const DISTRIBUTORS = { dst_a: "Distributor111", dst_b: "DistributorB111", dst_c: "DistributorC111" };
const TREASURY = "Treasury111";
const LOCK = "DocLock111";
let inspectPayloadHash: string | null = null;

// Dublê da cessão: nada vai para a Solana. Guarda o que foi "liquidado" para o inspect devolver.
function fakeAssignment(over: Partial<AssignmentGateway> = {}): AssignmentGateway & { calls: { mint: number; settle: number; double: number }; settled: SettleInput[] } {
  const calls = { mint: 0, settle: 0, double: 0 };
  const settled: SettleInput[] = [];
  return {
    calls,
    settled,
    parties: { distributorWallets: DISTRIBUTORS, treasuryWallet: TREASURY, funderWallets: WALLETS, settlementMint: "TbrlMint111", escrowProgramId: "Escrow111" },
    ping: async () => {},
    mintAssetToken: async (_input, opts) => {
      calls.mint++;
      opts.onSubmitted?.(SIG("Mint"), MINT);
      return { signature: SIG("Mint"), slot: 1, blockTime: "2026-10-11T12:00:00.000Z", mint: MINT };
    },
    settle: async (input, opts) => {
      calls.settle++;
      settled.push(input);
      opts.onSubmitted?.(SIG("Settle"));
      return { signature: SIG("Settle"), slot: 2, blockTime: "2026-10-11T12:00:05.000Z" };
    },
    attemptDoubleSettle: async (_input, opts) => {
      calls.double++;
      opts.onSubmitted?.(SIG("Double"));
      return { signature: SIG("Double"), landedWithError: true, rejectedByDocumentLock: true };
    },
    documentLockAddress: () => LOCK,
    inspect: async ({ funderId, documentSha256 }) => {
      const s = settled.at(-1);
      return {
        mint: { supply: 1, decimals: 0, mintAuthorityRevoked: true },
        metadataPayloadHash: inspectPayloadHash,
        funderBalance: 1,
        settlement: s ? { assetMint: s.assetMint, settlementMint: "TbrlMint111", distributor: "Distributor111", funder: WALLETS[funderId], amount: s.amount, fee: s.fee, treasury: TREASURY } : null,
        documentLock: s ? { documentSha256, assetMint: s.assetMint, funder: WALLETS[funderId], amount: s.amount } : null,
      };
    },
    readBalances: async (addresses) => addresses.map((address) => ({ address, solLamports: 0, settlementUnits: 1_000 })),
    checkSignature: async () => null,
    ...over,
  };
}

const ENABLED = { ASSIGNMENT_ENABLED: "true" };
const enabledApp = (gateway: AssignmentGateway) => makeApp(fakeChain(), { env: ENABLED, assignmentGateway: gateway });

// Recebível publicado e com a proposta de B aceita: pronto para a cessão.
async function withSelectedOffer(gateway: AssignmentGateway) {
  const built = await enabledApp(gateway);
  const r = await createPublished(built);
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
    expect(pending.assignment).toMatchObject({ status: "pending", offerId: offer.id, settlementAmount: offer.funderCashOutCents, platformFeeAmount: offer.platformFeeCents + offer.registryFeeCents, treasuryWallet: TREASURY, settlementAsset: "tBRL-DEMO", isSimulated: true });

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
      funderWallet: "FunderB111",
      funderId: "fnd_b",
      funderName: "Financiador Demo B",
      escrowProgramId: "Escrow111",
      documentLock: LOCK,
      error: null,
    });
    expect(gw.settled[0]).toMatchObject({
      assetMint: MINT,
      amount: offer.funderCashOutCents,
      fee: offer.platformFeeCents + offer.registryFeeCents,
      distributorId: "dst_a",
      funderId: "fnd_b",
      documentSha256: r.documents[0].sha256,
    });
    // O líquido da distribuidora é o aporte menos a taxa da AgroFlux e a tarifa de registro.
    expect(offer.funderCashOutCents - offer.platformFeeCents - offer.registryFeeCents).toBe(offer.netAmountCents);
    // v1.3: receita da AgroFlux registrada na liquidação.
    const rev = (await built.app.inject({ method: "GET", url: "/api/v1/admin/revenue" })).json();
    expect(rev.totals).toEqual({ platformFeeCents: 75_000, registryFeeCents: 2_500, count: 1 });
    expect(rev.entries[0]).toMatchObject({ reference: r.reference, distributorId: "dst_a", funderId: "fnd_b", settlementSignature: SIG("Settle") });
    expect(rev.treasuryWallet).toBe(TREASURY);
    // v1.2: a registradora simulada passou o crédito ao financiador e mudou o domicílio de pagamento.
    expect(r.registry.creditor).toEqual({ kind: "funder", name: "Financiador Demo B", wallet: "FunderB111" });
    expect(r.registry.paymentDomicile.payeeName).toBe("Financiador Demo B");
    expect(r.registry.paymentDomicile.instruction).toMatch(/Pagar ao credor atual: Financiador Demo B/);
    expect(r.assignment.explorerUrls.tokenMint).toBe(`https://explorer.solana.com/address/${MINT}?cluster=devnet`);
    expect(r.assignment.explorerUrls.settlement).toContain(SIG("Settle"));
    expect(r.events.map((e: { type: string }) => e.type).slice(-4)).toEqual(["assignment_requested", "assignment_token_minted", "assignment_settled", "registry_creditor_updated"]);
    expect(r.events.at(-2)).toMatchObject({ onChain: true, data: { settlementAmount: offer.funderCashOutCents, settlementAsset: "tBRL-DEMO" } });

    // v1.2: carteira do financiador B mostra a cessão; a de A continua vazia.
    const pf = (await built.app.inject({ method: "GET", url: "/api/v1/funders/fnd_b/portfolio" })).json();
    expect(pf.items).toHaveLength(1);
    expect(pf.items[0]).toMatchObject({ reference: r.reference, status: "settled", faceAmountCents: 15_000_000, paidAmountCents: offer.presentValueCents - offer.feesCents, annualRateBps: offer.annualRateBps, spreadBps: offer.spreadBps });
    const paid = offer.presentValueCents - offer.feesCents;
    expect(pf.totals).toEqual({ count: 1, paidAmountCents: paid, faceAmountCents: 15_000_000, projectedIncomeCents: 15_000_000 - paid });
    expect((await built.app.inject({ method: "GET", url: "/api/v1/funders/fnd_a/portfolio" })).json().items).toHaveLength(0);

    const list = (await built.app.inject({ method: "GET", url: "/api/v1/receivables" })).json();
    expect(list.totals.assignedCount).toBe(1);
    // Depois de liquidada, não há nova cessão.
    expect((await post(built, id)).json().error.code).toBe("INVALID_STATE");
  });

  it("antes da seleção da oferta: 409 INVALID_STATE", async () => {
    const built = await enabledApp(fakeAssignment());
    const r = await createPublished(built);
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

  it("verificação confere token, metadados, financiador, registro da liquidação e trava do documento", async () => {
    const gw = fakeAssignment();
    const { built, id } = await withSelectedOffer(gw);
    await post(built, id);
    await built.assignments!.settle();
    inspectPayloadHash = (await built.app.inject({ method: "GET", url: `/api/v1/receivables/${id}` })).json().chain.payloadHash;
    const v = (await built.app.inject({ method: "GET", url: `/api/v1/receivables/${id}/verification` })).json();
    expect(v.verified).toBe(true);
    expect(v.checks.map((c: { name: string }) => c.name)).toEqual([
      "transaction_found", "memo_matches", "document_hash_matches", "payload_hash_matches", "debtor_confirmation_matches",
      "terms_matches", "asset_token_unique", "asset_metadata_matches", "asset_held_by_funder", "settlement_record_matches", "document_lock_matches",
    ]);

    // Token fora do financiador (ex.: vendido para outro): a verificação acusa.
    const original = gw.inspect;
    gw.inspect = async (i) => ({ ...(await original(i)), funderBalance: 0 });
    const bad = (await built.app.inject({ method: "GET", url: `/api/v1/receivables/${id}/verification` })).json();
    expect(bad.verified).toBe(false);
    expect(bad.checks.find((c: { name: string }) => c.name === "asset_held_by_funder").passed).toBe(false);
    inspectPayloadHash = null;
  });

  it("prova de recusa: outro token, outro financiador, recusa on-chain registrada", async () => {
    const gw = fakeAssignment();
    const { built, id } = await withSelectedOffer(gw);
    const proof = () => built.app.inject({ method: "POST", url: `/api/v1/receivables/${id}/assignment/double-spend-test` });
    expect((await proof()).json().error.code).toBe("INVALID_STATE");

    await post(built, id);
    await built.assignments!.settle();
    const res = await proof();
    expect(res.statusCode).toBe(202);
    expect(res.json().receivable.assignment.doubleSpendProof).toMatchObject({ status: "pending", funderId: "fnd_a" });
    await built.assignments!.settle();

    const r = (await built.app.inject({ method: "GET", url: `/api/v1/receivables/${id}` })).json();
    expect(r.assignment.doubleSpendProof).toMatchObject({ status: "rejected", tokenMint: MINT, funderId: "fnd_a", signature: SIG("Double"), error: null });
    expect(r.assignment.doubleSpendProof.reason).toMatch(/trava on-chain/);
    expect(r.events.at(-1)).toMatchObject({ type: "double_assignment_rejected", onChain: true, chain: { signature: SIG("Double") } });
    expect(gw.calls).toMatchObject({ mint: 2, settle: 1, double: 1 });
    // Feita uma vez; o status do recebível não muda.
    expect(r.status).toBe("assigned");
    expect((await proof()).json().error.code).toBe("INVALID_STATE");

    const t = (await built.app.inject({ method: "GET", url: "/api/v1/transparency" })).json();
    expect(t.stats).toMatchObject({ assigned: 1, doubleSpendRejected: 1, published: 1 });
    expect(t.wallets.map((w: { role: string }) => w.role)).toEqual(["treasury", "distributor", "distributor", "distributor", "funder", "funder", "funder"]);
    expect(t.programs.map((p: { role: string }) => p.role)).toEqual(["memo", "escrow", "token_2022"]);
  });

  it("prova de recusa: se a recusa não vier da trava, fica em erro e pode ser refeita", async () => {
    const gw = fakeAssignment({ attemptDoubleSettle: async () => ({ signature: SIG("Other"), landedWithError: true, rejectedByDocumentLock: false }) });
    const { built, id } = await withSelectedOffer(gw);
    await post(built, id);
    await built.assignments!.settle();
    await built.app.inject({ method: "POST", url: `/api/v1/receivables/${id}/assignment/double-spend-test` });
    await built.assignments!.settle();
    const r = (await built.app.inject({ method: "GET", url: `/api/v1/receivables/${id}` })).json();
    expect(r.assignment.doubleSpendProof).toMatchObject({ status: "error", error: { code: "TX_FAILED" } });
    expect(r.events.some((e: { type: string }) => e.type === "double_assignment_rejected")).toBe(false);
    expect((await built.app.inject({ method: "POST", url: `/api/v1/receivables/${id}/assignment/double-spend-test` })).statusCode).toBe(202);
    await built.assignments!.settle();
  });

  it("classifica os erros da liquidação", () => {
    const err = (message: string, logs: string[] = []) => Object.assign(new Error(message), { logs });
    expect(classifySettleError(err("custom program error: 0x1", ["Program log: Error: insufficient funds"]))).toBe("INSUFFICIENT_TEST_TOKENS");
    expect(classifySettleError(err("custom program error: 0x1772", ["Program log: AnchorError occurred. Error Code: MintAuthorityNotRevoked."]))).toBe("ESCROW_REJECTED");
    expect(classifySettleError(err("custom program error: 0x0", ["Allocate: account Address { address: X } already in use"]))).toBe("ESCROW_REJECTED");
    expect(classifySettleError(err("Attempt to debit an account but found no record of a prior credit."))).toBe("INSUFFICIENT_FUNDS");
    expect(classifySettleError(err("fetch failed"))).toBe("RPC_UNAVAILABLE");
    expect(classifySettleError(err("custom program error: 0x1770a"))).toBe("TX_FAILED");
    // v1.2: "already in use" na trava do documento.
    const inUse = err("custom program error: 0x0", ["Allocate: account Address { address: DocLock111 } already in use"]);
    expect(classifySettleError(inUse, { documentLock: "DocLock111" })).toBe("DOCUMENT_ALREADY_ASSIGNED");
    expect(classifySettleError(inUse, { documentLock: "OutraConta" })).toBe("ESCROW_REJECTED");
  });
});
