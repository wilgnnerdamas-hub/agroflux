// Testes do escrow da cessão (contrato v1.2, §6.4 e §6.5): caminho feliz e casos de falha, provando que nenhuma perna acontece.
import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import {
  ExtensionType,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TYPE_SIZE,
  AuthorityType,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createMint,
  createSetAuthorityInstruction,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMintLen,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { createInitializeInstruction, createUpdateFieldInstruction, pack, type TokenMetadata } from "@solana/spl-token-metadata";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { assert } from "chai";
import { createHash } from "node:crypto";
import { AgrofluxEscrow } from "../target/types/agroflux_escrow";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.agrofluxEscrow as Program<AgrofluxEscrow>;
const connection = provider.connection;
const payer = (provider.wallet as anchor.Wallet).payer;

const distributor = Keypair.generate();
const funder = Keypair.generate();
const funder2 = Keypair.generate();
let tbrl: PublicKey;

// Hash de documento de teste (32 bytes), um por caso.
const docHash = (label: string) => [...createHash("sha256").update(label).digest()];

async function airdrop(to: PublicKey) {
  const sig = await connection.requestAirdrop(to, 2 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

/** Token da cessão: Token-2022, decimals 0, metadados só com referência e payloadHash, supply 1 e mint revogado. */
async function createAssetToken(reference: string, opts: { revoke?: boolean } = {}): Promise<PublicKey> {
  const mint = Keypair.generate();
  const metadata: TokenMetadata = {
    mint: mint.publicKey,
    updateAuthority: distributor.publicKey,
    name: `AgroFlux ${reference}`,
    symbol: "AGFX",
    uri: "",
    additionalMetadata: [["payloadHash", "ab".repeat(32)]],
  };
  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + TYPE_SIZE + LENGTH_SIZE + pack(metadata).length);
  const ata = getAssociatedTokenAddressSync(mint.publicKey, distributor.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const tx = new Transaction().add(
    SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: mint.publicKey, space: mintLen, lamports, programId: TOKEN_2022_PROGRAM_ID }),
    createInitializeMetadataPointerInstruction(mint.publicKey, distributor.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint.publicKey, 0, distributor.publicKey, null, TOKEN_2022_PROGRAM_ID),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint.publicKey,
      updateAuthority: distributor.publicKey,
      mint: mint.publicKey,
      mintAuthority: distributor.publicKey,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
    }),
    createUpdateFieldInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: mint.publicKey, updateAuthority: distributor.publicKey, field: "payloadHash", value: "ab".repeat(32) }),
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata, distributor.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createMintToInstruction(mint.publicKey, ata, distributor.publicKey, 1, [], TOKEN_2022_PROGRAM_ID),
  );
  if (opts.revoke !== false) {
    tx.add(createSetAuthorityInstruction(mint.publicKey, distributor.publicKey, AuthorityType.MintTokens, null, [], TOKEN_2022_PROGRAM_ID));
  }
  await sendAndConfirmTransaction(connection, tx, [payer, mint, distributor], { commitment: "confirmed" });
  return mint.publicKey;
}

const settlementPda = (assetMint: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("settlement"), assetMint.toBuffer()], program.programId)[0];
const documentPda = (hash: number[]) =>
  PublicKey.findProgramAddressSync([Buffer.from("document"), Buffer.from(hash)], program.programId)[0];

