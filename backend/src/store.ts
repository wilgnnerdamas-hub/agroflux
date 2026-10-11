// Persistência simples em arquivo JSON (data/db.json) + uploads privados (data/uploads).
// Escrita atômica: grava num arquivo temporário e renomeia.
import fs from "node:fs";
import path from "node:path";
import { emptyAssignment, emptyDebtorConfirmation, emptyListing, emptyRegistry } from "./receivables.js";
import { defaultSettings } from "./pricing/settings.js";
import type { Offer, Receivable, RevenueEntry, Settings } from "./types.js";

export interface DbShape {
  seq: number;
  // v1.2: sequência dos números de registro da registradora simulada.
  registrySeq: number;
  receivables: Record<string, Receivable>;
  offers: Record<string, Offer[]>;
  // Estado interno, fora do contrato: Idempotency-Key → id do recebível, e última assinatura enviada por recebível.
  idempotency: Record<string, string>;
  submissions: Record<string, string>;
  // v1.1: hash do token de confirmação → estado do link. O token em si nunca é guardado.
  confirmationTokens: Record<string, ConfirmationToken>;
  // v1.3: configurações de operação e lançamentos de receita da AgroFlux.
  settings: Settings;
  revenue: RevenueEntry[];
}

export interface ConfirmationToken {
  receivableId: string;
  expiresAt: string;
  state: "active" | "used" | "revoked";
}

const empty = (): DbShape => ({ seq: 0, registrySeq: 0, receivables: {}, offers: {}, idempotency: {}, submissions: {}, confirmationTokens: {}, settings: defaultSettings(), revenue: [] });

// Dados gravados por versões anteriores não têm os blocos novos: completa ao carregar.
function migrate(db: DbShape): DbShape {
  db.registrySeq ??= 0;
  db.settings = { ...defaultSettings(), ...db.settings };
  db.revenue ??= [];
  for (const r of Object.values(db.receivables)) {
    r.debtorConfirmation ??= emptyDebtorConfirmation();
    const a = emptyAssignment();
    r.assignment = { ...a, ...r.assignment, explorerUrls: { ...a.explorerUrls, ...r.assignment?.explorerUrls } };
    r.registry ??= emptyRegistry();
    r.listing ??= emptyListing();
    // v1.3: dados antigos pertencem à Distribuidora Demo.
    r.distributor = { id: (r.distributor as { id?: Receivable["distributor"]["id"] }).id ?? "dst_a", name: r.distributor.name };
    delete r.risk;
  }
  for (const offers of Object.values(db.offers)) {
    for (const o of offers) {
      o.origin ??= "automatic";
      o.createdAt ??= o.expiresAt;
      o.updatedAt ??= o.createdAt;
    }
  }
  return db;
}

export class Store {
  private db: DbShape;
  private readonly file: string;
  readonly uploadsDir: string;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, "db.json");
    this.uploadsDir = path.join(dataDir, "uploads");
    fs.mkdirSync(this.uploadsDir, { recursive: true });
    this.db = fs.existsSync(this.file) ? migrate({ ...empty(), ...JSON.parse(fs.readFileSync(this.file, "utf8")) }) : empty();
  }

  nextReference(): string {
    this.db.seq += 1;
    return `AGF-${String(this.db.seq).padStart(4, "0")}`;
  }

  nextRegistryId(): string {
    this.db.registrySeq += 1;
    return `REG-DEMO-${String(this.db.registrySeq).padStart(6, "0")}`;
  }

  get(id: string): Receivable | undefined {
    return this.db.receivables[id];
  }

  all(): Receivable[] {
    return Object.values(this.db.receivables);
  }

  put(r: Receivable) {
    // O risco é calculado a cada leitura e não é persistido.
    if (r.risk) delete r.risk;
    this.db.receivables[r.id] = r;
    this.save();
  }

  getOffers(id: string): Offer[] | undefined {
    return this.db.offers[id];
  }

  putOffers(id: string, offers: Offer[]) {
    this.db.offers[id] = offers;
    this.save();
  }

  getIdempotency(key: string): string | undefined {
    return this.db.idempotency[key];
  }

  putIdempotency(key: string, receivableId: string) {
    this.db.idempotency[key] = receivableId;
    this.save();
  }

  getSubmission(receivableId: string): string | undefined {
    return this.db.submissions[receivableId];
  }

  putSubmission(receivableId: string, signature: string) {
    this.db.submissions[receivableId] = signature;
    this.save();
  }

  getConfirmationToken(hash: string): ConfirmationToken | undefined {
    return this.db.confirmationTokens[hash];
  }

  // Grava o link novo e revoga os links ativos anteriores do mesmo recebível.
  putConfirmationToken(hash: string, token: ConfirmationToken) {
    for (const t of Object.values(this.db.confirmationTokens)) {
      if (t.receivableId === token.receivableId && t.state === "active") t.state = "revoked";
    }
    this.db.confirmationTokens[hash] = token;
    this.save();
  }

  markConfirmationToken(hash: string, state: ConfirmationToken["state"]) {
    this.db.confirmationTokens[hash].state = state;
    this.save();
  }

  saveUpload(documentId: string, ext: string, bytes: Buffer) {
    fs.writeFileSync(path.join(this.uploadsDir, `${documentId}${ext}`), bytes);
  }

  readUpload(documentId: string, ext: string): Buffer | null {
    const file = path.join(this.uploadsDir, `${documentId}${ext}`);
    return fs.existsSync(file) ? fs.readFileSync(file) : null;
  }

  getSettings(): Settings {
    return this.db.settings;
  }

  putSettings(s: Settings) {
    this.db.settings = s;
    this.save();
  }

  revenue(): RevenueEntry[] {
    return this.db.revenue;
  }

  addRevenue(entry: RevenueEntry) {
    if (this.db.revenue.some((e) => e.receivableId === entry.receivableId)) return;
    this.db.revenue.push(entry);
    this.save();
  }

  reset() {
    // As configurações da operação sobrevivem ao reset da demo.
    const settings = this.db.settings;
    this.db = { ...empty(), settings };
    fs.rmSync(this.uploadsDir, { recursive: true, force: true });
    fs.mkdirSync(this.uploadsDir, { recursive: true });
    this.save();
  }

  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.db));
    fs.renameSync(tmp, this.file);
  }
}
