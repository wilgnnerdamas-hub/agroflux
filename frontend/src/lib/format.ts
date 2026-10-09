const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatMoney(cents: number): string {
  return brl.format(cents / 100);
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
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    cents / 100,
  );
}

export function formatDate(isoDate: string): string {
  // "YYYY-MM-DD" sem fuso: formata sem converter para evitar deslocar um dia.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return new Date(isoDate).toLocaleDateString("pt-BR");
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatRateBps(bps: number): string {
  return `${(bps / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% a.m.`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2).replace(".", ",")} MB`;
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
