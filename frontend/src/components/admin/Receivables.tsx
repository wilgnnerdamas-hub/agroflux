"use client";

import Link from "next/link";
import { useState } from "react";
import { Search, X } from "lucide-react";
import { api, toApiError } from "@/lib/api";
import { formatBps, formatDate, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { nextStep } from "@/lib/nextStep";
import type { AdminReceivableRow } from "@/lib/types";
import { cx } from "@/components/ui";
import { RatingBadge } from "@/components/RiskCard";
import { GateDots, gatesDone, stageOf, useLoad, type StageGroup } from "./shared";

export type ReceivableFilter = "all" | "waiting" | "assigned" | "failed";

function Situation({ r, onRetry, busy }: { r: AdminReceivableRow; onRetry: () => void; busy: boolean }) {
  const { t } = useI18n();
  const a = t.admin;
  if (r.status === "assigned") return <span className="whitespace-nowrap text-sm text-brand">✓ {a.settledOk}</span>;
  if (r.status === "assignment_failed") {
    return (
      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        className="relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-terra-line px-2.5 py-1 text-xs font-medium text-terra transition-colors hover:bg-terra-fill hover:text-white disabled:opacity-60"
        data-testid={`retry-${r.reference}`}
      >
        ↻ {busy ? a.retrying : a.retryAssign}
      </button>
    );
  }
  const step = nextStep({ status: r.status, debtorConfirmation: { status: r.debtorConfirmation?.status ?? "none" }, offerCount: r.offerCount }, t);
  return (
    <span className="block">
      <span className="inline-flex items-center gap-2 text-sm text-ink">
        <span className="h-2 w-2 shrink-0 rounded-full border-[1.5px] border-amber" aria-hidden />
        {step.label}
      </span>
      <span className="block pl-4 text-[11px] text-faint">{a.awaitingDistributor}</span>
    </span>
  );
}

function Accepted({ r }: { r: AdminReceivableRow }) {
  const { t } = useI18n();
  if (!r.acceptedOffer) return <span className="text-empty">—</span>;
  return (
    <span className="block whitespace-nowrap text-sm">
      {r.acceptedOffer.funderName}
      {r.acceptedOffer.annualRateBps != null && <span className="block text-[11px] text-faint">{formatBps(r.acceptedOffer.annualRateBps)} {t.pricing.perYear}</span>}
    </span>
  );
}

export function Receivables({ filter, stage, onFilter }: { filter: ReceivableFilter; stage: StageGroup | null; onFilter: (f: ReceivableFilter, stage?: StageGroup | null) => void }) {
  const { t, errorMessage } = useI18n();
  const a = t.admin;
  const { view, reload } = useLoad(() => api.adminReceivables());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const retry = async (r: AdminReceivableRow) => {
    setBusy(r.id);
    setError(null);
    try {
      await api.requestAssignment(r.id, crypto.randomUUID());
      await reload(true);
    } catch (e) {
      setError(errorMessage(toApiError(e)));
    } finally {
      setBusy(null);
    }
  };

  return view((d) => {
    const is = (r: AdminReceivableRow, f: ReceivableFilter) =>
      f === "all" ? true : f === "assigned" ? r.status === "assigned" : f === "failed" ? r.status === "assignment_failed" : r.status !== "assigned" && r.status !== "assignment_failed";
    const term = q.trim().toLowerCase();
    const rows = d.items.filter(
      (r) =>
        is(r, filter) &&
        (!stage || stageOf(r.status) === stage) &&
        (!term || [r.reference, r.distributor.name, r.debtor.alias].some((v) => v.toLowerCase().includes(term))),
    );
    const filters: { k: ReceivableFilter; label: string }[] = [
      { k: "all", label: a.filters.all },
      { k: "waiting", label: a.filters.waiting },
      { k: "assigned", label: a.filters.assigned },
      { k: "failed", label: a.filters.failed },
    ];
    const gateLegend = t.gates.names.map((g, i) => `${String(i + 1).padStart(2, "0")} ${g}`).join(" · ");

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label={a.filters.label} className="flex flex-wrap gap-2">
            {filters.map((f) => {
              const on = filter === f.k && !stage;
              return (
                <button
                  key={f.k}
                  type="button"
                  onClick={() => onFilter(f.k, null)}
                  aria-pressed={on}
                  className={cx(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors duration-[250ms]",
                    on ? "border-ink bg-ink text-white" : "border-border bg-surface text-muted hover:border-ink hover:text-ink",
                  )}
                  data-testid={`admin-filter-${f.k}`}
                >
                  {f.label}
                  <span className={cx("font-mono text-[11px]", on ? "text-white/70" : "text-faint")}>{d.items.filter((r) => is(r, f.k)).length}</span>
                </button>
              );
            })}
            {stage && (
              <button
                type="button"
                onClick={() => onFilter("all", null)}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink bg-ink px-3 py-1.5 text-sm text-white"
                aria-label={`${a.stageChip(a.stages[stage])} — ${a.clearFilter}`}
              >
                {a.stageChip(a.stages[stage])} <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
          <label className="relative ml-auto w-full sm:w-[280px]">
            <span className="sr-only">{a.searchLabel}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" strokeWidth={1.5} aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={a.searchPlaceholder}
              className="agf-input h-10 w-full rounded-[10px] border border-border bg-surface pl-9 pr-3 text-sm placeholder:text-empty"
              data-testid="admin-search"
            />
          </label>
        </div>

        {error && <p className="rounded-[10px] border border-terra-line bg-terra-soft px-4 py-3 text-sm text-terra" role="alert">{error}</p>}

        <div className="overflow-hidden rounded-[14px] border border-border bg-surface" data-testid="admin-receivables">
          <table className="hidden w-full text-left text-sm min-[1000px]:table">
            <thead className="border-b border-divider text-xs text-faint">
              <tr>
                <th scope="col" className="px-5 py-3 font-normal">{a.colReceivable}</th>
                <th scope="col" className="px-3 py-3 font-normal">{t.dashboard.colDebtor}</th>
                <th scope="col" className="px-3 py-3 text-right font-normal">{t.dashboard.colAmount}</th>
                <th scope="col" className="px-3 py-3 font-normal">{t.dashboard.colDue}</th>
                <th scope="col" className="px-3 py-3 font-normal">{t.risk.rating}</th>
                <th scope="col" className="px-3 py-3 font-normal">{a.colGates}</th>
                <th scope="col" className="px-3 py-3 font-normal">{a.colSituation}</th>
                <th scope="col" className="px-5 py-3 font-normal">{a.accepted}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const failed = r.status === "assignment_failed";
                return (
                  <tr
                    key={r.id}
                    className={cx("agf-rise border-b border-divider transition-colors last:border-0 hover:bg-row", failed && "bg-[#fffcfa]")}
                    style={{ animationDelay: `${i * 35}ms` }}
                    data-testid="admin-row"
                  >
                    <td className="px-5 py-3.5">
                      <Link href={`/recebiveis/${r.id}`} className="font-mono font-medium hover:underline">{r.reference}</Link>
                      <span className="block text-xs text-muted">{r.distributor.name}</span>
                    </td>
                    <td className="px-3 py-3.5">{r.debtor.alias} <span className="text-faint">· {r.debtor.state}</span></td>
                    <td className="tnum whitespace-nowrap px-3 py-3.5 text-right">{formatMoney(r.amountCents)}</td>
                    <td className="tnum whitespace-nowrap px-3 py-3.5 text-muted">{formatDate(r.dueDate)}</td>
                    <td className="px-3 py-3.5"><RatingBadge rating={r.rating} score={r.score} /></td>
                    <td className="px-3 py-3.5"><GateDots done={gatesDone(r)} failed={failed} /></td>
                    <td className="px-3 py-3.5"><Situation r={r} onRetry={() => void retry(r)} busy={busy === r.id} /></td>
                    <td className="px-5 py-3.5"><Accepted r={r} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <ul className="divide-y divide-divider min-[1000px]:hidden">
            {rows.map((r, i) => {
              const failed = r.status === "assignment_failed";
              return (
                <li key={r.id} className={cx("agf-rise space-y-2 px-4 py-4", failed && "bg-[#fffcfa]")} style={{ animationDelay: `${i * 35}ms` }} data-testid="admin-row">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/recebiveis/${r.id}`} className="font-mono font-medium">{r.reference}</Link>
                    <span className="tnum">{formatMoney(r.amountCents)}</span>
                  </div>
                  <p className="text-xs text-muted">{r.distributor.name} · {r.debtor.alias} · {r.debtor.state} · {formatDate(r.dueDate)}</p>
                  <div className="flex flex-wrap items-center gap-3">
                    <RatingBadge rating={r.rating} score={r.score} />
                    <GateDots done={gatesDone(r)} failed={failed} />
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <Situation r={r} onRetry={() => void retry(r)} busy={busy === r.id} />
                    <Accepted r={r} />
                  </div>
                </li>
              );
            })}
          </ul>

          {rows.length === 0 && <p className="px-5 py-10 text-center text-sm text-faint">{a.noResults}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider px-5 py-3 text-xs text-faint">
            <span>{a.footerCount(rows.length, d.items.length)}</span>
            <span className="hidden font-mono text-[11px] uppercase xl:inline" aria-hidden>{gateLegend}</span>
          </div>
        </div>
      </div>
    );
  });
}
