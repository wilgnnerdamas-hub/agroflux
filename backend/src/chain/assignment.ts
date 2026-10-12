// Cessão tokenizada na Devnet (contrato v1.3, §6.4, §6.5 e §15.3). SIMULAÇÃO: token e moeda sem valor.
// 1) Token da cessão: Token-2022, supply 1, decimals 0, metadados só com referência e payloadHash, mint revogado.
// 2) Liquidação atômica pelo programa Anchor de escrow (blockchain/programs/agroflux-escrow), com trava por documento.
import {
  AuthorityType,
  ExtensionType,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TYPE_SIZE,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  getMintLen,
  getTokenMetadata,
} from "@solana/spl-token";
import { createInitializeInstruction, createUpdateAuthorityInstruction, createUpdateFieldInstruction, pack, type TokenMetadata } from "@solana/spl-token-metadata";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, type Signer } from "@solana/web3.js";
import bs58 from "bs58";
import type { DistributorWallets } from "../distributors.js";
import type { FunderWallets } from "../funders.js";
import type { AssignmentErrorCode, DistributorId, FunderId } from "../types.js";
import { ChainUnavailableError, classifySendError, parseSecret, type Confirmed, type SendOptions } from "./solana.js";

export interface AssignmentParties {
  // v1.3: uma carteira por distribuidora demo e a tesouraria da AgroFlux (só o endereço público).
  distributorWallets: DistributorWallets;
  treasuryWallet: string;
  // v1.2: uma carteira por financiador demo.
  funderWallets: FunderWallets;
  settlementMint: string;
  escrowProgramId: string;
}

export interface SettleInput {
  assetMint: string;
  amount: number;
  // v1.3: parte de `amount` que vai para a tesouraria da AgroFlux.
  fee: number;
  distributorId: DistributorId;
  funderId: FunderId;
  // sha256 (hex) do documento: semente da trava on-chain (§6.5).
  documentSha256: string;
}

// Leitura on-chain usada pela verificação (§6.7). Campos null = conta inexistente.
export interface AssignmentInspection {
  mint: { supply: number; decimals: number; mintAuthorityRevoked: boolean } | null;
  metadataPayloadHash: string | null;
  funderBalance: number | null;
  settlement: { assetMint: string; settlementMint: string; distributor: string; funder: string; amount: number; fee: number | null; treasury: string | null } | null;
  documentLock: { documentSha256: string; assetMint: string; funder: string; amount: number } | null;
}

export interface WalletBalance {
  address: string;
  solLamports: number | null;
  settlementUnits: number | null;
}

export interface AssignmentGateway {
  parties: AssignmentParties;
  // Lança ChainUnavailableError se a rede não responder.
  ping(): Promise<void>;
  // Cria o token da cessão. `onSubmitted` recebe a assinatura e o endereço da mint antes do envio.
  mintAssetToken(
    input: { reference: string; payloadHash: string; distributorId: DistributorId },
    opts: { timeoutMs: number; onSubmitted?: (signature: string, mint: string) => void },
  ): Promise<Confirmed & { mint: string }>;
  // Liquidação atômica: token da cessão ao financiador e `amount` de tBRL-DEMO ao distribuidor, na mesma transação.
  settle(input: SettleInput, opts: SendOptions): Promise<Confirmed>;
  // v1.2 (§3.10.1): tenta uma segunda liquidação do mesmo documento SEM simulação prévia, para a recusa ficar na Devnet.
  // `rejectedByDocumentLock` só é true se os logs mostrarem a trava do documento como causa.
  attemptDoubleSettle(input: SettleInput, opts: SendOptions): Promise<{ signature: string; landedWithError: boolean; rejectedByDocumentLock: boolean }>;
  documentLockAddress(documentSha256: string): string;
  // 11/10: lê a trava de um documento direto na Devnet, só pelo hash (verificador público). null = sem trava.
  readDocumentLock?(documentSha256: string): Promise<AssignmentInspection["documentLock"]>;
  // Lança ChainUnavailableError se a rede não responder.
  inspect(input: { assetMint: string; funderId: FunderId; documentSha256: string }): Promise<AssignmentInspection>;
  readBalances(addresses: string[]): Promise<WalletBalance[]>;
  checkSignature(signature: string): Promise<Confirmed | null>;
}

