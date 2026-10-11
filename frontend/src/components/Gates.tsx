"use client";

import { useEffect, useState } from "react";
import { GATES, type GateProgress } from "@/lib/gates";
import { useI18n } from "@/lib/i18n";
import { cx } from "./ui";

/** Trilha de 5 portões: concluídos em verde, o atual com anel (pulsa se pede ação), futuros em cinza. */
export function GateTrail({ progress, size = "sm", showLabel = true }: { progress: GateProgress; size?: "sm" | "lg"; showLabel?: boolean }) {
  const { t } = useI18n();
  const { done, current, tone, label } = progress;
  // A parte percorrida da linha anima a largura ao montar.
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setWidth(Math.max(0, Math.min(done, GATES) - 1) / (GATES - 1)));
    return () => cancelAnimationFrame(id);
  }, [done]);
  const dot = size === "lg" ? "h-3 w-3" : "h-[9px] w-[9px]";
  const text = `${t.gates.label}: ${done}/${GATES} · ${label}`;

  return (
    <div className="min-w-0" title={text}>
      <div className={cx("relative flex items-center justify-between", size === "lg" ? "w-full" : "w-[96px]")} aria-hidden>
        <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-border" />
        <span className="agf-bar absolute left-1 top-1/2 h-px -translate-y-1/2 bg-brand" style={{ width: `calc((100% - 0.5rem) * ${width})` }} />
        {Array.from({ length: GATES }).map((_, i) => {
          const isDone = i < done;
          const isCurrent = i === current;
          return (
            <span
              key={i}
              className={cx(
                "relative rounded-full border agf-fade",
                dot,
                isDone ? "border-brand bg-brand" : isCurrent ? (tone === "bad" ? "border-bad bg-surface" : "border-brand bg-surface") : "border-border-strong bg-surface",
                isCurrent && tone === "action" && "agf-pulse",
              )}
            />
          );
        })}
      </div>
      {showLabel && <p className="mt-1.5 font-mono text-[11px] text-muted">{done}/{GATES} · {label}</p>}
      <span className="sr-only">{text}</span>
    </div>
  );
}

/** Passo a passo grande dos portões (passaporte): número mono, nome e trilha. */
export function GateStepper({ progress }: { progress: GateProgress }) {
  const { t } = useI18n();
  const { done, current, tone } = progress;
  return (
    <ol className="grid grid-cols-5 gap-1 sm:gap-3" aria-label={t.gates.label}>
      {t.gates.names.map((name, i) => {
        const isDone = i < done;
        const isCurrent = i === current;
        return (
          <li key={name} className="min-w-0" aria-current={isCurrent ? "step" : undefined}>
            <div className="flex items-center gap-1.5">
              <span
                className={cx(
                  "h-2.5 w-2.5 shrink-0 rounded-full border agf-fade",
                  isDone ? "border-brand bg-brand" : isCurrent ? (tone === "bad" ? "border-bad bg-surface" : "border-brand bg-surface") : "border-border-strong bg-surface",
                  isCurrent && tone === "action" && "agf-pulse",
                )}
                aria-hidden
              />
              <span className={cx("h-px flex-1", i < done - 1 ? "bg-brand" : "bg-border", i === GATES - 1 && "invisible")} aria-hidden />
            </div>
            <p className={cx("mt-2 font-mono text-[11px]", isDone || isCurrent ? "text-brand" : "text-faint")}>{String(i + 1).padStart(2, "0")}</p>
            <p className={cx("truncate text-xs sm:text-sm", isDone ? "text-ink" : isCurrent ? "font-medium text-ink" : "text-faint")}>
              {name}
              <span className="sr-only">{isDone ? ` (${t.gates.doneSr})` : isCurrent ? ` (${t.gates.currentSr})` : ""}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
