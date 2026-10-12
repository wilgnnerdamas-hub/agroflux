import { describe, expect, it } from "vitest";
import { createOne, makeApp } from "./helpers.js";

describe("verificador público (GET /verify/:sha256)", () => {
  it("valida o hash e diz se o documento está na AgroFlux", async () => {
    const { app } = await makeApp();
    expect((await app.inject({ method: "GET", url: "/api/v1/verify/abc" })).statusCode).toBe(400);

    const unknown = (await app.inject({ method: "GET", url: `/api/v1/verify/${"0".repeat(64)}` })).json();
    expect(unknown).toMatchObject({ found: false, receivable: null, proofs: null });
    // Sem a cessão configurada, a trava on-chain não é consultada.
    expect(unknown.onChainLock.checked).toBe(false);

    const created = await createOne(app);
    const sha = created.documents[0].sha256;
    const res = (await app.inject({ method: "GET", url: `/api/v1/verify/${sha.toUpperCase()}` })).json();
    expect(res.found).toBe(true);
    expect(res.receivable).toMatchObject({ reference: created.reference, registryId: created.registry.registryId, status: "created" });
    expect(res.proofs).toEqual({ registration: null, debtorConfirmation: null, publication: null, assignment: null });
  });
});
