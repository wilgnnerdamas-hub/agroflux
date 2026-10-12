import { describe, expect, it } from "vitest";
import type { ClaudeCall } from "../src/ai/claude.js";
import type { Receivable } from "../src/types.js";
import { createOne, makeApp } from "./helpers.js";

// Dublê do Claude: responde a conferência e o parecer conforme a ferramenta pedida.
function fakeClaude(opts: { amountFound?: string; fail?: boolean } = {}) {
  const calls: ClaudeCall[] = [];
  const caller = async (call: ClaudeCall) => {
    calls.push(call);
    if (opts.fail) throw new Error("Anthropic API 529");
    if (call.tool.name === "report_document_check") {
      const text = call.content.find((c) => c.type === "text") as { text: string };
      const declaredAmount = /amount: (.*)/.exec(text.text)![1];
      const found = opts.amountFound ?? declaredAmount;
      return {
        readable: true,
        document_type: "NF-e de teste",
        fields: [
          { field: "amount", found, status: found === declaredAmount ? "match" : "mismatch" },
          { field: "issueDate", found: "01/10/2026", status: "match" },
          { field: "dueDate", found: null, status: "not_found" },
          { field: "product", found: "Fertilizante", status: "match" },
          { field: "debtor", found: "Produtor Demo", status: "match" },
        ],
        summary: "Conferência de teste.",
      };
    }
    return { memo: "Parecer de teste.", strengths: ["Aceite registrado"], concerns: ["Prazo longo", "x", "y", "z"] };
  };
  return { caller, calls };
}

const waitFor = async (fn: () => Promise<boolean>, ms = 2_000) => {
  const t0 = Date.now();
  while (!(await fn())) {
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe("analista de IA (Claude)", () => {
  it("sem chave: recurso desligado, sem conferência", async () => {
    const built = await makeApp();
    const health = (await built.app.inject({ method: "GET", url: "/api/v1/health" })).json();
    expect(health.features.ai).toBe(false);
    const created = await createOne(built.app);
    expect(created.documentCheck).toBeUndefined();
    const res = await built.app.inject({ method: "POST", url: `/api/v1/receivables/${created.id}/risk-memo`, payload: { lang: "pt" } });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("AI_UNAVAILABLE");
  });

  it("confere o documento em segundo plano; divergência vira fator de risco", async () => {
    const ok = fakeClaude();
    const a = await makeApp(undefined, { aiCaller: ok.caller });
    const createdA = await createOne(a.app);
    expect(createdA.documentCheck.status).toBe("pending");
    await waitFor(async () => (await a.app.inject({ method: "GET", url: `/api/v1/receivables/${createdA.id}` })).json().documentCheck.status === "done");
    const ra: Receivable = (await a.app.inject({ method: "GET", url: `/api/v1/receivables/${createdA.id}` })).json();
    expect(ra.documentCheck!.verdict).toBe("consistent");
    // O documento vai como PDF para o Claude, junto dos dados declarados.
    expect(ok.calls[0].content[0].type).toBe("document");

    const bad = fakeClaude({ amountFound: "R$ 1,00" });
    const b = await makeApp(undefined, { aiCaller: bad.caller });
    const createdB = await createOne(b.app);
    await waitFor(async () => (await b.app.inject({ method: "GET", url: `/api/v1/receivables/${createdB.id}` })).json().documentCheck.status === "done");
    const rb: Receivable = (await b.app.inject({ method: "GET", url: `/api/v1/receivables/${createdB.id}` })).json();
    expect(rb.documentCheck!.verdict).toBe("divergent");
    expect(rb.documentCheck!.fields.find((f) => f.field === "amount")!.status).toBe("mismatch");
    const factor = rb.risk!.factors.find((f) => f.key === "document_ai")!;
    expect(factor.points).toBeLessThan(0);
    expect(rb.risk!.pdTermBps).toBeGreaterThan(ra.risk!.pdTermBps);
  });

  it("falha da IA não quebra o cadastro; parecer fica em cache por idioma", async () => {
    const down = fakeClaude({ fail: true });
    const d = await makeApp(undefined, { aiCaller: down.caller });
    const created = await createOne(d.app);
    expect(created.status).toBe("created");
    await waitFor(async () => (await d.app.inject({ method: "GET", url: `/api/v1/receivables/${created.id}` })).json().documentCheck.status === "failed");

    const ok = fakeClaude();
    const built = await makeApp(undefined, { aiCaller: ok.caller });
    const c = await createOne(built.app);
    const memo1 = (await built.app.inject({ method: "POST", url: `/api/v1/receivables/${c.id}/risk-memo`, payload: { lang: "pt" } })).json().memo;
    expect(memo1.memo).toBe("Parecer de teste.");
    expect(memo1.concerns).toHaveLength(3);
    const before = ok.calls.length;
    const memo2 = (await built.app.inject({ method: "POST", url: `/api/v1/receivables/${c.id}/risk-memo`, payload: { lang: "pt" } })).json().memo;
    expect(memo2.createdAt).toBe(memo1.createdAt);
    expect(ok.calls.length).toBe(before);
  });
});
