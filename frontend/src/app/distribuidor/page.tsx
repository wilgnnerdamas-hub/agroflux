"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileStack, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { GATES, gateProgress, matchesFilter, type GateFilter, type GateProgress } from "@/lib/gates";
import { useI18n } from "@/lib/i18n";
import { useCountUp } from "@/lib/motion";
import { nextStep, type NextStep } from "@/lib/nextStep";
import { useAsync } from "@/lib/useAsync";
import { useRole } from "@/lib/role";
import type { ReceivableList, ReceivableSummary } from "@/lib/types";
import { ButtonLink, EmptyState, ErrorState, PageHeader, Skeleton, cx } from "@/components/ui";
import { offersSeen } from "@/components/passport/ProposalsPanel";
import { RatingBadge } from "@/components/RiskCard";
import { GateTrail } from "@/components/Gates";

const REFRESH_MS = 6000;
const VIEW_KEY = "agroflux.distributor.view";

type Row = { r: ReceivableSummary; step: NextStep; gate: GateProgress; isNew: boolean };

// ---------- KPIs ----------

function KpiCell({ dot, label, value, hint, accent }: { dot: string; label: string; value: React.ReactNode; hint: string; accent?: boolean }) {
  return (
    <div className="bg-surface p-5">
      <p className="flex items-center gap-2 text-[13px] text-muted">
        <span className={cx("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
        {label}
      </p>
      <p className={cx("big-num mt-2 text-[26px] leading-none sm:text-[30px]", accent ? "text-brand" : "text-ink")}>{value}</p>
      <p className="mt-2 text-xs text-faint">{hint}</p>
    </div>
  );
}

function Kpis({ data, rows }: { data?: ReceivableList; rows: Row[] }) {
  const { t } = useI18n();
  const d = t.dashboard;
  const needAction = rows.filter((x) => matchesFilter(x.step.tone, "action")).length;
  const negotiating = rows.filter((x) => x.gate.current === 3).length;
  const portfolio = useCountUp(data?.totals.amountCents);
  const nAction = useCountUp(data ? needAction : null);
  const nNeg = useCountUp(data ? negotiating : null);
  const nAssigned = useCountUp(data?.totals.assignedCount);

  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-border bg-border lg:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-surface p-5">
            <Skeleton className="w-24" />
            <Skeleton className="mt-3 h-7 w-28" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-border bg-border lg:grid-cols-4" data-testid="kpis">
      <KpiCell dot="bg-ink" label={d.kpiPortfolio} value={formatMoney(portfolio ?? 0)} hint={t.common.receivables(data.totals.count)} />
      <KpiCell dot="bg-brand" label={d.kpiNeedAction} value={nAction} hint={d.kpiNeedActionHint} accent />
      <KpiCell dot="bg-amber" label={d.kpiNegotiating} value={nNeg} hint={d.kpiNegotiatingHint} />
      <KpiCell dot="bg-chain" label={d.kpiAssigned} value={nAssigned} hint={d.kpiAssignedHint} />
    </div>
  );
}

// ---------- Próximo passo ----------

function NextStepCell({ row, compact }: { row: Row; compact?: boolean }) {
  const { t } = useI18n();
  const { step, isNew } = row;
  if (step.tone === "done") {
    return <span className="whitespace-nowrap text-sm font-medium text-chain">{t.dashboard.viewPassport} ↗</span>;
  }
  if (step.tone === "waiting") {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-muted">
        <span className="h-2 w-2 shrink-0 rounded-full border-[1.5px] border-amber" aria-hidden />
        {step.label}
      </span>
    );
  }
  const bad = step.tone === "bad";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={cx(
          "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-200",
          bad ? "border-bad text-bad group-hover:bg-bad group-hover:text-white" : "border-brand text-brand group-hover:bg-brand group-hover:text-white",
          compact && "px-2 py-0.5",
        )}
      >
        → {step.label}
      </span>
      {isNew && <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-medium uppercase text-white">{t.dashboard.newBadge}</span>}
    </span>
  );
}

// ---------- Lista ----------

