import type {
  AdminDistributorRow,
  AdminFunderRow,
  AdminOverview,
  AdminReceivableRow,
  AdminRevenue,
  AdminRisk,
  Distributor,
  PricingReference,
  RiskMemo,
  DocumentVerification,
  Quote,
  Settings,
  ConfirmationSummary,
  Funder,
  Marketplace,
  Offer,
  Portfolio,
  Terms,
  Transparency,
  CreateReceivableInput,
  DebtorConfirmationRequest,
  Health,
  OfferList,
  Receivable,
  ReceivableList,
  Verification,
} from "../types";

/** Única porta de entrada do frontend para a API (§5 do contrato). */
export interface AgroFluxApi {
  readonly mode: "http" | "mock";
  health(): Promise<Health>;
  listReceivables(distributorId?: string): Promise<ReceivableList>;
  createReceivable(input: CreateReceivableInput, document: File, clientSha256?: string): Promise<Receivable>;
  getReceivable(id: string): Promise<Receivable>;
  registerReceivable(id: string, idempotencyKey: string): Promise<Receivable>;
  getVerification(id: string): Promise<Verification>;
  listOffers(id: string): Promise<OfferList>;
  selectOffer(id: string, offerId: string): Promise<Receivable>;
  // v1.1: confirmação do sacado (§5.10–5.13).
  requestDebtorConfirmation(id: string): Promise<DebtorConfirmationRequest>;
  retryDebtorConfirmationRegister(id: string, idempotencyKey: string): Promise<Receivable>;
  getConfirmation(token: string): Promise<ConfirmationSummary>;
  confirmDebtor(token: string): Promise<ConfirmationSummary>;
  declineDebtor(token: string): Promise<ConfirmationSummary>;
  // v1.1: cessão tokenizada (§5.14). 202; o frontend acompanha por polling.
  requestAssignment(id: string, idempotencyKey: string): Promise<Receivable>;
  // v1.2 (§5.15–5.23).
  getTerms(): Promise<Terms>;
  publish(id: string, termsVersion: string, idempotencyKey: string): Promise<Receivable>;
  retryPublishRegister(id: string, idempotencyKey: string): Promise<Receivable>;
  proposeOffer(id: string, input: { funderId: string; spreadBps: number; feesCents: number }): Promise<{ offer: Offer; receivable: Receivable }>;
  listFunders(): Promise<{ items: Funder[] }>;
  getMarketplace(funderId: string): Promise<Marketplace>;
  getPortfolio(funderId: string): Promise<Portfolio>;
  requestDoubleSpendProof(id: string): Promise<Receivable>;
  getTransparency(): Promise<Transparency>;
  // v1.3 (§15).
  getPricingReference(): Promise<PricingReference>;
  // 11/10: analista de IA (Claude).
  runDocumentCheck(id: string): Promise<Receivable>;
  requestRiskMemo(id: string, lang: "pt" | "en"): Promise<RiskMemo>;
  verifyDocument(sha256: string): Promise<DocumentVerification>;
  requestMaturityPayment(id: string): Promise<Receivable>;
  quote(id: string, input: { funderId: string; spreadBps: number; feesCents: number }): Promise<Quote>;
  listDistributors(): Promise<{ items: Distributor[] }>;
  adminOverview(): Promise<AdminOverview>;
  adminReceivables(): Promise<{ items: AdminReceivableRow[] }>;
  adminFunders(): Promise<{ items: AdminFunderRow[] }>;
  adminDistributors(): Promise<{ items: AdminDistributorRow[] }>;
  adminRevenue(): Promise<AdminRevenue>;
  adminRisk(): Promise<AdminRisk>;
  getSettings(): Promise<Settings>;
  updateSettings(patch: unknown): Promise<Settings>;
}
