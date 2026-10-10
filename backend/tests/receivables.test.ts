import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { form, makeApp, PDF, sha, validInput } from "./helpers.js";

describe("POST /api/v1/receivables", () => {
  it("cria o recebível com documento, hash e eventos", async () => {
    const { app, dataDir } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/receivables",
      payload: form(validInput()),
      headers: { "x-client-sha256": sha(PDF) },
    });
    expect(res.statusCode).toBe(201);
    const r = res.json();
    expect(r.id).toMatch(/^rcv_/);
    expect(r.reference).toBe("AGF-0001");
    expect(r.status).toBe("created");
    expect(r.isDemo).toBe(true);
    expect(r.distributor).toEqual({ name: "Distribuidora Demo" });
    expect(r.termDays).toBe(165);
    expect(r.documents[0]).toMatchObject({ kind: "test_invoice", filename: "nf-teste.pdf", mimeType: "application/pdf", sizeBytes: PDF.length, sha256: sha(PDF) });
    expect(r.chain).toMatchObject({ status: "none", cluster: "devnet", signature: null });
    expect(r.events.map((e: { type: string }) => e.type)).toEqual(["receivable_created", "document_attached"]);
    expect(r.selectedOfferId).toBeNull();
    expect(r.debtorConfirmation).toEqual({ status: "none", isSimulated: true, requestedAt: null, expiresAt: null, respondedAt: null, chain: null });
    expect(r.assignment).toMatchObject({ status: "none", isSimulated: true, cluster: "devnet", settlementAsset: "tBRL-DEMO", tokenMint: null });
    // Arquivo guardado de forma privada.
    expect(fs.readdirSync(path.join(dataDir, "uploads"))).toHaveLength(1);
  });

  it("recusa hash divergente sem salvar nada", async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: "POST", url: "/api/v1/receivables", payload: form(validInput()), headers: { "x-client-sha256": "0".repeat(64) } });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("HASH_MISMATCH");
    const list = await app.inject({ method: "GET", url: "/api/v1/receivables" });
    expect(list.json().totals.count).toBe(0);
  });

  it("valida os campos do §8 com fieldErrors", async () => {
    const { app } = await makeApp();
    const bad = { ...validInput(), debtor: { alias: "123.456.789-01", state: "XX" }, cropSeason: "2026/28", amountCents: 10, dueDate: "2026-10-05" };
    const res = await app.inject({ method: "POST", url: "/api/v1/receivables", payload: form(bad, null) });
    expect(res.statusCode).toBe(422);
    const { error } = res.json();
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(error.fieldErrors).sort()).toEqual(["amountCents", "cropSeason", "debtor.alias", "debtor.state", "document", "dueDate"]);
  });

  it("recusa emissão futura", async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: "POST", url: "/api/v1/receivables", payload: form({ ...validInput(), issueDate: "2099-01-01", dueDate: "2099-03-01" }) });
    expect(res.json().error.fieldErrors.issueDate).toBe("A emissão não pode ser futura.");
  });

  it("recusa tipo de arquivo pelo conteúdo (415)", async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: "POST", url: "/api/v1/receivables", payload: form(validInput(), Buffer.from("não sou um pdf"), "falso.pdf") });
    expect(res.statusCode).toBe(415);
    expect(res.json().error.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("recusa arquivo acima de 5 MB (413)", async () => {
    const { app } = await makeApp();
    const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await app.inject({ method: "POST", url: "/api/v1/receivables", payload: form(validInput(), big) });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe("FILE_TOO_LARGE");
  });

  it("parte data ausente ou malformada vira 400", async () => {
    const { app } = await makeApp();
    const a = await app.inject({ method: "POST", url: "/api/v1/receivables", payload: form(undefined) });
    expect(a.statusCode).toBe(400);
    const b = await app.inject({ method: "POST", url: "/api/v1/receivables", payload: form("{oops") });
    expect(b.json().error.code).toBe("BAD_REQUEST");
  });
});

describe("GET /api/v1/receivables e /:id", () => {
  it("lista em ordem decrescente com totais e mostra o passaporte", async () => {
    const { app } = await makeApp();
    const a = (await app.inject({ method: "POST", url: "/api/v1/receivables", payload: form(validInput()) })).json();
    await new Promise((r) => setTimeout(r, 5));
    const b = (await app.inject({ method: "POST", url: "/api/v1/receivables", payload: form({ ...validInput(), amountCents: 200_000 }) })).json();

    const list = (await app.inject({ method: "GET", url: "/api/v1/receivables" })).json();
    expect(list.items.map((i: { id: string }) => i.id)).toEqual([b.id, a.id]);
    expect(list.items[0]).toEqual({
      id: b.id, reference: "AGF-0002", status: "created", debtor: b.debtor, product: b.product,
      amountCents: 200_000, currency: "BRL", dueDate: b.dueDate, chain: { status: "none" }, selectedOfferId: null,
      debtorConfirmation: { status: "none" }, assignment: { status: "none" }, createdAt: b.createdAt,
    });
    expect(list.totals).toEqual({ count: 2, amountCents: 15_200_000, registeredCount: 0, pendingCount: 0, offerSelectedCount: 0, debtorConfirmedCount: 0, assignedCount: 0 });

    const one = await app.inject({ method: "GET", url: `/api/v1/receivables/${a.id}` });
    expect(one.json()).toEqual(a);
    const missing = await app.inject({ method: "GET", url: "/api/v1/receivables/rcv_nao_existe" });
    expect(missing.statusCode).toBe(404);
  });
});

describe("migração de dados da v1.0", () => {
  it("completa debtorConfirmation e assignment ao carregar um db.json antigo", async () => {
    const { app, dataDir } = await makeApp();
    const created = (await app.inject({ method: "POST", url: "/api/v1/receivables", payload: form(validInput()) })).json();
    const file = path.join(dataDir, "db.json");
    const db = JSON.parse(fs.readFileSync(file, "utf8"));
    delete db.receivables[created.id].debtorConfirmation;
    delete db.receivables[created.id].assignment;
    delete db.confirmationTokens;
    fs.writeFileSync(file, JSON.stringify(db));

    const { app: app2 } = await makeApp(undefined, { dataDir });
    const r = (await app2.inject({ method: "GET", url: `/api/v1/receivables/${created.id}` })).json();
    expect(r.debtorConfirmation.status).toBe("none");
    expect(r.assignment.status).toBe("none");
    const list = (await app2.inject({ method: "GET", url: "/api/v1/receivables" })).json();
    expect(list.items[0].debtorConfirmation).toEqual({ status: "none" });
  });
});
