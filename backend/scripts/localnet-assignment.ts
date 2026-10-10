// Teste de integração do gateway real da cessão contra um validador LOCAL (solana-test-validator com o escrow carregado).
// Não usa a Devnet nem as carteiras do .env: gera carteiras descartáveis e pede SOL ao validador local.
// Uso: LOCALNET_URL=http://127.0.0.1:8899 ESCROW_PROGRAM_ID=<id> npx tsx scripts/localnet-assignment.ts
import assert from "node:assert/strict";
import { TOKEN_2022_PROGRAM_ID, createMint, getAccount, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, getTokenMetadata, mintTo, getMint } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { AssignmentFailure, createAssignmentGateway } from "../src/chain/assignment.js";

const url = process.env.LOCALNET_URL ?? "http://127.0.0.1:8899";
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("Só roda contra validador local.");
const connection = new Connection(url, "confirmed");
const [payer, distributor, funder] = [Keypair.generate(), Keypair.generate(), Keypair.generate()];

for (const kp of [payer, distributor, funder]) {
  const sig = await connection.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}
const tbrl = await createMint(connection, payer, payer.publicKey, null, 2, undefined, { commitment: "confirmed" });
const funderAta = await getOrCreateAssociatedTokenAccount(connection, payer, tbrl, funder.publicKey, false, "confirmed");
await mintTo(connection, payer, tbrl, funderAta.address, payer, 50_000, [], { commitment: "confirmed" });

const gw = createAssignmentGateway({
  rpcUrl: url,
  feePayerSecret: bs58.encode(payer.secretKey),
  distributorSecret: bs58.encode(distributor.secretKey),
  funderSecret: bs58.encode(funder.secretKey),
  settlementMint: tbrl.toBase58(),
  escrowProgramId: process.env.ESCROW_PROGRAM_ID!,
});
const opts = { timeoutMs: 30_000 };
const bal = async (mint: PublicKey, owner: PublicKey, program?: PublicKey) => {
  try {
    return Number((await getAccount(connection, getAssociatedTokenAddressSync(mint, owner, false, program), "confirmed", program)).amount);
  } catch {
    return null;
  }
};

// 1) Token da cessão com metadados, supply 1 e mint revogado.
const payloadHash = "c0ffee".padEnd(64, "0");
const minted = await gw.mintAssetToken({ reference: "AGF-0042", payloadHash }, opts);
const mint = new PublicKey(minted.mint);
const info = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
assert.equal(info.supply, 1n);
assert.equal(info.decimals, 0);
assert.equal(info.mintAuthority, null);
const md = await getTokenMetadata(connection, mint, "confirmed");
assert.equal(md?.name, "AgroFlux AGF-0042");
assert.equal(md?.symbol, "AGFX");
assert.deepEqual(md?.additionalMetadata, [["payloadHash", payloadHash]]);
assert.equal(md?.updateAuthority, undefined);
console.log("OK  token da cessão:", minted.mint);

// 2) Financiador sem saldo: falha amigável antes de enviar; nada muda.
await assert.rejects(gw.settle({ assetMint: minted.mint, amount: 60_000 }, opts), (e) => e instanceof AssignmentFailure && e.code === "INSUFFICIENT_TEST_TOKENS");
assert.equal(await bal(mint, distributor.publicKey, TOKEN_2022_PROGRAM_ID), 1);
console.log("OK  sem saldo: INSUFFICIENT_TEST_TOKENS, token continua com o distribuidor");

// 3) Liquidação atômica.
const settled = await gw.settle({ assetMint: minted.mint, amount: 12_345 }, opts);
assert.equal(await bal(mint, distributor.publicKey, TOKEN_2022_PROGRAM_ID), 0);
assert.equal(await bal(mint, funder.publicKey, TOKEN_2022_PROGRAM_ID), 1);
assert.equal(await bal(tbrl, distributor.publicKey), 12_345);
assert.equal(await bal(tbrl, funder.publicKey), 50_000 - 12_345);
assert.ok(await gw.checkSignature(settled.signature));
console.log("OK  liquidação atômica:", settled.signature);

// 4) Segunda liquidação do mesmo token: o escrow recusa (registro já existe / distribuidor não tem o token).
await assert.rejects(gw.settle({ assetMint: minted.mint, amount: 1 }, opts), (e) => e instanceof AssignmentFailure && e.code === "ESCROW_REJECTED");
console.log("OK  segunda liquidação recusada: ESCROW_REJECTED");
console.log("TUDO OK");
