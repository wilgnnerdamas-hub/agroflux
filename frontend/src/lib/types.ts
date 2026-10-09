// Tipos do contrato da API AgroFlux v1.0 (docs/api-contract.md).
// Não altere sem atualizar o contrato e avisar as três frentes.

export type ReceivableStatus =
  | "created"
  | "registration_pending"
  | "registered"
  | "registration_failed"
  | "offer_selected";

export type ChainStatus = "none" | "pending" | "confirmed" | "failed";

export type ChainErrorCode =
  | "INSUFFICIENT_FUNDS"
  | "RPC_UNAVAILABLE"
  | "TIMEOUT"
  | "TX_FAILED";

export type EventType =
  | "receivable_created"
  | "document_attached"
  | "chain_registration_requested"
  | "chain_registration_confirmed"
  | "chain_registration_failed"
  | "offers_generated"
  | "offer_selected";

export type ProductCategory = "fertilizer" | "crop_protection" | "seed" | "other";
export type DocumentKind = "test_invoice" | "test_contract" | "other";
export type FunderType = "simulated_fidc" | "simulated_bank" | "simulated_cooperative";
export type OfferStatus = "available" | "selected" | "unavailable";

export interface Debtor {
  alias: string;
  state: string;
}

export interface Product {
  category: ProductCategory;
  description: string;
}

export interface ReceivableDocument {
  id: string;
  kind: DocumentKind;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedAt: string;
}

export interface ChainRecord {
  status: ChainStatus;
  cluster: "devnet";
  signature: string | null;
  slot: number | null;
  blockTime: string | null;
  explorerUrl: string | null;
  programId: string | null;
  memo: string | null;
  payloadHash: string | null;
  submittedAt: string | null;
  confirmedAt: string | null;
  error: { code: ChainErrorCode; message: string } | null;
}

export interface ReceivableEvent {
  id: string;
  type: EventType;
  occurredAt: string;
  actor: "demo_user" | "system";
  description: string;
  onChain: boolean;
  chain: { signature: string; explorerUrl: string } | null;
  data: Record<string, unknown>;
}

export interface Receivable {
  id: string;
  reference: string;
  status: ReceivableStatus;
  isDemo: true;
  distributor: { name: string };
  debtor: Debtor;
  product: Product;
  cropSeason: string;
  amountCents: number;
  currency: "BRL";
  issueDate: string;
  dueDate: string;
  termDays: number;
  documents: ReceivableDocument[];
  chain: ChainRecord;
  events: ReceivableEvent[];
  selectedOfferId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReceivableSummary {
  id: string;
  reference: string;
  status: ReceivableStatus;
  debtor: Debtor;
  product: Product;
  amountCents: number;
  currency: "BRL";
  dueDate: string;
  chain: { status: ChainStatus };
  selectedOfferId: string | null;
  createdAt: string;
}

export interface ReceivableList {
  items: ReceivableSummary[];
  totals: {
    count: number;
    amountCents: number;
    registeredCount: number;
    pendingCount: number;
    offerSelectedCount: number;
  };
}

export interface CreateReceivableInput {
  debtor: Debtor;
  product: Product;
  cropSeason: string;
  amountCents: number;
  issueDate: string;
  dueDate: string;
  documentKind: DocumentKind;
}

export interface Offer {
  id: string;
  receivableId: string;
  isSimulated: true;
  funder: { name: string; type: FunderType };
  grossAmountCents: number;
  monthlyRateBps: number;
  feesCents: number;
  netAmountCents: number;
  termDays: number;
  status: OfferStatus;
  expiresAt: string;
}

export interface OfferList {
  isSimulated: true;
  disclaimer: string;
  items: Offer[];
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  label: string;
}

export interface Verification {
  verified: boolean;
  checkedAt: string;
  signature: string;
  checks: VerificationCheck[];
}

export interface Health {
  status: "ok" | string;
  version: string;
  cluster: "devnet";
  solana: { reachable: boolean; feePayerBalanceLamports: number | null };
}

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "OFFER_ALREADY_SELECTED"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FILE_TYPE"
  | "VALIDATION_ERROR"
  | "HASH_MISMATCH"
  | "CHAIN_UNAVAILABLE"
  | "INTERNAL_ERROR"
  // Códigos só do frontend (não vêm do backend):
  | "NETWORK_ERROR"
  | "BACKEND_NOT_CONNECTED";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    fieldErrors?: Record<string, string>;
    details?: Record<string, unknown>;
  };
}
