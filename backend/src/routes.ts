import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ChainGateway } from "./chain/solana.js";
import { ApiError } from "./errors.js";
import { listOffers, selectOffer } from "./offers.js";
import type { AssignmentService } from "./assignment.js";
import type { ConfirmationService } from "./confirmation.js";
import type { Registrar } from "./registration.js";
import { resetDemo } from "./seed.js";
import { createReceivable, getReceivable, listReceivables, type UploadedDocument } from "./receivables.js";
import type { Store } from "./store.js";
import type { Health } from "./types.js";
import { detectMime, validateReceivableInput } from "./validation.js";
import { verifyReceivable } from "./verification.js";

export const API_VERSION = "1.1.0";
const FILE_MESSAGE = "Envie um PDF, PNG ou JPEG de até 5 MB.";

export interface RouteDeps {
  store: Store;
  chain: ChainGateway;
  registrar: Registrar;
  confirmations: ConfirmationService;
  assignments: AssignmentService | null;
  demoResetEnabled: boolean;
}

type IdParams = { Params: { id: string } };
type OfferParams = { Params: { id: string; offerId: string } };
type TokenParams = { Params: { token: string } };

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

export async function routes(api: FastifyInstance, { store, chain, registrar, confirmations, assignments, demoResetEnabled }: RouteDeps) {
  api.get("/health", async (): Promise<Health> => {
    const solana = await chain.health();
    return { status: "ok", version: API_VERSION, cluster: "devnet", solana, features: { debtorConfirmation: true, assignment: assignments !== null } };
  });

  api.get("/receivables", async () => listReceivables(store));

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
    return reply.status(201).send(receivable);
  });

  api.get<IdParams>("/receivables/:id", async (req) => getReceivable(store, req.params.id));

  api.post<IdParams>("/receivables/:id/register", async (req, reply) => {
    const header = req.headers["idempotency-key"];
    const key = (Array.isArray(header) ? header[0] : header)?.trim() || undefined;
    const receivable = await registrar.register(req.params.id, key);
    return reply.status(202).send({ receivable });
  });

  api.get<IdParams>("/receivables/:id/verification", async (req) => verifyReceivable(store, chain, req.params.id));

  api.get<IdParams>("/receivables/:id/offers", async (req) => listOffers(store, req.params.id));

  api.post<OfferParams>("/receivables/:id/offers/:offerId/select", async (req) =>
    selectOffer(store, req.params.id, req.params.offerId),
  );

  // v1.1: confirmação do sacado (§5.10–5.13).
  api.post<IdParams>("/receivables/:id/debtor-confirmation", async (req, reply) =>
    reply.status(201).send(confirmations.request(req.params.id)),
  );
  api.post<IdParams>("/receivables/:id/debtor-confirmation/register", async (req, reply) => {
    const receivable = await confirmations.retryRegister(req.params.id, idempotencyKey(req));
    return reply.status(202).send({ receivable });
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
      return reply.status(202).send({ receivable });
    });
  }

  // Só existe com DEMO_RESET_ENABLED=true; sem isso, cai no 404 padrão.
  if (demoResetEnabled) {
    api.post("/demo/reset", async (_req, reply) => {
      await resetDemo(store, registrar);
      return reply.status(204).send();
    });
  }
}
