// GET /receivables/:id/verification (§5.6 e §6.7): confere as transações e contas na Devnet contra os dados guardados.
import type { AssignmentGateway } from "./chain/assignment.js";
import { confirmationHash, payloadHash, termsHash } from "./chain/payload.js";
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

const unavailable = (e: unknown) => {
  if (e instanceof ChainUnavailableError) return chainUnavailable("Não foi possível verificar agora. Tente novamente.");
  return e;
};

export async function verifyReceivable(store: Store, chain: ChainGateway, id: string, gateway: AssignmentGateway | null = null): Promise<Verification> {
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

  // v1.2 (§6.6): termo de coobrigação.
  const ls = r.listing;
  if (ls.chain?.status === "confirmed" && ls.chain.signature && ls.terms) {
    let lsMemo: string | null = null;
    try {
      lsMemo = (await chain.fetchMemo(ls.chain.signature))?.memo ?? null;
    } catch (e) {
      throw unavailable(e);
    }
    let th: unknown;
    try {
      th = lsMemo ? JSON.parse(lsMemo).th : undefined;
    } catch {
      th = undefined;
    }
    const expected = termsHash(r, ls.terms);
    checks.push({
      name: "terms_matches",
      passed: lsMemo !== null && lsMemo === ls.chain.memo && th === expected && expected === ls.terms.termsHash,
      label: "Termo de coobrigação confere on-chain",
    });
  }

  // v1.2 (§6.7): cessão tokenizada, lida direto das contas na Devnet.
  const a = r.assignment;
  if (gateway && r.status === "assigned" && a.tokenMint && a.funderId) {
    let info;
    try {
      info = await gateway.inspect({ assetMint: a.tokenMint, funderId: a.funderId, documentSha256: doc.sha256 });
    } catch (e) {
      throw unavailable(e);
    }
    const s = info.settlement;
    const lock = info.documentLock;
    checks.push(
      {
        name: "asset_token_unique",
        passed: !!info.mint && info.mint.supply === 1 && info.mint.decimals === 0 && info.mint.mintAuthorityRevoked,
        label: "Token da cessão é único (supply 1, sem autoridade de mint)",
      },
      { name: "asset_metadata_matches", passed: info.metadataPayloadHash !== null && info.metadataPayloadHash === r.chain.payloadHash, label: "Metadados do token apontam para este recebível" },
      { name: "asset_held_by_funder", passed: info.funderBalance === 1, label: "Token está com o financiador" },
      {
        name: "settlement_record_matches",
        passed:
          !!s &&
          s.assetMint === a.tokenMint &&
          s.amount === a.settlementAmount &&
          s.funder === a.funderWallet &&
          s.distributor === a.distributorWallet &&
          s.settlementMint === a.settlementMint,
        label: "Registro da liquidação confere (valor e carteiras)",
      },
    );
    if (a.documentLock) {
      checks.push({
        name: "document_lock_matches",
        passed: !!lock && lock.documentSha256 === doc.sha256 && lock.assetMint === a.tokenMint && lock.funder === a.funderWallet,
        label: "Documento travado on-chain contra segunda cessão",
      });
    }
  }

  return { verified: checks.every((c) => c.passed), checkedAt: new Date().toISOString(), signature, checks };
}
