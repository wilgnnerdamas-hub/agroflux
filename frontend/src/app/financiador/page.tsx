"use client";

import Link from "next/link";
import { ArrowRight, Inbox, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import { formatBps, formatDate, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useRole } from "@/lib/role";
import { useAsync } from "@/lib/useAsync";
import { useEffect } from "react";
import { Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui";
import { RatingBadge } from "@/components/RiskCard";

const POLL_MS = 8000;

export default function MarketplacePage() {
  const { t } = useI18n();
  const f = t.funder;
  const { funderId, funderName } = useRole();
  const { state, reload } = useAsync(() => api.getMarketplace(funderId), [funderId]);
  const data = state.data;

  // Novos recebíveis publicados aparecem sozinhos.
  useEffect(() => {
    const timer = setInterval(() => void reload(true), POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  return (
    <>
      <PageHeader title={f.marketTitle} subtitle={f.marketSubtitleFor(funderName)} />
      <div className="space-y-5">

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
                      <p className="flex items-center gap-2 font-semibold">
                        {r.reference}
                        {r.risk && <RatingBadge rating={r.risk.rating} score={r.risk.score} />}
                      </p>
                      <p className="text-lg font-bold tabular-nums">{formatMoney(r.amountCents)}</p>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {r.distributor.name} · {t.status.product[r.product.category]} · {r.debtor.state} · {t.dashboard.dueOn(formatDate(r.dueDate))} · {t.common.days(r.termDays)}
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      {it.debtorAccepted && (
                        <span className="inline-flex items-center gap-1 text-ok"><UserCheck className="h-3.5 w-3.5" aria-hidden /> {f.accepted}</span>
                      )}
                      <span>{f.proposals(it.offerCount)}</span>
                    </p>
                    <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-faint">{f.bestNet}</dt>
                        <dd className="mt-0.5 font-medium tabular-nums">
                          {it.bestOffer ? formatMoney(it.bestOffer.netAmountCents) : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-faint">{f.yourProposal}</dt>
                        <dd className="mt-0.5 font-medium tabular-nums">
                          {it.myOffer ? (
                            <>
                              {formatMoney(it.myOffer.netAmountCents)}
                              {it.myOffer.spreadBps != null && <span className="block text-xs font-normal text-muted">{t.pricing.cdiPlus(formatBps(it.myOffer.spreadBps))}</span>}
                            </>
                          ) : (
                            <span className="text-muted">{f.noProposal}</span>
                          )}
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
