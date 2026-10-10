// Envia SOL de teste da carteira pagadora para outro endereço da Devnet (ex.: carteira de deploy do escrow).
// Uso: npm run wallet:send -- <endereço> <sol>
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { loadConfig } from "../src/config.js";
import { parseSecret } from "../src/chain/solana.js";

const config = loadConfig();
if (!config.feePayerSecret) {
  console.error("SOLANA_FEE_PAYER_SECRET não definida.");
  process.exit(1);
}
const [to, amount] = process.argv.slice(2);
const sol = Number(amount);
if (!to || !(sol > 0) || sol > 4) {
  console.error("Uso: npm run wallet:send -- <endereço> <sol (até 4)>");
  process.exit(1);
}
const payer = parseSecret(config.feePayerSecret);
const connection = new Connection(config.solanaRpcUrl, "confirmed");
const tx = new Transaction().add(
  SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: new PublicKey(to), lamports: Math.round(sol * LAMPORTS_PER_SOL) }),
);
const sig = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
console.log(`Enviado ${sol} SOL para ${to}: ${sig}`);
console.log(`Saldo da pagadora: ${(await connection.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL} SOL`);
