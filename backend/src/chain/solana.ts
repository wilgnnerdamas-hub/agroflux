import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import bs58 from "bs58";
import type { ChainErrorCode } from "../types.js";
import { MEMO_PROGRAM_ID } from "./payload.js";

// Porta única para a Solana Devnet. Os testes trocam esta implementação por um dublê.
export interface ChainHealth {
  reachable: boolean;
  feePayerBalanceLamports: number | null;
}

export interface Confirmed {
  signature: string;
  slot: number;
  blockTime: string | null;
}

export interface SendOptions {
  timeoutMs: number;
  // Chamado com a assinatura antes do envio, para recuperar o estado se o servidor reiniciar.
  onSubmitted?: (signature: string) => void;
}

export interface ChainGateway {
  health(): Promise<ChainHealth>;
  // Lança ChainUnavailableError se não der para enviar agora (RPC fora ou carteira não configurada).
  ping(): Promise<void>;
  // Envia o memo e espera o commitment `confirmed`. Lança ChainFailure em caso de falha.
  sendMemo(memo: string, opts: SendOptions): Promise<Confirmed>;
  // Consulta uma assinatura já enviada. Devolve null se ela não estiver confirmada.
  checkSignature(signature: string): Promise<Confirmed | null>;
  // Busca a transação e devolve o texto do memo. null se a transação não existir ou tiver falhado.
  // Lança ChainUnavailableError se a rede não responder.
  fetchMemo(signature: string): Promise<{ memo: string | null } | null>;
}

export class ChainUnavailableError extends Error {}

export const CHAIN_ERROR_MESSAGES: Record<ChainErrorCode, string> = {
  INSUFFICIENT_FUNDS: "A carteira de demonstração está sem saldo na Devnet.",
  RPC_UNAVAILABLE: "A rede Solana Devnet não respondeu. Tente novamente.",
  TIMEOUT: "A confirmação demorou mais que o esperado. Tente novamente.",
  TX_FAILED: "A transação foi rejeitada pela rede.",
};

export class ChainFailure extends Error {
  constructor(
    public readonly code: ChainErrorCode,
    public readonly signature: string | null = null,
  ) {
    super(CHAIN_ERROR_MESSAGES[code]);
  }
}

// Aceita a secret em base58 ou como array JSON de 64 bytes (formato do solana-keygen).
export function parseSecret(secret: string): Keypair {
  const raw = secret.trim();
  const bytes = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw) as number[]) : bs58.decode(raw);
  if (bytes.length !== 64) throw new Error("SOLANA_FEE_PAYER_SECRET inválida: esperado 64 bytes.");
  return Keypair.fromSecretKey(bytes);
}

const RPC_TIMEOUT_MS = 5_000;
const POLL_MS = 1_000;
// Taxa base (5.000 lamports) com folga.
const MIN_BALANCE_LAMPORTS = 10_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

// Classifica erros de envio. Erros de rede viram RPC_UNAVAILABLE; o resto, rejeição da transação.
export function classifySendError(e: unknown): ChainErrorCode {
  const err = e as { message?: string; logs?: string[]; transactionLogs?: string[] };
  const text = [err?.message ?? String(e), ...(err?.logs ?? []), ...(err?.transactionLogs ?? [])].join(" ").toLowerCase();
  if (text.includes("insufficient") || text.includes("no record of a prior credit")) return "INSUFFICIENT_FUNDS";
  if (/fetch failed|econn|enotfound|etimedout|socket|network|timeout|429|too many requests|502|503|504/.test(text)) {
    return "RPC_UNAVAILABLE";
  }
  return "TX_FAILED";
}

