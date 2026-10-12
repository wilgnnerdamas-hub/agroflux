"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatBps, formatDate, formatMoney, formatRateBps } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { INTERACTIVE_FUNDER_ID } from "@/lib/labels";
import { prefersReducedMotion } from "@/lib/motion";
import { useAsync } from "@/lib/useAsync";
import type { PortfolioItem } from "@/lib/types";
import { ErrorState, LoadingBlock, PageHeader, cx } from "@/components/ui";
import { toMs } from "@/components/YieldChart";
import { DAY, MiniCurve, PortfolioCurve, isoDay, scopeValueAt, type CurvePosition } from "@/components/PortfolioCurve";

const toPosition = (i: PortfolioItem): CurvePosition => ({
  reference: i.reference,
  paidCents: i.paidAmountCents,
  faceCents: i.faceAmountCents,
  startMs: toMs(i.settledAt ?? new Date().toISOString()),
  endMs: toMs(i.dueDate),
});

/** 0 → 1 em ~1,1 s ao montar (ease-out cúbico): os números do painel contam até o valor. */
function useIntro() {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setP(1);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 1100);
      setP(1 - Math.pow(1 - k, 3));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return p;
}

function StatRow({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-divider py-2.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className={cx("tnum", green ? "text-brand" : "text-ink")}>{value}</dd>
    </div>
  );
}

function TermTrack({ item, today }: { item: PortfolioItem; today: number }) {
  const { t } = useI18n();
  const start = toMs(item.settledAt ?? new Date().toISOString());
  const end = toMs(item.dueDate);
  const frac = end > start ? Math.min(1, Math.max(0, (today - start) / (end - start))) : 1;
  const left = Math.max(0, Math.ceil((end - today) / DAY));
  return (
    <div className="min-w-[120px]">
      <span className="relative block h-2" aria-hidden>
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        <span className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-brand" style={{ width: `${frac * 100}%` }} />
        <span className="absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand" style={{ left: `${frac * 100}%` }} />
      </span>
      <p className="mt-1.5 text-xs text-muted">
        {t.funder.daysLeft(left)} · <span className="font-mono">{formatDate(item.dueDate)}</span>
      </p>
    </div>
  );
}

function Rate({ item }: { item: PortfolioItem }) {
  const { t } = useI18n();
  if (item.annualRateBps == null) return <>{formatRateBps(item.monthlyRateBps)}</>;
  return (
    <>
      {formatBps(item.annualRateBps)} <span className="text-faint">{t.pricing.perYear}</span>
    </>
  );
}

function ChainLinks({ item }: { item: PortfolioItem }) {
  const { t } = useI18n();
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
      {item.explorerUrls.tokenMint && (
        <a href={item.explorerUrls.tokenMint} target="_blank" rel="noreferrer" onClick={stop} onKeyDown={stop} className="font-medium text-chain hover:underline">
          {t.funder.viewToken} ↗
        </a>
      )}
      {item.explorerUrls.settlement && (
        <a href={item.explorerUrls.settlement} target="_blank" rel="noreferrer" onClick={stop} onKeyDown={stop} className="font-medium text-chain hover:underline">
          {t.funder.viewSettlement} ↗
        </a>
      )}
    </span>
  );
}

