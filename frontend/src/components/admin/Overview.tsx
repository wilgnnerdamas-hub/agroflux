"use client";

import { ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { formatBps, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useIntro } from "@/lib/motion";
import type { AdminOverview, AdminReceivableRow, Rating } from "@/lib/types";
import { cx } from "@/components/ui";
import { ratingBar, ratingFamily, ratingTone, type RatingFamily } from "@/components/RiskCard";
import { Panel, RATINGS, STAGES, StatCell, StatGrid, formatPct, pct, stageOf, useLoad, type StageGroup } from "./shared";

export type OpenReceivables = (filter: { status?: "failed"; stage?: StageGroup }) => void;

function Attention({ failed, onOpen }: { failed: AdminReceivableRow[]; onOpen: OpenReceivables }) {
  const { t } = useI18n();
  const a = t.admin;
  if (!failed.length) return null;
  return (
    <div className="agf-rise flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-amber-line bg-surface px-5 py-4" role="status" data-testid="attention">
      <span className="h-2 w-2 shrink-0 rounded-full bg-amber" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{a.attentionTitle(failed.length)}</p>
        <p className="text-sm text-muted">
          <span className="font-mono">{failed[0].reference}</span> · {a.attentionFailed}
          {failed.length > 1 && <span className="text-faint"> {a.attentionMore(failed.length - 1)}</span>}
        </p>
      </div>
      <button type="button" onClick={() => onOpen({ status: "failed" })} className="text-sm font-medium text-brand hover:underline">
        {a.viewReceivable} →
      </button>
    </div>
  );
}

function Numbers({ o, rows }: { o: AdminOverview; rows: AdminReceivableRow[] }) {
  const { t, locale } = useI18n();
  const a = t.admin;
  const p = useIntro();
  const assignedEl = rows.filter((r) => r.status === "assigned").reduce((s, r) => s + r.expectedLossCents, 0);
  const m = (c: number) => formatMoney(Math.round(c * p));
  const sub = [
    { k: a.avgTicket, v: o.averageTicketCents != null ? formatMoney(o.averageTicketCents) : "—" },
    { k: a.avgTerm, v: o.averageTermDays != null ? t.common.days(o.averageTermDays) : "—" },
    { k: a.avgRate, v: o.averageAnnualRateBps != null ? `${formatBps(o.averageAnnualRateBps)} ${t.pricing.perYear}` : "—" },
    { k: a.avgCet, v: o.averageCetAnnualBps != null ? `${formatBps(o.averageCetAnnualBps)} ${t.pricing.perYear}` : "—" },
  ];
  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-surface">
      <StatGrid>
        <StatCell dot="bg-ink" label={a.portfolio} value={m(o.portfolioCents)} hint={t.common.receivables(o.receivables)} />
        <StatCell dot="bg-chain" label={a.assigned} value={m(o.assignedVolumeCents)} hint={a.assignedHint(o.assignedCount, formatPct(pct(o.assignedVolumeCents, o.portfolioCents), locale, 0))} />
        <StatCell dot="bg-brand" label={a.revenue} value={m(o.revenueCents)} valueClass="text-brand" hint={a.entriesHint(o.assignedCount)} />
        <StatCell dot="bg-amber" label={a.expectedLoss} value={m(assignedEl)} hint={a.elHint(formatPct(pct(assignedEl, o.assignedVolumeCents), locale, 2))} />
      </StatGrid>
      <div className="grid grid-cols-1 gap-px border-t border-border bg-divider sm:grid-cols-2 lg:grid-cols-4">
        {sub.map((x) => (
          <div key={x.k} className="flex items-baseline justify-between gap-3 bg-row px-5 py-3">
            <span className="text-xs text-muted">{x.k}</span>
            <span className="tnum text-[15px]">{x.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Where({ rows, onOpen }: { rows: AdminReceivableRow[]; onOpen: OpenReceivables }) {
  const { t } = useI18n();
  const a = t.admin;
  const p = useIntro();
  const groups = STAGES.map((s) => {
    const items = rows.filter((r) => stageOf(r.status) === s.key);
    return { ...s, count: items.length, volume: items.reduce((x, r) => x + r.amountCents, 0) };
  });
  const total = rows.length || 1;
  return (
    <Panel title={a.whereTitle} aside={<span className="font-mono uppercase">{a.totalTag(rows.length)}</span>}>
      <div className="flex h-2.5 gap-[3px]" aria-hidden>
        {groups.filter((g) => g.count > 0).map((g) => (
          <span key={g.key} className={cx("rounded-[3px] transition-[width] duration-700", g.color)} style={{ width: `${(g.count / total) * 100 * p}%` }} />
        ))}
      </div>
      <ul className="mt-4 divide-y divide-divider" data-testid="stage-list">
        {groups.map((g) => (
          <li key={g.key}>
            <button
              type="button"
              onClick={() => onOpen(g.key === "failed" ? { status: "failed" } : { stage: g.key })}
              className="group flex w-full items-center gap-3 py-2.5 text-left text-sm transition-transform duration-200 hover:translate-x-1.5"
            >
              <span className={cx("h-2.5 w-2.5 shrink-0 rounded-sm", g.color)} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{a.stages[g.key]}</span>
              <span className="font-mono text-[11px] text-faint">{g.gate}</span>
              <span className="tnum hidden w-32 text-right text-muted sm:inline">{formatMoney(g.volume)}</span>
              <span className="tnum w-6 text-right font-medium">{g.count}</span>
              <ChevronRight className="h-4 w-4 text-faint group-hover:text-ink" strokeWidth={1.5} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function RatingMix({ o, rows }: { o: AdminOverview; rows: AdminReceivableRow[] }) {
  const { t } = useI18n();
  const a = t.admin;
  const p = useIntro();
  const max = Math.max(1, ...RATINGS.map((r) => o.ratingMix[r]));
  const families: { key: RatingFamily; label: string; dot: string }[] = [
    { key: "good", label: a.families.good, dot: "bg-brand" },
    { key: "watch", label: a.families.watch, dot: "bg-amber" },
    { key: "high", label: a.families.high, dot: "bg-terra-fill" },
  ];
  const famOf = (r: Rating) => ratingFamily(r);
  return (
    <Panel title={a.ratingMix}>
      <div data-testid="rating-mix">
        <div className="grid h-[150px] grid-cols-9 items-end gap-2" aria-hidden>
          {RATINGS.map((r) => (
            <div key={r} className="flex h-full flex-col items-center justify-end gap-1">
              <span className="font-mono text-[11px] text-muted">{o.ratingMix[r]}</span>
              <span className={cx("w-full max-w-[28px] rounded-t-[3px]", ratingBar(r), o.ratingMix[r] === 0 && "opacity-45")} style={{ height: `${Math.max(o.ratingMix[r] ? 4 : 1, (o.ratingMix[r] / max) * 118 * p)}px` }} />
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-9 gap-2">
          {RATINGS.map((r) => (
            <span key={r} className={cx("rounded-md border py-0.5 text-center font-mono text-[11px] font-semibold", ratingTone(r), o.ratingMix[r] === 0 && "opacity-45")}>{r}</span>
          ))}
        </div>
        <span className="sr-only">{RATINGS.map((r) => `${r}: ${o.ratingMix[r]}`).join(", ")}</span>
      </div>
      <ul className="mt-5 space-y-1.5 border-t border-divider pt-4 text-sm">
        {families.map((f) => {
          const items = rows.filter((r) => famOf(r.rating) === f.key);
          return (
            <li key={f.key} className="flex items-center gap-3">
              <span className={cx("h-2 w-2 rounded-full", f.dot)} aria-hidden />
              <span className="flex-1 font-mono text-xs">{f.label}</span>
              <span className="tnum text-muted">{formatMoney(items.reduce((s, r) => s + r.amountCents, 0))}</span>
              <span className="tnum w-6 text-right font-medium">{items.length}</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function Overview({ onOpen }: { onOpen: OpenReceivables }) {
  const { view: viewO } = useLoad(() => api.adminOverview());
  const { view: viewR } = useLoad(() => api.adminReceivables());
  return viewO((o) =>
    viewR((d) => (
      <div className="space-y-6">
        <Attention failed={d.items.filter((r) => r.status === "assignment_failed")} onOpen={onOpen} />
        <Numbers o={o} rows={d.items} />
        <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <Where rows={d.items} onOpen={onOpen} />
          <RatingMix o={o} rows={d.items} />
        </div>
      </div>
    )),
  );
}
