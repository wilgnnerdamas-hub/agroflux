import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ChainGateway } from "./chain/solana.js";
import { ApiError } from "./errors.js";
import type { Registrar } from "./registration.js";
import { createReceivable, getReceivable, listReceivables, type UploadedDocument } from "./receivables.js";
import type { Store } from "./store.js";
import type { Health } from "./types.js";
import { detectMime, validateReceivableInput } from "./validation.js";

export const API_VERSION = "1.0.0";
const FILE_MESSAGE = "Envie um PDF, PNG ou JPEG de até 5 MB.";

export interface RouteDeps {
  store: Store;
  chain: ChainGateway;
  registrar: Registrar;
}

type IdParams = { Params: { id: string } };

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

export async function routes(api: FastifyInstance, { store, chain, registrar }: RouteDeps) {
  api.get("/health", async (): Promise<Health> => {
    const solana = await chain.health();
    return { status: "ok", version: API_VERSION, cluster: "devnet", solana };
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
}
