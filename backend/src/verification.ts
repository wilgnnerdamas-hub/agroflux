// GET /receivables/:id/verification (§5.6): confere a transação na Devnet contra os dados guardados.
import { confirmationHash, payloadHash } from "./chain/payload.js";
import { ChainUnavailableError, type ChainGateway } from "./chain/solana.js";
import { chainUnavailable, invalidState } from "./errors.js";
import { EXT, getReceivable, sha256Hex } from "./receivables.js";
import type { Store } from "./store.js";
import type { Verification, VerificationCheck } from "./types.js";

function parseMemo(memo: string | null): { doc?: unknown; ph?: unknown } {
  try {
    return memo ? JSON.parse(memo) : {};
  } catch {
    return {};
  }
}

export async function verifyReceivable(store: Store, chain: ChainGateway, id: string): Promise<Verification> {
  const r = getReceivable(store, id);
  if (r.chain.status !== "confirmed" || !r.chain.signature) {
    throw invalidState("Ainda não há transação confirmada para verificar.");
  }
  const signature = r.chain.signature;

  let onChain: { memo: string | null } | null;
  try {
    onChain = await chain.fetchMemo(signature);
  } catch (e) {
    if (e instanceof ChainUnavailableError) throw chainUnavailable("Não foi possível verificar agora. Tente novamente.");
    throw e;
  }

  const memo = onChain?.memo ?? null;
  const parsed = parseMemo(memo);
  const doc = r.documents[0];
  const file = store.readUpload(doc.id, EXT[doc.mimeType] ?? "");
  const fileSha = file ? sha256Hex(file) : null;
  const ph = payloadHash(r);

  const checks: VerificationCheck[] = [
    { name: "transaction_found", passed: onChain !== null, label: "Transação encontrada na Devnet" },
    { name: "memo_matches", passed: memo !== null && memo === r.chain.memo, label: "Conteúdo on-chain igual ao registrado" },
    {
      name: "document_hash_matches",
      passed: fileSha !== null && fileSha === doc.sha256 && parsed.doc === doc.sha256,
      label: "Hash do documento confere",
    },
    {
      name: "payload_hash_matches",
      passed: ph === r.chain.payloadHash && parsed.ph === ph,
      label: "Hash dos dados do recebível confere",
    },
  ];

  // v1.1 (§6.3): confere também a confirmação do sacado, quando houver uma registrada.
  const dc = r.debtorConfirmation;
  if (dc.status === "confirmed" && dc.chain?.status === "confirmed" && dc.chain.signature) {
    let dcMemo: string | null = null;
    try {
      dcMemo = (await chain.fetchMemo(dc.chain.signature))?.memo ?? null;
    } catch (e) {
      if (e instanceof ChainUnavailableError) throw chainUnavailable("Não foi possível verificar agora. Tente novamente.");
      throw e;
    }
    const expected = dc.respondedAt ? confirmationHash(r, dc.respondedAt) : null;
    let ch: unknown;
    try {
      ch = dcMemo ? JSON.parse(dcMemo).ch : undefined;
    } catch {
      ch = undefined;
    }
    checks.push({
      name: "debtor_confirmation_matches",
      passed: dcMemo !== null && dcMemo === dc.chain.memo && ch === expected && expected === dc.chain.confirmationHash,
      label: "Confirmação do sacado confere on-chain",
    });
  }

  return { verified: checks.every((c) => c.passed), checkedAt: new Date().toISOString(), signature, checks };
}
