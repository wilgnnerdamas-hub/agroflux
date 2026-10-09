// MODO MOCK — somente desenvolvimento (§12 do contrato).
// Regras: mesmos tipos e estados do contrato; NUNCA gera assinatura, slot ou link do Explorer.
// O registro fica em "pendente" (aguardando backend) ou falha, se o cenário de falha estiver ligado.
import type { AgroFluxApi } from "./client";
import { ApiError } from "./errors";
import { sha256File } from "../hash";
import { daysBetween } from "../format";
import { validateReceivable, validateFile } from "../validation";
import type {
  ChainRecord,
  CreateReceivableInput,
  EventType,
  Receivable,
  ReceivableEvent,
  ReceivableSummary,
} from "../types";

const STORAGE_KEY = "agroflux.mock.v1";
const FAIL_REGISTRATION = process.env.NEXT_PUBLIC_MOCK_SCENARIO === "register_fail";

let store: Receivable[] | null = null;
let seq = 0;

const delay = (min = 350, max = 900) =>
  new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

const id = (prefix: string) =>
  `${prefix}_mock${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function emptyChain(): ChainRecord {
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

function event(type: EventType, description: string, data: Record<string, unknown> = {}, actor: ReceivableEvent["actor"] = "demo_user"): ReceivableEvent {
  return { id: id("evt"), type, occurredAt: new Date().toISOString(), actor, description, onChain: false, chain: null, data };
}

function seed(): Receivable[] {
  const now = new Date().toISOString();
  const mk = (n: number, alias: string, state: string, category: Receivable["product"]["category"], description: string, amountCents: number, issue: string, due: string): Receivable => {
    const reference = `AGF-${String(n).padStart(4, "0")}`;
    const docHash = `mock${"0".repeat(56)}${String(n).padStart(4, "0")}`;
    return {
      id: `rcv_mockseed${n}`,
      reference,
      status: "created",
      isDemo: true,
      distributor: { name: "Distribuidora Demo" },
      debtor: { alias, state },
      product: { category, description },
      cropSeason: "2026/27",
      amountCents,
      currency: "BRL",
      issueDate: issue,
      dueDate: due,
      termDays: daysBetween(issue, due),
      documents: [
        { id: `doc_mockseed${n}`, kind: "test_invoice", filename: `nf-teste-00${n}.pdf`, mimeType: "application/pdf", sizeBytes: 48_213, sha256: docHash, uploadedAt: now },
      ],
      chain: emptyChain(),
      events: [
        { ...event("receivable_created", `Recebível ${reference} cadastrado`, { reference }), occurredAt: now },
        { ...event("document_attached", "Documento de teste anexado", { sha256: docHash }), occurredAt: now },
      ],
      selectedOfferId: null,
      createdAt: now,
      updatedAt: now,
    };
  };
  return [
    mk(2, "Produtor Demo 02", "GO", "crop_protection", "Herbicida pós-emergente", 4_250_000, "2026-09-20", "2027-01-20"),
    mk(1, "Produtor Demo 01", "MT", "fertilizer", "Fertilizante NPK 20-05-20", 15_000_000, "2026-09-15", "2027-03-15"),
  ];
}

function load(): Receivable[] {
  if (store) return store;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    store = raw ? (JSON.parse(raw) as Receivable[]) : seed();
  } catch {
    store = seed();
  }
  return store;
}

function save() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* armazenamento indisponível: segue só em memória */
  }
}

function find(rid: string): Receivable {
  const r = load().find((x) => x.id === rid);
  if (!r) throw new ApiError("NOT_FOUND", "Recebível não encontrado.", 404);
  return r;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function summary(r: Receivable): ReceivableSummary {
  return {
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
    createdAt: r.createdAt,
  };
}

export function resetMockStore() {
  store = seed();
  save();
}

export function createMockApi(): AgroFluxApi {
  return {
    mode: "mock",
    async health() {
      await delay(150, 300);
      return { status: "ok", version: "mock", cluster: "devnet", solana: { reachable: false, feePayerBalanceLamports: null } };
    },
    async listReceivables() {
      await delay();
      const items = [...load()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(summary);
      return clone({
        items,
        totals: {
          count: items.length,
          amountCents: items.reduce((s, i) => s + i.amountCents, 0),
          registeredCount: items.filter((i) => i.status === "registered" || i.status === "offer_selected").length,
          pendingCount: items.filter((i) => i.status === "registration_pending").length,
          offerSelectedCount: items.filter((i) => i.status === "offer_selected").length,
        },
      });
    },
    async getReceivable(rid) {
      await delay(200, 500);
      return clone(find(rid));
    },
    async createReceivable(input: CreateReceivableInput, file: File, clientSha256?: string) {
      await delay(600, 1200);
      const fieldErrors = validateReceivable(input) as Record<string, string>;
      const fileError = validateFile(file);
      if (fileError) fieldErrors.document = fileError;
      if (Object.keys(fieldErrors).length) {
        throw new ApiError("VALIDATION_ERROR", "Alguns campos precisam de ajuste.", 422, fieldErrors);
      }
      const sha = await sha256File(file);
      if (clientSha256 && clientSha256 !== sha) {
        throw new ApiError("HASH_MISMATCH", "O hash do documento não confere. Selecione o arquivo novamente.", 422);
      }
      const all = load();
      const n = all.length + 1;
      const reference = `AGF-${String(n).padStart(4, "0")}`;
      const now = new Date().toISOString();
      const doc = { id: id("doc"), kind: input.documentKind, filename: file.name, mimeType: file.type, sizeBytes: file.size, sha256: sha, uploadedAt: now };
      const r: Receivable = {
        id: id("rcv"),
        reference,
        status: "created",
        isDemo: true,
        distributor: { name: "Distribuidora Demo" },
        debtor: { alias: input.debtor.alias.trim(), state: input.debtor.state },
        product: { category: input.product.category, description: input.product.description.trim() },
        cropSeason: input.cropSeason,
        amountCents: input.amountCents,
        currency: "BRL",
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        termDays: daysBetween(input.issueDate, input.dueDate),
        documents: [doc],
        chain: emptyChain(),
        events: [
          event("receivable_created", `Recebível ${reference} cadastrado`, { reference }),
          event("document_attached", "Documento de teste anexado", { documentId: doc.id, sha256: sha, filename: file.name }),
        ],
        selectedOfferId: null,
        createdAt: now,
        updatedAt: now,
      };
      all.push(r);
      save();
      return clone(r);
    },
    async registerReceivable(rid) {
      await delay(400, 800);
      const r = find(rid);
      if (r.status !== "created" && r.status !== "registration_failed") {
        throw new ApiError("INVALID_STATE", "Este recebível já foi enviado para registro.", 409);
      }
      const now = new Date().toISOString();
      r.status = "registration_pending";
      r.chain = { ...emptyChain(), status: "pending", submittedAt: now };
      r.events.push(event("chain_registration_requested", "Registro na Solana Devnet solicitado", {}));
      r.updatedAt = now;
      save();
      if (FAIL_REGISTRATION) {
        setTimeout(() => {
          const x = find(rid);
          if (x.status !== "registration_pending") return;
          const message = "A rede Solana Devnet não respondeu. Tente novamente.";
          x.status = "registration_failed";
          x.chain = { ...x.chain, status: "failed", error: { code: "RPC_UNAVAILABLE", message } };
          x.events.push(event("chain_registration_failed", "Falha no registro na Solana Devnet", { code: "RPC_UNAVAILABLE", message }, "system"));
          x.updatedAt = new Date().toISOString();
          save();
        }, 4000);
      }
      // Sem cenário de falha, permanece pendente: no mock não existe transação real para confirmar.
      return clone(r);
    },
    async getVerification(rid) {
      await delay();
      find(rid);
      throw new ApiError("INVALID_STATE", "Ainda não há transação confirmada para verificar.", 409);
    },
    async listOffers(rid) {
      await delay();
      const r = find(rid);
      if (r.status !== "registered" && r.status !== "offer_selected") {
        throw new ApiError("INVALID_STATE", "As ofertas simuladas ficam disponíveis após a confirmação na Devnet.", 409);
      }
      return { isSimulated: true, disclaimer: "", items: [] };
    },
    async selectOffer(rid) {
      await delay();
      find(rid);
      throw new ApiError("INVALID_STATE", "As ofertas simuladas ficam disponíveis após a confirmação na Devnet.", 409);
    },
  };
}

