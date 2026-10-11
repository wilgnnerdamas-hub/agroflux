"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, History } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { FEATURE_ASSIGNMENT } from "@/lib/features";
import { useI18n } from "@/lib/i18n";
import { useAsync } from "@/lib/useAsync";
import type { Receivable } from "@/lib/types";
import { Alert, Card, Collapsible, ErrorState, LoadingBlock, PageHeader } from "@/components/ui";
import { ReceivableStatusBadge } from "@/components/status";
import { FlowSteps } from "@/components/FlowSteps";
import { Timeline } from "@/components/Timeline";
import { RegisterStep } from "@/components/passport/RegisterStep";
import { DebtorStep } from "@/components/passport/DebtorStep";
import { PublishStep, TermsChainNotice } from "@/components/passport/PublishStep";
import { ProposalsPanel } from "@/components/passport/ProposalsPanel";
import { AssignedSummary, AssignmentStep, useAssignmentAvailable } from "@/components/passport/AssignmentStep";
import { OnChainRecords } from "@/components/passport/OnChainRecords";
import { ReceivableSummary } from "@/components/passport/ReceivableSummary";
import { RatingBadge, RiskCard } from "@/components/RiskCard";

const POLL_MS = 2000;
const POLL_MAX_MS = 75_000;
// Espera de respostas que vêm de outro aparelho (sacado) ou de transações longas.
const SLOW_POLL_MS = 3000;
const SLOW_POLL_MAX_MS = 15 * 60_000;

/** Algo do recebível está andando sozinho no backend? Então a tela se atualiza. */
function isWaiting(r: Receivable) {
  const dc = r.debtorConfirmation;
  return (
    dc.status === "requested" ||
    dc.chain?.status === "pending" ||
    r.listing.chain?.status === "pending" ||
    r.status === "assignment_pending" ||
    r.assignment.doubleSpendProof?.status === "pending"
  );
}

function NextAction({
  r,
  onUpdated,
  pollTimedOut,
  refresh,
  assignmentAvailable,
}: {
  r: Receivable;
  onUpdated: (r: Receivable) => void;
  pollTimedOut: boolean;
  refresh: () => void;
  assignmentAvailable: boolean | null;
}) {
  const dc = r.debtorConfirmation;
  const accepted = dc.status === "confirmed" && dc.chain?.status === "confirmed";
  const step = { receivable: r, onUpdated };
  // Função B atrás da flag; com a flag, aparece se o backend tiver a cessão ou se ela já existir.
  const assignmentOn = FEATURE_ASSIGNMENT && (assignmentAvailable === true || r.assignment.status !== "none");

  switch (r.status) {
    case "created":
    case "registration_pending":
    case "registration_failed":
      return <RegisterStep {...step} pollingTimedOut={pollTimedOut} onRefresh={refresh} />;
    case "registered":
      return accepted ? <PublishStep {...step} /> : <DebtorStep {...step} />;
    case "published":
      return (
        <div className="space-y-4">
          <TermsChainNotice {...step} />
          <ProposalsPanel {...step} />
        </div>
      );
    case "offer_selected":
    case "assignment_pending":
    case "assignment_failed":
      return assignmentOn ? <AssignmentStep {...step} /> : <ProposalsPanel {...step} />;
    case "assigned":
      return <AssignedSummary {...step} proofAvailable={assignmentAvailable === true} />;
  }
}

