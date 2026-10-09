// Pede SOL de teste na Devnet para a carteira pagadora. Uso: npm run wallet:airdrop [-- 1]
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { loadConfig } from "../src/config.js";
import { parseSecret } from "../src/chain/solana.js";

const config = loadConfig();
if (!config.feePayerSecret) {
  console.error("SOLANA_FEE_PAYER_SECRET não definida. Rode antes: npm run wallet:new");
  process.exit(1);
}
const pubkey = parseSecret(config.feePayerSecret).publicKey;
const sol = Number(process.argv[2] ?? 1);
const connection = new Connection(config.solanaRpcUrl, "confirmed");

console.log(`Carteira: ${pubkey.toBase58()}`);
try {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  const bh = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
  console.log(`Airdrop de ${sol} SOL confirmado.`);
} catch (e) {
  console.error(`Airdrop falhou (${(e as Error).message}).`);
  console.error(`O faucet público costuma limitar pedidos. Use https://faucet.solana.com com o endereço acima.`);
}
const balance = await connection.getBalance(pubkey);
console.log(`Saldo: ${balance / LAMPORTS_PER_SOL} SOL`);
