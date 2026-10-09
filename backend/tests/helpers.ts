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

// Assinatura de teste: não existe na Solana.
export const TEST_SIGNATURE = "TestSig1111111111111111111111111111111111111111111111111111111111";

// Dublê da Solana: guarda o memo "enviado" para o fetchMemo devolver depois.
export const fakeChain = (over: Partial<ChainGateway> = {}): ChainGateway => {
  const ledger = new Map<string, string>();
  return {
    health: async () => ({ reachable: true, feePayerBalanceLamports: 1_000_000_000 }),
    ping: async () => {},
    sendMemo: async (memo, opts) => {
      opts.onSubmitted?.(TEST_SIGNATURE);
      ledger.set(TEST_SIGNATURE, memo);
      return { signature: TEST_SIGNATURE, slot: 4242, blockTime: "2026-10-09T15:00:00.000Z" };
    },
    checkSignature: async () => null,
    fetchMemo: async (sig) => (ledger.has(sig) ? { memo: ledger.get(sig)! } : null),
    ...over,
  };
};

// Cria um recebível e leva até `registered` com o dublê.
export async function createRegistered(built: Awaited<ReturnType<typeof makeApp>>) {
  const r = await createOne(built.app);
  await built.app.inject({ method: "POST", url: `/api/v1/receivables/${r.id}/register` });
  await settle(built.registrar);
  return r as { id: string };
}

export async function makeApp(chain: ChainGateway = fakeChain(), opts: { dataDir?: string; confirmTimeoutMs?: number } = {}) {
  const dataDir = opts.dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "agroflux-test-"));
  const config = loadConfig({ FRONTEND_ORIGIN: "http://localhost:3000", DATA_DIR: dataDir });
  const built = await buildApp({ config, chain, confirmTimeoutMs: opts.confirmTimeoutMs });
  return { ...built, dataDir };
}

type Built = Awaited<ReturnType<typeof makeApp>>;

export async function createOne(app: Built["app"]) {
  const res = await app.inject({ method: "POST", url: "/api/v1/receivables", payload: form(validInput()) });
  return res.json();
}

// Espera as tentativas de registro em andamento terminarem.
export const settle = (registrar: Built["registrar"]) => Promise.all([...registrar.inflight.values()]);

export function form(data: unknown, file: Buffer | null = PDF, filename = "nf-teste.pdf", type = "application/pdf") {
  const fd = new FormData();
  if (data !== undefined) fd.append("data", typeof data === "string" ? data : JSON.stringify(data));
  if (file) fd.append("document", new Blob([new Uint8Array(file)], { type }), filename);
  return fd;
}