export function createSolanaGateway(rpcUrl: string, feePayerSecret: string | null): ChainGateway {
  const connection = new Connection(rpcUrl, "confirmed");
  const feePayer = feePayerSecret ? parseSecret(feePayerSecret) : null;
  const memoProgram = new PublicKey(MEMO_PROGRAM_ID);

  async function toConfirmed(signature: string, slot: number): Promise<Confirmed> {
    const t = await connection.getBlockTime(slot).catch(() => null);
    return { signature, slot, blockTime: t ? new Date(t * 1000).toISOString() : null };
  }

  return {
    async health() {
      try {
        if (!feePayer) {
          await withTimeout(connection.getLatestBlockhash(), RPC_TIMEOUT_MS);
          return { reachable: true, feePayerBalanceLamports: null };
        }
        const balance = await withTimeout(connection.getBalance(feePayer.publicKey), RPC_TIMEOUT_MS);
        return { reachable: true, feePayerBalanceLamports: balance };
      } catch {
        return { reachable: false, feePayerBalanceLamports: null };
      }
    },

    async ping() {
      if (!feePayer) throw new ChainUnavailableError("A carteira de demonstração não está configurada no servidor.");
      try {
        await withTimeout(connection.getLatestBlockhash(), RPC_TIMEOUT_MS);
      } catch {
        throw new ChainUnavailableError("A rede Solana Devnet não respondeu. Tente novamente.");
      }
    },

    async sendMemo(memo, { timeoutMs, onSubmitted }) {
      if (!feePayer) throw new ChainFailure("INSUFFICIENT_FUNDS");
      const deadline = Date.now() + timeoutMs;

      let tx: Transaction;
      try {
        const balance = await withTimeout(connection.getBalance(feePayer.publicKey), RPC_TIMEOUT_MS);
        if (balance < MIN_BALANCE_LAMPORTS) throw new ChainFailure("INSUFFICIENT_FUNDS");
        const { blockhash, lastValidBlockHeight } = await withTimeout(connection.getLatestBlockhash(), RPC_TIMEOUT_MS);
        tx = new Transaction({ feePayer: feePayer.publicKey, blockhash, lastValidBlockHeight }).add(
          new TransactionInstruction({
            programId: memoProgram,
            keys: [{ pubkey: feePayer.publicKey, isSigner: true, isWritable: false }],
            data: Buffer.from(memo, "utf8"),
          }),
        );
        tx.sign(feePayer);
      } catch (e) {
        if (e instanceof ChainFailure) throw e;
        throw new ChainFailure("RPC_UNAVAILABLE");
      }

      const signature = bs58.encode(tx.signature!);
      onSubmitted?.(signature);
      try {
        await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "confirmed", maxRetries: 5 });
      } catch (e) {
        throw new ChainFailure(classifySendError(e));
      }

      while (Date.now() < deadline) {
        try {
          const { value } = await connection.getSignatureStatuses([signature]);
          const st = value[0];
          if (st?.err) throw new ChainFailure("TX_FAILED", signature);
          if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
            return toConfirmed(signature, st.slot);
          }
        } catch (e) {
          if (e instanceof ChainFailure) throw e;
          // Falha passageira na consulta: continua tentando até o prazo.
        }
        await sleep(POLL_MS);
      }
      throw new ChainFailure("TIMEOUT", signature);
    },

    async fetchMemo(signature) {
      let tx;
      try {
        tx = await withTimeout(
          connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }),
          RPC_TIMEOUT_MS * 2,
        );
      } catch {
        throw new ChainUnavailableError("Não foi possível consultar a Solana Devnet agora.");
      }
      if (!tx || tx.meta?.err) return null;
      const { message } = tx.transaction;
      const keys = message.staticAccountKeys;
      const ix = message.compiledInstructions.find((i) => keys[i.programIdIndex]?.equals(memoProgram));
      return { memo: ix ? Buffer.from(ix.data).toString("utf8") : null };
    },

    async checkSignature(signature) {
      const { value } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
      const st = value[0];
      if (!st || st.err) return null;
      if (st.confirmationStatus !== "confirmed" && st.confirmationStatus !== "finalized") return null;
      return toConfirmed(signature, st.slot);
    },
  };
}
