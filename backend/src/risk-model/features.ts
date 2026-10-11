// Características (features) do modelo de risco, extraídas de um recebível. As mesmas definições servem para o
// treino (base sintética) e para a avaliação em produção, para o modelo ver sempre a mesma coisa.
import { createHash } from "node:crypto";
import { calendarDaysBetween, todayBrasilia } from "../pricing/calendar.js";
import type { Receivable } from "../types.js";

export const FEATURE_KEYS = [
  "acceptance",
  "declined",
  "coobligation",
  "term",
  "harvest_window",
  "harvest_before",
  "log_amount",
  "climate",
  "concentration",
  "on_time",
  "seasons",
  "platform_accepted",
  "platform_declined",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type FeatureVector = Record<FeatureKey, number>;

/** Histórico fictício do produtor, sempre o mesmo para o mesmo pseudônimo (rotulado como simulado). */
export function producerHistory(alias: string) {
  const h = createHash("sha256").update(`agroflux-historico:${alias.trim().toLowerCase()}`).digest();
  const onTimeRate = Math.round((0.7 + (h.readUInt16BE(0) / 65_535) * 0.3) * 100) / 100;
  const seasons = 1 + (h[2] % 10);
  const maxDelayDays = onTimeRate >= 0.95 ? h[3] % 16 : 10 + (h[3] % 81);
  return { isSimulated: true as const, seasons, onTimeRate, maxDelayDays };
}

// Risco climático por UF, de 0 (baixo) a 1 (alto): tabela de reserva quando não há leitura de chuva.
const CLIMATE_TABLE: Record<string, number> = { RS: 1, SC: 0.5, MA: 0.5, TO: 0.5, PI: 0.5, BA: 0.5 };
export const climateFallback = (uf: string) => CLIMATE_TABLE[uf] ?? 0;

export type ClimateReading = { index: number; detail: string; source: "open-meteo" | "table" };

export interface FeatureContext {
  all: Receivable[];
  today?: string;
  /** Índice climático (0–1) da UF do sacado, com a descrição; se ausente, usa a tabela de reserva. */
  climate?: (uf: string) => ClimateReading | null;
}

export interface ExtractedFeatures {
  x: FeatureVector;
  /** Texto legível de cada característica (vai para os fatores do cartão de risco). */
  detail: Record<FeatureKey, string>;
  days: number;
  history: ReturnType<typeof producerHistory>;
  climate: ClimateReading;
}

const money = (cents: number) => `R$ ${(cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export function extractFeatures(r: Receivable, ctx: FeatureContext): ExtractedFeatures {
  const today = ctx.today ?? todayBrasilia();
  const dc = r.debtorConfirmation;
  const accepted = dc.status === "confirmed" && dc.chain?.status === "confirmed";
  const declined = dc.status === "declined";
  const published = r.listing.status === "published" || ["offer_selected", "assignment_pending", "assigned", "assignment_failed"].includes(r.status);
  const days = Math.max(1, calendarDaysBetween(today, r.dueDate));

  // Vencimento x colheita: na safra 2026/27, a colheita principal vai de janeiro a junho de 2027.
  const year2 = Number(r.cropSeason.slice(0, 4)) + 1;
  const inWindow = r.dueDate >= `${year2}-01-01` && r.dueDate <= `${year2}-06-30`;
  const before = r.dueDate < `${year2}-01-01`;

  const climate = ctx.climate?.(r.debtor.state) ?? { index: climateFallback(r.debtor.state), detail: `${r.debtor.state}: tabela simplificada`, source: "table" as const };

  const mine = ctx.all.filter((x) => x.distributor.id === r.distributor.id);
  const total = mine.reduce((s, x) => s + x.amountCents, 0) || 1;
  const alias = r.debtor.alias.trim().toLowerCase();
  const share = mine.filter((x) => x.debtor.alias.trim().toLowerCase() === alias).reduce((s, x) => s + x.amountCents, 0) / total;

  const hist = producerHistory(r.debtor.alias);
  const others = ctx.all.filter((x) => x.id !== r.id && x.debtor.alias.trim().toLowerCase() === alias);
  const okCount = others.filter((x) => x.debtorConfirmation.status === "confirmed").length;
  const badCount = others.filter((x) => x.debtorConfirmation.status === "declined").length;

  const x: FeatureVector = {
    acceptance: accepted ? 1 : 0,
    declined: declined ? 1 : 0,
    coobligation: published ? 1 : 0,
    term: days / 365,
    harvest_window: inWindow ? 1 : 0,
    harvest_before: before ? 1 : 0,
    log_amount: Math.log(Math.max(r.amountCents, 100_000) / 10_000_000),
    climate: climate.index,
    concentration: share,
    on_time: hist.onTimeRate,
    seasons: hist.seasons / 10,
    platform_accepted: Math.min(okCount, 3) / 3,
    platform_declined: Math.min(badCount, 2) / 2,
  };
  const detail: Record<FeatureKey, string> = {
    acceptance: accepted ? "Aceite registrado na Solana Devnet." : dc.status === "requested" || dc.status === "confirmed" ? "Aceite em andamento." : "Ainda sem aceite.",
    declined: declined ? "O sacado recusou o título." : "Sem recusa do sacado.",
    coobligation: published ? "Termo de coobrigação aceito e registrado." : "Termo ainda não aceito.",
    term: `${days} dias até o vencimento.`,
    harvest_window: inWindow ? `Vence na janela de colheita (safra ${r.cropSeason}).` : `Fora da janela de colheita (safra ${r.cropSeason}).`,
    harvest_before: before ? "Vence antes da colheita da safra." : "Não vence antes da colheita.",
    log_amount: money(r.amountCents),
    climate: climate.detail,
    concentration: `${pct(share)} da carteira da distribuidora.`,
    on_time: `${pct(hist.onTimeRate)} em dia, atraso máximo de ${hist.maxDelayDays} dias (histórico simulado).`,
    seasons: `${hist.seasons} safra(s) de relacionamento (histórico simulado).`,
    platform_accepted: `${okCount} outro(s) título(s) aceito(s) na AgroFlux.`,
    platform_declined: `${badCount} título(s) recusado(s) na AgroFlux.`,
  };
  return { x, detail, days, history: hist, climate };
}

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  acceptance: "Aceite do sacado",
  declined: "Recusa do sacado",
  coobligation: "Coobrigação da distribuidora",
  term: "Prazo",
  harvest_window: "Vencimento na colheita",
  harvest_before: "Vencimento antes da colheita",
  log_amount: "Valor do título",
  climate: "Risco climático da região",
  concentration: "Concentração no sacado",
  on_time: "Pagamentos em dia (histórico simulado)",
  seasons: "Safras de relacionamento (histórico simulado)",
  platform_accepted: "Histórico na AgroFlux (aceites)",
  platform_declined: "Histórico na AgroFlux (recusas)",
};
