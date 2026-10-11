"use client";

import { Gauge } from "lucide-react";
import { formatBps, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Rating, Risk } from "@/lib/types";
import { Card, CardTitle, Collapsible, InfoTip, cx } from "./ui";

// Cor do rating: verde nos melhores, âmbar no meio, vermelho nos piores.
export function ratingTone(r: Rating) {
  if (r === "AA" || r === "A" || r === "B") return "bg-ok-soft text-ok border-ok/25";
  if (r === "C" || r === "D") return "bg-warn-soft text-warn border-warn/25";
  return "bg-bad-soft text-bad border-bad/25";
}

export function RatingBadge({ rating, score, className }: { rating: Rating; score?: number; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-bold", ratingTone(rating), className)} data-testid="rating-badge">
      {rating}
      {score != null && <span className="font-medium opacity-80">{score}</span>}
    </span>
  );
}

/** Risco do recebível (contrato v1.3, §15.2): resumo sempre visível, fatores recolhíveis. */
export function RiskCard({ risk, compact = false }: { risk: Risk; compact?: boolean }) {
  const { t, locale } = useI18n();
  const k = t.risk;
  const pct = (v: number) => `${(v * 100).toLocaleString(locale === "pt" ? "pt-BR" : "en-US", { maximumFractionDigits: 0 })}%`;
  const factors = [...risk.factors].sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const body = (
    <ul className="divide-y divide-border">
      {factors.map((f) => (
        <li key={f.key} className="flex items-start justify-between gap-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium text-ink">{locale === "pt" ? f.label : (k.factorLabels[f.key] ?? f.label)}</p>
            {locale === "pt" && <p className="text-xs text-muted">{f.detail}</p>}
          </div>
          <span className={cx("shrink-0 tabular-nums font-semibold", f.points > 0 ? "text-ok" : f.points < 0 ? "text-bad" : "text-muted")}>
            {f.points > 0 ? `+${f.points}` : f.points}
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <Card data-testid="risk-card">
      <CardTitle icon={<Gauge className="h-4 w-4 text-muted" aria-hidden />} aside={<InfoTip>{k.hint}</InfoTip>}>
        {k.title}
      </CardTitle>
      <div className="flex items-center gap-4">
        <span className={cx("flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border text-xl font-bold", ratingTone(risk.rating))}>{risk.rating}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted">{k.score}</span>
            <span className="font-semibold tabular-nums">{risk.score} / 1000</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-subtle" aria-hidden>
            <div className="h-2 rounded-full bg-brand" style={{ width: `${risk.score / 10}%` }} />
          </div>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-muted">{k.pd}</dt><dd className="font-semibold tabular-nums">{formatBps(risk.pdTermBps)}</dd></div>
        <div><dt className="text-xs text-muted">{k.lgd}</dt><dd className="font-semibold tabular-nums">{formatBps(risk.lgdBps, 0)}</dd></div>
        <div><dt className="text-xs text-muted">{k.el}</dt><dd className="font-semibold tabular-nums">{formatMoney(risk.expectedLossCents)}</dd></div>
        <div><dt className="text-xs text-muted">{k.spreadBase}</dt><dd className="font-semibold tabular-nums">{formatBps(risk.spreadBaseBps)} {t.pricing.perYear}</dd></div>
      </dl>
      <p className="mt-3 text-xs text-muted">
        {k.history}: {k.historyText(pct(risk.producerHistory.onTimeRate), risk.producerHistory.seasons, risk.producerHistory.maxDelayDays)}
      </p>
      <div className="mt-4">
        {compact ? (
          <Collapsible title={k.factors} className="border-dashed">{body}</Collapsible>
        ) : (
          <>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">{k.factors}</p>
            {body}
          </>
        )}
      </div>
    </Card>
  );
}
