"use client";

import { useId } from "react";
import { formatDate, formatMoney, formatMoneyCompact } from "@/lib/format";
import { businessDaysBetween } from "@/lib/calendar";
import { useI18n } from "@/lib/i18n";
import { InfoTip } from "./ui";

const DAY = 86_400_000;
export const toMs = (isoOrDate: string) => (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate) ? Date.parse(`${isoOrDate}T12:00:00Z`) : Date.parse(isoOrDate));
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface YieldPosition {
  paidCents: number;
  faceCents: number;
  startMs: number; // liquidação
  endMs: number; // vencimento
}

/**
 * Projeção simulada (contrato v1.3, §15.1): cresce do valor pago até o valor de face no vencimento,
 * em juros compostos pela taxa implícita, contando dias úteis. Antes da liquidação vale 0; depois do vencimento, o valor de face.
 */
export function valueAt(p: YieldPosition, t: number): number {
  if (t < p.startMs) return 0;
  if (t >= p.endMs || p.endMs <= p.startMs) return p.faceCents;
  // v1.3: o valor cresce por dias úteis (base 252), como no cálculo do backend.
  const total = businessDaysBetween(isoDay(p.startMs), isoDay(p.endMs));
  const f = total > 0 ? businessDaysBetween(isoDay(p.startMs), isoDay(t)) / total : (t - p.startMs) / (p.endMs - p.startMs);
  return p.paidCents * Math.pow(p.faceCents / p.paidCents, f);
}

export const portfolioValueAt = (ps: YieldPosition[], t: number) => ps.reduce((s, p) => s + valueAt(p, t), 0);

export function domainOf(ps: YieldPosition[]): [number, number] {
  return [Math.min(...ps.map((p) => p.startMs)), Math.max(...ps.map((p) => p.endMs))];
}

const W = 640;
const H = 240;
const PAD = { l: 84, r: 16, t: 20, b: 32 };
const SAMPLES = 80;

/**
 * Gráfico com a curva do valor no tempo. A área sob a curva é sombreada com dois tons:
 * forte até a data de referência ("hoje", já acumulado) e clara e tracejada depois (projetado).
 */
export function YieldChart({ positions, refMs, title }: { positions: YieldPosition[]; refMs: number; title: string }) {
  const { t } = useI18n();
  const uid = useId().replace(/:/g, "");
  if (!positions.length) return null;
  const [t0, t1] = domainOf(positions);
  const span = Math.max(t1 - t0, DAY);
  const v0 = portfolioValueAt(positions, t0);
  const v1 = portfolioValueAt(positions, t1);
  const gap = Math.max(v1 - v0, 1);
  const yMin = Math.max(0, v0 - gap * 0.35);
  const yMax = v1 + gap * 0.12;
  const x = (ms: number) => PAD.l + ((ms - t0) / span) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const ref = Math.min(Math.max(refMs, t0), t1);
  const baseY = H - PAD.b;

  const sample = (from: number, to: number) => {
    const pts: [number, number][] = [];
    const n = Math.max(2, Math.round((SAMPLES * (to - from)) / span));
    for (let i = 0; i <= n; i++) {
      const ms = from + ((to - from) * i) / n;
      pts.push([x(ms), y(portfolioValueAt(positions, ms))]);
    }
    return pts;
  };
  const line = (pts: [number, number][]) => pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const area = (pts: [number, number][]) => `${line(pts)} L${pts.at(-1)![0].toFixed(1)},${baseY} L${pts[0][0].toFixed(1)},${baseY} Z`;

  const past = sample(t0, ref);
  const future = sample(ref, t1);
  const refValue = portfolioValueAt(positions, ref);
  const refIsToday = Math.abs(ref - Date.now()) < DAY / 2;
  const refLabel = refIsToday ? t.funder.today : formatDate(isoDay(ref));
  const labelRight = x(ref) < W - 150;

  return (
    <figure className="w-full" data-testid="yield-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}. ${t.funder.valueAt(refLabel)}: ${formatMoney(Math.round(refValue))}`}>
        <defs>
          <pattern id={`hatch-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-brand)" strokeOpacity="0.18" strokeWidth="2" />
          </pattern>
        </defs>

        {/* Eixo Y: valor pago e valor de face. */}
        {[v0, v1].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--color-border)" strokeDasharray="3 4" />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="fill-[var(--color-muted)] text-[11px]">{formatMoneyCompact(v)}</text>
          </g>
        ))}

        {/* Área: acumulado (forte) e projetado (claro + hachura). */}
        <path d={area(future)} fill="var(--color-brand)" fillOpacity="0.07" />
        <path d={area(future)} fill={`url(#hatch-${uid})`} />
        <path d={area(past)} fill="var(--color-brand)" fillOpacity="0.28" />
        <path d={line(future)} fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeDasharray="6 5" />
        <path d={line(past)} fill="none" stroke="var(--color-brand)" strokeWidth="2.5" />

        {/* Linha da data de referência. */}
        <line x1={x(ref)} x2={x(ref)} y1={PAD.t - 6} y2={baseY} stroke="var(--color-ink)" strokeWidth="1.5" />
        <circle cx={x(ref)} cy={y(refValue)} r="4.5" fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth="2" />
        <text x={x(ref) + (labelRight ? 8 : -8)} y={PAD.t + 6} textAnchor={labelRight ? "start" : "end"} className="fill-[var(--color-ink)] text-[12px] font-semibold">
          {refLabel} · {formatMoney(Math.round(refValue))}
        </text>

        {/* Eixo X: liquidação e vencimento. */}
        <line x1={PAD.l} x2={W - PAD.r} y1={baseY} y2={baseY} stroke="var(--color-border-strong)" />
        <text x={PAD.l} y={H - 10} className="fill-[var(--color-muted)] text-[11px]">{formatDate(isoDay(t0))}</text>
        <text x={W - PAD.r} y={H - 10} textAnchor="end" className="fill-[var(--color-muted)] text-[11px]">{formatDate(isoDay(t1))}</text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-brand/30" aria-hidden /> {t.funder.realized}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm border border-dashed border-brand bg-brand/5" aria-hidden /> {t.funder.projected}</span>
        <InfoTip>{t.funder.chartNote}</InfoTip>
      </figcaption>
    </figure>
  );
}

/** Controle da data de referência (move a linha "Hoje" para ver a projeção em outra data). */
export function RefDateSlider({ domain, value, onChange }: { domain: [number, number]; value: number; onChange: (ms: number) => void }) {
  const { t } = useI18n();
  const id = useId();
  const [t0, t1] = domain;
  const days = Math.max(1, Math.round((t1 - t0) / DAY));
  const current = Math.round((Math.min(Math.max(value, t0), t1) - t0) / DAY);
  return (
    <div>
      <label htmlFor={id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm font-medium">
        <span>{t.funder.refDate}</span>
        <span className="tabular-nums text-muted">{formatDate(isoDay(t0 + current * DAY))}</span>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={days}
        value={current}
        onChange={(e) => onChange(t0 + Number(e.target.value) * DAY)}
        className="mt-2 w-full accent-[var(--color-brand)]"
        data-testid="ref-date"
      />
      <p className="mt-1 text-xs text-muted">{t.funder.refHint}</p>
    </div>
  );
}
