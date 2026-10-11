import type { AgroFluxApi } from "./client";
import { ApiError } from "./errors";
import type {
  AdminDistributorRow,
  AdminFunderRow,
  AdminOverview,
  AdminReceivableRow,
  AdminRevenue,
  AdminRisk,
  Distributor,
  PricingReference,
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

const TIMEOUT_MS = 20_000;

export function createHttpApi(baseUrl: string): AgroFluxApi {
  const base = baseUrl.replace(/\/+$/, "");

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { Accept: "application/json", ...(init.headers ?? {}) },
        cache: "no-store",
      });
    } catch {
      throw new ApiError(
        "NETWORK_ERROR",
        "Não foi possível falar com o servidor. Verifique a conexão e tente novamente.",
      );
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 204) return undefined as T;
    let body: unknown = undefined;
    try {
      body = await res.json();
    } catch {
      /* corpo vazio ou não-JSON */
    }
    if (!res.ok) throw ApiError.fromBody(res.status, body);
    return body as T;
  }

  return {
    mode: "http",
    health: () => request<Health>("/health"),
    listReceivables: (distributorId) => request<ReceivableList>(`/receivables${distributorId ? `?distributorId=${encodeURIComponent(distributorId)}` : ""}`),
    getReceivable: (id) => request<Receivable>(`/receivables/${encodeURIComponent(id)}`),
    async createReceivable(input: CreateReceivableInput, document: File, clientSha256?: string) {
      const form = new FormData();
      form.append("data", JSON.stringify(input));
      form.append("document", document, document.name);
      return request<Receivable>("/receivables", {
        method: "POST",
        body: form,
        headers: clientSha256 ? { "X-Client-Sha256": clientSha256 } : undefined,
      });
    },
    async registerReceivable(id, idempotencyKey) {
      const r = await request<{ receivable: Receivable }>(`/receivables/${encodeURIComponent(id)}/register`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
      });
      return r.receivable;
    },
    getVerification: (id) => request<Verification>(`/receivables/${encodeURIComponent(id)}/verification`),
    listOffers: (id) => request<OfferList>(`/receivables/${encodeURIComponent(id)}/offers`),
    selectOffer: (id, offerId) =>
      request<Receivable>(
        `/receivables/${encodeURIComponent(id)}/offers/${encodeURIComponent(offerId)}/select`,
        { method: "POST" },
      ),
    requestDebtorConfirmation: (id) =>
      request<DebtorConfirmationRequest>(`/receivables/${encodeURIComponent(id)}/debtor-confirmation`, { method: "POST" }),
    async retryDebtorConfirmationRegister(id, idempotencyKey) {
      const r = await request<{ receivable: Receivable }>(`/receivables/${encodeURIComponent(id)}/debtor-confirmation/register`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
      });
      return r.receivable;
    },
    getConfirmation: (token) => request<ConfirmationSummary>(`/confirmations/${encodeURIComponent(token)}`),
    confirmDebtor: (token) => request<ConfirmationSummary>(`/confirmations/${encodeURIComponent(token)}/confirm`, { method: "POST" }),
    declineDebtor: (token) => request<ConfirmationSummary>(`/confirmations/${encodeURIComponent(token)}/decline`, { method: "POST" }),
    async requestAssignment(id, idempotencyKey) {
      const r = await request<{ receivable: Receivable }>(`/receivables/${encodeURIComponent(id)}/assignment`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
      });
      return r.receivable;
    },
    getTerms: () => request<Terms>("/terms"),
    async publish(id, termsVersion, idempotencyKey) {
      const r = await request<{ receivable: Receivable }>(`/receivables/${encodeURIComponent(id)}/publish`, {
        method: "POST",
        body: JSON.stringify({ acceptTerms: true, termsVersion }),
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      });
      return r.receivable;
    },
    async retryPublishRegister(id, idempotencyKey) {
      const r = await request<{ receivable: Receivable }>(`/receivables/${encodeURIComponent(id)}/publish/register`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
      });
      return r.receivable;
    },
    proposeOffer: (id, input) =>
      request<{ offer: Offer; receivable: Receivable }>(`/receivables/${encodeURIComponent(id)}/offers`, {
        method: "POST",
        body: JSON.stringify(input),
        headers: { "Content-Type": "application/json" },
      }),
    listFunders: () => request<{ items: Funder[] }>("/funders"),
    getMarketplace: (funderId) => request<Marketplace>(`/marketplace?funderId=${encodeURIComponent(funderId)}`),
    getPortfolio: (funderId) => request<Portfolio>(`/funders/${encodeURIComponent(funderId)}/portfolio`),
    async requestDoubleSpendProof(id) {
      const r = await request<{ receivable: Receivable }>(`/receivables/${encodeURIComponent(id)}/assignment/double-spend-test`, { method: "POST" });
      return r.receivable;
    },
    getTransparency: () => request<Transparency>("/transparency"),
    getPricingReference: () => request<PricingReference>("/pricing/reference"),
    quote: (id, input) =>
      request<Quote>(`/receivables/${encodeURIComponent(id)}/quote`, {
        method: "POST",
        body: JSON.stringify(input),
        headers: { "Content-Type": "application/json" },
      }),
    listDistributors: () => request<{ items: Distributor[] }>("/distributors"),
    adminOverview: () => request<AdminOverview>("/admin/overview"),
    adminReceivables: () => request<{ items: AdminReceivableRow[] }>("/admin/receivables"),
    adminFunders: () => request<{ items: AdminFunderRow[] }>("/admin/funders"),
    adminDistributors: () => request<{ items: AdminDistributorRow[] }>("/admin/distributors"),
    adminRevenue: () => request<AdminRevenue>("/admin/revenue"),
    adminRisk: () => request<AdminRisk>("/admin/risk"),
    getSettings: () => request<Settings>("/admin/settings"),
    updateSettings: (patch) =>
      request<Settings>("/admin/settings", { method: "PUT", body: JSON.stringify(patch), headers: { "Content-Type": "application/json" } }),
  };
}
