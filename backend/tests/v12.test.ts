import { describe, expect, it } from "vitest";
import { termsHash, termsPayload } from "../src/chain/payload.js";
import { ChainFailure, ChainUnavailableError, type Confirmed } from "../src/chain/solana.js";
import { TERMS_TEXT, TERMS_TEXT_SHA256, TERMS_VERSION } from "../src/listing.js";
import type { Offer, Receivable } from "../src/types.js";
import { createConfirmed, createPublished, createRegistered, fakeChain, form, makeApp, PUBLISH_BODY, sha, uniquePdf, validInput } from "./helpers.js";

type Built = Awaited<ReturnType<typeof makeApp>>;
const get = async (b: Built, id: string): Promise<Receivable> => (await b.app.inject({ method: "GET", url: `/api/v1/receivables/${id}` })).json();
const publish = (b: Built, id: string, payload: unknown = PUBLISH_BODY, key?: string) =>
  b.app.inject({ method: "POST", url: `/api/v1/receivables/${id}/publish`, payload: payload as object, headers: key ? { "idempotency-key": key } : {} });
const propose = (b: Built, id: string, payload: object) => b.app.inject({ method: "POST", url: `/api/v1/receivables/${id}/offers`, payload });

describe("registradora simulada (v1.2)", () => {
  it("registra no cadastro com número sequencial e evento", async () => {
    const built = await makeApp();
    const pdf = uniquePdf();
    const r = (await built.app.inject({ method: "POST", url: "/api/v1/receivables", payload: form(validInput(), pdf) })).json();
    expect(r.registry).toEqual({
      status: "registered",
      isSimulated: true,
      registrarName: "Registradora Demo (simulada)",
      registryId: "REG-DEMO-000001",
      registeredAt: r.createdAt,
      documentSha256: sha(pdf),
      creditor: { kind: "distributor", name: "Distribuidora Demo", wallet: null },
      paymentDomicile: null,
    });
    expect(r.listing).toEqual({ status: "none", publishedAt: null, terms: null, chain: null });
    expect(r.events.map((e: { type: string }) => e.type)).toEqual(["receivable_created", "document_attached", "registry_registered"]);
    expect(r.events[2].data).toEqual({ registryId: "REG-DEMO-000001" });
  });

  it("recusa documento repetido com 409 DUPLICATE_DOCUMENT e não salva nada", async () => {
    const built = await makeApp();
    const pdf = uniquePdf();
    const first = (await built.app.inject({ method: "POST", url: "/api/v1/receivables", payload: form(validInput(), pdf) })).json();
    const dup = await built.app.inject({ method: "POST", url: "/api/v1/receivables", payload: form({ ...validInput(), amountCents: 900_000 }, pdf, "outro-nome.pdf") });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toMatchObject({ code: "DUPLICATE_DOCUMENT", details: { reference: first.reference, registryId: "REG-DEMO-000001" } });
    expect(dup.json().error.message).toMatch(/AGF-0001 \(REG-DEMO-000001\)/);
    const list = (await built.app.inject({ method: "GET", url: "/api/v1/receivables" })).json();
    expect(list.totals.count).toBe(1);
    // O número de registro não é consumido pela tentativa recusada.
    const next = (await built.app.inject({ method: "POST", url: "/api/v1/receivables", payload: form(validInput(), uniquePdf()) })).json();
    expect(next.registry.registryId).toBe("REG-DEMO-000002");
  });
});

