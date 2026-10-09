import type { AgroFluxApi } from "./client";
import { createHttpApi } from "./http";
import { createMockApi } from "./mock";

export { ApiError, toApiError } from "./errors";
export type { AgroFluxApi } from "./client";

export const API_MODE: "http" | "mock" =
  process.env.NEXT_PUBLIC_API_MODE === "mock" ? "mock" : "http";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export const api: AgroFluxApi = API_MODE === "mock" ? createMockApi() : createHttpApi(API_URL);