export const ASSIGNMENT_ERROR_MESSAGES: Record<AssignmentErrorCode, string> = {
  INSUFFICIENT_FUNDS: "A carteira de demonstração está sem saldo na Devnet.",
  RPC_UNAVAILABLE: "A rede Solana Devnet não respondeu. Tente novamente.",
  TIMEOUT: "A confirmação demorou mais que o esperado. Tente novamente.",
  TX_FAILED: "A transação foi rejeitada pela rede.",
  INSUFFICIENT_TEST_TOKENS: "A carteira de demonstração do financiador não tem tBRL-DEMO suficiente.",
  ESCROW_REJECTED: "O programa de liquidação recusou a operação. Nenhuma transferência foi feita.",
  DOCUMENT_ALREADY_ASSIGNED: "Este documento já foi cedido: a trava on-chain impede uma segunda cessão.",
};

export class AssignmentFailure extends Error {
  constructor(
    public readonly code: AssignmentErrorCode,
    public readonly signature: string | null = null,
  ) {
    super(ASSIGNMENT_ERROR_MESSAGES[code]);
  }
}

export const SETTLEMENT_DECIMALS = 2;
// Discriminador da instrução `settle` (IDL em blockchain/idl/agroflux_escrow.json). Não muda na v1.2.
const SETTLE_DISCRIMINATOR = Buffer.from([175, 42, 185, 87, 144, 131, 102, 212]);
const RPC_TIMEOUT_MS = 5_000;
const POLL_MS = 1_000;
const MIN_BALANCE_LAMPORTS = 50_000_000; // aluguel da mint, das contas de token e dos registros, com folga
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

const errorText = (e: unknown) => {
  const err = e as { message?: string; logs?: string[]; transactionLogs?: string[] };
  return [err?.message ?? String(e), ...(err?.logs ?? []), ...(err?.transactionLogs ?? [])].join(" ");
};

// Erros da liquidação: códigos do programa (6000+) viram ESCROW_REJECTED; falta de tBRL, INSUFFICIENT_TEST_TOKENS.
// Com `documentLock`, um "already in use" nessa conta vira DOCUMENT_ALREADY_ASSIGNED (v1.2).
export function classifySettleError(e: unknown, ctx: { documentLock?: string } = {}): AssignmentErrorCode {
  const raw = errorText(e);
  const text = raw.toLowerCase();
  if (text.includes("no record of a prior credit") || text.includes("insufficient lamports")) return "INSUFFICIENT_FUNDS";
  if (text.includes("error: insufficient funds")) return "INSUFFICIENT_TEST_TOKENS";
  if (ctx.documentLock && text.includes("already in use") && raw.includes(ctx.documentLock)) return "DOCUMENT_ALREADY_ASSIGNED";
  // 0x1770+ = erros do escrow; "already in use" = registro da liquidação já existe (token já liquidado).
  if (/custom program error: 0x17[0-9a-f]{2}\b|anchorerror|already in use/.test(text)) return "ESCROW_REJECTED";
  return classifySendError(e);
}

export function settlementPda(programId: PublicKey, assetMint: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("settlement"), assetMint.toBuffer()], programId)[0];
}

export function documentLockPda(programId: PublicKey, documentSha256: string) {
  return PublicKey.findProgramAddressSync([Buffer.from("document"), Buffer.from(documentSha256, "hex")], programId)[0];
}

