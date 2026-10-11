import { describe, expect, it } from "vitest";
import { businessDaysBetween, easter, holidays, isBusinessDay, todayBrasilia } from "../src/pricing/calendar.js";
import { createCdiProvider, parseBcb } from "../src/pricing/cdi.js";
import { price } from "../src/pricing/pricing.js";
import { IOF_RULE } from "../src/pricing/settings.js";
import { producerHistory, ratingForPd, RISK_MODEL } from "../src/risk.js";
import { buildModel } from "../src/risk-model/train.js";
import { defaultSettings } from "../src/pricing/settings.js";
import type { Offer, Receivable } from "../src/types.js";
import { createConfirmed, createOne, createPublished, form, makeApp, PUBLISH_BODY, uniquePdf, validInput } from "./helpers.js";

type Built = Awaited<ReturnType<typeof makeApp>>;
const get = async (b: Built, url: string) => (await b.app.inject({ method: "GET", url: `/api/v1${url}` })).json();

describe("calendário de dias úteis (§15.1)", () => {
  it("Páscoa e feriados móveis", () => {
    expect(easter(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(easter(2027).toISOString().slice(0, 10)).toBe("2027-03-28");
    const h = holidays(2026);
    for (const d of ["2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21", "2026-06-04", "2026-11-20", "2026-12-25"]) expect(h.has(d)).toBe(true);
    expect(isBusinessDay("2026-10-12")).toBe(false); // feriado (Nossa Senhora Aparecida)
    expect(isBusinessDay("2026-10-10")).toBe(false); // sábado
    expect(isBusinessDay("2026-10-13")).toBe(true);
  });

  it("conta (de, até]: sexta → terça com feriado na segunda = 1 dia útil", () => {
    expect(businessDaysBetween("2026-10-09", "2026-10-13")).toBe(1);
    expect(businessDaysBetween("2026-10-13", "2026-10-13")).toBe(0);
  });

  it("hoje no fuso de Brasília", () => {
    expect(todayBrasilia(Date.parse("2026-10-11T02:00:00Z"))).toBe("2026-10-10");
    expect(todayBrasilia(Date.parse("2026-10-11T04:00:00Z"))).toBe("2026-10-11");
  });
});

describe("precificação CDI + spread (§15.1)", () => {
  it("caso calculado à mão: 1 dia útil, CDI 10%, banco com IOF", () => {
    const p = price({
      faceCents: 1_000_000,
      pricedAt: "2026-10-09",
      dueDate: "2026-10-13",
      cdiAnnual: 0.1,
      spreadAnnual: 0,
      funderFeesCents: 0,
      iof: IOF_RULE,
      platformFeeBps: 50,
      registryFeeCents: 2_500,
    });
    expect(p).toMatchObject({
      businessDays: 1,
      calendarDays: 4,
      presentValueCents: 999_622,
      discountCents: 378,
      iofCents: 3_963,
      funderCashOutCents: 995_659,
      platformFeeCents: 5_000,
      registryFeeCents: 2_500,
      distributorNetCents: 988_159,
    });
    expect(p.annualRate).toBeCloseTo(0.1, 10);
    expect(p.cetAnnual).toBeCloseTo(Math.pow(1_000_000 / 988_159, 252) - 1, 6);
    expect(p.funderYieldAnnual).toBeCloseTo(Math.pow(1_000_000 / 999_622, 252) - 1, 6);
  });

  it("taxa anual composta = (1 + CDI) × (1 + spread) − 1; sem IOF para FIDC", () => {
    const p = price({ faceCents: 15_000_000, pricedAt: "2026-10-10", dueDate: "2027-03-15", cdiAnnual: 0.149, spreadAnnual: 0.03, funderFeesCents: 10_000, iof: null, platformFeeBps: 50, registryFeeCents: 2_500 });
    expect(p.annualRate).toBeCloseTo(0.18347, 10);
    expect(p.businessDays).toBe(businessDaysBetween("2026-10-10", "2027-03-15"));
    expect(p.presentValueCents).toBe(Math.round(15_000_000 / Math.pow(1.18347, p.businessDays / 252)));
    expect(p.iofCents).toBe(0);
    expect(p.monthlyEquivalent).toBeCloseTo(Math.pow(1.18347, 1 / 12) - 1, 10);
  });
});

describe("CDI do Banco Central (§15.1)", () => {
  it("lê a série 4389 e usa o valor manual quando a consulta falha", async () => {
    expect(parseBcb([{ data: "09/10/2026", valor: "14.90" }])).toEqual({ annualBps: 1490, referenceDate: "2026-10-09" });
    expect(parseBcb([{ data: "09/10/2026", valor: "14,9" }])).toEqual({ annualBps: 1490, referenceDate: "2026-10-09" });
    expect(parseBcb({})).toBeNull();

    let calls = 0;
    const ok = createCdiProvider((async () => {
      calls++;
      return new Response(JSON.stringify([{ data: "09/10/2026", valor: "14.65" }]), { status: 200 });
    }) as typeof fetch);
    expect(await ok({ source: "bcb", manualAnnualBps: 1200 })).toEqual({ annualBps: 1465, source: "bcb", referenceDate: "2026-10-09" });
    await ok({ source: "bcb", manualAnnualBps: 1200 });
    expect(calls).toBe(1); // cache
    expect(await ok({ source: "manual", manualAnnualBps: 1200 })).toEqual({ annualBps: 1200, source: "manual", referenceDate: null });

    const down = createCdiProvider((async () => {
      throw new Error("offline");
    }) as typeof fetch);
    expect(await down({ source: "bcb", manualAnnualBps: 1300 })).toEqual({ annualBps: 1300, source: "manual", referenceDate: null });
  });

  it("GET /pricing/reference informa CDI, origem e taxas da AgroFlux", async () => {
    const built = await makeApp();
    expect(await get(built, "/pricing/reference")).toEqual({
      cdiAnnualBps: 1490,
      cdiSource: "bcb",
      cdiReferenceDate: "2026-10-09",
      platformFeeBps: 50,
      registryFeeCents: 2_500,
      pricedAt: "2026-10-10",
    });
  });
});

describe("risco (§15.2)", () => {
  it("rating pela PD anual, modelo treinado e histórico simulado determinístico", () => {
    const st = defaultSettings();
    expect([30, 50, 100, 200, 400, 800, 1_500, 2_500, 4_000, 9_000].map((pd) => ratingForPd(pd, st))).toEqual(["AA", "AA", "A", "B", "C", "D", "E", "F", "G", "H"]);
    // O modelo gravado é a regressão logística da base sintética, com qualidade mínima de crédito.
    expect(RISK_MODEL.dataset.synthetic).toBe(true);
    expect(RISK_MODEL.metrics.auc).toBeGreaterThan(0.7);
    expect(RISK_MODEL.features.find((f) => f.key === "acceptance")!.coef).toBeLessThan(0);
    expect(RISK_MODEL.features.find((f) => f.key === "concentration")!.coef).toBeGreaterThan(0);
    // Mesma semente, mesmo modelo.
    const m1 = buildModel(7, 400);
    const m2 = buildModel(7, 400);
    expect(m1.features).toEqual(m2.features);
    const h = producerHistory("Produtor Demo 01");
    expect(producerHistory("produtor demo 01")).toEqual(h);
    expect(h.isSimulated).toBe(true);
    expect(h.onTimeRate).toBeGreaterThanOrEqual(0.7);
    expect(h.onTimeRate).toBeLessThanOrEqual(1);
  });

  it("o passaporte traz o risco com fatores, e o aceite e a coobrigação melhoram o score", async () => {
    const built = await makeApp();
    const created = await createOne(built.app);
    const before: Receivable = await get(built, `/receivables/${created.id}`);
    expect(before.risk).toMatchObject({ score: expect.any(Number), rating: expect.any(String), lgdBps: 6_000 });
    expect(before.risk!.factors.map((f) => f.key)).toEqual(
      expect.arrayContaining(["acceptance", "coobligation", "term", "log_amount", "climate", "concentration", "on_time", "seasons"]),
    );
    expect(before.risk!.model).toMatchObject({ synthetic: true });
    expect(before.risk!.factors.find((f) => f.key === "acceptance")!.points).toBeLessThan(0);

    const { id } = await createPublished(built);
    const after: Receivable = await get(built, `/receivables/${id}`);
    expect(after.risk!.factors.find((f) => f.key === "acceptance")!.points).toBeGreaterThan(0);
    expect(after.risk!.factors.find((f) => f.key === "coobligation")!.points).toBeGreaterThan(0);
    expect(after.risk!.pdTermBps).toBeLessThan(before.risk!.pdTermBps);
    expect(after.risk!.lgdBps).toBe(3_500);
    // Perda esperada = PD no prazo × LGD × valor (a PD exibida está arredondada em pontos-base).
    expect(after.risk!.expectedLossCents / ((after.risk!.pdTermBps / 10_000) * 0.35 * after.amountCents)).toBeCloseTo(1, 2);
    // O risco é calculado na leitura e não fica gravado no db.json.
    expect(built.store.get(id)).not.toHaveProperty("risk");
    // A lista leva o resumo do risco.
    const list = await get(built, "/receivables");
    expect(list.items[0].risk).toEqual({ score: after.risk!.score, rating: after.risk!.rating });
  });

  it("as propostas automáticas usam o spread-base do rating mais o ajuste do financiador", async () => {
    const built = await makeApp();
    const { id } = await createPublished(built);
    const r: Receivable = await get(built, `/receivables/${id}`);
    const items: Offer[] = (await get(built, `/receivables/${id}/offers`)).items;
    const b = items.find((o) => o.funder.id === "fnd_b")!;
    const c = items.find((o) => o.funder.id === "fnd_c")!;
    expect(b.spreadBps! - r.risk!.spreadBaseBps).toBeGreaterThanOrEqual(60);
    expect(b.spreadBps! - r.risk!.spreadBaseBps).toBeLessThanOrEqual(90);
    expect(c.spreadBps! - r.risk!.spreadBaseBps).toBeGreaterThanOrEqual(120);
    // Banco recolhe IOF; cooperativa não (configuração padrão).
    expect(b.iofCents).toBeGreaterThan(0);
    expect(c.iofCents).toBe(0);
  });
});

describe("configurações e administração (§15.5)", () => {
  it("lê, valida e altera as configurações; a taxa nova vale para as próximas propostas", async () => {
    const built = await makeApp();
    const s = await get(built, "/admin/settings");
    expect(s).toMatchObject({ platformFeeBps: 50, registryFeeCents: 2_500, cdi: { source: "bcb", manualAnnualBps: 1365 } });

    const bad = await built.app.inject({ method: "PUT", url: "/api/v1/admin/settings", payload: { platformFeeBps: 900, ratings: { AA: { spreadBps: -1 } } } });
    expect(bad.statusCode).toBe(422);
    expect(Object.keys(bad.json().error.fieldErrors).sort()).toEqual(["platformFeeBps", "ratings.AA.spreadBps"]);

    const ok = await built.app.inject({ method: "PUT", url: "/api/v1/admin/settings", payload: { platformFeeBps: 80, cdi: { source: "manual", manualAnnualBps: 1300 } } });
    expect(ok.json()).toMatchObject({ platformFeeBps: 80, cdi: { source: "manual", manualAnnualBps: 1300 } });
    expect(await get(built, "/pricing/reference")).toMatchObject({ cdiAnnualBps: 1300, cdiSource: "manual", platformFeeBps: 80 });

    const { id } = await createPublished(built);
    const items: Offer[] = (await get(built, `/receivables/${id}/offers`)).items;
    expect(items.every((o) => o.platformFeeCents === 120_000 && o.cdiBps === 1300)).toBe(true);
  });

  it("simulação de preço (quote) sem alterar estado", async () => {
    const built = await makeApp();
    const { id } = await createConfirmed(built);
    const q = await built.app.inject({ method: "POST", url: `/api/v1/receivables/${id}/quote`, payload: { funderId: "fnd_a", spreadBps: 400, feesCents: 0 } });
    expect(q.statusCode).toBe(200);
    expect(q.json()).toMatchObject({ spreadBps: 400, cdiBps: 1490, platformFeeCents: 75_000, registryFeeCents: 2_500, iofCents: 0 });
    expect((await built.app.inject({ method: "POST", url: `/api/v1/receivables/${id}/quote`, payload: { funderId: "fnd_a", spreadBps: 10, feesCents: 0 } })).statusCode).toBe(422);
    expect((await get(built, `/receivables/${id}`)).events.some((e: { type: string }) => e.type === "offer_proposed")).toBe(false);
  });

  it("distribuidoras demo: cadastro por distribuidora, filtro da lista e painel", async () => {
    const built = await makeApp();
    expect((await get(built, "/distributors")).items.map((d: { id: string }) => d.id)).toEqual(["dst_a", "dst_b", "dst_c"]);
    const res = await built.app.inject({ method: "POST", url: "/api/v1/receivables", payload: form({ ...validInput(), distributorId: "dst_c" }, uniquePdf()) });
    expect(res.json().distributor).toEqual({ id: "dst_c", name: "Sul Sementes (demo)" });
    expect(res.json().registry.creditor.name).toBe("Sul Sementes (demo)");
    await createOne(built.app);
    expect((await get(built, "/receivables?distributorId=dst_c")).items).toHaveLength(1);
    expect((await get(built, "/receivables")).items).toHaveLength(2);
    const bad = await built.app.inject({ method: "POST", url: "/api/v1/receivables", payload: form({ ...validInput(), distributorId: "dst_x" }, uniquePdf()) });
    expect(bad.json().error.fieldErrors.distributorId).toBeTruthy();

    const d = await get(built, "/admin/distributors");
    expect(d.items.find((x: { id: string }) => x.id === "dst_c")).toMatchObject({ receivables: 1, volumeCents: 15_000_000, topDebtor: { alias: "Produtor Demo 01", shareBps: 10_000 } });
  });

  it("visão geral, recebíveis, financiadores e risco do painel", async () => {
    const built = await makeApp();
    await createPublished(built);
    await createOne(built.app);
    const o = await get(built, "/admin/overview");
    expect(o).toMatchObject({ isSimulated: true, receivables: 2, portfolioCents: 30_000_000, assignedCount: 0, revenueCents: 0, byStatus: { published: 1, created: 1 } });
    expect(Object.values(o.ratingMix as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(2);
    const rs = await get(built, "/admin/receivables");
    expect(rs.items).toHaveLength(2);
    expect(rs.items[0]).toHaveProperty("rating");
    const f = await get(built, "/admin/funders");
    expect(f.items.find((x: { id: string }) => x.id === "fnd_b")).toMatchObject({ proposals: 1, accepted: 0, boughtCount: 0 });
    const k = await get(built, "/admin/risk");
    expect(k.ratings).toHaveLength(9);
    expect(k.byDebtor[0]).toMatchObject({ key: "Produtor Demo 01", count: 2, amountCents: 30_000_000 });
    expect(k.expectedLossCents).toBe(k.ratings.reduce((s: number, x: { expectedLossCents: number }) => s + x.expectedLossCents, 0));
  });

  it("publicar continua exigindo o termo (sanidade da v1.3)", async () => {
    const built = await makeApp();
    const { id } = await createConfirmed(built);
    expect((await built.app.inject({ method: "POST", url: `/api/v1/receivables/${id}/publish`, payload: PUBLISH_BODY })).statusCode).toBe(202);
  });
});
