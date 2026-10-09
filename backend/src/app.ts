import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import type { Config } from "./config.js";
import type { ChainGateway } from "./chain/solana.js";
import { errorHandler } from "./errors.js";
import { Registrar } from "./registration.js";
import { routes } from "./routes.js";
import { Store } from "./store.js";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface AppDeps {
  config: Config;
  chain: ChainGateway;
  store?: Store;
  confirmTimeoutMs?: number;
}

export async function buildApp({ config, chain, store = new Store(config.dataDir), confirmTimeoutMs }: AppDeps) {
  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? false : { level: "info" },
  });

  await app.register(cors, {
    origin: config.frontendOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "Idempotency-Key", "X-Client-Sha256"],
  });
  await app.register(multipart, {
    limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 5 },
    throwFileSizeLimit: true,
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: { code: "NOT_FOUND", message: "Rota não encontrada.", details: {} } });
  });

  const registrar = new Registrar(store, chain, confirmTimeoutMs, (msg, err) => app.log.error({ err }, msg));
  registrar.resumePending();

  await app.register(routes, { prefix: "/api/v1", store, chain, registrar });
  return { app, registrar, store };
}
