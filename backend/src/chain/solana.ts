import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";

// Porta única para a Solana Devnet. Os testes trocam esta implementação por um dublê.
export interface ChainHealth {
  reachable: boolean;
  feePayerBalanceLamports: number | null;
}

export interface ChainGateway {
  health(): Promise<ChainHealth>;
}

// Aceita a secret em base58 ou como array JSON de 64 bytes (formato do solana-keygen).
export function parseSecret(secret: string): Keypair {
  const raw = secret.trim();
  const bytes = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw) as number[]) : bs58.decode(raw);
  if (bytes.length !== 64) throw new Error("SOLANA_FEE_PAYER_SECRET inválida: esperado 64 bytes.");
  return Keypair.fromSecretKey(bytes);
}

const HEALTH_TIMEOUT_MS = 5_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export function createSolanaGateway(rpcUrl: string, feePayerSecret: string | null): ChainGateway {
  const connection = new Connection(rpcUrl, "confirmed");
  const feePayer = feePayerSecret ? parseSecret(feePayerSecret) : null;

  return {
    async health() {
      try {
        if (!feePayer) {
          await withTimeout(connection.getLatestBlockhash(), HEALTH_TIMEOUT_MS);
          return { reachable: true, feePayerBalanceLamports: null };
        }
        const balance = await withTimeout(connection.getBalance(feePayer.publicKey), HEALTH_TIMEOUT_MS);
        return { reachable: true, feePayerBalanceLamports: balance };
      } catch {
        return { reachable: false, feePayerBalanceLamports: null };
      }
    },
  };
}
