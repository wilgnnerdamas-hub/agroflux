// Treino do modelo de risco: base SINTÉTICA de operações históricas + regressão logística com regularização L2.
// A base é gerada a partir de premissas ilustrativas do setor (não há histórico real de inadimplência na demo).
// Trocar a base sintética por dados reais (SCR do Banco Central, bureaus, satélite) é trocar a fonte desta função.
import { FEATURE_KEYS, type FeatureKey, type FeatureVector } from "./features.js";

/** PRNG determinístico (mulberry32): a mesma semente gera a mesma base e o mesmo modelo. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

// "Verdade" usada só para gerar a base sintética (log-odds por unidade de cada característica).
const TRUE_INTERCEPT = -3.7;
const TRUE_COEF: Record<FeatureKey, number> = {
  acceptance: -0.9,
  declined: 1.6,
  coobligation: -0.5,
  term: 1.2,
  harvest_window: -0.7,
  harvest_before: 0.6,
  log_amount: 0.25,
  climate: 1.1,
  concentration: 1.5,
  on_time: -9,
  seasons: -0.8,
  platform_accepted: -0.4,
  platform_declined: 1.2,
};

export interface Row {
  x: FeatureVector;
  y: 0 | 1;
}

export function generateDataset(n: number, seed: number): Row[] {
  const r = rng(seed);
  const normal = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const beta = (a: number, b: number) => {
    // Aproximação simples por média de uniformes elevadas (suficiente para a forma da distribuição).
    const u = Math.pow(r(), 1 / a);
    const v = Math.pow(r(), 1 / b);
    return u / (u + v || 1);
  };
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const acceptance = r() < 0.75 ? 1 : 0;
    const declined = !acceptance && r() < 0.12 ? 1 : 0;
    const harvest = r();
    const climateDraw = r();
    const x: FeatureVector = {
      acceptance,
      declined,
      coobligation: r() < 0.7 ? 1 : 0,
      term: (30 + r() * 370) / 365,
      harvest_window: harvest < 0.55 ? 1 : 0,
      harvest_before: harvest >= 0.55 && harvest < 0.75 ? 1 : 0,
      log_amount: Math.log(1.5) + normal() * 0.9 - Math.log(1),
      climate: climateDraw < 0.6 ? r() * 0.25 : climateDraw < 0.85 ? 0.35 + r() * 0.3 : 0.7 + r() * 0.3,
      concentration: beta(2, 6),
      on_time: 0.7 + 0.3 * beta(5, 1.5),
      seasons: (1 + Math.floor(r() * 10)) / 10,
      platform_accepted: Math.min(3, Math.floor(r() * r() * 5)) / 3,
      platform_declined: r() < 0.05 ? (r() < 0.7 ? 0.5 : 1) : 0,
    };
    const z = TRUE_INTERCEPT + FEATURE_KEYS.reduce((s, k) => s + TRUE_COEF[k] * (k === "on_time" ? x[k] - 0.9 : x[k]), 0) + normal() * 0.35;
    rows.push({ x, y: r() < sigmoid(z) ? 1 : 0 });
  }
  return rows;
}

export interface TrainedFeature {
  key: FeatureKey;
  mean: number;
  std: number;
  coef: number;
}

export interface ModelMetrics {
  auc: number;
  ks: number;
  brier: number;
  defaultRate: number;
  deciles: { predicted: number; observed: number; count: number }[];
}

export interface RiskModel {
  name: string;
  version: string;
  trainedAt: string;
  dataset: { synthetic: true; rows: number; trainRows: number; testRows: number; seed: number; defaultRate: number };
  intercept: number;
  features: TrainedFeature[];
  metrics: ModelMetrics;
}

/** Regressão logística por gradiente descendente em lote, com características padronizadas e penalidade L2. */
export function trainLogistic(rows: Row[], { iterations = 3000, lr = 0.3, l2 = 1e-3 } = {}) {
  const keys = FEATURE_KEYS;
  const means = keys.map((k) => rows.reduce((s, r) => s + r.x[k], 0) / rows.length);
  const stds = keys.map((k, j) => Math.sqrt(rows.reduce((s, r) => s + (r.x[k] - means[j]) ** 2, 0) / rows.length) || 1);
  const X = rows.map((r) => keys.map((k, j) => (r.x[k] - means[j]) / stds[j]));
  const y: number[] = rows.map((r) => r.y);
  let b = Math.log((y.reduce((s, v) => s + v, 0) + 1) / (rows.length - y.reduce((s, v) => s + v, 0) + 1));
  const w = keys.map(() => 0);
  for (let it = 0; it < iterations; it++) {
    const gw = w.map(() => 0);
    let gb = 0;
    for (let i = 0; i < X.length; i++) {
      const p = sigmoid(b + X[i].reduce((s, v, j) => s + v * w[j], 0));
      const e = p - y[i];
      gb += e;
      for (let j = 0; j < w.length; j++) gw[j] += e * X[i][j];
    }
    b -= (lr * gb) / X.length;
    for (let j = 0; j < w.length; j++) w[j] -= lr * (gw[j] / X.length + l2 * w[j]);
  }
  const features: TrainedFeature[] = keys.map((key, j) => ({ key, mean: means[j], std: stds[j], coef: w[j] }));
  return { intercept: b, features };
}

