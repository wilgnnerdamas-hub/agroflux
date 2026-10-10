import { Check } from "lucide-react";
import type { Receivable } from "@/lib/types";
import { FEATURE_ASSIGNMENT } from "@/lib/features";
import { cx } from "./ui";

// v1.1: a confirmação do sacado vem antes da oferta (decisão G1).
const STEPS = ["Cadastrado", "Registrado na Devnet", "Confirmado pelo sacado", "Oferta simulada"];
// Função B: quinta etapa só com a flag ligada.
const STEPS_WITH_ASSIGNMENT = [...STEPS, "Cessão liquidada"];

function progress(r: Pick<Receivable, "status" | "debtorConfirmation">): { done: number; current: number; failed: boolean } {
  const dc = r.debtorConfirmation;
  switch (r.status) {
    case "created":
    case "registration_pending":
      return { done: 1, current: 1, failed: false };
    case "registration_failed":
      return { done: 1, current: 1, failed: true };
    case "registered": {
      const confirmed = dc.status === "confirmed" && dc.chain?.status === "confirmed";
      if (confirmed) return { done: 3, current: 3, failed: false };
      return { done: 2, current: 2, failed: dc.status === "declined" || dc.chain?.status === "failed" };
    }
    case "offer_selected":
      return { done: 4, current: 4, failed: false };
    case "assignment_pending":
      return { done: 4, current: 4, failed: false };
    case "assignment_failed":
      return { done: 4, current: 4, failed: true };
    case "assigned":
      return { done: 5, current: 5, failed: false };
  }
}

export function FlowSteps({ receivable }: { receivable: Pick<Receivable, "status" | "debtorConfirmation"> }) {
  const p = progress(receivable);
  const steps = FEATURE_ASSIGNMENT ? STEPS_WITH_ASSIGNMENT : STEPS;
  return (
    <ol className={cx("grid grid-cols-2 gap-x-2 gap-y-3", FEATURE_ASSIGNMENT ? "sm:grid-cols-5" : "sm:grid-cols-4")} aria-label="Etapas da demonstração">
      {steps.map((label, i) => {
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
