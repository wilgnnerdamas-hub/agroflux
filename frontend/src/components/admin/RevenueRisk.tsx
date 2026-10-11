"use client";

import { api } from "@/lib/api";
import { formatBps, formatDateTime, formatMoney, shorten } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useIntro } from "@/lib/motion";
import { DISTRIBUTORS } from "@/lib/role";
import type { AdminRiskGroup, RevenueEntry } from "@/lib/types";
import { AddressPill, cx } from "@/components/ui";
import { RatingBadge, ratingBar } from "@/components/RiskCard";
import { FUNDER_NAMES, Panel, StatCell, StatGrid, addressUrl, formatPct, pct, txUrl, useLoad } from "./shared";

function monthLabel(month: string, locale: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(locale === "pt" ? "pt-BR" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function Revenue() {
  const { t, locale } = useI18n();
  const a = t.admin;
  const p = useIntro();
  const { view } = useLoad(() => api.adminRevenue());
  return view((d) => {
    const fee = d.totals.platformFeeCents;
    const reg = d.totals.registryFeeCents;
    const total = fee + reg;
    const feeShare = pct(fee, total);
    const months = d.byMonth.map((m) => m.month).sort().reverse();
    const latest = months[0];
    const avgFeeBps = (() => {
      const face = d.entries.reduce((s, e) => s + e.faceAmountCents, 0);
      return face ? Math.round((fee / face) * 10_000) : null;
    })();
    const registryUnit = d.totals.count ? Math.round(reg / d.totals.count) : 0;
    const groups = months.map((m) => ({
      month: m,
      entries: d.entries.filter((e) => e.settledAt.slice(0, 7) === m),
      totals: d.byMonth.find((x) => x.month === m)!,
    }));

    return (
      <div className="space-y-6">
        <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
          <StatGrid>
            <StatCell
              label={a.totalRevenue}
              value={<span className="text-[30px] sm:text-[34px]">{formatMoney(Math.round(total * p))}</span>}
              valueClass="text-brand"
              hint={latest ? a.entriesMonth(d.totals.count, monthLabel(latest, locale)) : a.entriesHint(0)}
            />
            <StatCell label={a.platformFee} value={formatMoney(Math.round(fee * p))} hint={avgFeeBps != null ? a.feeHint(formatBps(avgFeeBps)) : undefined} />
            <StatCell label={a.registryFee} value={formatMoney(Math.round(reg * p))} hint={d.totals.count ? a.registryHint(d.totals.count, formatMoney(registryUnit)) : undefined} />
            <div className="min-w-0 bg-chain-soft p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-chain">{a.treasury}</p>
              {d.treasuryWallet ? (
                <>
                  <div className="mt-3"><AddressPill value={d.treasuryWallet} short={shorten(d.treasuryWallet, 6, 6)} /></div>
                  <a href={addressUrl(d.treasuryWallet)} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-medium text-chain hover:underline">
                    {a.viewExplorer} ↗
                  </a>
                </>
              ) : (
                <p className="mt-3 text-sm text-empty">—</p>
              )}
            </div>
          </StatGrid>
        </div>

        {total > 0 && (
          <Panel title={a.composition} aside={a.compositionText(formatPct(feeShare, locale, 0), formatPct(1 - feeShare, locale, 0))}>
            <div className="flex h-2.5 gap-[3px]" aria-hidden>
              <span className="rounded-[3px] bg-brand" style={{ width: `${feeShare * 100 * p}%` }} />
              <span className="rounded-[3px] bg-green-pale" style={{ width: `${(1 - feeShare) * 100 * p}%` }} />
            </div>
            <p className="mt-3 flex gap-5 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-brand" aria-hidden /> {a.platformFee}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-green-pale" aria-hidden /> {a.registryFee}</span>
            </p>
          </Panel>
        )}

        <Panel title={a.entries} bodyClass="">
          {d.entries.length === 0 ? (
            <p className="px-5 py-8 text-sm text-faint">{a.noRevenue}</p>
          ) : (
            <>
              <table className="hidden w-full text-left text-sm min-[1000px]:table">
                <thead className="border-b border-divider text-xs text-faint">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-normal">{a.colReceivable}</th>
                    <th scope="col" className="px-3 py-3 font-normal">{a.distributor}</th>
                    <th scope="col" className="px-3 py-3 font-normal">{a.funder}</th>
                    <th scope="col" className="px-3 py-3 text-right font-normal">{a.colFace}</th>
                    <th scope="col" className="px-3 py-3 text-right font-normal">{a.platformFee}</th>
                    <th scope="col" className="px-3 py-3 text-right font-normal">{a.registryFee}</th>
                    <th scope="col" className="px-5 py-3 font-normal">{a.colChain}</th>
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.month}>
                    {g.entries.map((e, i) => <EntryRow key={e.id} e={e} i={i} />)}
                    <tr className="border-b border-divider bg-row font-medium last:border-0">
                      <td className="px-5 py-3" colSpan={3}>{a.monthTotal(monthLabel(g.month, locale))} <span className="font-normal text-faint">· {a.entriesHint(g.totals.count)}</span></td>
                      <td className="px-3 py-3" />
                      <td className="tnum px-3 py-3 text-right text-brand">{formatMoney(g.totals.platformFeeCents)}</td>
                      <td className="tnum px-3 py-3 text-right">{formatMoney(g.totals.registryFeeCents)}</td>
                      <td className="tnum px-5 py-3">{formatMoney(g.totals.platformFeeCents + g.totals.registryFeeCents)}</td>
                    </tr>
                  </tbody>
                ))}
              </table>
              <div className="min-[1000px]:hidden">
                {groups.map((g) => (
                  <div key={g.month}>
                    <ul className="divide-y divide-divider">
                      {g.entries.map((e) => (
                        <li key={e.id} className="space-y-1 px-4 py-3 text-sm" data-testid="revenue-entry">
                          <div className="flex justify-between gap-2"><span className="font-mono font-medium">{e.reference}</span><span className="tnum text-brand">{formatMoney(e.platformFeeCents)}</span></div>
                          <p className="text-xs text-muted">{DISTRIBUTORS.find((x) => x.id === e.distributorId)?.name ?? e.distributorId} → {FUNDER_NAMES[e.funderId] ?? e.funderId}</p>
                          <a href={txUrl(e.settlementSignature)} target="_blank" rel="noreferrer" className="font-mono text-xs text-chain hover:underline">{shorten(e.settlementSignature, 6, 4)} ↗</a>
                        </li>
                      ))}
                    </ul>
                    <p className="flex justify-between border-y border-divider bg-row px-4 py-3 text-sm font-medium">
                      <span>{a.monthTotal(monthLabel(g.month, locale))}</span>
                      <span className="tnum">{formatMoney(g.totals.platformFeeCents + g.totals.registryFeeCents)}</span>
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>
    );
  });
}

function EntryRow({ e, i }: { e: RevenueEntry; i: number }) {
  return (
    <tr className="agf-rise border-b border-divider hover:bg-row" style={{ animationDelay: `${i * 35}ms` }} data-testid="revenue-entry">
      <td className="px-5 py-3">
        <span className="font-mono font-medium">{e.reference}</span>
        <span className="block font-mono text-[11px] text-faint">{formatDateTime(e.settledAt)}</span>
      </td>
      <td className="px-3 py-3">{DISTRIBUTORS.find((x) => x.id === e.distributorId)?.name ?? e.distributorId}</td>
      <td className="px-3 py-3">{FUNDER_NAMES[e.funderId] ?? e.funderId}</td>
      <td className="tnum px-3 py-3 text-right">{formatMoney(e.faceAmountCents)}</td>
      <td className="tnum px-3 py-3 text-right text-brand">{formatMoney(e.platformFeeCents)}</td>
      <td className="tnum px-3 py-3 text-right">{formatMoney(e.registryFeeCents)}</td>
      <td className="px-5 py-3">
        <a href={txUrl(e.settlementSignature)} target="_blank" rel="noreferrer" className="font-mono text-xs text-chain hover:underline">{shorten(e.settlementSignature, 6, 4)} ↗</a>
      </td>
    </tr>
  );
}

function Concentration({ title, rows, label }: { title: string; rows: AdminRiskGroup[]; label?: (k: string) => string }) {
  const { t, locale } = useI18n();
  const p = useIntro();
  const total = rows.reduce((s, r) => s + r.amountCents, 0) || 1;
  return (
    <Panel title={title} aside={t.admin.ofPortfolioHead}>
      <ul className="space-y-3 text-sm">
        {rows.slice(0, 6).map((r) => (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">{label ? label(r.key) : r.key} <span className="text-xs text-faint">· {formatMoney(r.amountCents)}</span></span>
              <span className="font-mono text-xs">{formatPct(r.amountCents / total, locale, 0)}</span>
            </div>
            <span className="mt-1.5 block h-0.5 bg-divider" aria-hidden>
              <span className="block h-0.5 bg-brand" style={{ width: `${(r.amountCents / total) * 100 * p}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function Risk() {
  const { t, locale } = useI18n();
  const a = t.admin;
  const p = useIntro();
  const { view } = useLoad(() => api.adminRisk());
  return view((d) => {
    const topDebtor = d.byDebtor[0];
    const topState = d.byState[0];
    const portfolio = d.portfolioCents || 1;
    return (
      <div className="space-y-6">
        <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
          <StatGrid>
            <StatCell dot="bg-ink" label={a.portfolio} value={formatMoney(Math.round(d.portfolioCents * p))} />
            <StatCell dot="bg-amber" label={t.risk.el} value={formatMoney(Math.round(d.expectedLossCents * p))} hint={a.elOfPortfolio(formatPct(pct(d.expectedLossCents, d.portfolioCents), locale, 2))} />
            <StatCell label={a.topDebtorCell} value={topDebtor ? formatPct(topDebtor.amountCents / portfolio, locale, 0) : "—"} hint={topDebtor?.key} />
            <StatCell label={a.topState} value={topState ? formatPct(topState.amountCents / portfolio, locale, 0) : "—"} hint={topState?.key} />
          </StatGrid>
        </div>

        <Panel title={a.elByRating} aside={a.fadedNote} bodyClass="">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-divider text-xs text-faint">
                <tr>
                  <th scope="col" className="px-5 py-3 font-normal">{t.risk.rating}</th>
                  <th scope="col" className="px-3 py-3 text-right font-normal">{a.count}</th>
                  <th scope="col" className="px-3 py-3 text-right font-normal">{a.volume}</th>
                  <th scope="col" className="px-3 py-3 font-normal">{a.share}</th>
                  <th scope="col" className="px-3 py-3 text-right font-normal">{t.risk.el}</th>
                  <th scope="col" className="px-3 py-3 text-right font-normal">{a.pdCol}</th>
                  <th scope="col" className="px-5 py-3 text-right font-normal">{a.spreadCol}</th>
                </tr>
              </thead>
              <tbody>
                {d.ratings.map((r) => {
                  const share = r.amountCents / portfolio;
                  return (
                    <tr key={r.rating} className={cx("border-b border-divider last:border-0", r.count === 0 && "opacity-50")}>
                      <td className="px-5 py-2.5"><RatingBadge rating={r.rating} /></td>
                      <td className="tnum px-3 py-2.5 text-right">{r.count}</td>
                      <td className="tnum px-3 py-2.5 text-right">{formatMoney(r.amountCents)}</td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="h-1 w-24 rounded-full bg-divider" aria-hidden>
                            <span className={cx("block h-1 rounded-full", ratingBar(r.rating))} style={{ width: `${share * 100 * p}%` }} />
                          </span>
                          <span className="font-mono text-xs">{formatPct(share, locale, 0)}</span>
                        </span>
                      </td>
                      <td className="tnum px-3 py-2.5 text-right">{formatMoney(r.expectedLossCents)}</td>
                      <td className="tnum px-3 py-2.5 text-right">{formatBps(r.pdAnnualBps)}</td>
                      <td className="tnum px-5 py-2.5 text-right">{formatBps(r.spreadBps)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-3">
          <Concentration title={a.byDebtor} rows={d.byDebtor} />
          <Concentration title={a.byState} rows={d.byState} />
          <Concentration title={a.byCategory} rows={d.byCategory} label={(k) => t.status.product[k as keyof typeof t.status.product] ?? k} />
        </div>
      </div>
    );
  });
}
