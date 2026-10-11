import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import type { Config } from "./config.js";
import type { ChainGateway } from "./chain/solana.js";
import { errorHandler } from "./errors.js";
import { AssignmentService } from "./assignment.js";
import { createAssignmentGateway, type AssignmentGateway } from "./chain/assignment.js";
import { ConfirmationService } from "./confirmation.js";
import { ListingService } from "./listing.js";
import { AdminService } from "./admin.js";
import { createCdiProvider, type CdiProvider } from "./pricing/cdi.js";
import { PricingService } from "./pricing/service.js";
import { Registrar } from "./registration.js";
import { routes } from "./routes.js";
import { Store } from "./store.js";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface AppDeps {
  config: Config;
  chain: ChainGateway;
  store?: Store;
  confirmTimeoutMs?: number;
  // Dublê da cessão nos testes. Em produção é criado a partir do config.
  assignmentGateway?: AssignmentGateway;
  // v1.3: CDI e data de cálculo injetáveis nos testes.
  cdiProvider?: CdiProvider;
  today?: () => string;
}

export async function buildApp({ config, chain, store = new Store(config.dataDir), confirmTimeoutMs, assignmentGateway, cdiProvider, today }: AppDeps) {
  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? false : { level: "info" },
  });

  await app.register(cors, {
    origin: config.frontendOrigins,
    methods: ["GET", "POST", "PUT", "OPTIONS"],
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
  const confirmations = new ConfirmationService(store, chain, confirmTimeoutMs, (msg, err) => app.log.error({ err }, msg));
  confirmations.resumePending();
  const bcb = cdiProvider ?? createCdiProvider();
  const cdi: CdiProvider = config.cdiFromBcb || cdiProvider ? bcb : (opts) => bcb({ ...opts, source: "manual" });
  const pricing = new PricingService(store, cdi, today);
  const listings = new ListingService(store, chain, pricing, confirmTimeoutMs, (msg, err) => app.log.error({ err }, msg));
  listings.resumePending();

  // Função B só liga com ASSIGNMENT_ENABLED=true e a configuração completa (§5.14).
  let assignments: AssignmentService | null = null;
  let activeGateway: AssignmentGateway | null = null;
  if (config.assignmentEnabled) {
    const gateway =
      assignmentGateway ??
      (config.assignment && config.feePayerSecret
        ? createAssignmentGateway({ rpcUrl: config.solanaRpcUrl, feePayerSecret: config.feePayerSecret, ...config.assignment })
        : null);
    if (gateway) {
      activeGateway = gateway;
      assignments = new AssignmentService(store, gateway, confirmTimeoutMs, (msg, err) => app.log.error({ err }, msg));
      assignments.resumePending();
    } else {
      app.log.warn(
        "ASSIGNMENT_ENABLED=true, mas faltam carteiras (DEMO_DISTRIBUTOR_SECRET, _B_, _C_, DEMO_FUNDER_SECRET, _B_, _C_), TBRL_MINT ou ESCROW_PROGRAM_ID. Cessão desligada.",
      );
    }
  }

  await app.register(routes, {
    prefix: "/api/v1",
    store,
    chain,
    registrar,
    confirmations,
    listings,
    assignments,
    assignmentGateway: activeGateway,
    pricing,
    admin: new AdminService(store, pricing, activeGateway),
    demoResetEnabled: config.demoResetEnabled,
  });
  return { app, registrar, confirmations, listings, assignments, store, pricing };
}
