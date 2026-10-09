import { Check } from "lucide-react";
import type { ReceivableStatus } from "@/lib/types";
import { cx } from "./ui";

const STEPS = ["Cadastrado", "Registrado na Devnet", "Oferta simulada"] as const;

function progress(status: ReceivableStatus): { done: number; current: number; failed: boolean } {
  switch (status) {
    case "created":
      return { done: 1, current: 1, failed: false };
    case "registration_pending":
      return { done: 1, current: 1, failed: false };
    case "registration_failed":
      return { done: 1, current: 1, failed: true };
    case "registered":
      return { done: 2, current: 2, failed: false };
    case "offer_selected":
      return { done: 3, current: 3, failed: false };
  }
}

export function FlowSteps({ status }: { status: ReceivableStatus }) {
  const p = progress(status);
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Etapas da demonstração">
      {STEPS.map((label, i) => {
        const done = i < p.done;
        const current = i === p.current && !done;
        return (
          <li key={label} className="min-w-0">
            <div className={cx("h-1.5 rounded-full", done ? "bg-brand" : current ? (p.failed ? "bg-bad" : "bg-warn") : "bg-border")} />
            <p
              className={cx("mt-2 flex items-center gap-1 text-xs font-medium", done ? "text-brand" : current ? "text-ink" : "text-faint")}
              aria-current={current ? "step" : undefined}
            >
              {done && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              <span className="truncate">{label}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
