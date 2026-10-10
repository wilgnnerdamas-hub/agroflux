// Tipos do contrato da API AgroFlux v1.2 (docs/api-contract.md).
// Não altere sem atualizar o contrato e avisar as três frentes.

export type ReceivableStatus =
  | "created"
  | "registration_pending"
  | "registered"
  | "registration_failed"
  // v1.2: publicado para financiadores (aceite do sacado + termo de coobrigação)
  | "published"
  | "offer_selected"
  // v1.1: cessão tokenizada
  | "assignment_pending"
  | "assigned"
  | "assignment_failed";

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
  | "offer_selected"
  // v1.1
  | "debtor_confirmation_requested"
  | "debtor_confirmed"
  | "debtor_confirmation_chain_failed"
  | "debtor_declined"
  | "assignment_requested"
  | "assignment_token_minted"
  | "assignment_settled"
  | "assignment_failed"
  // v1.2
  | "registry_registered"
  | "listing_published"
  | "listing_terms_anchored"
  | "listing_chain_failed"
  | "offer_proposed"
  | "registry_creditor_updated"
  | "double_assignment_rejected";

export type ProductCategory = "fertilizer" | "crop_protection" | "seed" | "other";
export type DocumentKind = "test_invoice" | "test_contract" | "other";
export type FunderType = "simulated_fidc" | "simulated_bank" | "simulated_cooperative";
export type OfferStatus = "available" | "selected" | "unavailable";
// v1.2 (§3.13)
export type FunderId = "fnd_a" | "fnd_b" | "fnd_c";
export type FunderMode = "interactive" | "automatic";

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

// v1.1 (§3.9)
export type DebtorConfirmationStatus = "none" | "requested" | "confirmed" | "declined";

export interface DebtorConfirmationChain {
  status: "pending" | "confirmed" | "failed";
  signature: string | null;
  explorerUrl: string | null;
  memo: string | null;
  confirmationHash: string | null;
  error: { code: ChainErrorCode; message: string } | null;
}

export interface DebtorConfirmation {
  status: DebtorConfirmationStatus;
  isSimulated: true;
  requestedAt: string | null;
  expiresAt: string | null;
  respondedAt: string | null;
  chain: DebtorConfirmationChain | null;
}

// v1.1 (§3.10)
export type AssignmentStatus = "none" | "pending" | "settled" | "failed";
export type AssignmentErrorCode = ChainErrorCode | "INSUFFICIENT_TEST_TOKENS" | "ESCROW_REJECTED" | "DOCUMENT_ALREADY_ASSIGNED";

// v1.2 (§3.10.1)
export interface DoubleSpendProof {
  status: "pending" | "rejected" | "error";
  attemptedAt: string;
  tokenMint: string | null;
  funderId: FunderId | null;
  signature: string | null;
  explorerUrl: string | null;
  reason: string | null;
  error: { code: AssignmentErrorCode; message: string } | null;
}

export interface Assignment {
  status: AssignmentStatus;
  isSimulated: true;
  cluster: "devnet";
  offerId: string | null;
  tokenMint: string | null;
  settlementMint: string | null;
  settlementAsset: "tBRL-DEMO";
  settlementAmount: number | null;
  distributorWallet: string | null;
  funderWallet: string | null;
  escrowProgramId: string | null;
  mintSignature: string | null;
  settlementSignature: string | null;
  explorerUrls: { tokenMint: string | null; mint: string | null; settlement: string | null; documentLock: string | null };
  submittedAt: string | null;
  settledAt: string | null;
  error: { code: AssignmentErrorCode; message: string } | null;
  // v1.2
  funderId: FunderId | null;
  funderName: string | null;
  documentLock: string | null;
  doubleSpendProof: DoubleSpendProof | null;
}

// v1.2 (§3.11): registradora SIMULADA.
export interface Registry {
  status: "none" | "registered";
  isSimulated: true;
  registrarName: string;
  registryId: string | null;
  registeredAt: string | null;
  documentSha256: string | null;
  creditor: { kind: "distributor" | "funder"; name: string; wallet: string | null };
  paymentDomicile: { payeeName: string; instruction: string; updatedAt: string } | null;
}

// v1.2 (§3.12)
export interface ListingChain {
  status: "pending" | "confirmed" | "failed";
  signature: string | null;
  explorerUrl: string | null;
  memo: string | null;
  error: { code: ChainErrorCode; message: string } | null;
}

