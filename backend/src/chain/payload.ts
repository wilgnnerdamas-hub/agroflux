// Payload canônico e memo on-chain (§6.2 do contrato). Só hashes e ids: nada de nomes, UF ou valores em claro.
import { createHash } from "node:crypto";
import type { Receivable } from "../types.js";

export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

export const explorerTxUrl = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

// Chaves em ordem alfabética, sem espaços. A ordem de inserção define a ordem do JSON.stringify.
export function canonicalPayload(r: Receivable): string {
  return JSON.stringify({
    amountCents: r.amountCents,
    cropSeason: r.cropSeason,
    currency: r.currency,
    documentSha256: r.documents[0].sha256,
    dueDate: r.dueDate,
    id: r.id,
    issueDate: r.issueDate,
    productCategory: r.product.category,
  });
}

export const payloadHash = (r: Receivable) => createHash("sha256").update(canonicalPayload(r)).digest("hex");

export function buildMemo(r: Receivable, ph = payloadHash(r)): string {
  return JSON.stringify({ app: "agroflux", v: 1, evt: "receivable_registered", rid: r.id, doc: r.documents[0].sha256, ph });
}

// v1.1 (§6.3): payload canônico e memo da confirmação do sacado.
export function confirmationPayload(r: Receivable, confirmedAt: string): string {
  return JSON.stringify({
    confirmedAt,
    receivableId: r.id,
    receivablePayloadHash: r.chain.payloadHash,
    response: "confirmed",
  });
}

export const confirmationHash = (r: Receivable, confirmedAt: string) =>
  createHash("sha256").update(confirmationPayload(r, confirmedAt)).digest("hex");

export function buildConfirmationMemo(r: Receivable, ch: string): string {
  return JSON.stringify({ app: "agroflux", v: 1, evt: "debtor_confirmed", rid: r.id, ch });
}
