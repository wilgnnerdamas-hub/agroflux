// Formatação de valores para a tela. O idioma vem do I18nProvider (setFormatLocale); o padrão é pt-BR.
// A moeda é sempre o real (BRL); a digitação de valores no formulário segue o padrão brasileiro.
let LOCALE = "pt-BR";
let brl = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "BRL" });

export function setFormatLocale(locale: string) {
  if (locale === LOCALE) return;
  LOCALE = locale;
  brl = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "BRL" });
}

export function formatMoney(cents: number): string {
  return brl.format(cents / 100);
}

/** Valor compacto para eixos de gráfico: "R$ 150 mil" / "R$150K". */
export function formatMoneyCompact(cents: number): string {
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(cents / 100);
}

/** "1500000" (centavos) a partir de "15.000,00" digitado pelo usuário. */
export function parseMoneyToCents(input: string): number | null {
  const clean = input.replace(/[^\d,]/g, "");
  if (!clean) return null;
  const [intPart, decPart = ""] = clean.split(",");
  const cents = Number(intPart || "0") * 100 + Number((decPart + "00").slice(0, 2));
  return Number.isFinite(cents) ? cents : null;
}

/** Máscara de digitação: mantém só dígitos e formata como moeda. */
export function maskMoneyInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  const cents = Number(digits);
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

export function formatDate(isoDate: string): string {
  // "YYYY-MM-DD" sem fuso: formata sem converter para evitar deslocar um dia.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (m) {
    if (LOCALE === "pt-BR") return `${m[3]}/${m[2]}/${m[1]}`;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString(LOCALE, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" });
  }
  return new Date(isoDate).toLocaleDateString(LOCALE, LOCALE === "pt-BR" ? undefined : { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatNumber(n: number): string {
  return n.toLocaleString(LOCALE);
}

export function formatRateBps(bps: number): string {
  const v = (bps / 100).toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return LOCALE === "pt-BR" ? `${v}% a.m.` : `${v}%/mo`;
}

export function formatBytes(bytes: number): string {
  const n = (v: number, d: number) => v.toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d });
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${n(bytes / 1024, 1)} KB`;
  return `${n(bytes / 1024 / 1024, 2)} MB`;
}

/** Encurta hashes e assinaturas para exibição: "9f2c1e…e4a7". */
export function shorten(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysBetween(fromISO: string, toISO: string): number {
  const toUTC = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUTC(toISO) - toUTC(fromISO)) / 86_400_000);
}