export interface Listing {
  status: "none" | "published";
  publishedAt: string | null;
  terms: { version: string; textSha256: string; termsHash: string; acceptedAt: string } | null;
  chain: ListingChain | null;
}

// v1.2 (§3.13)
export interface Funder {
  id: FunderId;
  name: string;
  type: FunderType;
  mode: FunderMode;
  wallet: string | null;
  isSimulated: true;
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
  debtorConfirmation: DebtorConfirmation;
  assignment: Assignment;
  registry: Registry;
  listing: Listing;
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
  debtorConfirmation: { status: DebtorConfirmationStatus };
  assignment: { status: AssignmentStatus };
  registry: { registryId: string | null };
  listing: { status: Listing["status"] };
  offerCount: number;
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
    debtorConfirmedCount: number;
    assignedCount: number;
    publishedCount: number;
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
  funder: { id: FunderId; name: string; type: FunderType };
  origin: "automatic" | "proposal";
  grossAmountCents: number;
  monthlyRateBps: number;
  feesCents: number;
  netAmountCents: number;
  termDays: number;
  status: OfferStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
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
  features: { debtorConfirmation: boolean; assignment: boolean; marketplace: boolean; doubleSpendProof: boolean };
}

// v1.1 (§5.10 e §5.11)
export interface DebtorConfirmationRequest {
  token: string;
  confirmationPath: string;
  expiresAt: string;
  receivable: Receivable;
}

export interface ConfirmationSummary {
  isSimulated: true;
  disclaimer: string;
  reference: string;
  distributor: { name: string };
  product: Product;
  amountCents: number;
  currency: "BRL";
  dueDate: string;
  status: DebtorConfirmationStatus;
  expiresAt: string;
  // v1.2: número na registradora simulada e, depois da cessão, para quem pagar.
  registryId: string | null;
  paymentDomicile: Registry["paymentDomicile"];
}

// v1.2 (§5.15–5.23)
export interface Terms {
  isSimulated: true;
  version: string;
  text: string;
  textSha256: string;
}

export interface MarketplaceItem {
  receivable: ReceivableSummary & { cropSeason: string; issueDate: string; termDays: number };
  registryId: string | null;
  debtorAccepted: boolean;
  offerCount: number;
  bestOffer: { funderName: string; monthlyRateBps: number; netAmountCents: number } | null;
  myOffer: Offer | null;
}

export interface Marketplace {
  isSimulated: true;
  disclaimer: string;
  items: MarketplaceItem[];
}

export interface PortfolioItem {
  receivableId: string;
  reference: string;
  registryId: string | null;
  status: "settling" | "settled";
  product: Product;
  debtorState: string;
  faceAmountCents: number;
  paidAmountCents: number;
  monthlyRateBps: number;
  feesCents: number;
  settledAt: string | null;
  dueDate: string;
  tokenMint: string | null;
  settlementSignature: string | null;
  explorerUrls: { tokenMint: string | null; settlement: string | null };
}

export interface Portfolio {
  isSimulated: true;
  funder: Funder;
  items: PortfolioItem[];
  totals: { count: number; paidAmountCents: number; faceAmountCents: number; projectedIncomeCents: number };
}

export interface TransparencyWallet {
  role: "fee_payer" | "distributor" | "funder";
  funderId?: FunderId;
  label: string;
  address: string;
  explorerUrl: string;
  solLamports: number | null;
  settlementUnits: number | null;
}

export interface Transparency {
  isSimulated: true;
  cluster: "devnet";
  checkedAt: string;
  programs: { role: "memo" | "escrow" | "token_2022"; label: string; address: string; explorerUrl: string }[];
  settlementAsset: { symbol: "tBRL-DEMO"; mint: string; decimals: number; explorerUrl: string } | null;
  wallets: TransparencyWallet[];
  registry: { name: string; isSimulated: true; titles: number };
  stats: { receivables: number; registeredOnChain: number; debtorAccepted: number; published: number; assigned: number; doubleSpendRejected: number };
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
  // v1.1
  | "DEBTOR_CONFIRMATION_REQUIRED"
  | "CONFIRMATION_ALREADY_ANSWERED"
  | "CONFIRMATION_LINK_EXPIRED"
  // v1.2
  | "DUPLICATE_DOCUMENT"
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
