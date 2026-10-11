// Teste de integração do gateway real da cessão contra um validador LOCAL (solana-test-validator com o escrow carregado).
// Não usa a Devnet nem as carteiras do .env: gera carteiras descartáveis e pede SOL ao validador local.
// Uso: LOCALNET_URL=http://127.0.0.1:8899 ESCROW_PROGRAM_ID=<id> npx tsx scripts/localnet-assignment.ts
import assert from "node:assert/strict";
import { TOKEN_2022_PROGRAM_ID, createMint, getAccount, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, getTokenMetadata, mintTo, getMint } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { AssignmentFailure, createAssignmentGateway } from "../src/chain/assignment.js";
import { DEFAULT_TREASURY } from "../src/config.js";

const url = process.env.LOCALNET_URL ?? "http://127.0.0.1:8899";
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("Só roda contra validador local.");
const connection = new Connection(url, "confirmed");
const [payer, distributor, funder, funderB, funderC] = [Keypair.generate(), Keypair.generate(), Keypair.generate(), Keypair.generate(), Keypair.generate()];

for (const kp of [payer, distributor, funder]) {
  const sig = await connection.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}
const tbrl = await createMint(connection, payer, payer.publicKey, null, 2, undefined, { commitment: "confirmed" });
const funderAta = await getOrCreateAssociatedTokenAccount(connection, payer, tbrl, funder.publicKey, false, "confirmed");
await mintTo(connection, payer, tbrl, funderAta.address, payer, 50_000, [], { commitment: "confirmed" });
const funderBAta = await getOrCreateAssociatedTokenAccount(connection, payer, tbrl, funderB.publicKey, false, "confirmed");
await mintTo(connection, payer, tbrl, funderBAta.address, payer, 50_000, [], { commitment: "confirmed" });

const gw = createAssignmentGateway({
  rpcUrl: url,
  feePayerSecret: bs58.encode(payer.secretKey),
  distributorSecrets: { dst_a: bs58.encode(distributor.secretKey), dst_b: bs58.encode(Keypair.generate().secretKey), dst_c: bs58.encode(Keypair.generate().secretKey) },
  treasury: DEFAULT_TREASURY,
  funderSecrets: { fnd_a: bs58.encode(funder.secretKey), fnd_b: bs58.encode(funderB.secretKey), fnd_c: bs58.encode(funderC.secretKey) },
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
const minted = await gw.mintAssetToken({ reference: "AGF-0042", payloadHash, distributorId: "dst_a" }, opts);
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

const documentSha256 = "d0c".padEnd(64, "1");
const settleInput = (assetMint: string, amount: number, funderId: "fnd_a" | "fnd_b" = "fnd_a", fee = 0) => ({ assetMint, amount, fee, distributorId: "dst_a" as const, funderId, documentSha256 });
const TREASURY = new PublicKey(DEFAULT_TREASURY);

// 2) Financiador sem saldo: falha amigável antes de enviar; nada muda.
await assert.rejects(gw.settle(settleInput(minted.mint, 60_000), opts), (e) => e instanceof AssignmentFailure && e.code === "INSUFFICIENT_TEST_TOKENS");
assert.equal(await bal(mint, distributor.publicKey, TOKEN_2022_PROGRAM_ID), 1);
console.log("OK  sem saldo: INSUFFICIENT_TEST_TOKENS, token continua com o distribuidor");

// 3) Liquidação atômica.
// v1.3: 345 da liquidação vão para a tesouraria da AgroFlux, na mesma transação.
const settled = await gw.settle(settleInput(minted.mint, 12_345, "fnd_a", 345), opts);
assert.equal(await bal(mint, distributor.publicKey, TOKEN_2022_PROGRAM_ID), 0);
assert.equal(await bal(mint, funder.publicKey, TOKEN_2022_PROGRAM_ID), 1);
assert.equal(await bal(tbrl, distributor.publicKey), 12_000);
assert.equal(await bal(tbrl, TREASURY), 345);
assert.equal(await bal(tbrl, funder.publicKey), 50_000 - 12_345);
assert.ok(await gw.checkSignature(settled.signature));
console.log("OK  liquidação atômica:", settled.signature);

// 4) Segunda liquidação do mesmo token: o escrow recusa (registro já existe / distribuidor não tem o token).
await assert.rejects(gw.settle(settleInput(minted.mint, 1), opts), (e) => e instanceof AssignmentFailure && e.code === "ESCROW_REJECTED");
console.log("OK  segunda liquidação do mesmo token recusada: ESCROW_REJECTED");

// 5) v1.2: inspeção on-chain usada pela verificação.
const ins = await gw.inspect({ assetMint: minted.mint, funderId: "fnd_a", documentSha256 });
assert.deepEqual(ins.mint, { supply: 1, decimals: 0, mintAuthorityRevoked: true });
assert.equal(ins.metadataPayloadHash, payloadHash);
assert.equal(ins.funderBalance, 1);
assert.deepEqual(ins.settlement, {
  assetMint: minted.mint,
  settlementMint: tbrl.toBase58(),
  distributor: distributor.publicKey.toBase58(),
  funder: funder.publicKey.toBase58(),
  amount: 12_345,
  fee: 345,
  treasury: DEFAULT_TREASURY,
});
assert.deepEqual(ins.documentLock, { documentSha256, assetMint: minted.mint, funder: funder.publicKey.toBase58(), amount: 12_345 });
console.log("OK  inspeção: token único, metadados, financiador, registro da liquidação e trava do documento");

// 6) v1.2: OUTRO token para o MESMO documento, com outro financiador. Com simulação: DOCUMENT_ALREADY_ASSIGNED.
const second = await gw.mintAssetToken({ reference: "AGF-0042-T", payloadHash, distributorId: "dst_a" }, opts);
await assert.rejects(gw.settle(settleInput(second.mint, 100, "fnd_b"), opts), (e) => e instanceof AssignmentFailure && e.code === "DOCUMENT_ALREADY_ASSIGNED");
console.log("OK  segunda cessão do mesmo documento (com simulação): DOCUMENT_ALREADY_ASSIGNED");

// 7) v1.2: prova de recusa, sem simulação: a transação entra na rede com erro, por causa da trava.
const fB = await bal(tbrl, funderB.publicKey);
const attempt = await gw.attemptDoubleSettle(settleInput(second.mint, 100, "fnd_b"), opts);
assert.equal(attempt.landedWithError, true);
assert.equal(attempt.rejectedByDocumentLock, true);
assert.equal(await bal(new PublicKey(second.mint), distributor.publicKey, TOKEN_2022_PROGRAM_ID), 1);
assert.equal(await bal(tbrl, funderB.publicKey), fB);
console.log("OK  prova de recusa gravada on-chain:", attempt.signature);

// 8) Saldos para a transparência.
const balances = await gw.readBalances([distributor.publicKey.toBase58(), funderC.publicKey.toBase58()]);
assert.equal(balances[0].settlementUnits, 12_000);
assert.equal(balances[1].settlementUnits, 0);
console.log("TUDO OK");
