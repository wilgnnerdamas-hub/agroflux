import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import type { ApiErrorCode } from "./types.js";

// Erro da API no envelope do §9 do contrato.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string>,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (message = "Recebível não encontrado.") => new ApiError(404, "NOT_FOUND", message);
export const invalidState = (message = "Ação não permitida no estado atual.") =>
  new ApiError(409, "INVALID_STATE", message);
export const chainUnavailable = (message = "A rede Solana Devnet não respondeu. Tente novamente.") =>
  new ApiError(503, "CHAIN_UNAVAILABLE", message);

export function errorHandler(err: FastifyError | ApiError, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof ApiError) {
    return reply.status(err.status).send({
      error: {
        code: err.code,
        message: err.message,
        ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}),
        details: err.details ?? {},
      },
    });
  }
  // Erros do próprio Fastify e dos plugins.
  const code = (err as FastifyError).code;
  if (code === "FST_REQ_FILE_TOO_LARGE" || code === "FST_ERR_CTP_BODY_TOO_LARGE") {
    return reply.status(413).send({
      error: { code: "FILE_TOO_LARGE", message: "Envie um PDF, PNG ou JPEG de até 5 MB.", details: {} },
    });
  }
  if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") {
    return reply.status(415).send({
      error: { code: "UNSUPPORTED_FILE_TYPE", message: "Formato de requisição não suportado.", details: {} },
    });
  }
  const status = (err as FastifyError).statusCode;
  if (status && status >= 400 && status < 500) {
    return reply.status(400).send({
      error: { code: "BAD_REQUEST", message: "Requisição inválida.", details: {} },
    });
  }
  req.log.error(err);
  return reply.status(500).send({
    error: { code: "INTERNAL_ERROR", message: "Erro inesperado. Tente novamente.", details: {} },
  });
}
