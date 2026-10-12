// Verificador público (11/10): dado o hash SHA-256 de um documento, diz se ele está na AgroFlux, em que etapa,
// para quem foi cedido e se existe a trava on-chain do escrow na Devnet (lida direto da rede, só pelo hash).
// Só devolve dados já públicos na demo (pseudônimos, identificadores e links do Explorer).
import { ApiError } from "./errors.js";
import type { AssignmentGateway } from "./chain/assignment.js";
import { ChainUnavailableError } from "./chain/solana.js";
import { explorerTxUrl } from "./chain/payload.js";
import { FUNDER_DEFS } from "./funders.js";
import type { Store } from "./store.js";

const link = (signature: string | null | undefined) => (signature ? { signature, explorerUrl: explorerTxUrl(signature) } : null);
const addressUrl = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;

export async function verifyDocument(store: Store, gateway: AssignmentGateway | null, sha256: string) {
  const hash = sha256.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new ApiError(400, "BAD_REQUEST", "Informe o hash SHA-256 do documento (64 caracteres hexadecimais).");

  const r = store.all().find((x) => x.documents.some((d) => d.sha256 === hash)) ?? null;

  // Trava on-chain: independe do banco da AgroFlux.
  let onChainLock: { checked: boolean; exists: boolean; address: string | null; explorerUrl: string | null; funder: string | null; funderName: string | null } = {
    checked: false,
    exists: false,
    address: null,
    explorerUrl: null,
    funder: null,
    funderName: null,
  };
  if (gateway?.readDocumentLock) {
    const address = gateway.documentLockAddress(hash);
    try {
      const lock = await gateway.readDocumentLock(hash);
      const funderId = lock ? Object.entries(gateway.parties.funderWallets).find(([, w]) => w === lock.funder)?.[0] : undefined;
      onChainLock = {
        checked: true,
        exists: !!lock,
        address,
        explorerUrl: addressUrl(address),
        funder: lock?.funder ?? null,
        funderName: funderId ? (FUNDER_DEFS.find((f) => f.id === funderId)?.name ?? null) : null,
      };
    } catch (e) {
      if (!(e instanceof ChainUnavailableError)) throw e;
      onChainLock = { ...onChainLock, address, explorerUrl: addressUrl(address) };
    }
  }

  return {
    isSimulated: true as const,
    sha256: hash,
    found: !!r,
    receivable: r
      ? {
          reference: r.reference,
          registryId: r.registry.registryId,
          status: r.status,
          distributor: r.distributor.name,
          debtorAlias: r.debtor.alias,
          debtorState: r.debtor.state,
          dueDate: r.dueDate,
          registeredAt: r.chain.confirmedAt,
        }
      : null,
    proofs: r
      ? {
          registration: r.chain.status === "confirmed" ? link(r.chain.signature) : null,
          debtorConfirmation: r.debtorConfirmation.chain?.status === "confirmed" ? link(r.debtorConfirmation.chain.signature) : null,
          publication: r.listing.chain?.status === "confirmed" ? link(r.listing.chain.signature) : null,
          assignment:
            r.status === "assigned"
              ? { ...link(r.assignment.settlementSignature)!, creditor: r.registry.creditor.name, tokenMint: r.assignment.tokenMint, tokenUrl: r.assignment.explorerUrls.tokenMint }
              : null,
          payment: r.assignment.maturityPayment?.status === "paid" ? { ...link(r.assignment.maturityPayment.signature)!, paidAt: r.assignment.maturityPayment.paidAt } : null,
        }
      : null,
    onChainLock,
  };
}
