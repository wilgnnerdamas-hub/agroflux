import "dotenv/config";
import path from "node:path";
import type { DistributorId, FunderId } from "./types.js";

// Tesouraria fixa no programa de escrow (constante TREASURY em blockchain/programs/agroflux-escrow/src/lib.rs).
export const DEFAULT_TREASURY = "8j5HxEYAX1hFToDWjBQsvvKYafAc67qr76xjq5K53XVq";

// Leitura das variáveis de ambiente. A secret da carteira nunca é logada.
export interface Config {
  port: number;
  frontendOrigins: string[];
  solanaRpcUrl: string;
  feePayerSecret: string | null;
  dataDir: string;
  demoResetEnabled: boolean;
  assignmentEnabled: boolean;
  // Função B (§6.4): carteiras de demonstração, mint tBRL-DEMO e programa de escrow. Secrets só no .env.
  // v1.2: uma carteira por financiador demo (A = DEMO_FUNDER_SECRET, B e C novas).
  // v1.3: uma carteira por distribuidora demo e a tesouraria da AgroFlux (só o endereço público).
  assignment: {
    distributorSecrets: Record<DistributorId, string>;
    funderSecrets: Record<FunderId, string>;
    settlementMint: string;
    escrowProgramId: string;
    treasury: string;
  } | null;
  /** Busca o CDI na API do Banco Central (`CDI_SOURCE=manual` desliga). */
  cdiFromBcb: boolean;
  /** Chuva real por UF (Open-Meteo) no risco. */
  climateFromOpenMeteo: boolean;
  /** Analista de IA: OpenAI (`OPENAI_API_KEY`) ou Anthropic (`ANTHROPIC_API_KEY`); sem chave, desligado. */
  ai: { provider: "openai" | "anthropic"; apiKey: string; model: string } | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 4000),
    frontendOrigins: (env.FRONTEND_ORIGIN ?? "http://localhost:3000")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    solanaRpcUrl: env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    feePayerSecret: env.SOLANA_FEE_PAYER_SECRET?.trim() || null,
    dataDir: path.resolve(env.DATA_DIR || "./data"),
    demoResetEnabled: env.DEMO_RESET_ENABLED === "true",
    assignmentEnabled: env.ASSIGNMENT_ENABLED === "true",
    assignment:
      env.DEMO_DISTRIBUTOR_SECRET && env.DEMO_DISTRIBUTOR_B_SECRET && env.DEMO_DISTRIBUTOR_C_SECRET &&
      env.DEMO_FUNDER_SECRET && env.DEMO_FUNDER_B_SECRET && env.DEMO_FUNDER_C_SECRET && env.TBRL_MINT && env.ESCROW_PROGRAM_ID
        ? {
            distributorSecrets: {
              dst_a: env.DEMO_DISTRIBUTOR_SECRET.trim(),
              dst_b: env.DEMO_DISTRIBUTOR_B_SECRET.trim(),
              dst_c: env.DEMO_DISTRIBUTOR_C_SECRET.trim(),
            },
            treasury: env.AGROFLUX_TREASURY?.trim() || DEFAULT_TREASURY,
            funderSecrets: { fnd_a: env.DEMO_FUNDER_SECRET.trim(), fnd_b: env.DEMO_FUNDER_B_SECRET.trim(), fnd_c: env.DEMO_FUNDER_C_SECRET.trim() },
            settlementMint: env.TBRL_MINT.trim(),
            escrowProgramId: env.ESCROW_PROGRAM_ID.trim(),
          }
        : null,
    cdiFromBcb: env.CDI_SOURCE !== "manual",
    /** Lê a chuva real por UF no Open-Meteo para o risco (`CLIMATE_SOURCE=off` desliga). */
    climateFromOpenMeteo: env.CLIMATE_SOURCE !== "off",
    ai: env.OPENAI_API_KEY?.trim()
      ? { provider: "openai", apiKey: env.OPENAI_API_KEY.trim(), model: env.OPENAI_MODEL?.trim() || "gpt-4.1" }
      : env.ANTHROPIC_API_KEY?.trim()
        ? { provider: "anthropic", apiKey: env.ANTHROPIC_API_KEY.trim(), model: env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5" }
        : null,
  };
}
