// Risco do recebível (contrato v1.3, §15.2): scorecard explicável, rating AA–H, PD, LGD e perda esperada.
// SIMULAÇÃO: pesos ilustrativos; o histórico do produtor é fictício e determinístico (rotulado como simulado).
import { createHash } from "node:crypto";
import { calendarDaysBetween, todayBrasilia } from "./pricing/calendar.js";
import { RATINGS } from "./pricing/settings.js";
import type { Rating, Receivable, Risk, RiskFactor, Settings } from "./types.js";

const BASE = 500;
const LIMITS: [number, Rating][] = [
  [850, "AA"],
  [750, "A"],
  [650, "B"],
  [550, "C"],
  [450, "D"],
  [350, "E"],
  [250, "F"],
  [150, "G"],
];

export const ratingFor = (score: number): Rating => LIMITS.find(([min]) => score >= min)?.[1] ?? "H";

// Risco climático por UF: tabela simplificada da demo (eventos recentes de seca e excesso de chuva).
const CLIMATE: Record<string, "low" | "medium" | "high"> = { RS: "high", SC: "medium", MA: "medium", TO: "medium", PI: "medium", BA: "medium" };

const money = (cents: number) => `R$ ${(cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** Histórico fictício do produtor, sempre o mesmo para o mesmo pseudônimo. */
export function producerHistory(alias: string) {
  const h = createHash("sha256").update(`agroflux-historico:${alias.trim().toLowerCase()}`).digest();
  const onTimeRate = Math.round((0.7 + (h.readUInt16BE(0) / 65_535) * 0.3) * 100) / 100;
  const seasons = 1 + (h[2] % 10);
  const maxDelayDays = onTimeRate >= 0.95 ? h[3] % 16 : 10 + (h[3] % 81);
  return { isSimulated: true as const, seasons, onTimeRate, maxDelayDays };
}

export function assessRisk(r: Receivable, all: Receivable[], settings: Settings, today = todayBrasilia()): Risk {
  const f: RiskFactor[] = [];
  const add = (key: string, label: string, points: number, detail: string) => f.push({ key, label, points, detail });

  // Aceite do sacado.
  const dc = r.debtorConfirmation;
  if (dc.status === "confirmed" && dc.chain?.status === "confirmed") add("acceptance", "Aceite do sacado", 80, "Aceite registrado na Solana Devnet.");
  else if (dc.status === "declined") add("acceptance", "Aceite do sacado", -150, "O sacado recusou o título.");
  else if (dc.status === "requested" || dc.status === "confirmed") add("acceptance", "Aceite do sacado", 0, "Aceite em andamento.");
  else add("acceptance", "Aceite do sacado", -30, "Ainda sem aceite.");

  add("coobligation", "Coobrigação da distribuidora", r.listing.status === "published" ? 40 : 0, r.listing.status === "published" ? "Termo aceito e registrado." : "Termo ainda não aceito.");
  if (r.registry.status === "registered") add("registry", "Título único na registradora", 20, `Registro ${r.registry.registryId}.`);

  // Prazo (dias corridos até o vencimento).
  const days = Math.max(0, calendarDaysBetween(today, r.dueDate));
  add("term", "Prazo", days <= 90 ? 40 : days <= 180 ? 20 : days <= 270 ? 0 : days <= 360 ? -30 : -60, `${days} dias até o vencimento.`);

  // Vencimento x colheita: na safra 2026/27, a colheita principal vai de janeiro a junho de 2027.
  const year2 = Number(r.cropSeason.slice(0, 4)) + 1;
  const due = r.dueDate;
  const harvest =
    due < `${year2}-01-01` ? { p: -40, d: "Vence antes da colheita da safra." } :
    due <= `${year2}-06-30` ? { p: 50, d: "Vence na janela de colheita da safra." } :
    due <= `${year2}-12-31` ? { p: 10, d: "Vence depois da colheita, no mesmo ano." } :
    { p: -20, d: "Vence muito depois da colheita." };
  add("harvest", "Vencimento x colheita", harvest.p, `${harvest.d} (safra ${r.cropSeason})`);

  const v = r.amountCents;
  add("amount", "Valor do título", v <= 10_000_000 ? 20 : v <= 50_000_000 ? 5 : v <= 200_000_000 ? -15 : -40, money(v));

  const climate = CLIMATE[r.debtor.state] ?? "low";
  add("climate", "Risco climático da UF", climate === "low" ? 20 : climate === "medium" ? 0 : -40, `${r.debtor.state}: ${climate === "low" ? "baixo" : climate === "medium" ? "médio" : "alto"} (tabela simplificada).`);

  // Concentração da distribuidora neste sacado.
  const mine = all.filter((x) => x.distributor.id === r.distributor.id);
  const total = mine.reduce((s, x) => s + x.amountCents, 0) || 1;
  const sameDebtor = mine.filter((x) => x.debtor.alias.trim().toLowerCase() === r.debtor.alias.trim().toLowerCase()).reduce((s, x) => s + x.amountCents, 0);
  const share = sameDebtor / total;
  add("concentration", "Concentração no sacado", share > 0.4 ? -40 : share > 0.25 ? -20 : 10, `${pct(share)} da carteira da distribuidora.`);

  // Histórico do produtor (simulado).
  const hist = producerHistory(r.debtor.alias);
  const onTime = hist.onTimeRate >= 0.97 ? 120 : hist.onTimeRate >= 0.92 ? 70 : hist.onTimeRate >= 0.85 ? 20 : hist.onTimeRate >= 0.78 ? -40 : -120;
  add("history_payments", "Pagamentos em dia (histórico simulado)", onTime, `${pct(hist.onTimeRate)} em dia, atraso máximo de ${hist.maxDelayDays} dias.`);
  add("history_seasons", "Safras de relacionamento (histórico simulado)", hist.seasons >= 6 ? 30 : hist.seasons >= 3 ? 10 : -20, `${hist.seasons} safra(s).`);

  // Histórico na plataforma: outros títulos do mesmo sacado.
  const others = all.filter((x) => x.id !== r.id && x.debtor.alias.trim().toLowerCase() === r.debtor.alias.trim().toLowerCase());
  const accepted = others.filter((x) => x.debtorConfirmation.status === "confirmed").length;
  const declined = others.filter((x) => x.debtorConfirmation.status === "declined").length;
  if (accepted || declined) {
    add("platform", "Histórico na AgroFlux", Math.min(accepted * 15, 45) - declined * 80, `${accepted} título(s) aceito(s), ${declined} recusado(s).`);
  }

  const score = Math.max(0, Math.min(1000, BASE + f.reduce((s, x) => s + x.points, 0)));
  const rating = ratingFor(score);
  const cfg = settings.ratings[rating];
  const pdAnnual = cfg.pdAnnualBps / 10_000;
  const pdTerm = 1 - Math.pow(1 - pdAnnual, Math.max(days, 1) / 365);
  const lgdBps = r.listing.status === "published" || ["offer_selected", "assignment_pending", "assigned", "assignment_failed"].includes(r.status)
    ? settings.lgdBps.withCoobligation
    : settings.lgdBps.withoutCoobligation;
  return {
    score,
    rating,
    pdAnnualBps: cfg.pdAnnualBps,
    pdTermBps: Math.round(pdTerm * 10_000),
    lgdBps,
    expectedLossCents: Math.round(pdTerm * (lgdBps / 10_000) * r.amountCents),
    spreadBaseBps: cfg.spreadBps,
    factors: f,
    producerHistory: hist,
  };
}

export { RATINGS };