// Instrução `settle` do escrow, montada à mão (mesma ordem de contas da IDL).
export function settleInstruction(p: {
  programId: PublicKey;
  payer: PublicKey;
  distributor: PublicKey;
  funder: PublicKey;
  assetMint: PublicKey;
  settlementMint: PublicKey;
  amount: number;
  fee: number;
  treasury: PublicKey;
  documentSha256: string;
}): TransactionInstruction {
  const ata = (mint: PublicKey, owner: PublicKey, program: PublicKey) => getAssociatedTokenAddressSync(mint, owner, false, program);
  const hash = Buffer.from(p.documentSha256, "hex");
  if (hash.length !== 32) throw new Error("documentSha256 inválido");
  const data = Buffer.alloc(56);
  SETTLE_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(BigInt(p.amount), 8);
  data.writeBigUInt64LE(BigInt(p.fee), 16);
  hash.copy(data, 24);
  const w = (pubkey: PublicKey, isSigner = false) => ({ pubkey, isSigner, isWritable: true });
  const r = (pubkey: PublicKey, isSigner = false) => ({ pubkey, isSigner, isWritable: false });
  return new TransactionInstruction({
    programId: p.programId,
    data,
    keys: [
      w(p.payer, true),
      r(p.distributor, true),
      r(p.funder, true),
      r(p.assetMint),
      r(p.settlementMint),
      w(ata(p.assetMint, p.distributor, TOKEN_2022_PROGRAM_ID)),
      w(ata(p.assetMint, p.funder, TOKEN_2022_PROGRAM_ID)),
      w(ata(p.settlementMint, p.funder, TOKEN_PROGRAM_ID)),
      w(ata(p.settlementMint, p.distributor, TOKEN_PROGRAM_ID)),
      w(settlementPda(p.programId, p.assetMint)),
      w(documentLockPda(p.programId, p.documentSha256)),
      r(p.treasury),
      w(ata(p.settlementMint, p.treasury, TOKEN_PROGRAM_ID)),
      r(TOKEN_2022_PROGRAM_ID),
      r(TOKEN_PROGRAM_ID),
      r(ASSOCIATED_TOKEN_PROGRAM_ID),
      r(SystemProgram.programId),
    ],
  });
}

// Leitura das contas Anchor do escrow (8 bytes de discriminador + campos na ordem do struct).
export function decodeSettlement(data: Buffer) {
  const key = (o: number) => new PublicKey(data.subarray(o, o + 32)).toBase58();
  // v1.3: `fee` e `treasury` ficam depois de `settled_at` (144) e `bump` (152). Registros antigos não têm.
  const v13 = data.length >= 193;
  return {
    assetMint: key(8),
    settlementMint: key(40),
    distributor: key(72),
    funder: key(104),
    amount: Number(data.readBigUInt64LE(136)),
    fee: v13 ? Number(data.readBigUInt64LE(153)) : null,
    treasury: v13 ? key(161) : null,
  };
}

export function decodeDocumentLock(data: Buffer) {
  const key = (o: number) => new PublicKey(data.subarray(o, o + 32)).toBase58();
  return { documentSha256: data.subarray(8, 40).toString("hex"), assetMint: key(40), funder: key(72), amount: Number(data.readBigUInt64LE(104)) };
}

export interface AssignmentEnv {
  rpcUrl: string;
  feePayerSecret: string;
  distributorSecrets: Record<DistributorId, string>;
  treasury: string;
  funderSecrets: Record<FunderId, string>;
  settlementMint: string;
  escrowProgramId: string;
}

