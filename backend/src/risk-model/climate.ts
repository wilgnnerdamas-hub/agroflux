// Índice climático REAL por UF: chuva acumulada nos últimos 365 dias comparada com a média dos 10 anos anteriores,
// num município agrícola de referência da UF. Fonte: Open-Meteo (Historical Weather API, gratuita e sem chave).
// Seca e excesso de chuva elevam o risco. Leitura em cache por 12 h; sem resposta, o risco usa a tabela de reserva.
import type { ClimateReading } from "./features.js";

const SITES: Record<string, { city: string; lat: number; lon: number }> = {
  AC: { city: "Rio Branco", lat: -9.97, lon: -67.81 },
  AL: { city: "Arapiraca", lat: -9.75, lon: -36.66 },
  AM: { city: "Humaitá", lat: -7.51, lon: -63.03 },
  AP: { city: "Macapá", lat: 0.03, lon: -51.07 },
  BA: { city: "Luís Eduardo Magalhães", lat: -12.09, lon: -45.8 },
  CE: { city: "Quixeramobim", lat: -5.2, lon: -39.29 },
  DF: { city: "Brasília", lat: -15.78, lon: -47.93 },
  ES: { city: "Linhares", lat: -19.39, lon: -40.07 },
  GO: { city: "Rio Verde", lat: -17.8, lon: -50.93 },
  MA: { city: "Balsas", lat: -7.53, lon: -46.04 },
  MG: { city: "Uberaba", lat: -19.75, lon: -47.93 },
  MS: { city: "Dourados", lat: -22.22, lon: -54.81 },
  MT: { city: "Sorriso", lat: -12.55, lon: -55.71 },
  PA: { city: "Paragominas", lat: -2.99, lon: -47.35 },
  PB: { city: "Campina Grande", lat: -7.23, lon: -35.88 },
  PE: { city: "Petrolina", lat: -9.39, lon: -40.5 },
  PI: { city: "Uruçuí", lat: -7.23, lon: -44.55 },
  PR: { city: "Cascavel", lat: -24.96, lon: -53.46 },
  RJ: { city: "Campos dos Goytacazes", lat: -21.75, lon: -41.32 },
  RN: { city: "Mossoró", lat: -5.19, lon: -37.34 },
  RO: { city: "Vilhena", lat: -12.74, lon: -60.15 },
  RR: { city: "Boa Vista", lat: 2.82, lon: -60.67 },
  RS: { city: "Passo Fundo", lat: -28.26, lon: -52.41 },
  SC: { city: "Chapecó", lat: -27.1, lon: -52.62 },
  SE: { city: "Lagarto", lat: -10.92, lon: -37.65 },
  SP: { city: "Ribeirão Preto", lat: -21.18, lon: -47.81 },
  TO: { city: "Porto Nacional", lat: -10.71, lon: -48.42 },
};

const TTL_MS = 12 * 60 * 60_000;
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface ClimateSnapshot extends ClimateReading {
  uf: string;
  city: string;
  rainMm: number;
  normalMm: number;
  anomaly: number;
  period: { start: string; end: string; normalFrom: number; normalTo: number };
  fetchedAt: number;
}

/** Índice de 0 a 1: seca abaixo de −10% e excesso acima de +15% elevam o risco. */
export function climateIndex(anomaly: number) {
  if (anomaly < -0.1) return Math.min(1, (-anomaly - 0.1) / 0.3);
  if (anomaly > 0.15) return Math.min(1, (anomaly - 0.15) / 0.35);
  return 0;
}

type Fetcher = (url: string) => Promise<{ daily?: { time: string[]; precipitation_sum: (number | null)[] } }>;

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return res.json();
};

export class ClimateService {
  private cache = new Map<string, ClimateSnapshot>();
  private inflight = new Map<string, Promise<void>>();

  constructor(private readonly fetcher: Fetcher = defaultFetcher, private readonly now: () => number = () => Date.now()) {}

  /** Leitura síncrona para o cálculo de risco; dispara a atualização em segundo plano se faltar ou estiver vencida. */
  reading = (uf: string): ClimateReading | null => {
    const snap = this.cache.get(uf);
    if (!snap || this.now() - snap.fetchedAt > TTL_MS) void this.refresh(uf);
    return snap ?? null;
  };

  snapshot(uf: string) {
    return this.cache.get(uf) ?? null;
  }

  async warm(ufs: string[]) {
    await Promise.allSettled([...new Set(ufs)].map((uf) => this.refresh(uf)));
  }

  refresh(uf: string): Promise<void> {
    const site = SITES[uf];
    if (!site) return Promise.resolve();
    const running = this.inflight.get(uf);
    if (running) return running;
    const job = this.load(uf, site)
      .catch(() => undefined)
      .finally(() => this.inflight.delete(uf));
    this.inflight.set(uf, job);
    return job;
  }

  private async load(uf: string, site: { city: string; lat: number; lon: number }) {
    // O arquivo histórico tem alguns dias de atraso; a janela termina 6 dias antes de hoje.
    const end = this.now() - 6 * DAY;
    const start = end - 11 * 365 * DAY;
    const url =
      `https://archive-api.open-meteo.com/v1/archive?latitude=${site.lat}&longitude=${site.lon}` +
      `&start_date=${iso(start)}&end_date=${iso(end)}&daily=precipitation_sum&timezone=America%2FSao_Paulo`;
    const data = await this.fetcher(url);
    const time = data.daily?.time ?? [];
    const rain = data.daily?.precipitation_sum ?? [];
    if (time.length < 365 * 5) return;
    const byDate = new Map(time.map((d, i) => [d, rain[i] ?? 0]));
    const sum = (from: number, to: number) => {
      let s = 0;
      for (let t = from; t <= to; t += DAY) s += byDate.get(iso(t)) ?? 0;
      return s;
    };
    const recentStart = end - 364 * DAY;
    const recent = sum(recentStart, end);
    const years = Array.from({ length: 10 }, (_, k) => sum(recentStart - (k + 1) * 365 * DAY, end - (k + 1) * 365 * DAY));
    const normal = years.reduce((s, v) => s + v, 0) / years.length;
    if (normal <= 0) return;
    const anomaly = recent / normal - 1;
    const index = Math.round(climateIndex(anomaly) * 100) / 100;
    const normalFrom = new Date(recentStart - 10 * 365 * DAY).getUTCFullYear();
    const normalTo = new Date(end - 365 * DAY).getUTCFullYear();
    const sign = anomaly >= 0 ? "acima" : "abaixo";
    const detail = `Chuva de 12 meses em ${site.city} (${uf}): ${Math.round(recent)} mm, ${Math.abs(Math.round(anomaly * 100))}% ${sign} da média de ${normalFrom}–${normalTo} (Open-Meteo).`;
    this.cache.set(uf, {
      uf,
      city: site.city,
      rainMm: Math.round(recent),
      normalMm: Math.round(normal),
      anomaly,
      index,
      detail,
      source: "open-meteo",
      period: { start: iso(recentStart), end: iso(end), normalFrom, normalTo },
      fetchedAt: this.now(),
    });
  }
}
