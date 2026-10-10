"use client";

import Link from "next/link";
import { ChevronRight, FileStack, Plus, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { FEATURE_ASSIGNMENT } from "@/lib/features";
import { formatDate, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useAsync } from "@/lib/useAsync";
import type { ReceivableList } from "@/lib/types";
import { Button, ButtonLink, EmptyState, ErrorState, PageHeader, Skeleton, cx } from "@/components/ui";
import { DebtorConfirmationBadge, ReceivableStatusBadge } from "@/components/status";

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const KPI_COUNT = FEATURE_ASSIGNMENT ? 6 : 5;
const KPI_COLS = FEATURE_ASSIGNMENT ? "lg:grid-cols-6" : "lg:grid-cols-5";

function KpiRow({ data }: { data?: ReceivableList }) {
  const { t } = useI18n();
  if (!data) {
    return (
      <div className={cx("grid grid-cols-2 gap-3 sm:grid-cols-3", KPI_COLS)} aria-hidden>
        {Array.from({ length: KPI_COUNT }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-4">
            <Skeleton className="w-20" />
            <Skeleton className="mt-3 h-7 w-24" />
          </div>
        ))}
      </div>
    );
  }
  const s = data.totals;
  const d = t.dashboard;
  return (
    <div className={cx("grid grid-cols-2 gap-3 sm:grid-cols-3", KPI_COLS)}>
      <Kpi label={d.kpiPortfolio} value={formatMoney(s.amountCents)} hint={t.common.receivables(s.count)} />
      <Kpi label={d.kpiRegistered} value={s.registeredCount} hint={s.pendingCount ? d.kpiRegistering(s.pendingCount) : undefined} />
      <Kpi label={d.kpiAccepted} value={s.debtorConfirmedCount} hint={d.simulated} />
      <Kpi label={d.kpiPublished} value={s.publishedCount ?? 0} />
      {/* Cessões liquidadas também passaram pelo aceite de proposta. */}
      <Kpi label={d.kpiProposal} value={s.offerSelectedCount + s.assignedCount} />
      {FEATURE_ASSIGNMENT && <Kpi label={d.kpiAssigned} value={s.assignedCount} hint={d.noValue} />}
    </div>
  );
}

function ListSkeleton() {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-border bg-surface" role="status" aria-live="polite">
      <span className="sr-only">{t.dashboard.loadingList}</span>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border p-4 last:border-0">
          <Skeleton className="w-20" />
          <Skeleton className="w-40" />
          <Skeleton className="ml-auto w-24" />
        </div>
      ))}
    </div>
  );
}

export default function DistributorDashboard() {
  const { t } = useI18n();
  const d = t.dashboard;
  const { state, reload } = useAsync(() => api.listReceivables());
  const data = state.data;

  return (
    <>
      <PageHeader
        title={d.title}
        subtitle={d.subtitle}
        actions={
          <>
            <Button variant="secondary" onClick={() => reload(true)} loading={state.status === "loading" && !!data}>
              <RefreshCw className="h-4 w-4" aria-hidden /> {t.common.refresh}
            </Button>
            <ButtonLink href="/recebiveis/novo">
              <Plus className="h-4 w-4" aria-hidden /> {d.new}
            </ButtonLink>
          </>
        }
      />

      <div className="space-y-6">
        <KpiRow data={data} />

        {state.status === "error" && !data && <ErrorState message={state.error.message} onRetry={() => reload()} title={d.loadError} />}
        {state.status === "error" && data && <ErrorState message={state.error.message} onRetry={() => reload(true)} title={d.staleError} />}
        {!data && state.status === "loading" && <ListSkeleton />}

        {data && data.items.length === 0 && (
          <EmptyState
            icon={<FileStack className="h-10 w-10" aria-hidden />}
            title={d.emptyTitle}
            action={
              <ButtonLink href="/recebiveis/novo">
                <Plus className="h-4 w-4" aria-hidden /> {d.emptyAction}
              </ButtonLink>
            }
          >
            {d.emptyText}
          </EmptyState>
        )}

        {data && data.items.length > 0 && (
          <>
            <div className="hidden overflow-hidden rounded-xl border border-border bg-surface md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-subtle text-xs uppercase tracking-wide text-faint">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">{d.colCode}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{d.colDebtor}</th>
                    <th scope="col" className="hidden px-4 py-3 font-medium 2xl:table-cell">{d.colProduct}</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">{d.colAmount}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{d.colDue}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{d.colStatus}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{d.colAcceptance}</th>
                    <th scope="col" className="w-8 px-2 py-3"><span className="sr-only">{d.open}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.id} className="group relative border-b border-border last:border-0 hover:bg-subtle/60">
                      <td className="whitespace-nowrap px-4 py-3 font-semibold">
                        <Link href={`/recebiveis/${r.id}`} className="after:absolute after:inset-0">{r.reference}</Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {r.debtor.alias} <span className="text-faint">· {r.debtor.state}</span>
                      </td>
                      <td className="hidden px-4 py-3 text-muted 2xl:table-cell">{t.status.product[r.product.category]}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">{formatMoney(r.amountCents)}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatDate(r.dueDate)}</td>
                      <td className="px-4 py-3"><ReceivableStatusBadge status={r.status} /></td>
                      <td className="px-4 py-3"><DebtorConfirmationBadge status={r.debtorConfirmation.status} short /></td>
                      <td className="px-2 py-3 text-faint group-hover:text-ink"><ChevronRight className="h-4 w-4" aria-hidden /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 md:hidden">
              {data.items.map((r) => (
                <li key={r.id}>
                  <Link href={`/recebiveis/${r.id}`} className="block rounded-xl border border-border bg-surface p-4 active:bg-subtle">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{r.reference}</span>
                      <span className="font-semibold tabular-nums">{formatMoney(r.amountCents)}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {r.debtor.alias} · {r.debtor.state} · {t.status.product[r.product.category]} · {d.dueOn(formatDate(r.dueDate))}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ReceivableStatusBadge status={r.status} />
                      {r.debtorConfirmation.status !== "none" && <DebtorConfirmationBadge status={r.debtorConfirmation.status} />}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
