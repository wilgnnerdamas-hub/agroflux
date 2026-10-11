// Calendário de dias úteis (contrato v1.3, §15.1), cópia do backend (backend/src/pricing/calendar.ts) para o gráfico.
// Feriados móveis derivados da Páscoa (Carnaval segunda e terça, Sexta-feira Santa e Corpus Christi),
// como no calendário usado pelo mercado financeiro brasileiro.

const DAY = 86_400_000;

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), em UTC. */
export function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const cache = new Map<number, Set<string>>();

export function holidays(year: number): Set<string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const e = easter(year).getTime();
  const fixed = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map((md) => `${year}-${md}`);
  const moving = [-48, -47, -2, 60].map((offset) => iso(new Date(e + offset * DAY)));
  const set = new Set([...fixed, ...moving]);
  cache.set(year, set);
  return set;
}

const toUtc = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export function isBusinessDay(isoDate: string): boolean {
  const t = toUtc(isoDate);
  const dow = new Date(t).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !holidays(Number(isoDate.slice(0, 4))).has(isoDate);
}

/** Dias úteis em (de, até]: não conta o dia inicial, conta o final. */
export function businessDaysBetween(fromIso: string, toIso: string): number {
  let n = 0;
  for (let t = toUtc(fromIso) + DAY; t <= toUtc(toIso); t += DAY) if (isBusinessDay(iso(new Date(t)))) n++;
  return n;
}

export const calendarDaysBetween = (fromIso: string, toIso: string) => Math.round((toUtc(toIso) - toUtc(fromIso)) / DAY);

/** Data de hoje no fuso de Brasília (UTC−3, sem horário de verão). */
export function todayBrasilia(now = Date.now()): string {
  return new Date(now - 3 * 3_600_000).toISOString().slice(0, 10);
}
