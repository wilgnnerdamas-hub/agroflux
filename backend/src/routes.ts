import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AssignmentGateway } from "./chain/assignment.js";
import type { ChainGateway } from "./chain/solana.js";
import { ApiError } from "./errors.js";
import { listFunders } from "./funders.js";
import { getTerms, type ListingService } from "./listing.js";
import { marketplace, portfolio } from "./marketplace.js";
import { listOffers, proposeOffer, quoteOffer, selectOffer } from "./offers.js";
import type { AdminService } from "./admin.js";
import { listDistributors } from "./distributors.js";
import type { PricingService } from "./pricing/service.js";
import { mergeSettings } from "./pricing/settings.js";
import type { Receivable } from "./types.js";
import { transparency } from "./transparency.js";
import type { AssignmentService } from "./assignment.js";
import type { ConfirmationService } from "./confirmation.js";
import type { Registrar } from "./registration.js";
import { resetDemo } from "./seed.js";
import { createReceivable, getReceivable, listReceivables, type UploadedDocument } from "./receivables.js";
import type { AiService } from "./ai/service.js";
import { verifyDocument } from "./verify-document.js";
import type { Store } from "./store.js";
import type { Health } from "./types.js";
import { detectMime, validateReceivableInput } from "./validation.js";
import { verifyReceivable } from "./verification.js";

export const API_VERSION = "1.3.0";
const FILE_MESSAGE = "Envie um PDF, PNG ou JPEG de até 5 MB.";

export interface RouteDeps {
  store: Store;
  chain: ChainGateway;
  registrar: Registrar;
  confirmations: ConfirmationService;
  listings: ListingService;
  assignments: AssignmentService | null;
  assignmentGateway: AssignmentGateway | null;
  pricing: PricingService;
  admin: AdminService;
  demoResetEnabled: boolean;
  ai: AiService | null;
}

type IdParams = { Params: { id: string } };
type OfferParams = { Params: { id: string; offerId: string } };
type TokenParams = { Params: { token: string } };
type FunderParams = { Params: { id: string } };
type MarketQuery = { Querystring: { funderId?: string } };
type ListQuery = { Querystring: { distributorId?: string } };

const idempotencyKey = (req: FastifyRequest) => {
  const header = req.headers["idempotency-key"];
  return (Array.isArray(header) ? header[0] : header)?.trim() || undefined;
};

async function readMultipart(req: FastifyRequest) {
  if (!req.isMultipart()) {
    throw new ApiError(400, "BAD_REQUEST", "Envie os dados como multipart/form-data, com as partes data e document.");
  }
  let data: string | undefined;
  let document: UploadedDocument | undefined;
  for await (const part of req.parts()) {
    if (part.type === "file") {
      const bytes = await part.toBuffer();
      if (part.fieldname === "document") document = { filename: part.filename || "documento", mimeType: part.mimetype, bytes };
    } else if (part.fieldname === "data") {
      data = String(part.value);
    }
  }
  return { data, document };
}

