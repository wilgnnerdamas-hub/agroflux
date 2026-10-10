"use client";

import Link from "next/link";
import { ArrowRight, Inbox, RefreshCw, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatMoney, formatRateBps } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { INTERACTIVE_FUNDER_ID } from "@/lib/labels";
import { useAsync } from "@/lib/useAsync";
import { useEffect } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui";
import { SimulationBanner } from "@/components/passport/ProposalsPanel";

const POLL_MS = 8000;

export default function MarketplacePage() {
  const { t } = useI18n();
  const f = t.funder;
  const { state, reload } = useAsync(() => api.getMarketplace(INTERACTIVE_FUNDER_ID));
  const data = state.data;

  // Novos recebíveis publicados aparecem sozinhos.
  useEffect(() => {
    const timer = setInterval(() => void reload(true), POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  return (
    <>
      <PageHeader
        title={f.marketTitle}
        subtitle={f.marketSubtitle}
        actions={
          <Button variant="secondary" onClick={() => reload(true)}>
            <RefreshCw className="h-4 w-4" aria-hidden /> {t.common.refresh}
          </Button>
        }
      />
      <div className="space-y-5">
        <p className="text-sm text-muted">{f.you}</p>
        <SimulationBanner title={t.common.simulation} text={data?.disclaimer || f.disclaimerFallback} />

        {!data && state.status === "loading" && <Card><LoadingBlock lines={4} /></Card>}
        {!data && state.status === "error" && <ErrorState message={state.error.message} onRetry={() => reload()} />}
        {data && data.items.length === 0 && (
          <EmptyState icon={<Inbox className="h-10 w-10" aria-hidden />} title={f.empty}>{f.emptyHint}</EmptyState>
        )}

        {data && data.items.length > 0 && (
          <ul className="grid gap-4 md:grid-cols-2" data-testid="market-list">
            {data.items.map((it) => {
              const r = it.receivable;
              return (
                <li key={r.id}>
                  <Link href={`/financiador/recebiveis/${r.id}`} className="group flex h-full flex-col rounded-xl border border-border bg-surface p-5 hover:border-brand">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{r.reference}</p>
                        <p className="text-xs text-muted">{f.registry} {it.registryId ?? "—"}</p>
                      </div>
                      <p className="text-lg font-bold tabular-nums">{formatMoney(r.amountCents)}</p>
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      {t.status.product[r.product.category]} — {r.product.description} · {r.debtor.state} · {t.dashboard.dueOn(formatDate(r.dueDate))} · {t.common.days(r.termDays)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {it.debtorAccepted && <Badge tone="ok" icon={<UserCheck className="h-3.5 w-3.5" aria-hidden />}>{f.accepted}</Badge>}
                      <Badge tone="sim">{f.proposals(it.offerCount)}</Badge>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-faint">{f.bestNet}</dt>
                        <dd className="mt-0.5 font-medium tabular-nums">
                          {it.bestOffer ? `${formatMoney(it.bestOffer.netAmountCents)} · ${formatRateBps(it.bestOffer.monthlyRateBps)}` : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-faint">{f.yourProposal}</dt>
                        <dd className="mt-0.5 font-medium tabular-nums">
                          {it.myOffer ? `${formatMoney(it.myOffer.netAmountCents)} · ${formatRateBps(it.myOffer.monthlyRateBps)}` : <span className="text-muted">{f.noProposal}</span>}
                        </dd>
                      </div>
                    </dl>
                    <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand">
                      {f.analyze} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