function ListView({ rows, total, filterKey }: { rows: Row[]; total: number; filterKey: string }) {
  const { t } = useI18n();
  const d = t.dashboard;
  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
      {/* Tabela (desktop) */}
      <table className="hidden w-full text-left text-sm lg:table">
        <thead className="border-b border-divider text-xs text-faint">
          <tr>
            <th scope="col" className="px-5 py-3 font-normal">{d.colCode}</th>
            <th scope="col" className="px-4 py-3 font-normal">{d.colDebtor}</th>
            <th scope="col" className="px-4 py-3 text-right font-normal">{d.colAmount}</th>
            <th scope="col" className="px-4 py-3 font-normal">{d.colDue}</th>
            <th scope="col" className="px-4 py-3 font-normal">{d.colGates}</th>
            <th scope="col" className="px-4 py-3 font-normal">{d.colNext}</th>
            <th scope="col" className="w-8 px-3 py-3"><span className="sr-only">{d.open}</span></th>
          </tr>
        </thead>
        <tbody key={filterKey}>
          {rows.map((row, i) => (
            <tr
              key={row.r.id}
              className="agf-rise group relative border-b border-divider transition-colors last:border-0 hover:bg-row focus-within:bg-row"
              style={{ animationDelay: `${i * 60}ms` }}
              data-testid="receivable-row"
            >
              <td className="whitespace-nowrap px-5 py-4">
                <Link href={`/recebiveis/${row.r.id}`} className="font-mono font-medium text-ink after:absolute after:inset-0 focus-visible:outline-none">
                  {row.r.reference}
                </Link>
                {row.r.risk && <span className="relative ml-2 align-middle"><RatingBadge rating={row.r.risk.rating} /></span>}
              </td>
              <td className="px-4 py-4">
                <span className="whitespace-nowrap">{row.r.debtor.alias}</span> <span className="text-faint">· {row.r.debtor.state}</span>
                <p className="text-xs text-muted">{t.status.product[row.r.product.category]}</p>
              </td>
              <td className="tnum whitespace-nowrap px-4 py-4 text-right">{formatMoney(row.r.amountCents)}</td>
              <td className="tnum whitespace-nowrap px-4 py-4 text-muted">{formatDate(row.r.dueDate)}</td>
              <td className="px-4 py-4"><GateTrail progress={row.gate} /></td>
              <td className="px-4 py-4"><NextStepCell row={row} /></td>
              <td className="px-3 py-4 text-faint transition-colors group-hover:text-ink"><ChevronRight className="h-4 w-4" strokeWidth={1.5} aria-hidden /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Cartões (celular e tablet) */}
      <ul className="divide-y divide-divider lg:hidden" key={`m-${filterKey}`}>
        {rows.map((row, i) => (
          <li key={row.r.id} className="agf-rise" style={{ animationDelay: `${i * 60}ms` }} data-testid="receivable-row">
            <Link href={`/recebiveis/${row.r.id}`} className="group block px-4 py-4 transition-colors hover:bg-row active:bg-row">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-medium">{row.r.reference}</span>
                <span className="tnum">{formatMoney(row.r.amountCents)}</span>
              </div>
              <p className="mt-1 text-sm text-muted">
                {row.r.debtor.alias} · {row.r.debtor.state} · {d.dueOn(formatDate(row.r.dueDate))}
              </p>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                <GateTrail progress={row.gate} />
                <NextStepCell row={row} compact />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {rows.length === 0 && <p className="px-5 py-10 text-center text-sm text-faint">{d.filterEmpty}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider px-5 py-3 text-xs text-faint">
        <span>{d.footerCount(rows.length, total)}</span>
        <span className="hidden sm:inline">{d.footerHint}</span>
      </div>
    </div>
  );
}

// ---------- Quadro (kanban por portão) ----------

function BoardView({ rows }: { rows: Row[] }) {
  const { t } = useI18n();
  const d = t.dashboard;
  const columns = t.gates.names.map((name, i) => ({
    name,
    items: rows.filter((x) => (x.gate.current ?? GATES - 1) === i),
  }));
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0" data-testid="board">
      <div className="grid min-w-[1000px] grid-cols-5 gap-3">
        {columns.map((col, i) => {
          const hot = col.items.some((x) => x.step.tone === "action");
          return (
            <section key={col.name} aria-label={col.name} className="min-w-0">
              <header className={cx("flex items-baseline gap-2 border-b pb-2", hot ? "border-brand" : "border-border")}>
                <span className="font-mono text-[11px] text-brand">{String(i + 1).padStart(2, "0")}</span>
                <span className="truncate text-sm font-medium">{col.name}</span>
                <span className="ml-auto font-mono text-[11px] text-faint">{col.items.length}</span>
              </header>
              <div className="mt-3 space-y-2">
                {col.items.length === 0 && (
                  <p className="rounded-[14px] border border-dashed border-border-strong px-3 py-6 text-center text-xs text-faint">{d.emptyColumn}</p>
                )}
                {col.items.map((row, j) => (
                  <Link
                    key={row.r.id}
                    href={`/recebiveis/${row.r.id}`}
                    className="agf-rise group block rounded-[14px] border border-border bg-surface p-3.5 transition-colors hover:border-brand"
                    style={{ animationDelay: `${j * 60}ms` }}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-medium text-ink">{row.r.reference}</span>
                      <span className="tnum text-faint">{formatDate(row.r.dueDate)}</span>
                    </div>
                    <p className="mt-1.5 truncate text-sm text-muted">{row.r.debtor.alias}</p>
                    <p className="big-num mt-1 text-lg">{formatMoney(row.r.amountCents)}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs">
                      <span
                        className={cx(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          row.step.tone === "action" ? "agf-pulse bg-brand" : row.step.tone === "bad" ? "bg-bad" : row.step.tone === "done" ? "bg-chain" : "bg-amber",
                        )}
                        aria-hidden
                      />
                      <span className={cx("truncate", row.step.tone === "action" ? "font-medium text-brand" : row.step.tone === "done" ? "text-chain" : "text-muted")}>
                        {row.step.tone === "done" ? d.viewPassport : row.step.label}
                      </span>
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Página ----------

function useNewOffers(items: ReceivableSummary[] | undefined) {
  // Lido do navegador depois de montar (o servidor não conhece o que a distribuidora já viu).
  const [seen, setSeen] = useState<Record<string, number>>({});
  useEffect(() => {
    if (items) setSeen(Object.fromEntries(items.map((i) => [i.id, offersSeen(i.id)])));
  }, [items]);
  return (r: ReceivableSummary) => r.status === "published" && r.offerCount > (seen[r.id] ?? r.offerCount);
}

function useView() {
  const [view, setView] = useState<"list" | "board">("list");
  useEffect(() => {
    try {
      if (window.localStorage.getItem(VIEW_KEY) === "board") setView("board");
    } catch {
      /* armazenamento indisponível */
    }
  }, []);
  const change = (v: "list" | "board") => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* armazenamento indisponível */
    }
  };
  return [view, change] as const;
}

export default function DistributorDashboard() {
  const { t } = useI18n();
  const d = t.dashboard;
  // v1.3: cada distribuidora demo vê só os próprios recebíveis.
  const { distributorId, distributorName } = useRole();
  const { state, reload } = useAsync(() => api.listReceivables(distributorId), [distributorId]);
  const data = state.data;
  const isNew = useNewOffers(data?.items);
  const [filter, setFilter] = useState<GateFilter>("all");
  const [view, setView] = useView();

  // A lista se atualiza sozinha (novas propostas, registros que confirmaram).
  useEffect(() => {
    const timer = setInterval(() => void reload(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const rows: Row[] = useMemo(
    () => (data?.items ?? []).map((r) => ({ r, step: nextStep(r, t), gate: gateProgress(r, t), isNew: isNew(r) })),
    [data, t, isNew],
  );
  const visible = rows.filter((x) => matchesFilter(x.step.tone, filter));
  const filters: { k: GateFilter; label: string }[] = [
    { k: "all", label: d.filterAll },
    { k: "action", label: d.filterAction },
    { k: "waiting", label: d.filterWaiting },
    { k: "assigned", label: d.filterAssigned },
  ];

  return (
    <>
      <PageHeader
        title={d.title}
        subtitle={d.subtitleFor(distributorName)}
        actions={
          <ButtonLink href="/recebiveis/novo">
            <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden /> {d.new}
          </ButtonLink>
        }
      />

      <div className="space-y-6">
        <Kpis data={data} rows={rows} />

        {state.status === "error" && !data && <ErrorState message={state.error.message} onRetry={() => reload()} title={d.loadError} />}
        {!data && state.status === "loading" && (
          <div className="rounded-[14px] border border-border bg-surface p-5" role="status">
            <span className="sr-only">{d.loadingList}</span>
            <Skeleton className="w-full" />
            <Skeleton className="mt-3 w-2/3" />
          </div>
        )}

        {data && data.items.length === 0 && (
          <EmptyState
            icon={<FileStack className="h-10 w-10" strokeWidth={1.25} aria-hidden />}
            title={d.emptyTitle}
            action={
              <ButtonLink href="/recebiveis/novo">
                <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden /> {d.emptyAction}
              </ButtonLink>
            }
          >
            {d.emptyText}
          </EmptyState>
        )}

        {data && data.items.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div role="group" aria-label={d.filterLabel} className="flex flex-wrap gap-2">
                {filters.map((f) => {
                  const n = rows.filter((x) => matchesFilter(x.step.tone, f.k)).length;
                  const on = filter === f.k;
                  return (
                    <button
                      key={f.k}
                      type="button"
                      onClick={() => setFilter(f.k)}
                      aria-pressed={on}
                      className={cx(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors duration-[250ms]",
                        on ? "border-ink bg-ink text-white" : "border-border bg-surface text-muted hover:border-ink hover:text-ink",
                      )}
                      data-testid={`filter-${f.k}`}
                    >
                      {f.label}
                      <span className={cx("font-mono text-[11px]", on ? "text-white/70" : "text-faint")}>{n}</span>
                    </button>
                  );
                })}
              </div>
              <div className="ml-auto flex items-center gap-4">
                <p className="hidden font-mono text-[11px] uppercase text-faint xl:block" aria-hidden>
                  {t.gates.names.map((g, i) => `${String(i + 1).padStart(2, "0")} ${g}`).join(" · ")}
                </p>
                <div role="group" aria-label={d.viewLabel} className="inline-flex rounded-[10px] border border-border bg-surface p-0.5">
                  {(["list", "board"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      aria-pressed={view === v}
                      className={cx("rounded-lg px-3 py-1 text-xs font-medium transition-colors", view === v ? "bg-ink text-white" : "text-muted hover:text-ink")}
                      data-testid={`view-${v}`}
                    >
                      {v === "list" ? d.viewList : d.viewBoard}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {view === "list" ? <ListView rows={visible} total={rows.length} filterKey={filter} /> : <BoardView rows={visible} />}
          </>
        )}
      </div>
    </>
  );
}
