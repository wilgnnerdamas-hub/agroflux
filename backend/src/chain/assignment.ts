// Cessão tokenizada na Devnet (contrato v1.1, §6.4). SIMULAÇÃO: token e moeda sem valor.
// 1) Token da cessão: Token-2022, supply 1, decimals 0, metadados só com referência e payloadHash, mint revogado.
// 2) Liquidação atômica pelo programa Anchor de escrow (blockchain/programs/agroflux-escrow).
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
  getMintLen,
} from "@solana/spl-token";
import { createInitializeInstruction, createUpdateAuthorityInstruction, createUpdateFieldInstruction, pack, type TokenMetadata } from "@solana/spl-token-metadata";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, type Signer } from "@solana/web3.js";
import bs58 from "bs58";
import type { AssignmentErrorCode } from "../types.js";
import { ChainUnavailableError, classifySendError, parseSecret, type Confirmed, type SendOptions } from "./solana.js";

export interface AssignmentParties {
  distributorWallet: string;
  funderWallet: string;
  settlementMint: string;
  escrowProgramId: string;
}

export interface AssignmentGateway {
  parties: AssignmentParties;
  // Lança ChainUnavailableError se a rede não responder.
  ping(): Promise<void>;
  // Cria o token da cessão. `onSubmitted` recebe a assinatura e o endereço da mint antes do envio.
  mintAssetToken(
    input: { reference: string; payloadHash: string },
    opts: { timeoutMs: number; onSubmitted?: (signature: string, mint: string) => void },
  ): Promise<Confirmed & { mint: string }>;
  // Liquidação atômica: token da cessão ao financiador e `amount` de tBRL-DEMO ao distribuidor, na mesma transação.
  settle(input: { assetMint: string; amount: number }, opts: SendOptions): Promise<Confirmed>;
  checkSignature(signature: string): Promise<Confirmed | null>;
}

export const ASSIGNMENT_ERROR_MESSAGES: Record<AssignmentErrorCode, string> = {
  INSUFFICIENT_FUNDS: "A carteira de demonstração está sem saldo na Devnet.",
  RPC_UNAVAILABLE: "A rede Solana Devnet não respondeu. Tente novamente.",
  TIMEOUT: "A confirmação demorou mais que o esperado. Tente novamente.",
  TX_FAILED: "A transação foi rejeitada pela rede.",
  INSUFFICIENT_TEST_TOKENS: "A carteira de demonstração do financiador não tem tBRL-DEMO suficiente.",
  ESCROW_REJECTED: "O programa de liquidação recusou a operação. Nenhuma transferência foi feita.",
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
// Discriminador da instrução `settle` (IDL em blockchain/idl/agroflux_escrow.json).
const SETTLE_DISCRIMINATOR = Buffer.from([175, 42, 185, 87, 144, 131, 102, 212]);
const RPC_TIMEOUT_MS = 5_000;
const POLL_MS = 1_000;
const MIN_BALANCE_LAMPORTS = 50_000_000; // aluguel da mint, das contas de token e do registro, com folga
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

// Erros da liquidação: códigos do programa (6000+) viram ESCROW_REJECTED; falta de tBRL, INSUFFICIENT_TEST_TOKENS.
export function classifySettleError(e: unknown): AssignmentErrorCode {
  const err = e as { message?: string; logs?: string[]; transactionLogs?: string[] };
  const text = [err?.message ?? String(e), ...(err?.logs ?? []), ...(err?.transactionLogs ?? [])].join(" ").toLowerCase();
  if (text.includes("no record of a prior credit") || text.includes("insufficient lamports")) return "INSUFFICIENT_FUNDS";
  if (text.includes("error: insufficient funds")) return "INSUFFICIENT_TEST_TOKENS";
  // 0x1770+ = erros do escrow; "already in use" = registro da liquidação já existe (token já liquidado).
  if (/custom program error: 0x17[0-9a-f]{2}\b|anchorerror|already in use/.test(text)) return "ESCROW_REJECTED";
  return classifySendError(e);
}

export function settlementPda(programId: PublicKey, assetMint: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("settlement"), assetMint.toBuffer()], programId)[0];
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
}): TransactionInstruction {
  const ata = (mint: PublicKey, owner: PublicKey, program: PublicKey) => getAssociatedTokenAddressSync(mint, owner, false, program);
  const data = Buffer.alloc(16);
  SETTLE_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(BigInt(p.amount), 8);
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
      r(TOKEN_2022_PROGRAM_ID),
      r(TOKEN_PROGRAM_ID),
      r(ASSOCIATED_TOKEN_PROGRAM_ID),
      r(SystemProgram.programId),
    ],
  });
}

export interface AssignmentEnv {
  rpcUrl: string;
  feePayerSecret: string;
  distributorSecret: string;
  funderSecret: string;
  settlementMint: string;
  escrowProgramId: string;
}

export function createAssignmentGateway(env: AssignmentEnv): AssignmentGateway {
  const connection = new Connection(env.rpcUrl, "confirmed");
  const payer = parseSecret(env.feePayerSecret);
  const distributor = parseSecret(env.distributorSecret);
  const funder = parseSecret(env.funderSecret);
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

  // Assina, avisa a assinatura antes do envio, envia (com simulação) e acompanha até `confirmed` ou o prazo.
  async function sendAndPoll(
    build: () => TransactionInstruction[],
    signers: Signer[],
    timeoutMs: number,
    classify: (e: unknown) => AssignmentErrorCode,
    onSubmitted?: (signature: string) => void,
  ): Promise<Confirmed> {
    const deadline = Date.now() + timeoutMs;
    let tx: Transaction;
    try {
      const balance = await withTimeout(connection.getBalance(payer.publicKey), RPC_TIMEOUT_MS);
      if (balance < MIN_BALANCE_LAMPORTS) throw new AssignmentFailure("INSUFFICIENT_FUNDS");
      const { blockhash, lastValidBlockHeight } = await withTimeout(connection.getLatestBlockhash(), RPC_TIMEOUT_MS);
      tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight }).add(...build());
      tx.sign(payer, ...signers);
    } catch (e) {
      if (e instanceof AssignmentFailure) throw e;
      throw new AssignmentFailure("RPC_UNAVAILABLE");
    }
    const signature = bs58.encode(tx.signature!);
    onSubmitted?.(signature);
    try {
      await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "confirmed", maxRetries: 5 });
    } catch (e) {
      throw new AssignmentFailure(classify(e));
    }
    while (Date.now() < deadline) {
      try {
        const { value } = await connection.getSignatureStatuses([signature]);
        const st = value[0];
        if (st?.err) throw new AssignmentFailure("TX_FAILED", signature);
        if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return toConfirmed(signature, st.slot);
      } catch (e) {
        if (e instanceof AssignmentFailure) throw e;
      }
      await sleep(POLL_MS);
    }
    throw new AssignmentFailure("TIMEOUT", signature);
  }

  return {
    parties: {
      distributorWallet: distributor.publicKey.toBase58(),
      funderWallet: funder.publicKey.toBase58(),
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

    async mintAssetToken({ reference, payloadHash }, { timeoutMs, onSubmitted }) {
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

    async settle({ assetMint, amount }, { timeoutMs, onSubmitted }) {
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
      const ix = settleInstruction({
        programId,
        payer: payer.publicKey,
        distributor: distributor.publicKey,
        funder: funder.publicKey,
        assetMint: new PublicKey(assetMint),
        settlementMint,
        amount,
      });
      return sendAndPoll(() => [ix], [distributor, funder], timeoutMs, classifySettleError, onSubmitted);
    },

    checkSignature,
  };
}