function Portfolio() {
  const { t, locale } = useI18n();
  const f = t.funder;
  const lc = locale === "pt" ? "pt-BR" : "en-US";
  const router = useRouter();
  const pathname = usePathname();
  const pos = useSearchParams().get("pos");
  const { state, reload } = useAsync(() => api.getPortfolio(INTERACTIVE_FUNDER_ID));
  const data = state.data;
  const items = useMemo(() => data?.items ?? [], [data]);
  // Na curva, só as posições em aberto (as pagas no vencimento já viraram caixa).
  const settled = useMemo(() => items.filter((i) => i.status === "settled" && !i.maturityPayment), [items]);
  const [today] = useState(() => Date.now());
  const [pointMs, setPointMs] = useState<number | null>(null);
  const intro = useIntro();

  const settling = items.some((i) => i.status === "settling");
  useEffect(() => {
    if (!settling) return;
    const timer = setInterval(() => void reload(true), 3000);
    return () => clearInterval(timer);
  }, [settling, reload]);

  // Escopo: carteira toda ou uma posição (?pos=AGF-0009, para compartilhar e manter ao recarregar).
  const selected = settled.find((i) => i.reference === pos) ?? null;
  const select = (ref: string | null) => {
    setPointMs(null);
    router.replace(ref ? `${pathname}?pos=${encodeURIComponent(ref)}` : pathname, { scroll: false });
  };
  const scopeItems = useMemo(() => (selected ? [selected] : settled), [selected, settled]);
  const positions = useMemo(() => scopeItems.map(toPosition), [scopeItems]);

  const paid = scopeItems.reduce((s, i) => s + i.paidAmountCents, 0);
  const face = scopeItems.reduce((s, i) => s + i.faceAmountCents, 0);
  const at = pointMs ?? today;
  const valueNow = positions.length ? scopeValueAt(positions, at) : 0;
  const accrued = Math.max(0, valueNow - paid);
  const totalPaid = settled.reduce((s, i) => s + i.paidAmountCents, 0);

  // Rendimento médio por dia corrido até o próximo vencimento do escopo.
  const nextDue = positions.filter((p) => p.endMs > today).map((p) => p.endMs).sort((a, b) => a - b)[0];
  const perDay = nextDue ? (scopeValueAt(positions, nextDue) - scopeValueAt(positions, today)) / Math.max(1, (nextDue - today) / DAY) : 0;

  const m = (cents: number) => formatMoney(Math.round(cents * intro));
  const scopeLabel = selected
    ? `${selected.reference} · ${selected.product.description}`
    : f.scopeAll(settled.length);

  return (
    <>
      <PageHeader title={f.portfolioTitle} subtitle={f.portfolioSubtitle} />
      <div className="space-y-10">
        {!data && state.status === "loading" && <div className="rounded-[14px] border border-border bg-surface p-6"><LoadingBlock lines={4} /></div>}
        {!data && state.status === "error" && <ErrorState message={state.error.message} onRetry={() => reload()} />}

        {data && items.length === 0 && (
          <div className="rounded-[14px] border border-dashed border-border-strong bg-surface px-6 py-14 text-center" data-testid="portfolio-empty">
            <p className="text-base font-medium">{f.emptyTitle}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">{f.portfolioEmptyHint}</p>
            <Link href="/financiador" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">{f.emptyLink} →</Link>
          </div>
        )}

        {settled.length > 0 && (
          <section className="grid overflow-hidden rounded-[14px] border border-border bg-surface min-[1000px]:grid-cols-[340px_1fr]" data-testid="portfolio-panel">
            {/* Números do escopo (mudam com a data apontada na curva). */}
            <div className="border-b border-divider p-6 min-[1000px]:border-b-0 min-[1000px]:border-r">
              <p className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-brand" data-testid="scope-label">{scopeLabel}</p>
              <p className="mt-5 text-[13px] text-muted" data-testid="value-label">{pointMs == null ? f.valueToday : f.valueAt(formatDate(isoDay(at)))}</p>
              <p className="big-num mt-1 text-[40px] leading-none tracking-[-0.035em]">{m(valueNow)}</p>
              <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-brand">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden /> {f.incomeTag(m(accrued))}
              </p>
              <dl className="mt-6">
                {selected ? (
                  <>
                    <StatRow label={f.paid} value={m(paid)} />
                    <StatRow label={f.receiveAtDue} value={m(face)} />
                    <StatRow label={f.income} value={m(face - paid)} green />
                    <StatRow label={f.share} value={`${(totalPaid ? (paid / totalPaid) * 100 * intro : 0).toLocaleString(lc, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`} />
                  </>
                ) : (
                  <>
                    <StatRow label={f.invested} value={m(paid)} />
                    <StatRow label={f.faceTotal} value={m(face)} />
                    <StatRow label={f.income} value={m(face - paid)} green />
                    <StatRow label={f.receivablesCount} value={String(Math.round(settled.length * intro))} />
                  </>
                )}
              </dl>
              <p className="mt-4 text-xs text-faint">
                {selected ? f.perDayOne(formatMoney(Math.round(perDay)), formatDate(selected.dueDate)) : f.perDayAll(formatMoney(Math.round(perDay)))}
              </p>
            </div>

            {/* Curva. */}
            <div className="min-w-0 p-6">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div role="group" aria-label={f.scopeGroup} className="-mx-1 flex w-full min-w-0 gap-2 overflow-x-auto px-1 pb-1 sm:w-auto sm:flex-1 min-[1000px]:flex-wrap min-[1000px]:overflow-visible [scrollbar-width:none]">
                  {[null, ...settled.map((i) => i.reference)].map((ref) => {
                    const on = (selected?.reference ?? null) === ref;
                    return (
                      <button
                        key={ref ?? "all"}
                        type="button"
                        onClick={() => select(ref)}
                        aria-pressed={on}
                        className={cx(
                          "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors duration-[250ms]",
                          ref && "font-mono",
                          on ? "border-ink bg-ink text-white" : "border-border bg-surface text-muted hover:border-ink hover:text-ink",
                        )}
                        data-testid={`scope-${ref ?? "all"}`}
                      >
                        {ref ?? f.scopeAllChip}
                      </button>
                    );
                  })}
                </div>
                <p className="flex w-full items-center gap-4 text-xs text-faint sm:w-auto">
                  <span className="inline-flex items-center gap-1.5"><span className="h-px w-5 bg-brand" aria-hidden /> {f.legendAccrued}</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t border-dashed border-brand" aria-hidden /> {f.legendProjected}</span>
                </p>
              </div>
              <PortfolioCurve
                positions={positions}
                today={today}
                pointMs={pointMs}
                onPoint={setPointMs}
                showMaturities={!selected && positions.length > 1}
                scopeKey={selected?.reference ?? "all"}
                scopeLabel={scopeLabel}
              />
            </div>
          </section>
        )}

        {items.length > 0 && (
          <section aria-labelledby="positions">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="positions" className="text-lg font-medium">{f.positions}</h2>
              <p className="text-xs text-faint">{f.positionsHint(items.length)}</p>
            </div>
            <div className="overflow-hidden rounded-[14px] border border-border bg-surface" data-testid="portfolio-list">
              <table className="hidden w-full text-left text-sm min-[1000px]:table">
                <thead className="border-b border-divider text-xs text-faint">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-normal">{f.colReceivable}</th>
                    <th scope="col" className="px-4 py-3 text-right font-normal">{f.paid}</th>
                    <th scope="col" className="px-4 py-3 text-right font-normal">{f.face}</th>
                    <th scope="col" className="px-4 py-3 font-normal">{f.colRate}</th>
                    <th scope="col" className="px-4 py-3 font-normal">{f.colTerm}</th>
                    <th scope="col" className="px-5 py-3 font-normal">{f.colChain}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i, n) => {
                    const on = selected?.receivableId === i.receivableId;
                    const can = i.status === "settled" && !i.maturityPayment;
                    const toggle = () => can && select(on ? null : i.reference);
                    return (
                      <tr
                        key={i.receivableId}
                        tabIndex={can ? 0 : -1}
                        aria-pressed={can ? on : undefined}
                        onClick={toggle}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggle();
                          }
                        }}
                        className={cx(
                          "agf-rise border-b border-divider transition-colors last:border-0 focus-visible:outline-2 focus-visible:-outline-offset-2",
                          can && "cursor-pointer hover:bg-brand-softer",
                          on && "bg-brand-softer",
                        )}
                        style={{ animationDelay: `${n * 60}ms` }}
                        data-testid={`position-${i.reference}`}
                      >
                        <td className="px-5 py-4">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-medium">{i.reference}</span>
                            {i.maturityPayment ? (
                              <span className="rounded-full bg-chain-soft px-2 py-0.5 text-[11px] font-medium text-chain">{t.maturity.paidChip}</span>
                            ) : can ? (
                              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">{f.settled}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-soft px-2 py-0.5 text-[11px] font-medium text-amber-ink">
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> {f.settling}
                              </span>
                            )}
                            <span className={cx("inline-flex items-center gap-1 text-[11px] text-brand transition-opacity duration-300", on ? "opacity-100" : "opacity-0")} aria-hidden={!on}>
                              <MiniCurve /> {f.onCurve}
                            </span>
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {i.product.description} · {i.debtorState} · <span className="font-mono">{i.registryId ?? "—"}</span>
                          </p>
                          {i.maturityPayment && (
                            <p className="mt-1 text-xs text-chain">
                              {t.maturity.received(formatMoney(i.maturityPayment.amount), i.maturityPayment.paidAt ? formatDate(i.maturityPayment.paidAt.slice(0, 10)) : "—")}
                            </p>
                          )}
                        </td>
                        <td className="tnum whitespace-nowrap px-4 py-4 text-right">{formatMoney(i.paidAmountCents)}</td>
                        <td className="tnum whitespace-nowrap px-4 py-4 text-right">{formatMoney(i.faceAmountCents)}</td>
                        <td className="tnum whitespace-nowrap px-4 py-4"><Rate item={i} /></td>
                        <td className="px-4 py-4"><TermTrack item={i} today={today} /></td>
                        <td className="px-5 py-4"><ChainLinks item={i} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Cartões (celular e tablet). */}
              <ul className="divide-y divide-divider min-[1000px]:hidden">
                {items.map((i, n) => {
                  const on = selected?.receivableId === i.receivableId;
                  const can = i.status === "settled" && !i.maturityPayment;
                  return (
                    <li key={i.receivableId} className="agf-rise" style={{ animationDelay: `${n * 60}ms` }}>
                      <div
                        role="button"
                        tabIndex={can ? 0 : -1}
                        aria-pressed={can ? on : undefined}
                        onClick={() => can && select(on ? null : i.reference)}
                        onKeyDown={(e) => {
                          if (can && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            select(on ? null : i.reference);
                          }
                        }}
                        className={cx("block px-4 py-4 transition-colors", can && "cursor-pointer hover:bg-brand-softer", on && "bg-brand-softer")}
                      >
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-medium">{i.reference}</span>
                          <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", can ? "bg-brand-soft text-brand" : "bg-amber-soft text-amber-ink")}>
                            {can ? f.settled : f.settling}
                          </span>
                          {on && <span className="inline-flex items-center gap-1 text-[11px] text-brand"><MiniCurve /> {f.onCurve}</span>}
                        </p>
                        <p className="mt-1 text-xs text-muted">{i.product.description} · {i.debtorState}</p>
                        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <div><dt className="text-xs text-faint">{f.paid}</dt><dd className="tnum">{formatMoney(i.paidAmountCents)}</dd></div>
                          <div><dt className="text-xs text-faint">{f.face}</dt><dd className="tnum">{formatMoney(i.faceAmountCents)}</dd></div>
                          <div><dt className="text-xs text-faint">{f.colRate}</dt><dd className="tnum"><Rate item={i} /></dd></div>
                        </dl>
                        <div className="mt-3"><TermTrack item={i} today={today} /></div>
                        <div className="mt-3"><ChainLinks item={i} /></div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

export default function PortfolioPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Portfolio />
    </Suspense>
  );
}
