import "dotenv/config";
import path from "node:path";

// Leitura das variáveis de ambiente. A secret da carteira nunca é logada.
export interface Config {
  port: number;
  frontendOrigins: string[];
  solanaRpcUrl: string;
  feePayerSecret: string | null;
  dataDir: string;
  demoResetEnabled: boolean;
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
  };
}
