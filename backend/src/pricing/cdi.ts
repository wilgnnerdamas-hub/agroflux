// CDI de referência (contrato v1.3, §15.1): API pública do Banco Central (SGS, série 4389, CDI anualizado base 252).
// Cache de 6 horas; se a consulta falhar ou a configuração for manual, vale o valor manual.

export interface CdiQuote {
  annualBps: number;
  source: "bcb" | "manual";
  referenceDate: string | null; // YYYY-MM-DD da série do BCB
}

export type CdiProvider = (opts: { source: "bcb" | "manual"; manualAnnualBps: number }) => Promise<CdiQuote>;

const URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json";
const CACHE_MS = 6 * 3_600_000;
const TIMEOUT_MS = 4_000;

/** Lê o último valor da série. "10/10/2026" + "14,90" ou "14.90" → { 1490, "2026-10-10" }. */
export function parseBcb(body: unknown): { annualBps: number; referenceDate: string } | null {
  const row = Array.isArray(body) ? body.at(-1) : null;
  if (!row || typeof row.valor !== "string" || typeof row.data !== "string") return null;
  const value = Number(row.valor.replace(",", "."));
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(row.data);
  if (!Number.isFinite(value) || value <= 0 || value > 100 || !m) return null;
  return { annualBps: Math.round(value * 100), referenceDate: `${m[3]}-${m[2]}-${m[1]}` };
}

export function createCdiProvider(fetchImpl: typeof fetch = fetch): CdiProvider {
  let cached: { at: number; quote: CdiQuote } | null = null;
  return async ({ source, manualAnnualBps }) => {
    const manual: CdiQuote = { annualBps: manualAnnualBps, source: "manual", referenceDate: null };
    if (source === "manual") return manual;
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.quote;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await fetchImpl(URL, { signal: ctrl.signal, headers: { Accept: "application/json" } }).finally(() => clearTimeout(timer));
      const parsed = res.ok ? parseBcb(await res.json()) : null;
      if (!parsed) return manual;
      const quote: CdiQuote = { ...parsed, source: "bcb" };
      cached = { at: Date.now(), quote };
      return quote;
    } catch {
      return manual;
    }
  };
}

/** Provedor fixo para testes e para quando a rede externa não é desejada. */
export const fixedCdi = (annualBps: number): CdiProvider => async ({ source, manualAnnualBps }) =>
  source === "manual" ? { annualBps: manualAnnualBps, source: "manual", referenceDate: null } : { annualBps, source: "bcb", referenceDate: "2026-10-09" };
