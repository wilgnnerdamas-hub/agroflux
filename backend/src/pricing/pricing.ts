// Precificação de mercado (contrato v1.3, §15.1): CDI + spread, juros compostos sobre dias úteis (base 252).
// SIMULAÇÃO: os números seguem a convenção do mercado, mas não representam uma proposta real.
import { businessDaysBetween, calendarDaysBetween } from "./calendar.js";

export interface IofRule {
  dailyRate: number; // ex.: 0.000041 (0,0041% ao dia)
  additionalRate: number; // ex.: 0.0038 (0,38%)
}

export interface PriceInput {
  faceCents: number;
  pricedAt: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  cdiAnnual: number; // ex.: 0.149
  spreadAnnual: number; // ex.: 0.035
  funderFeesCents: number;
  iof: IofRule | null;
  platformFeeBps: number; // taxa AgroFlux sobre o valor de face
  registryFeeCents: number;
}

export interface Price {
  pricedAt: string;
  businessDays: number;
  calendarDays: number;
  annualRate: number;
  monthlyEquivalent: number;
  presentValueCents: number;
  discountCents: number;
  iofCents: number;
  funderCashOutCents: number;
  platformFeeCents: number;
  registryFeeCents: number;
  distributorNetCents: number;
  cetAnnual: number;
  cetMonthly: number;
  funderYieldAnnual: number;
}

export const toBps = (rate: number) => Math.round(rate * 10_000);
export const annualToMonthly = (annual: number) => Math.pow(1 + annual, 1 / 12) - 1;

/** Taxa anual efetiva que leva `pv` a `fv` em `du` dias úteis. */
export function impliedAnnual(pv: number, fv: number, du: number): number {
  if (pv <= 0 || du <= 0) return 0;
  return Math.pow(fv / pv, 252 / du) - 1;
}

export function price(p: PriceInput): Price {
  const du = Math.max(1, businessDaysBetween(p.pricedAt, p.dueDate));
  const dc = Math.max(1, calendarDaysBetween(p.pricedAt, p.dueDate));
  const annualRate = (1 + p.cdiAnnual) * (1 + p.spreadAnnual) - 1;
  const presentValueCents = Math.round(p.faceCents / Math.pow(1 + annualRate, du / 252));
  const iofCents = p.iof ? Math.round(presentValueCents * (p.iof.dailyRate * Math.min(dc, 365) + p.iof.additionalRate)) : 0;
  const funderCashOutCents = presentValueCents - p.funderFeesCents - iofCents;
  const platformFeeCents = Math.round((p.faceCents * p.platformFeeBps) / 10_000);
  const distributorNetCents = funderCashOutCents - platformFeeCents - p.registryFeeCents;
  const cetAnnual = impliedAnnual(distributorNetCents, p.faceCents, du);
  return {
    pricedAt: p.pricedAt,
    businessDays: du,
    calendarDays: dc,
    annualRate,
    monthlyEquivalent: annualToMonthly(annualRate),
    presentValueCents,
    discountCents: p.faceCents - presentValueCents,
    iofCents,
    funderCashOutCents,
    platformFeeCents,
    registryFeeCents: p.registryFeeCents,
    distributorNetCents,
    cetAnnual,
    cetMonthly: annualToMonthly(cetAnnual),
    funderYieldAnnual: impliedAnnual(presentValueCents - p.funderFeesCents, p.faceCents, du),
  };
}
