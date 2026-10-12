// MODO MOCK — somente desenvolvimento (§12 do contrato).
// Regras: mesmos tipos e estados do contrato; NUNCA gera assinatura, slot, mint, liquidação ou link do Explorer.
// O registro fica em "pendente" (aguardando backend) ou falha, se o cenário de falha estiver ligado.
import type { AgroFluxApi } from "./client";
import { ApiError } from "./errors";
import { sha256File } from "../hash";
import { daysBetween } from "../format";
import { validateReceivable, validateFile } from "../validation";
import type {
  Assignment,
  ChainRecord,
  Listing,
  Registry,
  ConfirmationSummary,
  DebtorConfirmation,
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

function emptyDebtorConfirmation(): DebtorConfirmation {
  return { status: "none", isSimulated: true, requestedAt: null, expiresAt: null, respondedAt: null, chain: null };
}

function emptyAssignment(): Assignment {
  return {
    status: "none", isSimulated: true, cluster: "devnet", offerId: null, tokenMint: null, settlementMint: null,
    settlementAsset: "tBRL-DEMO", settlementAmount: null, distributorWallet: null, funderWallet: null, escrowProgramId: null,
    mintSignature: null, settlementSignature: null, explorerUrls: { tokenMint: null, mint: null, settlement: null, documentLock: null },
    submittedAt: null, settledAt: null, error: null, funderId: null, funderName: null, documentLock: null, doubleSpendProof: null,
    platformFeeAmount: null, treasuryWallet: null,
  };
}

// v1.2: a registradora simulada do mock só numera; nada vai para a rede.
function registry(n: number, sha256: string, at: string): Registry {
  return {
    status: "registered",
    isSimulated: true,
    registrarName: "Registradora Demo (simulada)",
    registryId: `REG-MOCK-${String(n).padStart(6, "0")}`,
    registeredAt: at,
    documentSha256: sha256,
    creditor: { kind: "distributor", name: "Distribuidora Demo", wallet: null },
    paymentDomicile: null,
  };
}

const emptyListing = (): Listing => ({ status: "none", publishedAt: null, terms: null, chain: null });

// Links de confirmação do mock: token → id do recebível (só em memória).
const mockTokens = new Map<string, { receivableId: string; expiresAt: string; used: boolean }>();

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
      distributor: { id: "dst_a", name: "Distribuidora Demo" },
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
      debtorConfirmation: emptyDebtorConfirmation(),
      assignment: emptyAssignment(),
      registry: registry(n, docHash, now),
      listing: emptyListing(),
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
    // Dados salvos antes da v1.1 não têm os blocos novos.
    for (const r of store) {
      r.debtorConfirmation ??= emptyDebtorConfirmation();
      r.assignment = { ...emptyAssignment(), ...r.assignment };
      r.registry ??= registry(0, r.documents[0]?.sha256 ?? "", r.createdAt);
      r.listing ??= emptyListing();
    }
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
    debtorConfirmation: { status: r.debtorConfirmation.status },
    assignment: { status: r.assignment.status },
    registry: { registryId: r.registry.registryId },
    listing: { status: r.listing.status },
    offerCount: 0,
    distributor: r.distributor,
    risk: null,
    createdAt: r.createdAt,
  };
}

function confirmationSummary(r: Receivable, expiresAt: string): ConfirmationSummary {
  return {
    isSimulated: true,
    disclaimer: "Simulação — sem verificação de identidade do sacado.",
    reference: r.reference,
    distributor: r.distributor,
    product: r.product,
    amountCents: r.amountCents,
    currency: r.currency,
    dueDate: r.dueDate,
    status: r.debtorConfirmation.status,
    expiresAt,
    registryId: r.registry.registryId,
    paymentDomicile: r.registry.paymentDomicile,
  };
}

