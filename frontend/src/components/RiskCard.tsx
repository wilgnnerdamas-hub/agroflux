"use client";

import { Gauge } from "lucide-react";
import { formatBps, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Rating, Risk } from "@/lib/types";
import { Card, CardTitle, Collapsible, InfoTip, cx } from "./ui";

// Cor do rating: verde nos melhores, âmbar no meio, vermelho nos piores.
export type RatingFamily = "good" | "watch" | "high";
export function ratingFamily(r: Rating): RatingFamily {
  return r === "AA" || r === "A" || r === "B" ? "good" : r === "C" || r === "D" ? "watch" : "high";
}

/** Cores por família de rating: AA–B verde, C–D âmbar, E–H terracota. */
export function ratingTone(r: Rating) {
  return { good: "bg-rate-soft text-brand border-rate-line", watch: "bg-amber-soft text-amber-text border-amber-line", high: "bg-terra-soft text-terra border-terra-line" }[ratingFamily(r)];
}

/** Cor de barra/coluna da família do rating. */
export function ratingBar(r: Rating) {
  return { good: "bg-brand", watch: "bg-amber", high: "bg-terra-fill" }[ratingFamily(r)];
}

export function RatingBadge({ rating, score, className }: { rating: Rating; score?: number; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-semibold", ratingTone(rating), className)} data-testid="rating-badge">
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
      <CardTitle
        icon={<Gauge className="h-4 w-4 text-muted" aria-hidden />}
        aside={<InfoTip>{risk.model ? k.hintModel(risk.model.auc.toLocaleString(locale === "pt" ? "pt-BR" : "en-US", { maximumFractionDigits: 2 })) : k.hint}</InfoTip>}
      >
        {k.title}
      </CardTitle>
      {risk.model && <p className="-mt-2 mb-4 font-mono text-[11px] uppercase tracking-[0.06em] text-faint" data-testid="risk-model-tag">{k.modelTag}</p>}
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
