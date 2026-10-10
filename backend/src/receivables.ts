// Regras de negócio dos recebíveis: criação, histórico de eventos e resumos.
// Só este módulo muda o estado de um recebível.
import { createHash, randomBytes } from "node:crypto";
import { ApiError, notFound } from "./errors.js";
import type { Store } from "./store.js";
import type {
  Assignment,
  ChainRecord,
  DebtorConfirmation,
  CreateReceivableInput,
  EventType,
  Receivable,
  ReceivableEvent,
  ReceivableList,
  ReceivableSummary,
} from "./types.js";
import { daysBetween } from "./validation.js";

export const newId = (prefix: string) => `${prefix}_${randomBytes(8).toString("hex")}`;
export const sha256Hex = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const now = () => new Date().toISOString();

export const EXT: Record<string, string> = { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg" };

export function emptyChain(): ChainRecord {
  return {
    status: "none",
    cluster: "devnet",
    signature: null,
    slot: null,
    blockTime: null,
    explorerUrl: null,
    programId: null,
    memo: null,
    payloadHash: null,
    submittedAt: null,
    confirmedAt: null,
    error: null,
  };
}

// v1.1: blocos iniciais da confirmação do sacado e da cessão.
export function emptyDebtorConfirmation(): DebtorConfirmation {
  return { status: "none", isSimulated: true, requestedAt: null, expiresAt: null, respondedAt: null, chain: null };
}

export function emptyAssignment(): Assignment {
  return {
    status: "none",
    isSimulated: true,
    cluster: "devnet",
    offerId: null,
    tokenMint: null,
    settlementMint: null,
    settlementAsset: "tBRL-DEMO",
    settlementAmount: null,
    distributorWallet: null,
    funderWallet: null,
    escrowProgramId: null,
    mintSignature: null,
    settlementSignature: null,
    explorerUrls: { tokenMint: null, mint: null, settlement: null },
    submittedAt: null,
    settledAt: null,
    error: null,
  };
}

export function makeEvent(
  type: EventType,
  description: string,
  data: Record<string, unknown> = {},
  extra: Partial<Pick<ReceivableEvent, "actor" | "onChain" | "chain" | "occurredAt">> = {},
): ReceivableEvent {
  return { id: newId("evt"), type, occurredAt: now(), actor: "demo_user", description, onChain: false, chain: null, data, ...extra };
}

export interface UploadedDocument {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

export function createReceivable(
  store: Store,
  input: CreateReceivableInput,
  doc: UploadedDocument,
  clientSha256?: string,
): Receivable {
  const sha256 = sha256Hex(doc.bytes);
  if (clientSha256 && clientSha256.trim().toLowerCase() !== sha256) {
    throw new ApiError(
      422,
      "HASH_MISMATCH",
      "O hash calculado no navegador não confere com o do servidor. Envie o arquivo de novo.",
      undefined,
      { serverSha256: sha256 },
    );
  }

  const id = newId("rcv");
  const reference = store.nextReference();
  const documentId = newId("doc");
  const createdAt = now();
  store.saveUpload(documentId, EXT[doc.mimeType] ?? "", doc.bytes);

  const receivable: Receivable = {
    id,
    reference,
    status: "created",
    isDemo: true,
    distributor: { name: "Distribuidora Demo" },
    debtor: input.debtor,
    product: input.product,
    cropSeason: input.cropSeason,
    amountCents: input.amountCents,
    currency: "BRL",
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    termDays: daysBetween(input.issueDate, input.dueDate),
    documents: [
      {
        id: documentId,
        kind: input.documentKind,
        filename: doc.filename,
        mimeType: doc.mimeType,
        sizeBytes: doc.bytes.length,
        sha256,
        uploadedAt: createdAt,
      },
    ],
    chain: emptyChain(),
    events: [
      makeEvent("receivable_created", `Recebível ${reference} cadastrado`, { reference }, { occurredAt: createdAt }),
      makeEvent("document_attached", "Documento de teste anexado", { documentId, sha256, filename: doc.filename }),
    ],
    selectedOfferId: null,
    debtorConfirmation: emptyDebtorConfirmation(),
    assignment: emptyAssignment(),
    createdAt,
    updatedAt: createdAt,
  };
  store.put(receivable);
  return receivable;
}

export function getReceivable(store: Store, id: string): Receivable {
  const r = store.get(id);
  if (!r) throw notFound();
  return r;
}

const toSummary = (r: Receivable): ReceivableSummary => ({
  id: r.id,
  reference: r.reference,
  status: r.status,
  debtor: r.debtor,
  product: r.product,
  amountCents: r.amountCents,
  currency: r.currency,
  dueDate: r.dueDate,
  chain: { status: r.chain.status },
  selectedOfferId: r.selectedOfferId,
  debtorConfirmation: { status: r.debtorConfirmation.status },
  assignment: { status: r.assignment.status },
  createdAt: r.createdAt,
});

const REGISTERED: Receivable["status"][] = ["registered", "offer_selected", "assignment_pending", "assigned", "assignment_failed"];

export function listReceivables(store: Store): ReceivableList {
  const all = store.all().sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return {
    items: all.slice(0, 100).map(toSummary),
    totals: {
      count: all.length,
      amountCents: all.reduce((s, r) => s + r.amountCents, 0),
      registeredCount: all.filter((r) => REGISTERED.includes(r.status)).length,
      pendingCount: all.filter((r) => r.status === "registration_pending").length,
      offerSelectedCount: all.filter((r) => r.status === "offer_selected").length,
      debtorConfirmedCount: all.filter((r) => r.debtorConfirmation.status === "confirmed").length,
      assignedCount: all.filter((r) => r.status === "assigned").length,
    },
  };
}
