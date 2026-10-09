import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";
import { createSolanaGateway } from "./chain/solana.js";

const config = loadConfig();
const chain = createSolanaGateway(config.solanaRpcUrl, config.feePayerSecret);
const { app } = await buildApp({ config, chain });

if (!config.feePayerSecret) {
  app.log.warn("SOLANA_FEE_PAYER_SECRET não definida: o registro na Devnet vai falhar. Rode `npm run wallet:new`.");
}

await app.listen({ port: config.port, host: "0.0.0.0" });
