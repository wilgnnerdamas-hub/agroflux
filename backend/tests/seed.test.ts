import { describe, expect, it } from "vitest";
import { ChainFailure } from "../src/chain/solana.js";
import { detectMime } from "../src/validation.js";
import { demoPdf } from "../src/seed.js";
import { createOne, fakeChain, makeApp } from "./helpers.js";

const ON = { env: { DEMO_RESET_ENABLED: "true" } };

describe("POST /api/v1/demo/reset", () => {
  it("não existe sem DEMO_RESET_ENABLED=true", async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: "POST", url: "/api/v1/demo/reset" });
    expect(res.statusCode).toBe(404);
  });

  it("apaga os dados e recria 1 registrado + 1 cadastrado + 1 publicado (txs do seed)", async () => {
    const { app } = await makeApp(fakeChain(), ON);
    await createOne(app);
    await createOne(app);
    await createOne(app);

    const res = await app.inject({ method: "POST", url: "/api/v1/demo/reset" });
    expect(res.statusCode).toBe(204);

    const list = (await app.inject({ method: "GET", url: "/api/v1/receivables" })).json();
    expect(list.totals).toMatchObject({ count: 5, registeredCount: 3, pendingCount: 0, offerSelectedCount: 0, publishedCount: 2, debtorConfirmedCount: 2 });
    const byRef = Object.fromEntries(list.items.map((i: { reference: string; status: string }) => [i.reference, i.status]));
    // Sem a função B ligada, o AGF-0004 para em publicado (com ela, chega a cedido).
    expect(byRef).toEqual({ "AGF-0001": "registered", "AGF-0002": "created", "AGF-0003": "published", "AGF-0004": "published", "AGF-0005": "created" });
    const dist = Object.fromEntries(list.items.map((i: { reference: string; distributor: { id: string } }) => [i.reference, i.distributor.id]));
    expect(dist).toEqual({ "AGF-0001": "dst_a", "AGF-0002": "dst_b", "AGF-0003": "dst_c", "AGF-0004": "dst_b", "AGF-0005": "dst_a" });

    const pub = list.items.find((i: { reference: string }) => i.reference === "AGF-0003");
    const pubFull = (await app.inject({ method: "GET", url: `/api/v1/receivables/${pub.id}` })).json();
    expect(pubFull.listing.chain.status).toBe("confirmed");
    expect(pubFull.registry.registryId).toBe("REG-DEMO-000003");
    const market = (await app.inject({ method: "GET", url: "/api/v1/marketplace?funderId=fnd_a" })).json();
    expect(market.items).toHaveLength(2);
    expect(market.items.find((i: { registryId: string }) => i.registryId === "REG-DEMO-000003")).toMatchObject({ debtorAccepted: true, offerCount: 2, myOffer: null });
    const pv = (await app.inject({ method: "GET", url: `/api/v1/receivables/${pub.id}/verification` })).json();
    expect(pv.verified).toBe(true);
    expect(pv.checks.map((c: { name: string }) => c.name)).toContain("terms_matches");

    const reg = list.items.find((i: { reference: string }) => i.reference === "AGF-0001");
    const full = (await app.inject({ method: "GET", url: `/api/v1/receivables/${reg.id}` })).json();
    expect(full.chain.signature).toBeTruthy();
    expect(full.debtor.alias).toBe("Produtor Demo 01");
    // Os dados semeados passam na mesma validação do cadastro.
    const v = await app.inject({ method: "GET", url: `/api/v1/receivables/${reg.id}/verification` });
    expect(v.json().verified).toBe(true);
  });

  it("responde 503 se o exemplo registrado não confirmar", async () => {
    const { app } = await makeApp(fakeChain({ sendMemo: async () => { throw new ChainFailure("INSUFFICIENT_FUNDS"); } }), ON);
    const res = await app.inject({ method: "POST", url: "/api/v1/demo/reset" });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.message).toMatch(/sem saldo/);
  });

  it("cada reset gera documentos novos (as travas on-chain antigas não bloqueiam o seed)", async () => {
    const { app } = await makeApp(fakeChain(), ON);
    const hashes = async () => {
      const list = (await app.inject({ method: "GET", url: "/api/v1/receivables" })).json();
      return Promise.all(
        list.items.map(async (i: { id: string }) => (await app.inject({ method: "GET", url: `/api/v1/receivables/${i.id}` })).json().documents[0].sha256 as string),
      );
    };
    await app.inject({ method: "POST", url: "/api/v1/demo/reset" });
    const first = await hashes();
    await new Promise((r) => setTimeout(r, 5));
    await app.inject({ method: "POST", url: "/api/v1/demo/reset" });
    const second = await hashes();
    expect(second.some((h) => first.includes(h))).toBe(false);
    expect(demoPdf("X", "a").equals(demoPdf("X", "b"))).toBe(false);
  });

  it("o PDF de exemplo é reconhecido como PDF", () => {
    const pdf = demoPdf("Teste");
    expect(detectMime(pdf)).toBe("application/pdf");
    expect(pdf.toString("latin1")).toMatch(/%%EOF\n$/);
  });
});