export async function routes(api: FastifyInstance, deps: RouteDeps) {
  const { store, chain, registrar, confirmations, listings, assignments, assignmentGateway, pricing, admin, demoResetEnabled, ai } = deps;
  const wallets = assignmentGateway?.parties.funderWallets ?? null;
  // v1.3: toda resposta com recebível leva o risco calculado na hora.
  const out = (r: Receivable) => pricing.present(r);

  api.get("/health", async (): Promise<Health> => {
    const solana = await chain.health();
    const assignment = assignments !== null;
    return {
      status: "ok",
      version: API_VERSION,
      cluster: "devnet",
      solana,
      features: { debtorConfirmation: true, assignment, marketplace: true, doubleSpendProof: assignment, ai: ai !== null },
    };
  });

  api.get<ListQuery>("/receivables", async (req) => listReceivables(store, pricing, req.query.distributorId));

  api.post("/receivables", async (req, reply) => {
    const { data, document } = await readMultipart(req);
    if (data === undefined) throw new ApiError(400, "BAD_REQUEST", "A parte data está ausente.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      throw new ApiError(400, "BAD_REQUEST", "A parte data não é um JSON válido.");
    }

    const result = validateReceivableInput(parsed);
    const fieldErrors = result.ok ? {} : { ...result.fieldErrors };
    if (!document || document.bytes.length === 0) fieldErrors.document = FILE_MESSAGE;
    if (Object.keys(fieldErrors).length || !result.ok || !document) {
      throw new ApiError(422, "VALIDATION_ERROR", "Alguns campos precisam de ajuste.", fieldErrors);
    }

    const mimeType = detectMime(document.bytes);
    if (!mimeType) throw new ApiError(415, "UNSUPPORTED_FILE_TYPE", FILE_MESSAGE);

    const header = req.headers["x-client-sha256"];
    const clientSha256 = Array.isArray(header) ? header[0] : header;
    const receivable = createReceivable(store, result.value, { ...document, mimeType }, clientSha256);
    // 11/10: a IA confere o documento em segundo plano (quando configurada).
    return reply.status(201).send(out(ai ? ai.startDocumentCheck(receivable.id) : receivable));
  });

  // 11/10: conferência do documento (repetir) e parecer de risco por IA.
  api.post<IdParams>("/receivables/:id/document-check", async (req, reply) => {
    if (!ai) throw new ApiError(503, "AI_UNAVAILABLE", "A análise por IA não está configurada neste ambiente.");
    return reply.status(202).send(out(ai.startDocumentCheck(req.params.id)));
  });

  api.post<IdParams & { Body: { lang?: string } }>("/receivables/:id/risk-memo", async (req) => {
    if (!ai) throw new ApiError(503, "AI_UNAVAILABLE", "A análise por IA não está configurada neste ambiente.");
    const lang = req.body?.lang === "en" ? "en" : "pt";
    return { memo: await ai.riskMemo(req.params.id, lang) };
  });

  api.get<IdParams>("/receivables/:id", async (req) => out(getReceivable(store, req.params.id)));

  // 11/10: verificador público por hash do documento (registro, etapas e trava on-chain).
  api.get<{ Params: { sha256: string } }>("/verify/:sha256", async (req) => verifyDocument(store, assignmentGateway, req.params.sha256));

  api.post<IdParams>("/receivables/:id/register", async (req, reply) => {
    const header = req.headers["idempotency-key"];
    const key = (Array.isArray(header) ? header[0] : header)?.trim() || undefined;
    const receivable = await registrar.register(req.params.id, key);
    return reply.status(202).send({ receivable: out(receivable) });
  });

  api.get<IdParams>("/receivables/:id/verification", async (req) => verifyReceivable(store, chain, req.params.id, assignmentGateway));

  api.get<IdParams>("/receivables/:id/offers", async (req) => listOffers(store, req.params.id));

  api.post<OfferParams>("/receivables/:id/offers/:offerId/select", async (req) => out(selectOffer(store, req.params.id, req.params.offerId)));

  // v1.2: publicação com termo de coobrigação, propostas, visão do financiador e transparência (§5.15–5.23).
  api.get("/terms", async () => getTerms());
  api.post<IdParams>("/receivables/:id/publish", async (req, reply) => {
    const receivable = await listings.publish(req.params.id, req.body, idempotencyKey(req));
    return reply.status(202).send({ receivable: out(receivable) });
  });
  api.post<IdParams>("/receivables/:id/publish/register", async (req, reply) => {
    const receivable = await listings.retryRegister(req.params.id, idempotencyKey(req));
    return reply.status(202).send({ receivable: out(receivable) });
  });
  api.post<IdParams>("/receivables/:id/offers", async (req, reply) => {
    const { offer, receivable } = await proposeOffer(store, pricing, req.params.id, req.body);
    return reply.status(201).send({ offer, receivable: out(receivable) });
  });
  // v1.3 (§15.1): simulação de preço, sem alterar estado.
  api.post<IdParams>("/receivables/:id/quote", async (req) => quoteOffer(store, pricing, req.params.id, req.body));
  api.get("/pricing/reference", async () => pricing.reference());
  api.get("/distributors", async () => ({ items: listDistributors(assignmentGateway?.parties.distributorWallets ?? null) }));
  api.get("/funders", async () => ({ items: listFunders(wallets) }));
  api.get<MarketQuery>("/marketplace", async (req) => marketplace(store, pricing, req.query.funderId));
  api.get<FunderParams>("/funders/:id/portfolio", async (req) => portfolio(store, req.params.id, wallets));
  api.get("/transparency", async () => transparency(store, chain, assignmentGateway));

  // v1.3 (§15.5): painel de administração (sem senha na demo).
  api.get("/admin/overview", async () => admin.overview());
  api.get("/admin/receivables", async () => admin.receivables());
  api.get("/admin/funders", async () => admin.funders());
  api.get("/admin/distributors", async () => admin.distributors());
  api.get("/admin/revenue", async () => admin.revenue());
  api.get("/admin/risk", async () => admin.risk());
  api.get("/admin/settings", async () => store.getSettings());
  api.put("/admin/settings", async (req) => {
    const next = mergeSettings(store.getSettings(), req.body);
    store.putSettings(next);
    return next;
  });

  // v1.1: confirmação do sacado (§5.10–5.13).
  api.post<IdParams>("/receivables/:id/debtor-confirmation", async (req, reply) =>
    reply.status(201).send((({ receivable, ...rest }) => ({ ...rest, receivable: out(receivable) }))(confirmations.request(req.params.id))),
  );
  api.post<IdParams>("/receivables/:id/debtor-confirmation/register", async (req, reply) => {
    const receivable = await confirmations.retryRegister(req.params.id, idempotencyKey(req));
    return reply.status(202).send({ receivable: out(receivable) });
  });
  api.get<TokenParams>("/confirmations/:token", async (req) => confirmations.getSummary(req.params.token));
  api.post<TokenParams>("/confirmations/:token/confirm", async (req, reply) =>
    reply.status(202).send(confirmations.confirm(req.params.token)),
  );
  api.post<TokenParams>("/confirmations/:token/decline", async (req) => confirmations.decline(req.params.token));

  // v1.1: cessão tokenizada (§5.14). Só existe com a função B ligada; sem isso, cai no 404 padrão.
  if (assignments) {
    api.post<IdParams>("/receivables/:id/assignment", async (req, reply) => {
      const receivable = await assignments.request(req.params.id, idempotencyKey(req));
      return reply.status(202).send({ receivable: out(receivable) });
    });
    api.post<IdParams>("/receivables/:id/maturity-payment", async (req, reply) => {
      const receivable = await assignments.requestMaturityPayment(req.params.id);
      return reply.status(202).send({ receivable: out(receivable) });
    });
    api.post<IdParams>("/receivables/:id/assignment/double-spend-test", async (req, reply) => {
      const receivable = await assignments.requestDoubleSpendProof(req.params.id);
      return reply.status(202).send({ receivable: out(receivable) });
    });
  }

  // Só existe com DEMO_RESET_ENABLED=true; sem isso, cai no 404 padrão.
  if (demoResetEnabled) {
    api.post("/demo/reset", async (_req, reply) => {
      await resetDemo(store, registrar, confirmations, listings, assignments);
      return reply.status(204).send();
    });
  }
}
