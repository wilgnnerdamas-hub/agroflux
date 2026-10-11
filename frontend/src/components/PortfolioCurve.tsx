"use client";

// Curva de rendimento da carteira (ou de uma posição): SVG + requestAnimationFrame, sem biblioteca de gráfico.
// Hover, toque e teclado movem a data apontada; a página mostra os números dessa data.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { formatDate, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { prefersReducedMotion } from "@/lib/motion";
import type { YieldPosition } from "./YieldChart";
import { cx } from "./ui";

export const DAY = 86_400_000;
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface CurvePosition extends YieldPosition {
  reference: string;
}

/**
 * Valor da posição no dia d (dias corridos, curva contínua): pago × (face/pago)^(min(d, prazo)/prazo).
 * Antes da liquidação vale o pago; depois do vencimento, a face.
 */
export function curveValueAt(p: YieldPosition, ms: number): number {
  const term = p.endMs - p.startMs;
  if (term <= 0 || ms >= p.endMs) return p.faceCents;
  const d = Math.max(0, ms - p.startMs);
  return p.paidCents * Math.pow(p.faceCents / p.paidCents, Math.min(d, term) / term);
}

export const scopeValueAt = (ps: YieldPosition[], ms: number) => ps.reduce((s, p) => s + curveValueAt(p, ms), 0);

/** Domínio do eixo X: de hoje até o maior vencimento do escopo. */
export function curveDomain(ps: YieldPosition[], today: number): [number, number] {
  const end = Math.max(...ps.map((p) => p.endMs));
  return [today, Math.max(end, today + DAY)];
}

/** "R$ 63,0 mil": compacto com uma casa, para os rótulos das guias. */
export function moneyCompact1(cents: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL", notation: "compact", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(cents / 100);
}

