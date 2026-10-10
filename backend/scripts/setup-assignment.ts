// Preparação da função B (contrato v1.1, §6.4), feita uma vez. Idempotente: pula o que já existe.
// 1) Carteiras de demonstração "distribuidor demo" e "financiador demo" (secrets só em backend/.env).
// 2) Mint de TESTE tBRL-DEMO (2 casas decimais), com a carteira pagadora como autoridade.
// 3) Saldo de tBRL-DEMO para o financiador demo (sem valor).
// Mostra só chaves públicas. Uso: npm run setup:assignment -- [--escrow <PROGRAM_ID>]
import fs from "node:fs";
import path from "node:path";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { loadConfig } from "../src/config.js";
import { parseSecret } from "../src/chain/solana.js";
import { SETTLEMENT_DECIMALS } from "../src/chain/assignment.js";

const envPath = path.resolve(import.meta.dirname, "..", ".env");
const FUNDER_TARGET = 1_000_000_000n; // 10.000.000,00 tBRL-DEMO (menor unidade = centavo)

let env = fs.readFileSync(envPath, "utf8");
const get = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim() || "";
const set = (k: string, v: string) => {
  const line = `${k}=${v}`;
  env = new RegExp(`^${k}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${k}=.*$`, "m"), line) : `${env.trimEnd()}\n${line}\n`;
  fs.writeFileSync(envPath, env, { mode: 0o600 });
};

const config = loadConfig();
if (!config.feePayerSecret) {
  console.error("SOLANA_FEE_PAYER_SECRET não definida.");
  process.exit(1);
}
const payer = parseSecret(config.feePayerSecret);
const connection = new Connection(config.solanaRpcUrl, "confirmed");

function wallet(key: string, label: string): Keypair {
  const existing = get(key);
  if (existing) return parseSecret(existing);
  const kp = Keypair.generate();
  set(key, bs58.encode(kp.secretKey));
  console.log(`Carteira "${label}" criada e gravada em backend/.env.`);
  return kp;
}

const distributor = wallet("DEMO_DISTRIBUTOR_SECRET", "distribuidor demo");
const funder = wallet("DEMO_FUNDER_SECRET", "financiador demo");
console.log(`Distribuidor demo: ${distributor.publicKey.toBase58()}`);
console.log(`Financiador demo:  ${funder.publicKey.toBase58()}`);

let mint = get("TBRL_MINT");
if (!mint) {
  const created = await createMint(connection, payer, payer.publicKey, null, SETTLEMENT_DECIMALS, undefined, { commitment: "confirmed" });
  mint = created.toBase58();
  set("TBRL_MINT", mint);
  console.log("Mint tBRL-DEMO criada (moeda de teste, sem valor).");
}
console.log(`tBRL-DEMO: ${mint}`);

const funderAta = await getOrCreateAssociatedTokenAccount(connection, payer, new PublicKey(mint), funder.publicKey, false, "confirmed");
if (funderAta.amount < FUNDER_TARGET / 10n) {
  await mintTo(connection, payer, new PublicKey(mint), funderAta.address, payer, FUNDER_TARGET - funderAta.amount, [], { commitment: "confirmed" });
  console.log("Saldo de tBRL-DEMO do financiador demo abastecido.");
}
const bal = await connection.getTokenAccountBalance(funderAta.address, "confirmed");
console.log(`Saldo do financiador demo: ${bal.value.uiAmountString} tBRL-DEMO`);

const i = process.argv.indexOf("--escrow");
if (i > 0 && process.argv[i + 1]) {
  set("ESCROW_PROGRAM_ID", new PublicKey(process.argv[i + 1]).toBase58());
}
console.log(`ESCROW_PROGRAM_ID: ${get("ESCROW_PROGRAM_ID") || "(não definido; passe --escrow <PROGRAM_ID>)"}`);
console.log(`Carteira pagadora: ${(await connection.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL} SOL`);
console.log("Para ligar a função B: ASSIGNMENT_ENABLED=true (e as mesmas variáveis no Railway).");
