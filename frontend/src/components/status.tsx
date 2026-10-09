import { CheckCircle2, CircleDashed, Clock, Link2, XCircle, Handshake } from "lucide-react";
import { Badge, type Tone } from "./ui";
import { CHAIN_STATUS_LABEL, RECEIVABLE_STATUS_LABEL } from "@/lib/labels";
import type { ChainStatus, ReceivableStatus } from "@/lib/types";

const RECEIVABLE_TONE: Record<ReceivableStatus, Tone> = {
  created: "neutral",
  registration_pending: "warn",
  registered: "ok",
  registration_failed: "bad",
  offer_selected: "sim",
};

const ic = "h-3.5 w-3.5";
const RECEIVABLE_ICON: Record<ReceivableStatus, React.ReactNode> = {
  created: <CircleDashed className={ic} aria-hidden />,
  registration_pending: <Clock className={ic} aria-hidden />,
  registered: <CheckCircle2 className={ic} aria-hidden />,
  registration_failed: <XCircle className={ic} aria-hidden />,
  offer_selected: <Handshake className={ic} aria-hidden />,
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

export function SimulatedBadge() {
  return <Badge tone="sim">Simulação</Badge>;
}
