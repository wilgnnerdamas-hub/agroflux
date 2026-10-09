// Persistência simples em arquivo JSON (data/db.json) + uploads privados (data/uploads).
// Escrita atômica: grava num arquivo temporário e renomeia.
import fs from "node:fs";
import path from "node:path";
import type { Offer, Receivable } from "./types.js";

export interface DbShape {
  seq: number;
  receivables: Record<string, Receivable>;
  offers: Record<string, Offer[]>;
}

const empty = (): DbShape => ({ seq: 0, receivables: {}, offers: {} });

export class Store {
  private db: DbShape;
  private readonly file: string;
  readonly uploadsDir: string;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, "db.json");
    this.uploadsDir = path.join(dataDir, "uploads");
    fs.mkdirSync(this.uploadsDir, { recursive: true });
    this.db = fs.existsSync(this.file) ? { ...empty(), ...JSON.parse(fs.readFileSync(this.file, "utf8")) } : empty();
  }

  nextReference(): string {
    this.db.seq += 1;
    return `AGF-${String(this.db.seq).padStart(4, "0")}`;
  }

  get(id: string): Receivable | undefined {
    return this.db.receivables[id];
  }

  all(): Receivable[] {
    return Object.values(this.db.receivables);
  }

  put(r: Receivable) {
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

  saveUpload(documentId: string, ext: string, bytes: Buffer) {
    fs.writeFileSync(path.join(this.uploadsDir, `${documentId}${ext}`), bytes);
  }

  reset() {
    this.db = empty();
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