const PAD_WIDE = { l: 4, r: 132, t: 18, b: 44 };
const PAD_NARROW = { l: 4, r: 8, t: 26, b: 44 };
const SAMPLES = 140;

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function PortfolioCurve({
  positions,
  today,
  pointMs,
  onPoint,
  showMaturities,
  scopeKey,
  scopeLabel,
}: {
  positions: CurvePosition[];
  today: number;
  pointMs: number | null;
  onPoint: (ms: number | null) => void;
  showMaturities: boolean;
  scopeKey: string;
  scopeLabel: string;
}) {
  const { t, locale } = useI18n();
  const f = t.funder;
  const lc = locale === "pt" ? "pt-BR" : "en-US";
  const uid = useId().replace(/:/g, "");
  const [box, { w, h }] = useSize<HTMLDivElement>();
  const narrow = w > 0 && w < 560;
  const PAD = narrow ? PAD_NARROW : PAD_WIDE;
  const [t0, t1] = curveDomain(positions, today);
  const yMin = positions.reduce((s, p) => s + p.paidCents, 0);
  const yMax = positions.reduce((s, p) => s + p.faceCents, 0);
  const plotW = Math.max(1, w - PAD.l - PAD.r);
  const plotH = Math.max(1, h - PAD.t - PAD.b);
  const x = (ms: number) => PAD.l + ((ms - t0) / (t1 - t0)) * plotW;
  const y = (v: number) => PAD.t + (1 - (v - yMin) / Math.max(1, yMax - yMin)) * plotH;
  const msAt = (px: number) => Math.min(t1, Math.max(t0, t0 + ((px - PAD.l) / plotW) * (t1 - t0)));

  // Desenho do trecho projetado a cada troca de escopo (~0,9 s, ease-out).
  const [draw, setDraw] = useState(1);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setDraw(1);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 900);
      setDraw(1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setDraw(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scopeKey]);

  const point = pointMs == null ? today : Math.min(t1, Math.max(t0, pointMs));
  const value = scopeValueAt(positions, point);

  const sample = (from: number, to: number) => {
    const n = Math.max(2, Math.round((SAMPLES * (to - from)) / (t1 - t0)));
    return Array.from({ length: n + 1 }, (_, i) => {
      const ms = from + ((to - from) * i) / n;
      return [x(ms), y(scopeValueAt(positions, ms))] as const;
    });
  };
  const path = (pts: readonly (readonly [number, number])[]) => pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const solid = sample(t0, point);
  const dashed = sample(point, t1);
  const baseY = y(yMin);
  const area = `${path(solid)} L${solid.at(-1)![0].toFixed(1)},${baseY.toFixed(1)} L${solid[0][0].toFixed(1)},${baseY.toFixed(1)} Z`;

  const maturities = showMaturities
    ? positions.filter((p) => p.endMs > t0 && p.endMs < t1).map((p) => ({ ref: p.reference, ms: p.endMs, v: scopeValueAt(positions, p.endMs) }))
    : [];
  const ticks = (narrow ? [0, 0.5, 1] : [0, 1 / 3, 2 / 3, 1]).map((k) => t0 + (t1 - t0) * k);
  const dateLabel = pointMs == null ? f.today : formatDate(isoDay(point));
  const aria = f.curveAria(scopeLabel, dateLabel, formatMoney(Math.round(value)));

  // Teclado: ←/→ 1 dia, Shift 7 dias, Home hoje, End fim.
  const onKey = (e: React.KeyboardEvent) => {
    const step = (e.shiftKey ? 7 : 1) * DAY;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = Math.min(t1, Math.max(t0, point + (e.key === "ArrowRight" ? step : -step)));
      onPoint(next <= t0 ? null : next);
    } else if (e.key === "Home") {
      e.preventDefault();
      onPoint(null);
    } else if (e.key === "End") {
      e.preventDefault();
      onPoint(t1);
    }
  };
  const fromEvent = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onPoint(msAt(e.clientX - r.left));
  };

  const px = x(point);
  const py = y(value);
  const flip = px > w - PAD.r - 150;
  const active = pointMs != null;

  return (
    <div>
      <div
        ref={box}
        className="relative h-[240px] cursor-crosshair select-none rounded-md outline-none min-[1000px]:h-[300px] focus-visible:ring-2 focus-visible:ring-brand/40"
        style={{ touchAction: "none" }}
        tabIndex={0}
        role="img"
        aria-label={aria}
        onKeyDown={onKey}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" || e.buttons) fromEvent(e);
        }}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          fromEvent(e);
        }}
        onPointerUp={(e) => {
          if (e.pointerType !== "mouse") onPoint(null);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") onPoint(null);
        }}
        onPointerCancel={() => onPoint(null)}
        data-testid="yield-chart"
      >
        {w > 0 && h > 0 && (
          <svg width={w} height={h} className="absolute inset-0 overflow-visible" aria-hidden>
            <defs>
              <clipPath id={`draw-${uid}`}>
                <rect x={0} y={0} width={PAD.l + plotW * draw + 2} height={h} />
              </clipPath>
            </defs>

            {/* Guias: face (topo) e pago (base). */}
            {[
              { v: yMax, label: `${moneyCompact1(yMax, lc)} · ${f.faceTag}` },
              { v: yMin, label: `${moneyCompact1(yMin, lc)} · ${f.paidTag}` },
            ].map((g) => (
              <g key={g.label}>
                <line x1={PAD.l} x2={PAD.l + plotW} y1={y(g.v)} y2={y(g.v)} stroke="var(--color-divider)" />
                <text x={narrow ? PAD.l + plotW : w} y={narrow ? y(g.v) - 6 : y(g.v) + 4} textAnchor="end" className="fill-[var(--color-faint)] font-mono text-[11px]">{g.label}</text>
              </g>
            ))}

            <g clipPath={`url(#draw-${uid})`}>
              <path d={area} fill="var(--color-brand)" fillOpacity={0.08} />
              <path d={path(solid)} fill="none" stroke="var(--color-brand)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              <path d={path(dashed)} fill="none" stroke="var(--color-brand)" strokeWidth={1.5} strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
            </g>

            {/* Vencimentos intermediários: onde a inclinação muda. */}
            <g className="transition-opacity duration-500" style={{ opacity: draw >= 1 ? 1 : 0 }}>
              {maturities.map((m) => (
                <g key={m.ref}>
                  <circle cx={x(m.ms)} cy={y(m.v)} r={3.5} fill="var(--color-ink)" />
                  <text x={x(m.ms)} y={y(m.v) + 16} textAnchor="middle" className="fill-[var(--color-muted)] font-mono text-[10px]">{m.ref}</text>
                </g>
              ))}
            </g>

            {/* Régua e ponto da data apontada. */}
            {active && <line x1={px} x2={px} y1={PAD.t - 6} y2={PAD.t + plotH} stroke="var(--color-ink)" strokeOpacity={0.18} />}

            {/* Eixo X. */}
            {ticks.map((ms, i) => (
              <text
                key={i}
                x={x(ms)}
                y={h - 10}
                textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}
                className="fill-[var(--color-faint)] font-mono text-[11px]"
              >
                {i === 0 ? f.today : formatDate(isoDay(ms))}
              </text>
            ))}
          </svg>
        )}

        {w > 0 && (
          <span
            className="pointer-events-none absolute h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-brand bg-surface"
            style={{ left: px, top: py, boxShadow: "0 0 0 4px rgba(30,107,74,.12)" }}
            aria-hidden
          />
        )}
        {w > 0 && active && (
          <span
            className="pointer-events-none absolute whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white"
            style={{ left: px, top: Math.max(0, py - 52), transform: flip ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
            aria-hidden
          >
            <span className="block font-mono text-[11px] text-white/70">{formatDate(isoDay(point))}</span>
            <span className="tnum font-medium">{formatMoney(Math.round(value))}</span>
          </span>
        )}
      </div>
      <p className="sr-only" aria-live="polite">{active ? `${formatDate(isoDay(point))}: ${formatMoney(Math.round(value))}` : ""}</p>
      <p className="mt-2 text-xs text-faint">{f.curveHint}</p>
    </div>
  );
}

/** Mini-traço de curva (indicador "na curva" da tabela). */
export function MiniCurve({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 10" className={cx("h-2.5 w-5", className)} aria-hidden>
      <path d="M1 9 C 7 8, 12 5, 19 1" fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}
