import { CheckCircle2, CircleDashed, Clock, Link2, XCircle, Handshake, Coins, UserCheck, UserX, Send } from "lucide-react";
import { Badge, type Tone } from "./ui";
import { CHAIN_STATUS_LABEL, DEBTOR_CONFIRMATION_STATUS_LABEL, RECEIVABLE_STATUS_LABEL } from "@/lib/labels";
import type { ChainStatus, DebtorConfirmationStatus, ReceivableStatus } from "@/lib/types";

const RECEIVABLE_TONE: Record<ReceivableStatus, Tone> = {
  created: "neutral",
  registration_pending: "warn",
  registered: "ok",
  registration_failed: "bad",
  offer_selected: "sim",
  assignment_pending: "warn",
  assigned: "sim",
  assignment_failed: "bad",
};

const ic = "h-3.5 w-3.5";
const RECEIVABLE_ICON: Record<ReceivableStatus, React.ReactNode> = {
  created: <CircleDashed className={ic} aria-hidden />,
  registration_pending: <Clock className={ic} aria-hidden />,
  registered: <CheckCircle2 className={ic} aria-hidden />,
  registration_failed: <XCircle className={ic} aria-hidden />,
  offer_selected: <Handshake className={ic} aria-hidden />,
  assignment_pending: <Clock className={ic} aria-hidden />,
  assigned: <Coins className={ic} aria-hidden />,
  assignment_failed: <XCircle className={ic} aria-hidden />,
};

export function ReceivableStatusBadge({ status }: { status: ReceivableStatus }) {
  return (
    <Badge tone={RECEIVABLE_TONE[status]} icon={RECEIVABLE_ICON[status]}>
      {RECEIVABLE_STATUS_LABEL[status]}
    </Badge>
  );
}

const CHAIN_TONE: Record<ChainStatus, Tone> = { none: "neutral", pending: "warn", confirmed: "chain", failed: "bad" };

export function ChainStatusBadge({ status }: { status: ChainStatus }) {
  const icon =
    status === "confirmed" ? <Link2 className={ic} aria-hidden /> :
    status === "pending" ? <Clock className={ic} aria-hidden /> :
    status === "failed" ? <XCircle className={ic} aria-hidden /> :
    <CircleDashed className={ic} aria-hidden />;
  return (
    <Badge tone={CHAIN_TONE[status]} icon={icon}>
      {CHAIN_STATUS_LABEL[status]}
    </Badge>
  );
}

// v1.1: selo da confirmação do sacado (§4.5).
const DC_TONE: Record<DebtorConfirmationStatus, Tone> = { none: "neutral", requested: "warn", confirmed: "ok", declined: "bad" };
const DC_ICON: Record<DebtorConfirmationStatus, React.ReactNode> = {
  none: <CircleDashed className={ic} aria-hidden />,
  requested: <Send className={ic} aria-hidden />,
  confirmed: <UserCheck className={ic} aria-hidden />,
  declined: <UserX className={ic} aria-hidden />,
};

// Versão curta para tabelas e listas.
const DC_SHORT_LABEL: Record<DebtorConfirmationStatus, string> = {
  none: "Não solicitada",
  requested: "Aguardando",
  confirmed: "Confirmada (simulada)",
  declined: "Recusada (simulada)",
};

export function DebtorConfirmationBadge({ status, short = false }: { status: DebtorConfirmationStatus; short?: boolean }) {
  return (
    <Badge tone={DC_TONE[status]} icon={DC_ICON[status]}>
      {short ? DC_SHORT_LABEL[status] : DEBTOR_CONFIRMATION_STATUS_LABEL[status]}
    </Badge>
  );
}

export function SimulatedBadge() {
  return <Badge tone="sim">Simulação</Badge>;
}
