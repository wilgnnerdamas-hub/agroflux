"use client";

import { CheckCircle2, CircleDashed, Clock, Coins, Handshake, Link2, Megaphone, Send, UserCheck, UserX, XCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { ChainStatus, DebtorConfirmationStatus, ReceivableStatus } from "@/lib/types";
import { Badge, type Tone } from "./ui";

const RECEIVABLE_TONE: Record<ReceivableStatus, Tone> = {
  created: "neutral",
  registration_pending: "warn",
  registered: "neutral",
  registration_failed: "bad",
  published: "info",
  offer_selected: "info",
  assignment_pending: "warn",
  assigned: "ok",
  assignment_failed: "bad",
};

const ic = "h-3.5 w-3.5";
const RECEIVABLE_ICON: Record<ReceivableStatus, React.ReactNode> = {
  created: <CircleDashed className={ic} aria-hidden />,
  registration_pending: <Clock className={ic} aria-hidden />,
  registered: <CheckCircle2 className={ic} aria-hidden />,
  registration_failed: <XCircle className={ic} aria-hidden />,
  published: <Megaphone className={ic} aria-hidden />,
  offer_selected: <Handshake className={ic} aria-hidden />,
  assignment_pending: <Clock className={ic} aria-hidden />,
  assigned: <Coins className={ic} aria-hidden />,
  assignment_failed: <XCircle className={ic} aria-hidden />,
};

export function ReceivableStatusBadge({ status }: { status: ReceivableStatus }) {
  const { t } = useI18n();
  return (
    <Badge tone={RECEIVABLE_TONE[status]} icon={RECEIVABLE_ICON[status]}>
      {t.status.receivable[status]}
    </Badge>
  );
}

const CHAIN_TONE: Record<ChainStatus, Tone> = { none: "neutral", pending: "warn", confirmed: "chain", failed: "bad" };

export function ChainStatusBadge({ status }: { status: ChainStatus }) {
  const { t } = useI18n();
  const icon =
    status === "confirmed" ? <Link2 className={ic} aria-hidden /> :
    status === "pending" ? <Clock className={ic} aria-hidden /> :
    status === "failed" ? <XCircle className={ic} aria-hidden /> :
    <CircleDashed className={ic} aria-hidden />;
  return (
    <Badge tone={CHAIN_TONE[status]} icon={icon}>
      {t.status.chain[status]}
    </Badge>
  );
}

const DC_TONE: Record<DebtorConfirmationStatus, Tone> = { none: "neutral", requested: "warn", confirmed: "ok", declined: "bad" };
const DC_ICON: Record<DebtorConfirmationStatus, React.ReactNode> = {
  none: <CircleDashed className={ic} aria-hidden />,
  requested: <Send className={ic} aria-hidden />,
  confirmed: <UserCheck className={ic} aria-hidden />,
  declined: <UserX className={ic} aria-hidden />,
};

export function DebtorConfirmationBadge({ status, short = false }: { status: DebtorConfirmationStatus; short?: boolean }) {
  const { t } = useI18n();
  return (
    <Badge tone={DC_TONE[status]} icon={DC_ICON[status]}>
      {short ? t.status.debtorShort[status] : t.status.debtor[status]}
    </Badge>
  );
}

export function SimulatedBadge() {
  const { t } = useI18n();
  return <Badge tone="sim">{t.common.simulation}</Badge>;
}