describe("publicação com termo de coobrigação (v1.2)", () => {
  it("GET /terms devolve o texto e o hash", async () => {
    const built = await makeApp();
    const t = (await built.app.inject({ method: "GET", url: "/api/v1/terms" })).json();
    expect(t).toEqual({ isSimulated: true, version: TERMS_VERSION, text: TERMS_TEXT, textSha256: TERMS_TEXT_SHA256 });
    expect(t.text).toMatch(/SIMULADO, SEM VALOR JURÍDICO/);
    expect(sha(Buffer.from(t.text))).toBe(t.textSha256);
  });

  it("exige termo aceito, aceite do sacado on-chain e status registered", async () => {
    const built = await makeApp();
    const { id } = await createRegistered(built);
    expect((await publish(built, id, { acceptTerms: false, termsVersion: TERMS_VERSION })).json().error).toMatchObject({ code: "VALIDATION_ERROR", fieldErrors: { acceptTerms: expect.any(String) } });
    expect((await publish(built, id, { acceptTerms: true, termsVersion: "v0" })).statusCode).toBe(422);
    expect((await publish(built, id)).json().error.code).toBe("DEBTOR_CONFIRMATION_REQUIRED");
    expect((await get(built, id)).status).toBe("registered");
  });

  it("publica: status, termo, memo on-chain, propostas automáticas e eventos", async () => {
    const built = await makeApp();
    const { id } = await createConfirmed(built);
    const res = await publish(built, id, PUBLISH_BODY, "p1");
    expect(res.statusCode).toBe(202);
    const pending: Receivable = res.json().receivable;
    expect(pending.status).toBe("published");
    expect(pending.listing).toMatchObject({ status: "published", terms: { version: TERMS_VERSION, textSha256: TERMS_TEXT_SHA256 }, chain: { status: "pending" } });
    // Mesmo clique de novo: nada duplicado.
    expect((await publish(built, id, PUBLISH_BODY, "p1")).statusCode).toBe(202);
    await built.listings.settle();

    const r = await get(built, id);
    const terms = r.listing.terms!;
    expect(terms.termsHash).toBe(termsHash(r, terms));
    expect(JSON.parse(termsPayload(r, terms))).toEqual({
      acceptedAt: terms.acceptedAt,
      receivableId: id,
      receivablePayloadHash: r.chain.payloadHash,
      termsTextSha256: TERMS_TEXT_SHA256,
      termsVersion: TERMS_VERSION,
    });
    expect(r.listing.chain).toMatchObject({ status: "confirmed", memo: JSON.stringify({ app: "agroflux", v: 1, evt: "receivable_published", rid: id, th: terms.termsHash }) });
    const types = r.events.map((e) => e.type);
    expect(types.slice(-3)).toEqual(["listing_published", "offers_generated", "listing_terms_anchored"]);
    expect(types.filter((t) => t === "listing_published")).toHaveLength(1);
    expect(r.events.at(-1)).toMatchObject({ onChain: true, data: { termsHash: terms.termsHash } });
    expect((await publish(built, id)).json().error.code).toBe("INVALID_STATE");

    const v = (await built.app.inject({ method: "GET", url: `/api/v1/receivables/${id}/verification` })).json();
    expect(v.verified).toBe(true);
    expect(v.checks.at(-1)).toEqual({ name: "terms_matches", passed: true, label: "Termo de coobrigação confere on-chain" });
  });

  it("falha no memo do termo: propostas seguem valendo e a nova tentativa registra", async () => {
    let failTerms = true;
    const base = fakeChain();
    const built = await makeApp(
      fakeChain({
        sendMemo: async (memo, opts): Promise<Confirmed> => {
          if (failTerms && memo.includes("receivable_published")) throw new ChainFailure("RPC_UNAVAILABLE");
          return base.sendMemo(memo, opts);
        },
        fetchMemo: base.fetchMemo,
      }),
    );
    const { id } = await createConfirmed(built);
    await publish(built, id);
    await built.listings.settle();
    let r = await get(built, id);
    expect(r.status).toBe("published");
    expect(r.listing.chain).toMatchObject({ status: "failed", error: { code: "RPC_UNAVAILABLE" } });
    expect(r.events.at(-1)?.type).toBe("listing_chain_failed");
    expect((await built.app.inject({ method: "GET", url: `/api/v1/receivables/${id}/offers` })).json().items).toHaveLength(2);

    failTerms = false;
    const retry = await built.app.inject({ method: "POST", url: `/api/v1/receivables/${id}/publish/register`, headers: { "idempotency-key": "r1" } });
    expect(retry.statusCode).toBe(202);
    await built.listings.settle();
    r = await get(built, id);
    expect(r.listing.chain?.status).toBe("confirmed");
    expect((await built.app.inject({ method: "POST", url: `/api/v1/receivables/${id}/publish/register` })).json().error.code).toBe("INVALID_STATE");
  });

  it("rede fora antes de publicar: 503 e nada muda", async () => {
    let down = false;
    const built = await makeApp(fakeChain({ ping: async () => { if (down) throw new ChainUnavailableError("fora"); } }));
    const { id } = await createConfirmed(built);
    down = true;
    const res = await publish(built, id);
    expect(res.statusCode).toBe(503);
    expect((await get(built, id)).status).toBe("registered");
  });
});

