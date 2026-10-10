"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatMoney, formatRateBps } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { INTERACTIVE_FUNDER_ID } from "@/lib/labels";
import { useAsync } from "@/lib/useAsync";
import type { PortfolioItem } from "@/lib/types";
import { Badge, ButtonLink, Card, CardTitle, EmptyState, ErrorState, ExplorerLink, LoadingBlock, PageHeader } from "@/components/ui";
import { domainOf, RefDateSlider, toMs, YieldChart, type YieldPosition } from "@/components/YieldChart";

const position = (i: PortfolioItem): YieldPosition => ({
  paidCents: i.paidAmountCents,
  faceCents: i.faceAmountCents,
  startMs: toMs(i.settledAt ?? new Date().toISOString()),
  endMs: toMs(i.dueDate),
});

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}

export default function PortfolioPage() {
  const { t } = useI18n();
  const f = t.funder;
  const { state, reload } = useAsync(() => api.getPortfolio(INTERACTIVE_FUNDER_ID));
  const data = state.data;
  const settled = useMemo(() => (data?.items ?? []).filter((i) => i.status === "settled"), [data]);
  const positions = useMemo(() => settled.map(position), [settled]);
  const [refMs, setRefMs] = useState(() => Date.now());

  const settling = data?.items.some((i) => i.status === "settling");
  useEffect(() => {
    if (!settling) return;
    const timer = setInterval(() => void reload(true), 3000);
    return () => clearInterval(timer);
  }, [settling, reload]);

  return (
    <>
      <PageHeader title={f.portfolioTitle} subtitle={f.portfolioSubtitle} />
      <div className="space-y-6">
        {!data && state.status === "loading" && <Card><LoadingBlock lines={4} /></Card>}
        {!data && state.status === "error" && <ErrorState message={state.error.message} onRetry={() => reload()} />}

        {data && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={f.invested} value={formatMoney(data.totals.paidAmountCents)} />
            <Kpi label={f.faceTotal} value={formatMoney(data.totals.faceAmountCents)} />
            <Kpi label={f.income} value={formatMoney(data.totals.projectedIncomeCents)} />
            <Kpi label={f.count} value={data.totals.count} />
          </div>
        )}

        {data && data.items.length === 0 && (
          <EmptyState icon={<Wallet className="h-10 w-10" aria-hidden />} title={f.portfolioEmpty} action={<ButtonLink href="/financiador">{t.shell.navMarket}</ButtonLink>}>
            {f.portfolioEmptyHint}
          </EmptyState>
        )}

        {positions.length > 0 && (
          <Card>
            <CardTitle>{positions.length > 1 ? f.chartPortfolio : f.chartTitle}</CardTitle>
            <YieldChart positions={positions} refMs={refMs} title={f.chartPortfolio} />
            <div className="mt-5">
              <RefDateSlider domain={domainOf(positions)} value={refMs} onChange={setRefMs} />
            </div>
          </Card>
        )}

        {data && data.items.length > 0 && (
          <ul className="grid gap-4 lg:grid-cols-2" data-testid="portfolio-list">
            {data.items.map((i) => (
              <li key={i.receivableId}>
                <Card>
                  <CardTitle
                    aside={
                      i.status === "settled" ? (
                        <Badge tone="sim">{f.settled}</Badge>
                      ) : (
                        <Badge tone="warn" icon={<Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}>{f.settling}</Badge>
                      )
                    }
                  >
                    {i.reference}
                  </CardTitle>
                  <p className="text-sm text-muted">
                    {t.status.product[i.product.category]} — {i.product.description} · {i.debtorState} · {f.registry} {i.registryId ?? "—"}
                  </p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div><dt className="text-xs uppercase text-faint">{f.paid}</dt><dd className="font-semibold tabular-nums">{formatMoney(i.paidAmountCents)}</dd></div>
                    <div><dt className="text-xs uppercase text-faint">{f.face}</dt><dd className="font-semibold tabular-nums">{formatMoney(i.faceAmountCents)}</dd></div>
                    <div><dt className="text-xs uppercase text-faint">{t.proposals.rate}</dt><dd className="tabular-nums">{formatRateBps(i.monthlyRateBps)}</dd></div>
                    <div><dt className="text-xs uppercase text-faint">{f.dueOn}</dt><dd className="tabular-nums">{formatDate(i.dueDate)}</dd></div>
                  </dl>
                  {i.status === "settled" && (
                    <div className="mt-4">
                      <YieldChart positions={[position(i)]} refMs={refMs} title={`${f.chartTitle} ${i.reference}`} />
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-4">
                    {i.explorerUrls.tokenMint && <ExplorerLink href={i.explorerUrls.tokenMint}>{f.viewToken}</ExplorerLink>}
                    {i.explorerUrls.settlement && <ExplorerLink href={i.explorerUrls.settlement}>{f.viewSettlement}</ExplorerLink>}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