export function predict(model: Pick<RiskModel, "intercept" | "features">, x: FeatureVector) {
  return sigmoid(model.intercept + model.features.reduce((s, f) => s + f.coef * ((x[f.key] - f.mean) / f.std), 0));
}

/** AUC (Mann–Whitney), KS, Brier e calibração por decil. */
export function evaluate(scores: number[], y: (0 | 1)[]): ModelMetrics {
  const pairs = scores.map((s, i) => ({ s, y: y[i] })).sort((a, b) => a.s - b.s);
  const pos = y.filter((v) => v === 1).length;
  const neg = y.length - pos;
  let rankSum = 0;
  pairs.forEach((p, i) => {
    if (p.y === 1) rankSum += i + 1;
  });
  const auc = pos && neg ? (rankSum - (pos * (pos + 1)) / 2) / (pos * neg) : 0.5;
  let tp = 0;
  let fp = 0;
  let ks = 0;
  for (const p of [...pairs].reverse()) {
    if (p.y === 1) tp++;
    else fp++;
    ks = Math.max(ks, Math.abs(tp / (pos || 1) - fp / (neg || 1)));
  }
  const brier = scores.reduce((s, v, i) => s + (v - y[i]) ** 2, 0) / scores.length;
  const deciles = Array.from({ length: 10 }, (_, d) => {
    const slice = pairs.slice(Math.floor((d * pairs.length) / 10), Math.floor(((d + 1) * pairs.length) / 10));
    return {
      predicted: slice.reduce((s, p) => s + p.s, 0) / (slice.length || 1),
      observed: slice.filter((p) => p.y === 1).length / (slice.length || 1),
      count: slice.length,
    };
  });
  return { auc, ks, brier, defaultRate: pos / (y.length || 1), deciles };
}

/** Gera a base, separa treino e teste (80/20) e treina. Determinístico pela semente. */
export function buildModel(seed = 20261011, rows = 5000): RiskModel {
  const data = generateDataset(rows, seed);
  const cut = Math.floor(rows * 0.8);
  const train = data.slice(0, cut);
  const test = data.slice(cut);
  const fitted = trainLogistic(train);
  const metrics = evaluate(test.map((r) => predict(fitted, r.x)), test.map((r) => r.y));
  const round = (v: number, d = 6) => Math.round(v * 10 ** d) / 10 ** d;
  return {
    name: "Regressão logística (base sintética)",
    version: "1.0.0",
    trainedAt: new Date().toISOString(),
    dataset: { synthetic: true, rows, trainRows: train.length, testRows: test.length, seed, defaultRate: round(data.filter((r) => r.y).length / rows, 4) },
    intercept: round(fitted.intercept),
    features: fitted.features.map((f) => ({ key: f.key, mean: round(f.mean), std: round(f.std), coef: round(f.coef) })),
    metrics: {
      auc: round(metrics.auc, 4),
      ks: round(metrics.ks, 4),
      brier: round(metrics.brier, 5),
      defaultRate: round(metrics.defaultRate, 4),
      deciles: metrics.deciles.map((d) => ({ predicted: round(d.predicted, 4), observed: round(d.observed, 4), count: d.count })),
    },
  };
}
