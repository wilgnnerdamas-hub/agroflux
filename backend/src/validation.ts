import { isDistributorId } from "./distributors.js";
// Regras do §8 do contrato. As chaves de fieldErrors usam o caminho com ponto, como o frontend.
import type { CreateReceivableInput, DocumentKind, ProductCategory } from "./types.js";

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];
const CATEGORIES: ProductCategory[] = ["fertilizer", "crop_protection", "seed", "other"];
const DOCUMENT_KINDS: DocumentKind[] = ["test_invoice", "test_contract", "other"];

export type FieldErrors = Record<string, string>;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function parseDate(v: unknown): number | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  // Recusa datas como 2026-02-31.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return t;
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((parseDate(toISO)! - parseDate(fromISO)!) / 86_400_000);
}

// "Hoje" em UTC: fica à frente do horário de Brasília, então não recusa a data local do usuário.
export const todayUTC = () => new Date().toISOString().slice(0, 10);

export function validateReceivableInput(
  raw: unknown,
  today = todayUTC(),
): { ok: true; value: CreateReceivableInput } | { ok: false; fieldErrors: FieldErrors } {
  const e: FieldErrors = {};
  const input = isObj(raw) ? raw : {};
  const debtor = isObj(input.debtor) ? input.debtor : {};
  const product = isObj(input.product) ? input.product : {};

  const alias = str(debtor.alias);
  if (alias.length < 2 || alias.length > 60 || /\d{11,}/.test(alias.replace(/[.\-/\s]/g, ""))) {
    e["debtor.alias"] = "Use um pseudônimo, sem CPF ou CNPJ.";
  }
  const state = str(debtor.state);
  if (!UFS.includes(state)) e["debtor.state"] = "Selecione uma UF válida.";

  const category = product.category as ProductCategory;
  if (!CATEGORIES.includes(category)) e["product.category"] = "Selecione a categoria do insumo.";
  const description = str(product.description);
  if (description.length < 3 || description.length > 120) {
    e["product.description"] = "Descreva o insumo (3 a 120 caracteres).";
  }

  const cropSeason = str(input.cropSeason);
  const sm = /^(\d{4})\/(\d{2})$/.exec(cropSeason);
  if (!sm || (Number(sm[1]) + 1) % 100 !== Number(sm[2])) e.cropSeason = "Use o formato 2026/27.";

  const amountCents = input.amountCents;
  if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents < 100_000 || amountCents > 1_000_000_000) {
    e.amountCents = "Informe um valor entre R$ 1.000 e R$ 10.000.000.";
  }

  const issueDate = input.issueDate as string;
  const dueDate = input.dueDate as string;
  const issue = parseDate(issueDate);
  if (issue === null) e.issueDate = "Informe a data de emissão.";
  else if (issueDate > today) e.issueDate = "A emissão não pode ser futura.";
  const due = parseDate(dueDate);
  if (due === null) e.dueDate = "Informe a data de vencimento.";
  else if (issue !== null) {
    const d = Math.round((due - issue) / 86_400_000);
    if (d < 15 || d > 720) e.dueDate = "O vencimento deve ficar entre 15 e 720 dias após a emissão.";
  }

  const documentKind = input.documentKind as DocumentKind;
  if (!DOCUMENT_KINDS.includes(documentKind)) e.documentKind = "Selecione o tipo de documento.";
  // v1.3: distribuidora demo (opcional; padrão dst_a).
  const distributorId = input.distributorId === undefined ? "dst_a" : input.distributorId;
  if (!isDistributorId(distributorId)) e.distributorId = "Selecione uma distribuidora demo válida.";

  if (Object.keys(e).length) return { ok: false, fieldErrors: e };
  return {
    ok: true,
    value: {
      debtor: { alias, state },
      product: { category, description },
      cropSeason,
      amountCents: amountCents as number,
      issueDate,
      dueDate,
      documentKind,
      distributorId: distributorId as CreateReceivableInput["distributorId"],
    },
  };
}

// Detecta o tipo pelo conteúdo (assinatura do arquivo), não pelo que o navegador declarou.
export function detectMime(bytes: Buffer): "application/pdf" | "image/png" | "image/jpeg" | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}
