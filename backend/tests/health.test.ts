import { describe, expect, it } from "vitest";
import { fakeChain, makeApp } from "./helpers.js";

describe("GET /api/v1/health", () => {
  it("responde no formato do contrato", async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: "ok",
      version: "1.0.0",
      cluster: "devnet",
      solana: { reachable: true, feePayerBalanceLamports: 1_000_000_000 },
    });
  });

  it("libera CORS só para a origem do frontend", async () => {
    const { app } = await makeApp(fakeChain({ health: async () => ({ reachable: false, feePayerBalanceLamports: null }) }));
    const ok = await app.inject({ method: "GET", url: "/api/v1/health", headers: { origin: "http://localhost:3000" } });
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    const other = await app.inject({ method: "GET", url: "/api/v1/health", headers: { origin: "http://evil.test" } });
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rota desconhecida usa o envelope de erro", async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/nada" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });
});
