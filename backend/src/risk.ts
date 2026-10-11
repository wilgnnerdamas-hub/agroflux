// Risco do recebível (contrato v1.3, §15.2, revisto em 11/10): PD estimada por um modelo de regressão logística
// treinado em base SINTÉTICA (src/risk-model). O score, o rating AA–H e os fatores saem do próprio modelo:
// cada fator mostra quanto aquela característica moveu o score em relação a uma operação média da base.
// O histórico do produtor continua fictício e determinístico (rotulado como simulado).
import { readFileSync } from "node:fs";
import { todayBrasilia } from "./pricing/calendar.js";
import { RATINGS } from "./pricing/settings.js";
import { FEATURE_LABELS, extractFeatures, producerHistory, type ClimateReading } from "./risk-model/features.js";
import type { RiskModel } from "./risk-model/train.js";
import type { Rating, Receivable, Risk, RiskFactor, Settings } from "./types.js";

export { producerHistory };

export const RISK_MODEL: RiskModel = JSON.parse(readFileSync(new URL("./risk-model/model.json", import.meta.url), "utf8"));

// Escala do score (como num scorecard de mercado): 500 = operação média da base; +50 pontos dobram a chance de pagar.
const BASE_SCORE = 500;
const POINTS_PER_LN_ODDS = 50 / Math.LN2;

/** Rating pela PD anual: cada rating cobre a faixa em torno da PD de referência da tabela (média geométrica entre vizinhos). */
export function ratingForPd(pdAnnualBps: number, settings: Settings): Rating {
  for (let i = 0; i < RATINGS.length - 1; i++) {
    const upper = Math.sqrt(settings.ratings[RATINGS[i]].pdAnnualBps * settings.ratings[RATINGS[i + 1]].pdAnnualBps);
    if (pdAnnualBps <= upper) return RATINGS[i];
  }
  return "H";
}

export interface RiskContext {
  climate?: (uf: string) => ClimateReading | null;
}

export function assessRisk(r: Receivable, all: Receivable[], settings: Settings, today = todayBrasilia(), ctx: RiskContext = {}): Risk {
  const m = RISK_MODEL;
  const f = extractFeatures(r, { all, today, climate: ctx.climate });

  // Contribuição de cada característica em log-odds, em relação à média da base de treino.
  const contrib = m.features.map((feat) => ({ key: feat.key, z: feat.coef * ((f.x[feat.key] - feat.mean) / feat.std) }));
  const z = m.intercept + contrib.reduce((s, c) => s + c.z, 0);
  const pdTerm = Math.min(0.999, Math.max(0.0001, 1 / (1 + Math.exp(-z))));
  const pdAnnual = 1 - Math.pow(1 - pdTerm, 365 / Math.max(f.days, 30));

  const factors: RiskFactor[] = contrib
    .map((c) => ({ key: c.key, label: FEATURE_LABELS[c.key], points: Math.round(-POINTS_PER_LN_ODDS * c.z), detail: f.detail[c.key] }));
  const score = Math.max(0, Math.min(1000, Math.round(BASE_SCORE + POINTS_PER_LN_ODDS * (m.intercept - z))));

  const pdAnnualBps = Math.round(pdAnnual * 10_000);
  const rating = ratingForPd(pdAnnualBps, settings);
  const lgdBps = f.x.coobligation ? settings.lgdBps.withCoobligation : settings.lgdBps.withoutCoobligation;
  return {
    score,
    rating,
    pdAnnualBps,
    pdTermBps: Math.round(pdTerm * 10_000),
    lgdBps,
    expectedLossCents: Math.round(pdTerm * (lgdBps / 10_000) * r.amountCents),
    spreadBaseBps: settings.ratings[rating].spreadBps,
    factors,
    producerHistory: f.history,
    model: { name: m.name, version: m.version, auc: m.metrics.auc, synthetic: true },
    climate: { index: f.climate.index, source: f.climate.source },
  };
}

export { RATINGS };
