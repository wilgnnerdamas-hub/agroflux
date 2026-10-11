"use client";

import { api } from "@/lib/api";
import { formatBps, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useIntro } from "@/lib/motion";
import { cx } from "@/components/ui";
import { HIGH_CONCENTRATION, addressUrl, formatPct, pct, useLoad } from "./shared";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-divider py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="tnum">{value}</dd>
    </div>
  );
}

export function Funders() {
  const { t } = useI18n();
  const a = t.admin;
  const p = useIntro();
  const { view } = useLoad(() => api.adminFunders());
  return view((d) => {
    const maxProposals = Math.max(1, ...d.items.map((f) => f.proposals));
    return (
      <div className="grid gap-4 md:grid-cols-2 min-[1000px]:grid-cols-3" data-testid="admin-funders">
        {d.items.map((f, i) => {
          const bars = [
            { k: a.proposals, v: f.proposals, c: "bg-step" },
            { k: a.acceptedCount, v: f.accepted, c: "bg-green-mid" },
            { k: a.bought, v: f.boughtCount, c: "bg-brand" },
          ];
          return (
            <article
              key={f.id}
              className="agf-rise rounded-[14px] border border-border bg-surface p-6 transition-colors hover:border-brand"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-medium">{f.name}</h3>
                  <p className="text-xs text-faint">{t.status.funderType[f.type]}</p>
                </div>
                {f.wallet && (
                  <a href={addressUrl(f.wallet)} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-medium text-chain hover:underline">
                    {a.wallet} ↗
                  </a>
                )}
              </div>
              <p className="mt-5 text-[13px] text-muted">{a.boughtVolume}</p>
              <p className="big-num mt-1 text-[28px] leading-none">{formatMoney(Math.round(f.boughtFaceCents * p))}</p>

              <p className="mt-6 text-xs text-faint">{a.funnelTitle}</p>
              <div className="mt-2 grid h-9 grid-cols-3 items-end gap-2 rounded-md bg-bg px-2" aria-hidden>
                {bars.map((b) => (
                  <span key={b.k} className={cx("block rounded-t-[2px]", b.c)} style={{ height: `${Math.max(b.v ? 2 : 0, (b.v / maxProposals) * 100 * p)}%` }} />
                ))}
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-2 text-center">
                {bars.map((b) => (
                  <p key={b.k} className="text-[11px] text-faint">
                    {b.k} <span className="block font-mono text-sm text-ink">{b.v}</span>
                  </p>
                ))}
              </div>

              <dl className="mt-4">
                <Row label={a.avgRateProposed} value={f.averageAnnualRateBps != null ? `${formatBps(f.averageAnnualRateBps)} ${t.pricing.perYear}` : "—"} />
                <Row label={a.avgYield} value={f.averageYieldAnnualBps != null ? `${formatBps(f.averageYieldAnnualBps)} ${t.pricing.perYear}` : "—"} />
                <Row
                  label={a.balanceShort}
                  value={f.settlementUnits != null ? <span className="font-mono">{formatMoney(f.settlementUnits).replace("R$", "").trim()} <span className="text-xs text-faint">tBRL</span></span> : "—"}
                />
              </dl>
            </article>
          );
        })}
      </div>
    );
  });
}

export function Distributors() {
  const { t, locale } = useI18n();
  const a = t.admin;
  const p = useIntro();
  const { view } = useLoad(() => api.adminDistributors());
  return view((d) => (
    <div className="grid gap-4 md:grid-cols-2 min-[1000px]:grid-cols-3" data-testid="admin-distributors">
      {d.items.map((x, i) => {
        const assignedShare = pct(x.assignedVolumeCents, x.volumeCents);
        const top = x.topDebtor ? x.topDebtor.shareBps / 10_000 : 0;
        const high = top > HIGH_CONCENTRATION;
        return (
          <article
            key={x.id}
            className="agf-rise rounded-[14px] border border-border bg-surface p-6 transition-colors hover:border-brand"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-medium">{x.name}</h3>
                <p className="text-xs text-faint">{t.common.receivables(x.receivables)}</p>
              </div>
              <p className="shrink-0 text-right text-xs text-faint">
                {a.avgCet} <span className="block font-mono text-sm text-ink">{x.averageCetAnnualBps != null ? formatBps(x.averageCetAnnualBps) : "—"}</span>
              </p>
            </div>
            <p className="mt-5 text-[13px] text-muted">{a.volume}</p>
            <p className="mt-1 flex items-baseline justify-between gap-3">
              <span className="big-num text-[28px] leading-none">{formatMoney(Math.round(x.volumeCents * p))}</span>
              <span className="text-sm text-brand">{a.assignedPct(formatPct(assignedShare, locale, 0))}</span>
            </p>
            <span className="mt-3 block h-1.5 rounded-full bg-subtle" aria-hidden>
              <span className="block h-1.5 rounded-full bg-brand" style={{ width: `${assignedShare * 100 * p}%` }} />
            </span>
            <p className="mt-2 text-xs text-faint">{a.assignedLine(formatMoney(x.assignedVolumeCents), x.assignedCount)}</p>

            <div className="mt-5 border-t border-divider pt-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs text-faint">{a.topDebtor}</p>
                {high && <span className="rounded-full border border-amber-line bg-amber-soft px-2 py-0.5 text-[11px] font-medium text-amber-text">{a.highConcentration}</span>}
              </div>
              {x.topDebtor ? (
                <>
                  <p className="mt-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{x.topDebtor.alias}</span>
                    <span className={cx("font-mono", high ? "text-amber-text" : "text-ink")}>{formatPct(top, locale, 0)}</span>
                  </p>
                  <span className="relative mt-2 block h-0.5 bg-border" aria-hidden>
                    <span className={cx("absolute inset-y-0 left-0", high ? "bg-amber" : "bg-brand")} style={{ width: `${top * 100 * p}%` }} />
                    <span className="absolute -top-1 h-2.5 w-px bg-faint" style={{ left: `${HIGH_CONCENTRATION * 100}%` }} />
                  </span>
                  <p className="mt-2 text-[11px] text-faint">{a.markHint(formatPct(HIGH_CONCENTRATION, locale, 0))}</p>
                </>
              ) : (
                <p className="mt-1 text-sm text-empty">—</p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  ));
}
