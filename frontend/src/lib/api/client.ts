import type {
  ConfirmationSummary,
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
  listReceivables(): Promise<ReceivableList>;
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
}