function findToken(token: string, forAnswer: boolean) {
  const t = mockTokens.get(token);
  if (!t) throw new ApiError("NOT_FOUND", "Link de confirmação não encontrado.", 404);
  if (Date.parse(t.expiresAt) < Date.now()) throw new ApiError("CONFIRMATION_LINK_EXPIRED", "Este link de confirmação venceu.", 410);
  if (forAnswer && t.used) throw new ApiError("CONFIRMATION_ALREADY_ANSWERED", "Este link de confirmação já foi usado.", 409);
  return { t, r: find(t.receivableId) };
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
      return {
        status: "ok",
        version: "mock",
        cluster: "devnet",
        solana: { reachable: false, feePayerBalanceLamports: null },
        features: { debtorConfirmation: true, assignment: false, marketplace: true, doubleSpendProof: false },
      };
    },
    async listReceivables(distributorId) {
      await delay();
      const items = [...load()].filter((r) => !distributorId || r.distributor.id === distributorId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(summary);
      return clone({
        items,
        totals: {
          count: items.length,
          amountCents: items.reduce((s, i) => s + i.amountCents, 0),
          registeredCount: items.filter((i) => i.chain.status === "confirmed").length,
          pendingCount: items.filter((i) => i.status === "registration_pending").length,
          offerSelectedCount: items.filter((i) => i.status === "offer_selected").length,
          debtorConfirmedCount: items.filter((i) => i.debtorConfirmation.status === "confirmed").length,
          assignedCount: items.filter((i) => i.status === "assigned").length,
          publishedCount: items.filter((i) => i.status === "published").length,
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
      const dup = all.find((x) => x.documents.some((d) => d.sha256 === sha));
      if (dup) {
        throw new ApiError("DUPLICATE_DOCUMENT", `Este documento já está registrado na registradora (simulada) como ${dup.reference}.`, 409, undefined, {
          reference: dup.reference,
          registryId: dup.registry.registryId,
        });
      }
      const n = all.length + 1;
      const reference = `AGF-${String(n).padStart(4, "0")}`;
      const now = new Date().toISOString();
      const doc = { id: id("doc"), kind: input.documentKind, filename: file.name, mimeType: file.type, sizeBytes: file.size, sha256: sha, uploadedAt: now };
      const r: Receivable = {
        id: id("rcv"),
        reference,
        status: "created",
        isDemo: true,
        distributor: { id: "dst_a", name: "Distribuidora Demo" },
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
        debtorConfirmation: emptyDebtorConfirmation(),
        assignment: emptyAssignment(),
        registry: registry(n, sha, now),
        listing: emptyListing(),
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
      if (r.chain.status !== "confirmed") {
        throw new ApiError("INVALID_STATE", "As propostas ficam disponíveis depois do registro na Devnet e da publicação.", 409);
      }
      return { isSimulated: true, disclaimer: "", items: [] };
    },
    async selectOffer(rid) {
      await delay();
      find(rid);
      throw new ApiError("INVALID_STATE", "As ofertas simuladas ficam disponíveis após a confirmação na Devnet.", 409);
    },
    // v1.1. No mock o recebível nunca chega a `registered`, então o pedido de link responde INVALID_STATE,
    // como o backend responderia. As respostas do sacado nunca geram assinatura.
    async requestDebtorConfirmation(rid) {
      await delay();
      const r = find(rid);
      if (r.status !== "registered" || r.debtorConfirmation.status === "confirmed") {
        throw new ApiError("INVALID_STATE", "A confirmação do sacado fica disponível depois do registro na Devnet.", 409);
      }
      const token = id("tok");
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
      for (const t of mockTokens.values()) if (t.receivableId === rid) t.expiresAt = now;
      mockTokens.set(token, { receivableId: rid, expiresAt, used: false });
      r.debtorConfirmation = { ...emptyDebtorConfirmation(), status: "requested", requestedAt: now, expiresAt };
      r.events.push(event("debtor_confirmation_requested", "Confirmação solicitada ao sacado (simulação)", { expiresAt }));
      r.updatedAt = now;
      save();
      return clone({ token, confirmationPath: `/confirmar/${token}`, expiresAt, receivable: r });
    },
    // O mock nunca cria token nem liquida (rota inexistente sem o backend real).
    async requestAssignment() {
      await delay();
      throw new ApiError("NOT_FOUND", "A cessão tokenizada só existe com o backend real e a função ligada.", 404);
    },

    // v1.2. No mock nada chega a ser publicado (o aceite nunca é confirmado on-chain).
    async getTerms() {
      await delay(150, 300);
      const text = "TERMO DE COOBRIGAÇÃO — DEMONSTRAÇÃO (SIMULADO, SEM VALOR JURÍDICO)\nModo mock: o texto oficial vem do backend.";
      return { isSimulated: true, version: "coobrigacao-demo-v1", text, textSha256: await sha256File(new File([text], "termo.txt")) };
    },
    async publish(rid) {
      await delay();
      find(rid);
      throw new ApiError("DEBTOR_CONFIRMATION_REQUIRED", "Antes de publicar, o aceite do sacado precisa estar registrado on-chain.", 409);
    },
    async retryPublishRegister() {
      await delay();
      throw new ApiError("INVALID_STATE", "Não há registro do termo com falha para repetir.", 409);
    },
    async proposeOffer(rid) {
      await delay();
      find(rid);
      throw new ApiError("INVALID_STATE", "Este recebível não está aberto para propostas.", 409);
    },
    async listFunders() {
      await delay(150, 300);
      return {
        items: [
          { id: "fnd_a", name: "Financiador Demo A", type: "simulated_fidc", mode: "interactive", wallet: null, isSimulated: true },
          { id: "fnd_b", name: "Financiador Demo B", type: "simulated_bank", mode: "automatic", wallet: null, isSimulated: true },
          { id: "fnd_c", name: "Financiador Demo C", type: "simulated_cooperative", mode: "automatic", wallet: null, isSimulated: true },
        ],
      };
    },
    async getMarketplace() {
      await delay();
      return { isSimulated: true, disclaimer: "Recebíveis fictícios publicados para demonstração. Não é oferta de investimento.", items: [] };
    },
    async getPortfolio() {
      await delay();
      return {
        isSimulated: true,
        funder: { id: "fnd_a", name: "Financiador Demo A", type: "simulated_fidc", mode: "interactive", wallet: null, isSimulated: true },
        items: [],
        totals: { count: 0, paidAmountCents: 0, faceAmountCents: 0, projectedIncomeCents: 0 },
      };
    },
    async requestDoubleSpendProof() {
      await delay();
      throw new ApiError("NOT_FOUND", "A prova de recusa só existe com o backend real e a cessão ligada.", 404);
    },
    async getTransparency() {
      await delay();
      const all = load();
      return {
        isSimulated: true,
        cluster: "devnet",
        checkedAt: new Date().toISOString(),
        programs: [{ role: "memo", label: "SPL Memo", address: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", explorerUrl: "https://explorer.solana.com/address/MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr?cluster=devnet" }],
        settlementAsset: null,
        wallets: [],
        registry: { name: "Registradora Demo (simulada)", isSimulated: true, titles: all.length },
        stats: { receivables: all.length, registeredOnChain: 0, debtorAccepted: 0, published: 0, assigned: 0, doubleSpendRejected: 0 },
      };
    },

    // v1.3: o mock não precifica nem tem painel de administração (só o backend real calcula).
    async runDocumentCheck() {
      throw new ApiError("BACKEND_NOT_CONNECTED", "A análise por IA só existe com o backend real.", 0);
    },
    async requestRiskMemo() {
      throw new ApiError("BACKEND_NOT_CONNECTED", "A análise por IA só existe com o backend real.", 0);
    },
    async getPricingReference() {
      await delay(150, 300);
      return { cdiAnnualBps: 1490, cdiSource: "manual", cdiReferenceDate: null, platformFeeBps: 50, registryFeeCents: 2_500, pricedAt: new Date().toISOString().slice(0, 10) };
    },
    async quote() {
      await delay();
      throw new ApiError("BACKEND_NOT_CONNECTED", "A simulação de preço só existe com o backend real.", 0);
    },
    async listDistributors() {
      await delay(150, 300);
      return {
        items: [
          { id: "dst_a", name: "Distribuidora Demo", wallet: null, isSimulated: true },
          { id: "dst_b", name: "Cerrado Insumos (demo)", wallet: null, isSimulated: true },
          { id: "dst_c", name: "Sul Sementes (demo)", wallet: null, isSimulated: true },
        ],
      };
    },
    async adminOverview() {
      throw new ApiError("BACKEND_NOT_CONNECTED", "O painel de administração só existe com o backend real.", 0);
    },
    async adminReceivables() {
      throw new ApiError("BACKEND_NOT_CONNECTED", "O painel de administração só existe com o backend real.", 0);
    },
    async adminFunders() {
      throw new ApiError("BACKEND_NOT_CONNECTED", "O painel de administração só existe com o backend real.", 0);
    },
    async adminDistributors() {
      throw new ApiError("BACKEND_NOT_CONNECTED", "O painel de administração só existe com o backend real.", 0);
    },
    async adminRevenue() {
      throw new ApiError("BACKEND_NOT_CONNECTED", "O painel de administração só existe com o backend real.", 0);
    },
    async adminRisk() {
      throw new ApiError("BACKEND_NOT_CONNECTED", "O painel de administração só existe com o backend real.", 0);
    },
    async getSettings() {
      throw new ApiError("BACKEND_NOT_CONNECTED", "O painel de administração só existe com o backend real.", 0);
    },
    async updateSettings() {
      throw new ApiError("BACKEND_NOT_CONNECTED", "O painel de administração só existe com o backend real.", 0);
    },

    async retryDebtorConfirmationRegister() {
      await delay();
      throw new ApiError("INVALID_STATE", "Não há registro de confirmação com falha para repetir.", 409);
    },
    async getConfirmation(token) {
      await delay();
      const { t, r } = findToken(token, false);
      return clone(confirmationSummary(r, t.expiresAt));
    },
    async confirmDebtor(token) {
      await delay();
      const { t, r } = findToken(token, true);
      t.used = true;
      const now = new Date().toISOString();
      // Fica pendente: no mock não existe memo real para confirmar.
      r.debtorConfirmation = {
        ...r.debtorConfirmation,
        status: "confirmed",
        respondedAt: now,
        chain: { status: "pending", signature: null, explorerUrl: null, memo: null, confirmationHash: null, error: null },
      };
      r.updatedAt = now;
      save();
      return clone(confirmationSummary(r, t.expiresAt));
    },
    async declineDebtor(token) {
      await delay();
      const { t, r } = findToken(token, true);
      t.used = true;
      const now = new Date().toISOString();
      r.debtorConfirmation = { ...r.debtorConfirmation, status: "declined", respondedAt: now };
      r.events.push(event("debtor_declined", "Sacado recusou o recebível (simulação)", {}, "system"));
      r.updatedAt = now;
      save();
      return clone(confirmationSummary(r, t.expiresAt));
    },
  };
}

