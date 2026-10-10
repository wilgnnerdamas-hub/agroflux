import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ChainUnavailableError } from "../src/chain/solana.js";
import { netAmount, offerTerms } from "../src/offers.js";
import type { Offer, Receivable } from "../src/types.js";
import { createOne, createPublished, createRegistered, fakeChain, makeApp, TEST_SIGNATURE } from "./helpers.js";

type App = Awaited<ReturnType<typeof makeApp>>["app"];
const verify = (app: App, id: string) => app.inject({ method: "GET", url: `/api/v1/receivables/${id}/verification` });
const offers = (app: App, id: string) => app.inject({ method: "GET", url: `/api/v1/receivables/${id}/offers` });
const select = (app: App, id: string, offerId: string) =>
  app.inject({ method: "POST", url: `/api/v1/receivables/${id}/offers/${offerId}/select` });
const get = async (app: App, id: string): Promise<Receivable> => (await app.inject({ method: "GET", url: `/api/v1/receivables/${id}` })).json();

describe("GET /api/v1/receivables/:id/verification", () => {
  it("confere transação, memo, hash do documento e payload", async () => {
    const built = await makeApp();
    const { id } = await createRegistered(built);
    const res = await verify(built.app, id);
    expect(res.statusCode).toBe(200);
    const v = res.json();
    expect(v.verified).toBe(true);
    expect(v.signature).toBe(TEST_SIGNATURE);
    expect(v.checks).toEqual([
      { name: "transaction_found", passed: true, label: "Transação encontrada na Devnet" },
      { name: "memo_matches", passed: true, label: "Conteúdo on-chain igual ao registrado" },
      { name: "document_hash_matches", passed: true, label: "Hash do documento confere" },
      { name: "payload_hash_matches", passed: true, label: "Hash dos dados do recebível confere" },
    ]);
  });

  it("detecta documento adulterado no armazenamento", async () => {
    const built = await makeApp();
    const { id } = await createRegistered(built);
    const r = await get(built.app, id);
    fs.writeFileSync(path.join(built.dataDir, "uploads", `${r.documents[0].id}.pdf`), "%PDF-1.4 adulterado");
    const v = (await verify(built.app, id)).json();
    expect(v.verified).toBe(false);
    expect(v.checks.find((c: { name: string }) => c.name === "document_hash_matches").passed).toBe(false);
  });

  it("detecta memo on-chain diferente e transação inexistente", async () => {
    const altered = await makeApp(fakeChain({ fetchMemo: async () => ({ memo: '{"app":"agroflux","v":1,"evt":"receivable_registered","rid":"x","doc":"y","ph":"z"}' }) }));
    const a = await createRegistered(altered);
    const va = (await verify(altered.app, a.id)).json();
    expect(va.verified).toBe(false);
    expect(va.checks.map((c: { passed: boolean }) => c.passed)).toEqual([true, false, false, false]);

    const missing = await makeApp(fakeChain({ fetchMemo: async () => null }));
    const b = await createRegistered(missing);
    expect((await verify(missing.app, b.id)).json().checks[0].passed).toBe(false);
  });

  it("409 sem transação confirmada; 503 quando a rede não responde", async () => {
    const built = await makeApp();
    const created = await createOne(built.app);
    expect((await verify(built.app, created.id)).json().error.code).toBe("INVALID_STATE");

    const down = await makeApp(fakeChain({ fetchMemo: async () => { throw new ChainUnavailableError("fora"); } }));
    const { id } = await createRegistered(down);
    const res = await verify(down.app, id);
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("CHAIN_UNAVAILABLE");
  });
});

describe("propostas simuladas (v1.2)", () => {
  it("cálculo de referência do contrato (§3.7 e exemplo do §5.7)", () => {
    expect(netAmount(15_000_000, 150, 157, 15_000)).toBe(13_807_500);
  });

  it("termos determinísticos e dentro das faixas", () => {
    const r = { id: "rcv_abc", amountCents: 15_000_000, termDays: 157 };
    expect(offerTerms(r)).toEqual(offerTerms({ ...r }));
    for (const t of offerTerms(r)) {
      expect(t.monthlyRateBps).toBeGreaterThanOrEqual(120);
      expect(t.monthlyRateBps).toBeLessThanOrEqual(250);
      expect(t.feesCents).toBeGreaterThanOrEqual(5_000);
      expect(t.feesCents).toBeLessThanOrEqual(30_000);
    }
  });

  it("409 antes do registro; lista vazia em registered (ainda não publicado)", async () => {
    const built = await makeApp();
    const created = await createOne(built.app);
    const res = await offers(built.app, created.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("INVALID_STATE");

    const { id } = await createRegistered(built);
    const empty = (await offers(built.app, id)).json();
    expect(empty).toMatchObject({ isSimulated: true, items: [] });
    expect(empty.disclaimer).toMatch(/fictícias/);
  });

  it("a publicação gera as propostas automáticas de B e C, uma única vez", async () => {
    const built = await makeApp();
    const { id } = await createPublished(built);
    const first = (await offers(built.app, id)).json();
    expect(first.items).toHaveLength(2);
    for (const o of first.items as Offer[]) {
      expect(o).toMatchObject({ receivableId: id, isSimulated: true, origin: "automatic", grossAmountCents: 15_000_000, termDays: 165, status: "available" });
      expect(o.id).toMatch(/^ofr_/);
      expect(o.netAmountCents).toBe(netAmount(o.grossAmountCents, o.monthlyRateBps, o.termDays, o.feesCents));
    }
    expect(first.items.map((o: Offer) => o.funder.id)).toEqual(["fnd_b", "fnd_c"]);
    expect(first.items.map((o: Offer) => o.funder.type)).toEqual(["simulated_bank", "simulated_cooperative"]);

    const second = (await offers(built.app, id)).json();
    expect(second.items).toEqual(first.items);
    const events = (await get(built.app, id)).events.filter((e) => e.type === "offers_generated");
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual({ offerIds: first.items.map((o: Offer) => o.id) });
  });

  it("aceita uma proposta, é idempotente e bloqueia outra", async () => {
    const built = await makeApp();
    const { id } = await createPublished(built);
    const items: Offer[] = (await offers(built.app, id)).json().items;
    const [a, b] = items;

    const res = await select(built.app, id, a.id);
    expect(res.statusCode).toBe(200);
    const r: Receivable = res.json();
    expect(r.status).toBe("offer_selected");
    expect(r.selectedOfferId).toBe(a.id);
    expect(r.chain.status).toBe("confirmed");
    expect(r.events.at(-1)).toMatchObject({
      type: "offer_selected",
      onChain: false,
      data: { offerId: a.id, funderName: a.funder.name, netAmountCents: a.netAmountCents },
    });

    const again = await select(built.app, id, a.id);
    expect(again.statusCode).toBe(200);
    expect(again.json().events).toHaveLength(r.events.length);

    const other = await select(built.app, id, b.id);
    expect(other.statusCode).toBe(409);
    expect(other.json().error.code).toBe("OFFER_ALREADY_SELECTED");

    const after: Offer[] = (await offers(built.app, id)).json().items;
    expect(after.map((o) => o.status)).toEqual(["selected", "unavailable"]);

    const totals = (await built.app.inject({ method: "GET", url: "/api/v1/receivables" })).json().totals;
    expect(totals).toMatchObject({ registeredCount: 1, offerSelectedCount: 1, publishedCount: 0 });

    expect((await select(built.app, id, "ofr_nao_existe")).statusCode).toBe(404);
  });
});
