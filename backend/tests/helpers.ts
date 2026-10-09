import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildApp } from "../src/app.js";
import type { ChainGateway } from "../src/chain/solana.js";
import { loadConfig } from "../src/config.js";

export const PDF = Buffer.from("%PDF-1.4\n% documento de teste AgroFlux\n%%EOF\n");
export const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

export const validInput = () => ({
  debtor: { alias: "Produtor Demo 01", state: "MT" },
  product: { category: "fertilizer", description: "Fertilizante NPK 20-05-20" },
  cropSeason: "2026/27",
  amountCents: 15_000_000,
  issueDate: "2026-10-01",
  dueDate: "2027-03-15",
  documentKind: "test_invoice",
});

export const fakeChain = (over: Partial<ChainGateway> = {}): ChainGateway => ({
  health: async () => ({ reachable: true, feePayerBalanceLamports: 1_000_000_000 }),
  ...over,
});

export async function makeApp(chain: ChainGateway = fakeChain()) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agroflux-test-"));
  const config = loadConfig({ FRONTEND_ORIGIN: "http://localhost:3000", DATA_DIR: dataDir });
  const app = await buildApp({ config, chain });
  return { app, dataDir };
}

export function form(data: unknown, file: Buffer | null = PDF, filename = "nf-teste.pdf", type = "application/pdf") {
  const fd = new FormData();
  if (data !== undefined) fd.append("data", typeof data === "string" ? data : JSON.stringify(data));
  if (file) fd.append("document", new Blob([new Uint8Array(file)], { type }), filename);
  return fd;
}