function Passport() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const justCreated = useSearchParams().get("criado") === "1";
  const { state, setState, reload } = useAsync(() => api.getReceivable(id), [id]);
  const r = state.data;
  const onUpdated = (next: Receivable) => setState({ status: "success", data: next });
  const assignmentAvailable = useAssignmentAvailable();

  // Registro pendente: polling rápido com limite (§5.5).
  const pollStart = useRef<number | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const registering = r?.status === "registration_pending";
  useEffect(() => {
    if (!registering) {
      pollStart.current = null;
      setPollTimedOut(false);
      return;
    }
    if (pollTimedOut) return;
    pollStart.current ??= Date.now();
    const timer = setInterval(() => {
      if (Date.now() - (pollStart.current ?? 0) > POLL_MAX_MS) {
        setPollTimedOut(true);
        clearInterval(timer);
        return;
      }
      void reload(true);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [registering, pollTimedOut, reload]);

  const waiting = !!r && isWaiting(r);
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > SLOW_POLL_MAX_MS) return clearInterval(timer);
      void reload(true);
    }, r?.status === "assignment_pending" ? POLL_MS : SLOW_POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, r?.status, reload]);

  const refresh = () => {
    pollStart.current = Date.now();
    setPollTimedOut(false);
    void reload(true);
  };

  const back = (
    <Link href="/distribuidor" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
      <ArrowLeft className="h-4 w-4" aria-hidden /> {t.passport.back}
    </Link>
  );

  if (!r && state.status === "loading") {
    return (
      <div className="space-y-6">
        <LoadingBlock label={t.passport.loading} lines={2} />
        <Card><LoadingBlock lines={4} /></Card>
      </div>
    );
  }
  if (!r && state.status === "error") {
    return (
      <>
        {back}
        <div className="mt-4">
          <ErrorState
            title={state.error.code === "NOT_FOUND" ? t.passport.notFound : t.passport.loadError}
            message={state.error.message}
            onRetry={state.error.code === "NOT_FOUND" ? undefined : () => reload()}
          />
        </div>
      </>
    );
  }
  if (!r) return null;

  return (
    <>
      <PageHeader
        back={back}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {r.reference}
            <ReceivableStatusBadge status={r.status} />
            {r.risk && <RatingBadge rating={r.risk.rating} score={r.risk.score} />}
          </span>
        }
        subtitle={
          <span>
            {r.distributor.name} · {r.debtor.alias} · {t.status.product[r.product.category]}
            {r.registry.registryId && <span className="text-faint"> · {r.registry.registryId}</span>}
          </span>
        }
        actions={
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums text-ink">{formatMoney(r.amountCents)}</p>
            <p className="text-xs text-muted">{t.passport.due} {formatDate(r.dueDate)}</p>
          </div>
        }
      />

      <div className="space-y-6">
        {justCreated && r.status === "created" && <Alert tone="ok">{t.passport.created}</Alert>}
        {state.status === "error" && <ErrorState title={t.common.updateError} message={state.error.message} onRetry={refresh} />}

        <Card className="py-4 sm:py-5">
          <FlowSteps receivable={r} />
        </Card>

        {/* Propostas precisam de largura para comparar: nesse passo, o resumo desce para baixo. */}
        <div className={r.status === "published" ? "grid gap-6" : "grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"}>
          <section aria-labelledby="next-action" className="min-w-0 space-y-3">
            <h2 id="next-action" className="text-xs font-semibold uppercase tracking-wide text-faint">
              {r.status === "assigned" ? t.passport.done : t.passport.nextAction}
            </h2>
            <NextAction r={r} onUpdated={onUpdated} pollTimedOut={pollTimedOut} refresh={refresh} assignmentAvailable={assignmentAvailable} />
          </section>
          <div className={r.status === "published" ? "grid gap-6 lg:grid-cols-2" : "space-y-6 lg:pt-7"}>
            <ReceivableSummary receivable={r} />
            {r.risk && <RiskCard risk={r.risk} compact />}
          </div>
        </div>

        <OnChainRecords receivable={r} />

        <Collapsible
          title={t.passport.history}
          icon={<History className="h-4 w-4 text-muted" aria-hidden />}
          aside={<span className="text-xs text-muted">{t.passport.historyCount(r.events.length)}</span>}
          testId="history"
        >
          <Timeline events={r.events} />
        </Collapsible>
      </div>
    </>
  );
}

export default function PassportPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Passport />
    </Suspense>
  );
}
