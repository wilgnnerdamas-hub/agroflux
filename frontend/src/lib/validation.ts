// Espelha as regras do §8 do contrato. O backend é quem decide; aqui é só retorno imediato.
import { daysBetween, todayISO } from "./format";
import { pt, type Dict } from "./i18n/pt";
import { UFS } from "./labels";
import type { CreateReceivableInput } from "./types";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_MIME = ["application/pdf", "image/png", "image/jpeg"] as const;

export type FieldErrors = Partial<Record<string, string>>;
type Messages = Dict["form"]["v"];

export function validateReceivable(input: Partial<CreateReceivableInput>, v: Messages = pt.form.v): FieldErrors {
  const e: FieldErrors = {};
  const alias = input.debtor?.alias?.trim() ?? "";
  if (alias.length < 2 || alias.length > 60 || /\d{11,}/.test(alias.replace(/[.\-/\s]/g, ""))) e["debtor.alias"] = v.alias;
  if (!input.debtor?.state || !(UFS as readonly string[]).includes(input.debtor.state)) e["debtor.state"] = v.state;
  if (!input.product?.category) e["product.category"] = v.category;
  const desc = input.product?.description?.trim() ?? "";
  if (desc.length < 3 || desc.length > 120) e["product.description"] = v.description;
  const sm = /^(\d{4})\/(\d{2})$/.exec(input.cropSeason ?? "");
  if (!sm || (Number(sm[1]) + 1) % 100 !== Number(sm[2])) e.cropSeason = v.season;
  const amount = input.amountCents;
  if (amount == null || !Number.isInteger(amount) || amount < 100_000 || amount > 1_000_000_000) e.amountCents = v.amount;
  if (!input.issueDate) e.issueDate = v.issueMissing;
  else if (input.issueDate > todayISO()) e.issueDate = v.issueFuture;
  if (!input.dueDate) e.dueDate = v.dueMissing;
  else if (input.issueDate) {
    const d = daysBetween(input.issueDate, input.dueDate);
    if (d < 15 || d > 720) e.dueDate = v.dueRange;
  }
  if (!input.documentKind) e.documentKind = v.kind;
  return e;
}

export function validateFile(file: File | null, v: Messages = pt.form.v): string | null {
  if (!file) return v.file;
  if (!(ACCEPTED_MIME as readonly string[]).includes(file.type) || file.size > MAX_FILE_BYTES) return v.file;
  return null;
}