export function createAssignmentGateway(env: AssignmentEnv): AssignmentGateway {
  const connection = new Connection(env.rpcUrl, "confirmed");
  const payer = parseSecret(env.feePayerSecret);
  const distributors = Object.fromEntries(Object.entries(env.distributorSecrets).map(([id, s]) => [id, parseSecret(s)])) as Record<DistributorId, Keypair>;
  const treasury = new PublicKey(env.treasury);
  const funders = Object.fromEntries(Object.entries(env.funderSecrets).map(([id, s]) => [id, parseSecret(s)])) as Record<FunderId, Keypair>;
  const settlementMint = new PublicKey(env.settlementMint);
  const programId = new PublicKey(env.escrowProgramId);

  async function toConfirmed(signature: string, slot: number): Promise<Confirmed> {
    const t = await connection.getBlockTime(slot).catch(() => null);
    return { signature, slot, blockTime: t ? new Date(t * 1000).toISOString() : null };
  }

  async function checkSignature(signature: string) {
    const { value } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const st = value[0];
    if (!st || st.err) return null;
    if (st.confirmationStatus !== "confirmed" && st.confirmationStatus !== "finalized") return null;
    return toConfirmed(signature, st.slot);
  }

  // Assina e avisa a assinatura antes do envio.
  async function prepare(build: () => TransactionInstruction[], signers: Signer[]) {
    try {
      const balance = await withTimeout(connection.getBalance(payer.publicKey), RPC_TIMEOUT_MS);
      if (balance < MIN_BALANCE_LAMPORTS) throw new AssignmentFailure("INSUFFICIENT_FUNDS");
      const { blockhash, lastValidBlockHeight } = await withTimeout(connection.getLatestBlockhash(), RPC_TIMEOUT_MS);
      const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight }).add(...build());
      tx.sign(payer, ...signers);
      return { tx, signature: bs58.encode(tx.signature!) };
    } catch (e) {
      if (e instanceof AssignmentFailure) throw e;
      throw new AssignmentFailure("RPC_UNAVAILABLE");
    }
  }

  // Acompanha até `confirmed` ou o prazo. Devolve o erro da transação, se ela entrou na rede com falha.
  async function poll(signature: string, deadline: number): Promise<{ slot: number; err: unknown }> {
    while (Date.now() < deadline) {
      try {
        const { value } = await connection.getSignatureStatuses([signature]);
        const st = value[0];
        if (st && (st.err || st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return { slot: st.slot, err: st.err };
      } catch {
        // Falha passageira na consulta: continua tentando até o prazo.
      }
      await sleep(POLL_MS);
    }
    throw new AssignmentFailure("TIMEOUT", signature);
  }

  // Envia com simulação prévia e acompanha até `confirmed`.
  async function sendAndPoll(
    build: () => TransactionInstruction[],
    signers: Signer[],
    timeoutMs: number,
    classify: (e: unknown) => AssignmentErrorCode,
    onSubmitted?: (signature: string) => void,
  ): Promise<Confirmed> {
    const deadline = Date.now() + timeoutMs;
    const { tx, signature } = await prepare(build, signers);
    onSubmitted?.(signature);
    try {
      await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "confirmed", maxRetries: 5 });
    } catch (e) {
      throw new AssignmentFailure(classify(e));
    }
    const { slot, err } = await poll(signature, deadline);
    if (err) throw new AssignmentFailure("TX_FAILED", signature);
    return toConfirmed(signature, slot);
  }

  function funderKeypair(id: FunderId) {
    const kp = funders[id];
    if (!kp) throw new AssignmentFailure("ESCROW_REJECTED");
    return kp;
  }

  async function assertFunderBalance(funder: Keypair, amount: number) {
    // Conferência amigável antes de gastar taxa; o programa garante a atomicidade de qualquer forma.
    try {
      const funderAta = getAssociatedTokenAddressSync(settlementMint, funder.publicKey, false, TOKEN_PROGRAM_ID);
      const bal = await withTimeout(connection.getTokenAccountBalance(funderAta), RPC_TIMEOUT_MS);
      if (BigInt(bal.value.amount) < BigInt(amount)) throw new AssignmentFailure("INSUFFICIENT_TEST_TOKENS");
    } catch (e) {
      if (e instanceof AssignmentFailure) throw e;
      if (/could not find account|invalid param/i.test(String((e as Error)?.message))) throw new AssignmentFailure("INSUFFICIENT_TEST_TOKENS");
      throw new AssignmentFailure("RPC_UNAVAILABLE");
    }
  }

  function distributorKeypair(id: DistributorId) {
    const kp = distributors[id];
    if (!kp) throw new AssignmentFailure("ESCROW_REJECTED");
    return kp;
  }

  const ix = (input: SettleInput, funder: Keypair) =>
    settleInstruction({
      programId,
      payer: payer.publicKey,
      distributor: distributorKeypair(input.distributorId).publicKey,
      funder: funder.publicKey,
      assetMint: new PublicKey(input.assetMint),
      settlementMint,
      amount: input.amount,
      fee: input.fee,
      treasury,
      documentSha256: input.documentSha256,
    });

  const read = <T>(p: Promise<T>) =>
    withTimeout(p, RPC_TIMEOUT_MS * 2).catch((e) => {
      throw new ChainUnavailableError(`Não foi possível consultar a Solana Devnet agora. ${String((e as Error)?.message ?? "")}`.trim());
    });

  return {
    parties: {
      distributorWallets: Object.fromEntries(Object.entries(distributors).map(([id, kp]) => [id, kp.publicKey.toBase58()])) as DistributorWallets,
      treasuryWallet: treasury.toBase58(),
      funderWallets: Object.fromEntries(Object.entries(funders).map(([id, kp]) => [id, kp.publicKey.toBase58()])) as FunderWallets,
      settlementMint: settlementMint.toBase58(),
      escrowProgramId: programId.toBase58(),
    },

    async ping() {
      try {
        await withTimeout(connection.getLatestBlockhash(), RPC_TIMEOUT_MS);
      } catch {
        throw new ChainUnavailableError("A rede Solana Devnet não respondeu. Tente novamente.");
      }
    },

    async mintAssetToken({ reference, payloadHash, distributorId }, { timeoutMs, onSubmitted }) {
      const distributor = distributorKeypair(distributorId);
      const mint = Keypair.generate();
      const metadata: TokenMetadata = {
        mint: mint.publicKey,
        updateAuthority: distributor.publicKey,
        name: `AgroFlux ${reference}`,
        symbol: "AGFX",
        uri: "",
        additionalMetadata: [["payloadHash", payloadHash]],
      };
      const mintLen = getMintLen([ExtensionType.MetadataPointer]);
      let lamports: number;
      try {
        lamports = await withTimeout(
          connection.getMinimumBalanceForRentExemption(mintLen + TYPE_SIZE + LENGTH_SIZE + pack(metadata).length),
          RPC_TIMEOUT_MS,
        );
      } catch {
        throw new AssignmentFailure("RPC_UNAVAILABLE");
      }
      const ata = getAssociatedTokenAddressSync(mint.publicKey, distributor.publicKey, false, TOKEN_2022_PROGRAM_ID);
      const T22 = TOKEN_2022_PROGRAM_ID;
      const confirmed = await sendAndPoll(
        () => [
          SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: mint.publicKey, space: mintLen, lamports, programId: T22 }),
          createInitializeMetadataPointerInstruction(mint.publicKey, distributor.publicKey, mint.publicKey, T22),
          createInitializeMintInstruction(mint.publicKey, 0, distributor.publicKey, null, T22),
          createInitializeInstruction({
            programId: T22,
            metadata: mint.publicKey,
            updateAuthority: distributor.publicKey,
            mint: mint.publicKey,
            mintAuthority: distributor.publicKey,
            name: metadata.name,
            symbol: metadata.symbol,
            uri: metadata.uri,
          }),
          createUpdateFieldInstruction({ programId: T22, metadata: mint.publicKey, updateAuthority: distributor.publicKey, field: "payloadHash", value: payloadHash }),
          createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata, distributor.publicKey, mint.publicKey, T22),
          createMintToInstruction(mint.publicKey, ata, distributor.publicKey, 1, [], T22),
          // Supply fica em 1 para sempre e os metadados ficam imutáveis.
          createSetAuthorityInstruction(mint.publicKey, distributor.publicKey, AuthorityType.MintTokens, null, [], T22),
          createUpdateAuthorityInstruction({ programId: T22, metadata: mint.publicKey, oldAuthority: distributor.publicKey, newAuthority: null }),
        ],
        [mint, distributor],
        timeoutMs,
        classifySendError,
        (sig) => onSubmitted?.(sig, mint.publicKey.toBase58()),
      );
      return { ...confirmed, mint: mint.publicKey.toBase58() };
    },

    async settle(input, { timeoutMs, onSubmitted }) {
      const funder = funderKeypair(input.funderId);
      await assertFunderBalance(funder, input.amount);
      const documentLock = documentLockPda(programId, input.documentSha256).toBase58();
      return sendAndPoll(() => [ix(input, funder)], [distributorKeypair(input.distributorId), funder], timeoutMs, (e) => classifySettleError(e, { documentLock }), onSubmitted);
    },

    async attemptDoubleSettle(input, { timeoutMs, onSubmitted }) {
      const funder = funderKeypair(input.funderId);
      const deadline = Date.now() + timeoutMs;
      const { tx, signature } = await prepare(() => [ix(input, funder)], [distributorKeypair(input.distributorId), funder]);
      onSubmitted?.(signature);
      try {
        // Sem simulação prévia: a transação entra na rede e a recusa do programa fica registrada.
        await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 5 });
      } catch (e) {
        throw new AssignmentFailure(classifySendError(e));
      }
      const { err } = await poll(signature, deadline);
      if (!err) return { signature, landedWithError: false, rejectedByDocumentLock: false };
      const documentLock = documentLockPda(programId, input.documentSha256).toBase58();
      let logs: string[] = [];
      for (let i = 0; i < 5 && logs.length === 0; i++) {
        const t = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }).catch(() => null);
        logs = t?.meta?.logMessages ?? [];
        if (logs.length === 0) await sleep(POLL_MS);
      }
      const text = logs.join(" ");
      return { signature, landedWithError: true, rejectedByDocumentLock: text.includes("already in use") && text.includes(documentLock) };
    },

    documentLockAddress: (documentSha256) => documentLockPda(programId, documentSha256).toBase58(),

    async readDocumentLock(documentSha256) {
      const acc = await read(connection.getAccountInfo(documentLockPda(programId, documentSha256), "confirmed"));
      return acc?.owner.equals(programId) ? decodeDocumentLock(Buffer.from(acc.data)) : null;
    },

    async inspect({ assetMint, funderId, documentSha256 }) {
      const mintKey = new PublicKey(assetMint);
      const funder = funders[funderId]?.publicKey;
      const [mintInfo, metadata, funderAcc, settlementAcc, lockAcc] = await Promise.all([
        read(getMint(connection, mintKey, "confirmed", TOKEN_2022_PROGRAM_ID).catch(() => null)),
        read(getTokenMetadata(connection, mintKey, "confirmed").catch(() => null)),
        funder
          ? read(connection.getTokenAccountBalance(getAssociatedTokenAddressSync(mintKey, funder, false, TOKEN_2022_PROGRAM_ID), "confirmed").catch(() => null))
          : Promise.resolve(null),
        read(connection.getAccountInfo(settlementPda(programId, mintKey), "confirmed")),
        read(connection.getAccountInfo(documentLockPda(programId, documentSha256), "confirmed")),
      ]);
      return {
        mint: mintInfo ? { supply: Number(mintInfo.supply), decimals: mintInfo.decimals, mintAuthorityRevoked: mintInfo.mintAuthority === null } : null,
        metadataPayloadHash: metadata?.additionalMetadata.find(([k]) => k === "payloadHash")?.[1] ?? null,
        funderBalance: funderAcc ? Number(funderAcc.value.amount) : null,
        settlement: settlementAcc?.owner.equals(programId) ? decodeSettlement(Buffer.from(settlementAcc.data)) : null,
        documentLock: lockAcc?.owner.equals(programId) ? decodeDocumentLock(Buffer.from(lockAcc.data)) : null,
      };
    },

    async readBalances(addresses) {
      return Promise.all(
        addresses.map(async (address) => {
          const owner = new PublicKey(address);
          const [sol, tbrl] = await Promise.all([
            withTimeout(connection.getBalance(owner), RPC_TIMEOUT_MS).catch(() => null),
            withTimeout(connection.getTokenAccountBalance(getAssociatedTokenAddressSync(settlementMint, owner, false, TOKEN_PROGRAM_ID)), RPC_TIMEOUT_MS)
              .then((b) => Number(b.value.amount))
              .catch((e) => (/could not find account|invalid param/i.test(String((e as Error)?.message)) ? 0 : null)),
          ]);
          return { address, solLamports: sol, settlementUnits: tbrl };
        }),
      );
    },

    checkSignature,
  };
}
