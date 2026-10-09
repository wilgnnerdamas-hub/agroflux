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

  it("apaga os dados e recria 1 registrado (tx do seed) + 1 cadastrado", async () => {
    const { app } = await makeApp(fakeChain(), ON);
    await createOne(app);
    await createOne(app);
    await createOne(app);

    const res = await app.inject({ method: "POST", url: "/api/v1/demo/reset" });
    expect(res.statusCode).toBe(204);

    const list = (await app.inject({ method: "GET", url: "/api/v1/receivables" })).json();
    expect(list.totals).toMatchObject({ count: 2, registeredCount: 1, pendingCount: 0, offerSelectedCount: 0 });
    const byRef = Object.fromEntries(list.items.map((i: { reference: string; status: string }) => [i.reference, i.status]));
    expect(byRef).toEqual({ "AGF-0001": "registered", "AGF-0002": "created" });

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

  it("o PDF de exemplo é reconhecido como PDF", () => {
    const pdf = demoPdf("Teste");
    expect(detectMime(pdf)).toBe("application/pdf");
    expect(pdf.toString("latin1")).toMatch(/%%EOF\n$/);
  });
});
