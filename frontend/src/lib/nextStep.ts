// "Próximo passo" de um recebível, do ponto de vista da distribuidora (painel e passaporte).
import type { Dict } from "./i18n/pt";
import type { ReceivableSummary } from "./types";

export type StepTone = "action" | "waiting" | "bad" | "done";
export interface NextStep {
  label: string;
  tone: StepTone;
}

type Input = Pick<ReceivableSummary, "status" | "debtorConfirmation" | "offerCount">;

export function nextStep(r: Input, t: Dict): NextStep {
  const n = t.next;
  switch (r.status) {
    case "created":
      return { label: n.register, tone: "action" };
    case "registration_pending":
      return { label: n.registering, tone: "waiting" };
    case "registration_failed":
      return { label: n.retryRegister, tone: "bad" };
    case "registered":
      if (r.debtorConfirmation.status === "confirmed") return { label: n.publish, tone: "action" };
      if (r.debtorConfirmation.status === "requested") return { label: n.waitingAcceptance, tone: "waiting" };
      if (r.debtorConfirmation.status === "declined") return { label: n.declined, tone: "bad" };
      return { label: n.askAcceptance, tone: "action" };
    case "published":
      return r.offerCount > 0 ? { label: n.choose(r.offerCount), tone: "action" } : { label: n.waitingProposals, tone: "waiting" };
    case "offer_selected":
      return { label: n.assign, tone: "action" };
    case "assignment_pending":
      return { label: n.settling, tone: "waiting" };
    case "assignment_failed":
      return { label: n.retryAssign, tone: "bad" };
    case "assigned":
      return { label: n.done, tone: "done" };
    default:
      return { label: "—", tone: "waiting" };
  }
}