describe("propostas do financiador e marketplace (v1.2)", () => {
  it("financiador A envia e revisa a proposta; a distribuidora pode aceitá-la", async () => {
    const built = await makeApp();
    const { id } = await createPublished(built);

    const res = await propose(built, id, { funderId: "fnd_a", spreadBps: 400, feesCents: 10_000 });
    expect(res.statusCode).toBe(201);
    const { offer } = res.json() as { offer: Offer };
    expect(offer).toMatchObject({
      funder: { id: "fnd_a", name: "Financiador Demo A", type: "simulated_fidc" },
      origin: "proposal",
      spreadBps: 400,
      feesCents: 10_000,
      status: "available",
    });

    const revised = (await propose(built, id, { funderId: "fnd_a", spreadBps: 350, feesCents: 5_000 })).json().offer as Offer;
    expect(revised.id).toBe(offer.id);
    expect(revised.createdAt).toBe(offer.createdAt);
    // A proposta gravada tem o mesmo preço da simulação (§15.1).
    const quote = (await built.app.inject({ method: "POST", url: `/api/v1/receivables/${id}/quote`, payload: { funderId: "fnd_a", spreadBps: 350, feesCents: 5_000 } })).json();
    expect(revised.netAmountCents).toBe(quote.netAmountCents);
    expect(revised.netAmountCents).toBeGreaterThan(offer.netAmountCents);

    const items: Offer[] = (await built.app.inject({ method: "GET", url: `/api/v1/receivables/${id}/offers` })).json().items;
    expect(items.map((o) => o.funder.id)).toEqual(["fnd_b", "fnd_c", "fnd_a"]);
    const r = await get(built, id);
    expect(r.events.filter((e) => e.type === "offer_proposed").map((e) => e.description)).toEqual([
      "Proposta recebida de Financiador Demo A (simulação)",
      "Proposta revisada de Financiador Demo A (simulação)",
    ]);

    const market = (await built.app.inject({ method: "GET", url: "/api/v1/marketplace?funderId=fnd_a" })).json();
    expect(market.isSimulated).toBe(true);
    expect(market.disclaimer).toMatch(/Não é oferta de investimento/);
    expect(market.items).toHaveLength(1);
    const best = items.reduce((b, o) => (o.netAmountCents > b.netAmountCents ? o : b));
    expect(market.items[0]).toMatchObject({
      receivable: { id, status: "published", termDays: 165, cropSeason: "2026/27", listing: { status: "published" } },
      debtorAccepted: true,
      offerCount: 3,
      bestOffer: { funderName: best.funder.name, netAmountCents: best.netAmountCents },
      myOffer: { id: offer.id, spreadBps: 350 },
    });

    const sel = await built.app.inject({ method: "POST", url: `/api/v1/receivables/${id}/offers/${offer.id}/select` });
    expect(sel.json().status).toBe("offer_selected");
    const listed = (await built.app.inject({ method: "GET", url: "/api/v1/receivables" })).json();
    expect(listed.items[0].offerCount).toBe(3);
    // Fora de `published`: sem novas propostas e fora do marketplace.
    expect((await propose(built, id, { funderId: "fnd_a", spreadBps: 300, feesCents: 0 })).json().error.code).toBe("INVALID_STATE");
    expect((await built.app.inject({ method: "GET", url: "/api/v1/marketplace" })).json().items).toHaveLength(0);
  });

  it("valida a proposta: financiador interativo, faixas e valor líquido positivo", async () => {
    const built = await makeApp();
    const { id } = await createPublished(built);
    const errors = async (body: object) => (await propose(built, id, body)).json().error.fieldErrors;
    expect(await errors({ funderId: "fnd_b", spreadBps: 400, feesCents: 0 })).toEqual({ funderId: "Selecione um financiador demo válido." });
    expect(await errors({ funderId: "fnd_x", spreadBps: 400, feesCents: 0 })).toHaveProperty("funderId");
    expect(await errors({ funderId: "fnd_a", spreadBps: 49, feesCents: 0 })).toHaveProperty("spreadBps");
    expect(await errors({ funderId: "fnd_a", spreadBps: 3_001, feesCents: 0 })).toHaveProperty("spreadBps");
    expect(await errors({ funderId: "fnd_a", spreadBps: 400.5, feesCents: 0 })).toHaveProperty("spreadBps");
    expect(await errors({ funderId: "fnd_a", spreadBps: 400, feesCents: 100_001 })).toHaveProperty("feesCents");
    expect((await propose(built, id, { funderId: "fnd_a", spreadBps: 400, feesCents: 0 })).statusCode).toBe(201);
  });

  it("proposta antes da publicação: 409; recebível inexistente: 404", async () => {
    const built = await makeApp();
    const { id } = await createRegistered(built);
    expect((await propose(built, id, { funderId: "fnd_a", spreadBps: 400, feesCents: 0 })).json().error.code).toBe("INVALID_STATE");
    expect((await propose(built, "rcv_nao_existe", { funderId: "fnd_a", spreadBps: 400, feesCents: 0 })).statusCode).toBe(404);
  });

  it("valor líquido negativo é recusado", async () => {
    const built = await makeApp();
    const r = (await built.app.inject({ method: "POST", url: "/api/v1/receivables", payload: form({ ...validInput(), amountCents: 100_000, issueDate: "2026-01-02", dueDate: "2027-12-20" }, uniquePdf()) })).json();
    await built.app.inject({ method: "POST", url: `/api/v1/receivables/${r.id}/register` });
    await Promise.all([...built.registrar.inflight.values()]);
    const link = (await built.app.inject({ method: "POST", url: `/api/v1/receivables/${r.id}/debtor-confirmation` })).json();
    await built.app.inject({ method: "POST", url: `/api/v1/confirmations/${link.token}/confirm` });
    await built.confirmations.settle();
    await publish(built, r.id);
    const res = await propose(built, r.id, { funderId: "fnd_a", spreadBps: 3_000, feesCents: 100_000 });
    expect(res.json().error.fieldErrors.spreadBps).toMatch(/negativo/);
  });

  it("financiadores demo, carteira vazia e transparência sem a cessão ligada", async () => {
    const built = await makeApp();
    const funders = (await built.app.inject({ method: "GET", url: "/api/v1/funders" })).json();
    expect(funders.items).toEqual([
      { id: "fnd_a", name: "Financiador Demo A", type: "simulated_fidc", mode: "interactive", wallet: null, isSimulated: true },
      { id: "fnd_b", name: "Financiador Demo B", type: "simulated_bank", mode: "automatic", wallet: null, isSimulated: true },
      { id: "fnd_c", name: "Financiador Demo C", type: "simulated_cooperative", mode: "automatic", wallet: null, isSimulated: true },
    ]);
    const pf = (await built.app.inject({ method: "GET", url: "/api/v1/funders/fnd_a/portfolio" })).json();
    expect(pf).toMatchObject({ isSimulated: true, funder: { id: "fnd_a" }, items: [], totals: { count: 0, paidAmountCents: 0, faceAmountCents: 0, projectedIncomeCents: 0 } });
    expect((await built.app.inject({ method: "GET", url: "/api/v1/funders/fnd_z/portfolio" })).statusCode).toBe(404);

    await createPublished(built);
    const t = (await built.app.inject({ method: "GET", url: "/api/v1/transparency" })).json();
    expect(t).toMatchObject({ isSimulated: true, cluster: "devnet", settlementAsset: null, wallets: [] });
    expect(t.programs).toEqual([{ role: "memo", label: "SPL Memo", address: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", explorerUrl: expect.stringContaining("cluster=devnet") }]);
    expect(t.registry).toEqual({ name: "Registradora Demo (simulada)", isSimulated: true, titles: 1 });
    expect(t.stats).toEqual({ receivables: 1, registeredOnChain: 1, debtorAccepted: 1, published: 1, assigned: 0, doubleSpendRejected: 0 });
  });

  it("transparência mostra a carteira pagadora quando o gateway expõe o endereço", async () => {
    const built = await makeApp(fakeChain({ feePayerAddress: "FeePayer111" }));
    const t = (await built.app.inject({ method: "GET", url: "/api/v1/transparency" })).json();
    expect(t.wallets).toEqual([
      { role: "fee_payer", label: "Carteira pagadora (taxas da demo)", address: "FeePayer111", explorerUrl: expect.stringContaining("FeePayer111"), solLamports: 1_000_000_000, settlementUnits: null },
    ]);
  });
});

describe("página do sacado depois da cessão (v1.2)", () => {
  it("o resumo do link mostra o número de registro", async () => {
    const built = await makeApp();
    const { id } = await createRegistered(built);
    const link = (await built.app.inject({ method: "POST", url: `/api/v1/receivables/${id}/debtor-confirmation` })).json();
    const s = (await built.app.inject({ method: "GET", url: `/api/v1/confirmations/${link.token}` })).json();
    expect(s).toMatchObject({ registryId: "REG-DEMO-000001", paymentDomicile: null });
  });
});
