import type { ApiErrorBody, ApiErrorCode } from "../types";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ApiErrorCode,
    message: string,
    status = 0,
    fieldErrors?: Record<string, string>,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.details = details;
  }

  static fromBody(status: number, body: unknown): ApiError {
    const err = (body as ApiErrorBody | undefined)?.error;
    if (err?.code && err?.message) {
      return new ApiError(err.code, err.message, status, err.fieldErrors, err.details);
    }
    return new ApiError(
      status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST",
      "O servidor respondeu de forma inesperada. Tente novamente.",
      status,
    );
  }
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  return new ApiError(
    "NETWORK_ERROR",
    "Não foi possível falar com o servidor. Verifique a conexão e tente novamente.",
  );
}
