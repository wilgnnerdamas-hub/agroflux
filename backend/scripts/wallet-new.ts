// Gera a carteira pagadora da Devnet e grava a secret em backend/.env (fora do git).
// Mostra só a chave pública. Uso: npm run wallet:new [-- --force]
import fs from "node:fs";
import path from "node:path";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const root = path.resolve(import.meta.dirname, "..");
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");
const force = process.argv.includes("--force");

let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : fs.readFileSync(examplePath, "utf8");
const current = env.match(/^SOLANA_FEE_PAYER_SECRET=(.*)$/m)?.[1]?.trim();
if (current && !force) {
  console.error("Já existe SOLANA_FEE_PAYER_SECRET em backend/.env. Use --force para substituir.");
  process.exit(1);
}

const kp = Keypair.generate();
const line = `SOLANA_FEE_PAYER_SECRET=${bs58.encode(kp.secretKey)}`;
env = /^SOLANA_FEE_PAYER_SECRET=.*$/m.test(env)
  ? env.replace(/^SOLANA_FEE_PAYER_SECRET=.*$/m, line)
  : `${env.trimEnd()}\n${line}\n`;
fs.writeFileSync(envPath, env, { mode: 0o600 });

console.log("Carteira da Devnet criada e gravada em backend/.env.");
console.log(`Chave pública: ${kp.publicKey.toBase58()}`);
console.log("Próximo passo: npm run wallet:airdrop");