function settle(assetMint: PublicKey, amount: number, hash: number[], who: Keypair = funder) {
  return program.methods
    .settle(new anchor.BN(amount), hash)
    .accounts({
      payer: payer.publicKey,
      distributor: distributor.publicKey,
      funder: who.publicKey,
      assetMint,
      settlementMint: tbrl,
      settlementTokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([distributor, who])
    .rpc({ commitment: "confirmed" });
}

const balance = async (mint: PublicKey, owner: PublicKey, programId: PublicKey) => {
  try {
    return Number((await getAccount(connection, getAssociatedTokenAddressSync(mint, owner, false, programId), "confirmed", programId)).amount);
  } catch {
    return null; // conta ainda não existe
  }
};

describe("agroflux-escrow", () => {
  before(async () => {
    await airdrop(distributor.publicKey);
    await airdrop(funder.publicKey);
    await airdrop(funder2.publicKey);
    // tBRL-DEMO: SPL Token clássico, 2 casas decimais; financiador recebe 1.000,00.
    tbrl = await createMint(connection, payer, payer.publicKey, null, 2, undefined, { commitment: "confirmed" });
    const funderAta = await getOrCreateAssociatedTokenAccount(connection, payer, tbrl, funder.publicKey, false, "confirmed", { commitment: "confirmed" });
    await mintTo(connection, payer, tbrl, funderAta.address, payer, 100_000, [], { commitment: "confirmed" });
    const funder2Ata = await getOrCreateAssociatedTokenAccount(connection, payer, tbrl, funder2.publicKey, false, "confirmed", { commitment: "confirmed" });
    await mintTo(connection, payer, tbrl, funder2Ata.address, payer, 100_000, [], { commitment: "confirmed" });
  });

  it("liquida atomicamente: token vai ao financiador e tBRL-DEMO ao distribuidor", async () => {
    const asset = await createAssetToken("AGF-0001");
    const hash = docHash("doc-1");
    await settle(asset, 12_345, hash);

    assert.equal(await balance(asset, distributor.publicKey, TOKEN_2022_PROGRAM_ID), 0);
    assert.equal(await balance(asset, funder.publicKey, TOKEN_2022_PROGRAM_ID), 1);
    assert.equal(await balance(tbrl, distributor.publicKey, TOKEN_PROGRAM_ID), 12_345);
    assert.equal(await balance(tbrl, funder.publicKey, TOKEN_PROGRAM_ID), 100_000 - 12_345);

    const record = await program.account.settlement.fetch(settlementPda(asset));
    assert.equal(record.amount.toNumber(), 12_345);
    assert.ok(record.assetMint.equals(asset));
    assert.ok(record.settlementMint.equals(tbrl));
    assert.ok(record.distributor.equals(distributor.publicKey));
    assert.ok(record.funder.equals(funder.publicKey));

    const lock = await program.account.documentLock.fetch(documentPda(hash));
    assert.deepEqual([...lock.documentHash], hash);
    assert.ok(lock.assetMint.equals(asset));
    assert.ok(lock.funder.equals(funder.publicKey));
    assert.equal(lock.amount.toNumber(), 12_345);

    // O mesmo token não pode ser liquidado duas vezes.
    let failed = false;
    try {
      await settle(asset, 1, docHash("doc-1-outra"));
    } catch {
      failed = true;
    }
    assert.isTrue(failed, "segunda liquidação deveria falhar");
  });

  it("financiador sem saldo: a transação falha e nenhuma perna acontece", async () => {
    const asset = await createAssetToken("AGF-0002");
    const funderBefore = await balance(tbrl, funder.publicKey, TOKEN_PROGRAM_ID);
    const distributorBefore = await balance(tbrl, distributor.publicKey, TOKEN_PROGRAM_ID);

    let err: unknown;
    try {
      await settle(asset, 10_000_000, docHash("doc-2"));
    } catch (e) {
      err = e;
    }
    assert.ok(err, "liquidação sem saldo deveria falhar");
    assert.match(String(err), /insufficient funds|0x1\b/i);

    // Perna 1 desfeita: o token continua com o distribuidor e o financiador nem ganhou a conta.
    assert.equal(await balance(asset, distributor.publicKey, TOKEN_2022_PROGRAM_ID), 1);
    assert.isNull(await balance(asset, funder.publicKey, TOKEN_2022_PROGRAM_ID));
    // Perna 2 não aconteceu.
    assert.equal(await balance(tbrl, funder.publicKey, TOKEN_PROGRAM_ID), funderBefore);
    assert.equal(await balance(tbrl, distributor.publicKey, TOKEN_PROGRAM_ID), distributorBefore);
    // Nenhum registro de liquidação.
    assert.isNull(await connection.getAccountInfo(settlementPda(asset), "confirmed"));
    assert.isNull(await connection.getAccountInfo(documentPda(docHash("doc-2")), "confirmed"));

    // Depois de abastecer o financiador, a nova tentativa liquida normalmente.
    await mintTo(connection, payer, tbrl, getAssociatedTokenAddressSync(tbrl, funder.publicKey), payer, 10_000_000, [], { commitment: "confirmed" });
    await settle(asset, 10_000_000, docHash("doc-2"));
    assert.equal(await balance(asset, funder.publicKey, TOKEN_2022_PROGRAM_ID), 1);
  });

  it("v1.2: recusa ceder de novo o mesmo documento com OUTRO token e outro financiador; nenhuma perna acontece", async () => {
    const hash = docHash("doc-duplo");
    const first = await createAssetToken("AGF-0005");
    await settle(first, 5_000, hash);

    // Distribuidor mal-intencionado: novo token para o mesmo documento, outro financiador.
    const second = await createAssetToken("AGF-0005-B");
    const f2Before = await balance(tbrl, funder2.publicKey, TOKEN_PROGRAM_ID);
    const distBefore = await balance(tbrl, distributor.publicKey, TOKEN_PROGRAM_ID);
    let err: unknown;
    try {
      await settle(second, 5_000, hash, funder2);
    } catch (e) {
      err = e;
    }
    assert.ok(err, "a segunda cessão do mesmo documento deveria falhar");
    assert.match(String(err) + JSON.stringify((err as { logs?: string[] })?.logs ?? []), /already in use/i);

    assert.equal(await balance(second, distributor.publicKey, TOKEN_2022_PROGRAM_ID), 1);
    assert.isNull(await balance(second, funder2.publicKey, TOKEN_2022_PROGRAM_ID));
    assert.equal(await balance(tbrl, funder2.publicKey, TOKEN_PROGRAM_ID), f2Before);
    assert.equal(await balance(tbrl, distributor.publicKey, TOKEN_PROGRAM_ID), distBefore);
    assert.isNull(await connection.getAccountInfo(settlementPda(second), "confirmed"));
    // A trava continua apontando para o primeiro token.
    const lock = await program.account.documentLock.fetch(documentPda(hash));
    assert.ok(lock.assetMint.equals(first));
  });

  it("recusa token com autoridade de mint ativa (termos divergentes)", async () => {
    const asset = await createAssetToken("AGF-0003", { revoke: false });
    let err: unknown;
    try {
      await settle(asset, 100, docHash("doc-3"));
    } catch (e) {
      err = e;
    }
    assert.match(String(err), /MintAuthorityNotRevoked/);
    assert.equal(await balance(asset, distributor.publicKey, TOKEN_2022_PROGRAM_ID), 1);
  });

  it("recusa valor zero", async () => {
    const asset = await createAssetToken("AGF-0004");
    let err: unknown;
    try {
      await settle(asset, 0, docHash("doc-4"));
    } catch (e) {
      err = e;
    }
    assert.match(String(err), /InvalidAmount/);
  });
});
