"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronRight, Clock, FileStack, Plus, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { FEATURE_ASSIGNMENT } from "@/lib/features";
import { formatDate, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { nextStep, type NextStep } from "@/lib/nextStep";
import { useAsync } from "@/lib/useAsync";
import type { ReceivableList, ReceivableSummary } from "@/lib/types";
import { ButtonLink, EmptyState, ErrorState, PageHeader, Skeleton, cx } from "@/components/ui";
import { offersSeen } from "@/components/passport/ProposalsPanel";

const REFRESH_MS = 6000;

function Kpi({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint?: string; accent?: boolean }) {
  return (
    <div className={cx("rounded-xl border bg-surface p-4", accent ? "border-brand/40" : "border-border")}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cx("mt-1 text-2xl font-bold tabular-nums", accent ? "text-brand" : "text-ink")}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}

/** Próximo passo como texto com ícone: verde quando é com a distribuidora, cinza quando espera, vermelho na falha. */
function StepPill({ step }: { step: NextStep }) {
  const icon =
    step.tone === "action" ? <ArrowRight className="h-3.5 w-3.5" aria-hidden /> :
    step.tone === "done" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> :
    step.tone === "bad" ? <XCircle className="h-3.5 w-3.5" aria-hidden /> :
    <Clock className="h-3.5 w-3.5" aria-hidden />;
  const cls = { action: "bg-brand text-white", done: "bg-ok-soft text-ok", bad: "bg-bad-soft text-bad", waiting: "bg-subtle text-muted" }[step.tone];
  return <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", cls)}>{icon}{step.label}</span>;
}

function useNewOffers(items: ReceivableSummary[] | undefined) {
  // Lido do navegador depois de montar (o servidor não conhece o que a distribuidora já viu).
  const [seen, setSeen] = useState<Record<string, number>>({});
  useEffect(() => {
    if (items) setSeen(Object.fromEntries(items.map((i) => [i.id, offersSeen(i.id)])));
  }, [items]);
  return (r: ReceivableSummary) => r.status === "published" && r.offerCount > (seen[r.id] ?? r.offerCount);
}

function KpiRow({ data }: { data?: ReceivableList }) {
  const { t } = useI18n();
  const d = t.dashboard;
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-4">
            <Skeleton className="w-20" />
            <Skeleton className="mt-3 h-7 w-24" />
          </div>
        ))}
      </div>
    );
  }
  const s = data.totals;
  const needAction = data.items.filter((r) => nextStep(r, t).tone !== "waiting" && nextStep(r, t).tone !== "done").length;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label={d.kpiPortfolio} value={formatMoney(s.amountCents)} hint={t.common.receivables(s.count)} />
      <Kpi label={d.kpiNeedAction} value={needAction} accent={needAction > 0} />
      <Kpi label={d.kpiNegotiating} value={s.publishedCount ?? 0} />
      {FEATURE_ASSIGNMENT ? <Kpi label={d.kpiAssigned} value={s.assignedCount} /> : <Kpi label={d.kpiProposal} value={s.offerSelectedCount + s.assignedCount} />}
    </div>
  );
}

export default function DistributorDashboard() {
  const { t } = useI18n();
  const d = t.dashboard;
  const { state, reload } = useAsync(() => api.listReceivables());
  const data = state.data;
  const isNew = useNewOffers(data?.items);

  // A lista se atualiza sozinha (novas propostas, registros que confirmaram).
  useEffect(() => {
    const timer = setInterval(() => void reload(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const proposals = (r: ReceivableSummary) =>
    r.offerCount > 0 ? (
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        {r.offerCount}
        {isNew(r) && <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">{d.newBadge}</span>}
      </span>
    ) : (
      <span className="text-faint">—</span>
    );

  return (
    <>
      <PageHeader
        title={d.title}
        actions={
          <ButtonLink href="/recebiveis/novo">
            <Plus className="h-4 w-4" aria-hidden /> {d.new}
          </ButtonLink>
        }
      />

      <div className="space-y-6">
        <KpiRow data={data} />

        {state.status === "error" && !data && <ErrorState message={state.error.message} onRetry={() => reload()} title={d.loadError} />}
        {!data && state.status === "loading" && (
          <div className="rounded-xl border border-border bg-surface p-4" role="status">
            <span className="sr-only">{d.loadingList}</span>
            <Skeleton className="w-full" />
            <Skeleton className="mt-3 w-2/3" />
          </div>
        )}

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
                <thead className="border-b border-border text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">{d.colCode}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{d.colDebtor}</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">{d.colAmount}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{d.colDue}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{d.colNext}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{d.colProposals}</th>
                    <th scope="col" className="w-8 px-2 py-3"><span className="sr-only">{d.open}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.id} className="group relative border-b border-border last:border-0 hover:bg-subtle/60" data-testid="receivable-row">
                      <td className="whitespace-nowrap px-4 py-3 font-semibold">
                        <Link href={`/recebiveis/${r.id}`} className="after:absolute after:inset-0">{r.reference}</Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {r.debtor.alias} <span className="text-faint">· {r.debtor.state}</span>
                        <p className="text-xs text-muted">{t.status.product[r.product.category]}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">{formatMoney(r.amountCents)}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatDate(r.dueDate)}</td>
                      <td className="px-4 py-3"><StepPill step={nextStep(r, t)} /></td>
                      <td className="px-4 py-3">{proposals(r)}</td>
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
                      {r.debtor.alias} · {r.debtor.state} · {d.dueOn(formatDate(r.dueDate))}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <StepPill step={nextStep(r, t)} />
                      {r.offerCount > 0 && <span className="text-xs text-muted">{d.colProposals}: {proposals(r)}</span>}
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
