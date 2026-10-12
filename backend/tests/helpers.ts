import fs from "node:fs";
import type { ClaudeToolCaller } from "../src/ai/claude.js";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { buildApp } from "../src/app.js";
import type { AssignmentGateway } from "../src/chain/assignment.js";
import type { ChainGateway } from "../src/chain/solana.js";
import { fixedCdi, type CdiProvider } from "../src/pricing/cdi.js";
import { loadConfig } from "../src/config.js";

export const PDF = Buffer.from("%PDF-1.4\n% documento de teste AgroFlux\n%%EOF\n");
// v1.2: a registradora simulada recusa documento repetido; cada recebível de teste ganha um PDF próprio.
export const uniquePdf = () => Buffer.from(`%PDF-1.4\n% documento de teste AgroFlux ${randomBytes(6).toString("hex")}\n%%EOF\n`);
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
  let sent = 0;
  return {
    health: async () => ({ reachable: true, feePayerBalanceLamports: 1_000_000_000 }),
    ping: async () => {},
    // O primeiro envio usa TEST_SIGNATURE; os seguintes, assinaturas de teste distintas.
    sendMemo: async (memo, opts) => {
      const signature = sent++ === 0 ? TEST_SIGNATURE : `TestSig${sent}`.padEnd(TEST_SIGNATURE.length, "1");
      opts.onSubmitted?.(signature);
      ledger.set(signature, memo);
      return { signature, slot: 4242, blockTime: "2026-10-09T15:00:00.000Z" };
    },
    checkSignature: async () => null,
    fetchMemo: async (sig) => (ledger.has(sig) ? { memo: ledger.get(sig)! } : null),
    ...over,
  };
};

// Pede o link e confirma como sacado, esperando o memo da confirmação.
export async function confirmDebtor(built: Awaited<ReturnType<typeof makeApp>>, id: string) {
  const req = (await built.app.inject({ method: "POST", url: `/api/v1/receivables/${id}/debtor-confirmation` })).json();
  await built.app.inject({ method: "POST", url: `/api/v1/confirmations/${req.token}/confirm` });
  await built.confirmations.settle();
  return req.token as string;
}

// Cria, registra e confirma pelo sacado: pronto para selecionar oferta.
export async function createConfirmed(built: Awaited<ReturnType<typeof makeApp>>) {
  const r = await createRegistered(built);
  await confirmDebtor(built, r.id);
  return r;
}

export const TODAY = "2026-10-10";
export const PUBLISH_BODY = { acceptTerms: true, termsVersion: "coobrigacao-demo-v1" };

// Cria, registra, confirma e publica (termo aceito): pronto para receber e aceitar propostas.
export async function createPublished(built: Awaited<ReturnType<typeof makeApp>>) {
  const r = await createConfirmed(built);
  const res = await built.app.inject({ method: "POST", url: `/api/v1/receivables/${r.id}/publish`, payload: PUBLISH_BODY });
  if (res.statusCode !== 202) throw new Error(`publish falhou: ${res.body}`);
  await built.listings.settle();
  return r;
}

// Cria um recebível e leva até `registered` com o dublê.
export async function createRegistered(built: Awaited<ReturnType<typeof makeApp>>) {
  const r = await createOne(built.app);
  await built.app.inject({ method: "POST", url: `/api/v1/receivables/${r.id}/register` });
  await settle(built.registrar);
  return r as { id: string };
}

export async function makeApp(
  chain: ChainGateway = fakeChain(),
  opts: { dataDir?: string; confirmTimeoutMs?: number; env?: Record<string, string>; assignmentGateway?: AssignmentGateway; cdiProvider?: CdiProvider; today?: string; aiCaller?: ClaudeToolCaller } = {},
) {
  const dataDir = opts.dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "agroflux-test-"));
  const config = loadConfig({ FRONTEND_ORIGIN: "http://localhost:3000", DATA_DIR: dataDir, CLIMATE_SOURCE: "off", ...opts.env });
  // v1.3: CDI fixo (14,90% a.a.) e data de cálculo fixa, para o preço ser determinístico e sem rede externa.
  const today = opts.today ?? TODAY;
  const built = await buildApp({
    config,
    chain,
    confirmTimeoutMs: opts.confirmTimeoutMs,
    assignmentGateway: opts.assignmentGateway,
    cdiProvider: opts.cdiProvider ?? fixedCdi(1490),
    today: () => today,
    aiCaller: opts.aiCaller,
  });
  return { ...built, dataDir };
}

type Built = Awaited<ReturnType<typeof makeApp>>;

export async function createOne(app: Built["app"]) {
  const res = await app.inject({ method: "POST", url: "/api/v1/receivables", payload: form(validInput(), uniquePdf()) });
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
