// Espelha as regras do §8 do contrato. O backend é quem decide; aqui é só retorno imediato.
import { daysBetween, todayISO } from "./format";
import { UFS } from "./labels";
import type { CreateReceivableInput } from "./types";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_MIME = ["application/pdf", "image/png", "image/jpeg"] as const;

export type FieldErrors = Partial<Record<string, string>>;

export function validateReceivable(input: Partial<CreateReceivableInput>): FieldErrors {
  const e: FieldErrors = {};
  const alias = input.debtor?.alias?.trim() ?? "";
  if (alias.length < 2 || alias.length > 60 || /\d{11,}/.test(alias.replace(/[.\-/\s]/g, ""))) {
    e["debtor.alias"] = "Use um pseudônimo, sem CPF ou CNPJ.";
  }
  if (!input.debtor?.state || !(UFS as readonly string[]).includes(input.debtor.state)) {
    e["debtor.state"] = "Selecione uma UF válida.";
  }
  if (!input.product?.category) e["product.category"] = "Selecione a categoria do insumo.";
  const desc = input.product?.description?.trim() ?? "";
  if (desc.length < 3 || desc.length > 120) {
    e["product.description"] = "Descreva o insumo (3 a 120 caracteres).";
  }
  const season = input.cropSeason ?? "";
  const sm = /^(\d{4})\/(\d{2})$/.exec(season);
  if (!sm || (Number(sm[1]) + 1) % 100 !== Number(sm[2])) {
    e.cropSeason = "Use o formato 2026/27.";
  }
  const amount = input.amountCents;
  if (amount == null || !Number.isInteger(amount) || amount < 100_000 || amount > 1_000_000_000) {
    e.amountCents = "Informe um valor entre R$ 1.000 e R$ 10.000.000.";
  }
  if (!input.issueDate) {
    e.issueDate = "Informe a data de emissão.";
  } else if (input.issueDate > todayISO()) {
    e.issueDate = "A emissão não pode ser futura.";
  }
  if (!input.dueDate) {
    e.dueDate = "Informe a data de vencimento.";
  } else if (input.issueDate) {
    const d = daysBetween(input.issueDate, input.dueDate);
    if (d < 15 || d > 720) e.dueDate = "O vencimento deve ficar entre 15 e 720 dias após a emissão.";
  }
  if (!input.documentKind) e.documentKind = "Selecione o tipo de documento.";
  return e;
}

export function validateFile(file: File | null): string | null {
  if (!file) return "Envie um PDF, PNG ou JPEG de até 5 MB.";
  if (!(ACCEPTED_MIME as readonly string[]).includes(file.type) || file.size > MAX_FILE_BYTES) {
    return "Envie um PDF, PNG ou JPEG de até 5 MB.";
  }
  return null;
}
