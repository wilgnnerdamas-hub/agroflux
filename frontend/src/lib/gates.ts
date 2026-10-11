// Os 5 portões da AgroFlux (01 cadastro · 02 registro · 03 confirmação · 04 oferta · 05 cessão), a partir dos
// estados reais do contrato. A publicação faz parte do portão 04 (oferta).
import type { Dict } from "./i18n/pt";
import { nextStep, type StepTone } from "./nextStep";
import type { ReceivableStatus, ReceivableSummary } from "./types";

export const GATES = 5;

export interface GateProgress {
  /** Portões concluídos (1 a 5). */
  done: number;
  /** Índice (0–4) do portão em andamento, ou null quando os 5 estão concluídos. */
  current: number | null;
  tone: StepTone;
  /** Rótulo curto do estado, para "2/5 · Registrado". */
  label: string;
}

type Input = Pick<ReceivableSummary, "status" | "offerCount"> & { debtorConfirmation: { status: ReceivableSummary["debtorConfirmation"]["status"] } };

function doneCount(status: ReceivableStatus, confirmed: boolean): number {
  switch (status) {
    case "created":
    case "registration_pending":
    case "registration_failed":
      return 1;
    case "registered":
      return confirmed ? 3 : 2;
    case "published":
      return 3;
    case "offer_selected":
    case "assignment_pending":
    case "assignment_failed":
      return 4;
    case "assigned":
      return 5;
    default:
      return 0;
  }
}

export function gateProgress(r: Input, t: Dict): GateProgress {
  const confirmed = r.debtorConfirmation.status === "confirmed";
  const done = doneCount(r.status, confirmed);
  const step = nextStep(r, t);
  const label = r.status === "registered" && confirmed ? t.gates.short.confirmed : t.gates.short[r.status];
  return { done, current: done >= GATES ? null : done, tone: step.tone, label };
}

export type GateFilter = "all" | "action" | "waiting" | "assigned";

export function matchesFilter(tone: StepTone, f: GateFilter) {
  if (f === "all") return true;
  if (f === "action") return tone === "action" || tone === "bad";
  if (f === "waiting") return tone === "waiting";
  return tone === "done";
}
