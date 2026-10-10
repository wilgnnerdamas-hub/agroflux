"use client";

import { Check } from "lucide-react";
import { FEATURE_ASSIGNMENT } from "@/lib/features";
import { useI18n } from "@/lib/i18n";
import type { Receivable } from "@/lib/types";
import { cx } from "./ui";

type Progress = { done: number; failed: boolean };

// v1.2: cadastro → registro → aceite do sacado → publicação → proposta aceita → (cessão, com a flag).
export function progress(r: Pick<Receivable, "status" | "debtorConfirmation">): Progress {
  const dc = r.debtorConfirmation;
  switch (r.status) {
    case "created":
    case "registration_pending":
      return { done: 1, failed: false };
    case "registration_failed":
      return { done: 1, failed: true };
    case "registered": {
      const accepted = dc.status === "confirmed" && dc.chain?.status === "confirmed";
      if (accepted) return { done: 3, failed: false };
      return { done: 2, failed: dc.status === "declined" || dc.chain?.status === "failed" };
    }
    case "published":
      return { done: 4, failed: false };
    case "offer_selected":
    case "assignment_pending":
      return { done: 5, failed: false };
    case "assignment_failed":
      return { done: 5, failed: true };
    case "assigned":
      return { done: 6, failed: false };
    default:
      return { done: 0, failed: false };
  }
}

export function FlowSteps({ receivable }: { receivable: Pick<Receivable, "status" | "debtorConfirmation"> }) {
  const { t } = useI18n();
  const p = progress(receivable);
  const steps = FEATURE_ASSIGNMENT ? t.steps.items : t.steps.items.slice(0, 5);
  return (
    <ol className={cx("grid grid-cols-2 gap-x-2 gap-y-3", FEATURE_ASSIGNMENT ? "sm:grid-cols-6" : "sm:grid-cols-5")} aria-label={t.steps.label}>
      {steps.map((label, i) => {
        const done = i < p.done;
        const current = i === p.done;
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
