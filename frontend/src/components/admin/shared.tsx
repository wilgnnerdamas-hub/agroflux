"use client";

// Peças comuns do Painel AgroFlux: carregamento, células de números, painéis, trilha de portões e tons.
import { api } from "@/lib/api";
import { GATES } from "@/lib/gates";
import { useI18n } from "@/lib/i18n";
import { useAsync } from "@/lib/useAsync";
import type { AdminReceivableRow, Rating, ReceivableStatus } from "@/lib/types";
import { ErrorState, LoadingBlock, cx } from "@/components/ui";

export const RATINGS: Rating[] = ["AA", "A", "B", "C", "D", "E", "F", "G", "H"];
export const FUNDER_NAMES: Record<string, string> = { fnd_a: "Financiador Demo A", fnd_b: "Financiador Demo B", fnd_c: "Financiador Demo C" };
/** Concentração considerada alta no maior sacado da distribuidora (não há parâmetro equivalente nas configurações). */
export const HIGH_CONCENTRATION = 0.5;

export const addressUrl = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
export const txUrl = (s: string) => `https://explorer.solana.com/tx/${s}?cluster=devnet`;

export function useLoad<T>(fn: () => Promise<T>) {
  const { state, reload } = useAsync(fn, []);
  const { errorMessage } = useI18n();
  const view = (render: (d: T) => React.ReactNode) =>
    !state.data && state.status === "loading" ? (
      <div className="rounded-[14px] border border-border bg-surface p-6"><LoadingBlock lines={4} /></div>
    ) : !state.data && state.status === "error" ? (
      <ErrorState message={errorMessage(state.error)} onRetry={() => reload()} />
    ) : state.data ? (
      render(state.data)
    ) : null;
  return { view, reload, data: state.data };
}

/** Grade de células com divisórias de 1px (gap sobre o fundo da borda). */
export function StatGrid({ children, cols = 4, className }: { children: React.ReactNode; cols?: 3 | 4; className?: string }) {
  return (
    <div className={cx("grid grid-cols-2 gap-px bg-border", cols === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3", className)}>
      {children}
    </div>
  );
}

export function StatCell({ dot, label, value, hint, valueClass, className }: { dot?: string; label: string; value: React.ReactNode; hint?: React.ReactNode; valueClass?: string; className?: string }) {
  return (
    <div className={cx("min-w-0 bg-surface p-5", className)}>
      <p className="flex items-center gap-2 text-[13px] text-muted">
        {dot && <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", dot)} aria-hidden />}
        {label}
      </p>
      <p className={cx("big-num mt-2 truncate text-[26px] leading-none sm:text-[30px]", valueClass ?? "text-ink")}>{value}</p>
      {hint && <p className="mt-2 text-xs text-faint">{hint}</p>}
    </div>
  );
}

export function Panel({ title, aside, children, className, bodyClass }: { title: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cx("min-w-0 rounded-[14px] border border-border bg-surface", className)}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-divider px-5 py-4">
        <h2 className="text-base font-medium">{title}</h2>
        {aside && <span className="text-xs text-faint">{aside}</span>}
      </header>
      <div className={bodyClass ?? "p-5"}>{children}</div>
    </section>
  );
}

export const pct = (part: number, total: number) => (total > 0 ? part / total : 0);

export function formatPct(v: number, locale: string, digits = 1) {
  return `${(v * 100).toLocaleString(locale === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

/** Grupos de etapa do painel ("Onde estão os recebíveis") e o portão de cada um. */
export type StageGroup = "created" | "registered" | "published" | "assigned" | "failed";
export const STAGES: { key: StageGroup; gate: string; color: string }[] = [
  { key: "created", gate: "01", color: "bg-step" },
  { key: "registered", gate: "02", color: "bg-green-pale" },
  { key: "published", gate: "04", color: "bg-green-mid" },
  { key: "assigned", gate: "05", color: "bg-brand" },
  { key: "failed", gate: "05", color: "bg-amber" },
];

export function stageOf(s: ReceivableStatus): StageGroup {
  if (s === "assigned") return "assigned";
  if (s === "assignment_failed") return "failed";
  if (s === "published" || s === "offer_selected" || s === "assignment_pending") return "published";
  if (s === "registered") return "registered";
  return "created";
}

/** Portões concluídos a partir da linha do admin. */
export function gatesDone(r: Pick<AdminReceivableRow, "status" | "debtorConfirmation">) {
  switch (r.status) {
    case "assigned":
      return 5;
    case "offer_selected":
    case "assignment_pending":
    case "assignment_failed":
      return 4;
    case "published":
      return 3;
    case "registered":
      return r.debtorConfirmation?.status === "confirmed" ? 3 : 2;
    default:
      return 1;
  }
}

/** Trilha de 5 pontos; na falha, o trecho percorrido e o 5º ponto ficam em terracota. */
export function GateDots({ done, failed, progress = 1 }: { done: number; failed?: boolean; progress?: number }) {
  const { t } = useI18n();
  const reach = failed ? GATES : done;
  const filled = Math.max(0, reach - 1) / (GATES - 1);
  const tone = failed ? "bg-terra-fill" : "bg-brand";
  const ring = failed ? "border-terra-fill" : "border-brand";
  return (
    <span className="relative inline-flex w-[88px] items-center justify-between" title={`${t.gates.label}: ${done}/${GATES}`}>
      <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-border" aria-hidden />
      <span className={cx("absolute left-1 top-1/2 h-px -translate-y-1/2", tone)} style={{ width: `calc((100% - 0.5rem) * ${filled * progress})` }} aria-hidden />
      {Array.from({ length: GATES }).map((_, i) => {
        const isDone = i < done;
        const isFail = failed && i === GATES - 1;
        return (
          <span
            key={i}
            className={cx("relative h-[9px] w-[9px] rounded-full border", isFail ? "border-terra-fill bg-terra-fill" : isDone ? cx(ring, tone) : "border-border-strong bg-surface")}
            aria-hidden
          />
        );
      })}
      <span className="sr-only">{`${t.gates.label}: ${done}/${GATES}`}</span>
    </span>
  );
}

/** Lê os recebíveis do admin (usado pela aba e pelos avisos). */
export const loadAdminReceivables = () => api.adminReceivables();
