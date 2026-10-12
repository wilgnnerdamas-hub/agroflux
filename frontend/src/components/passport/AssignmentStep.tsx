"use client";

import { useEffect, useState } from "react";
import { Ban, Coins, Landmark, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { api, toApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Receivable } from "@/lib/types";
import { Alert, Badge, Button, Card, CardTitle, DescList, ExplorerLink, FieldLabel, MonoValue, type Tone } from "../ui";
import { useReceivableAction, type StepProps } from "./shared";

/** A cessão está ligada no backend (health.features.assignment)? */
export function useAssignmentAvailable() {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .health()
      .then((h) => alive && setAvailable(h.features?.assignment === true))
      .catch(() => alive && setAvailable(false));
    return () => {
      alive = false;
    };
  }, []);
  return available;
}

const TONE: Record<Receivable["assignment"]["status"], Tone> = { none: "neutral", pending: "warn", settled: "sim", failed: "bad" };
export const formatTbrl = (units: number, locale: string) =>
  `${(units / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tBRL-DEMO`;

// Etapa 6: formalizar a cessão (token + liquidação atômica). Aparece com a proposta aceita, em liquidação ou após falha.
export function AssignmentStep({ receivable, onUpdated }: StepProps) {
  const { t, errorMessage } = useI18n();
  const a = receivable.assignment;
  const action = useReceivableAction((key) => api.requestAssignment(receivable.id, key), onUpdated);
  const funder = a.funderName;

  return (
    <Card data-testid="assignment-step">
      <CardTitle icon={<Coins className="h-4 w-4 text-sim" aria-hidden />} aside={<Badge tone={TONE[a.status]}>{t.status.assignment[a.status]}</Badge>}>
        {t.assignment.title}
      </CardTitle>

      <div className="space-y-4" aria-live="polite">
        {a.status === "none" && (
          <>
            <p className="text-sm text-muted">{t.assignment.intro}</p>
            {action.error && <Alert tone="bad">{action.error}</Alert>}
            <Button onClick={action.run} loading={action.busy}>
              <Coins className="h-4 w-4" aria-hidden /> {t.assignment.start}
            </Button>
          </>
        )}
        {a.status === "pending" && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-warn" aria-hidden />
            {a.tokenMint ? t.assignment.settling : t.assignment.minting}
          </p>
        )}
        {a.status === "failed" && (
          <>
            <Alert tone="bad" title={t.assignment.failedTitle}>
              {a.error ? errorMessage(a.error) : ""} {t.assignment.failedText}
            </Alert>
            {action.error && <Alert tone="bad">{action.error}</Alert>}
            <Button onClick={action.run} loading={action.busy}>
              <RefreshCw className="h-4 w-4" aria-hidden /> {t.assignment.retry}
            </Button>
          </>
        )}
        {a.settlementAmount != null && (
          <DescList
            items={[
              { label: t.assignment.amountToSettle, value: <span className="font-semibold tabular-nums">{formatTbrl(a.settlementAmount, t.locale)}</span> },
              ...(funder ? [{ label: t.passport.creditor, value: funder }] : []),
            ]}
          />
        )}
      </div>
    </Card>
  );
}

/** Prova de recusa (§5.22): outro token para o mesmo documento, outro financiador, recusa gravada na Devnet. */
function DoubleSpendProof({ receivable, onUpdated }: StepProps) {
  const { t, errorMessage } = useI18n();
  const p = receivable.assignment.doubleSpendProof;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      onUpdated(await api.requestDoubleSpendProof(receivable.id));
    } catch (e) {
      setError(errorMessage(toApiError(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-4" data-testid="double-spend-proof">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Ban className="h-4 w-4 text-bad" aria-hidden /> {t.proof.title}
      </p>
      <p className="mt-1 text-sm text-muted">{t.proof.intro}</p>

      <div className="mt-3 space-y-3" aria-live="polite">
        {(!p || p.status === "error") && (
          <>
            {p?.status === "error" && (
              <Alert tone="warn" title={t.proof.errorTitle}>{p.error ? (p.error.code === "TX_FAILED" ? p.error.message : errorMessage(p.error)) : ""}</Alert>
            )}
            <Button variant="secondary" onClick={run} loading={busy}>
              <Ban className="h-4 w-4" aria-hidden /> {p ? t.proof.retry : t.proof.run}
            </Button>
          </>
        )}
        {p?.status === "pending" && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-warn" aria-hidden /> {t.proof.running}
          </p>
        )}
        {p?.status === "rejected" && (
          <Alert tone="ok" title={t.proof.rejectedTitle}>
            <p>{t.proof.rejectedText}</p>
            {p.explorerUrl && <ExplorerLink href={p.explorerUrl} className="mt-2">{t.proof.viewRejected}</ExplorerLink>}
          </Alert>
        )}
        {p?.tokenMint && p.status !== "pending" && (
          <div>
            <FieldLabel>{t.proof.attemptToken}</FieldLabel>
            <MonoValue value={p.tokenMint} />
          </div>
        )}
        {error && <Alert tone="bad">{error}</Alert>}
      </div>
    </div>
  );
}

// Fluxo concluído: cessão liquidada, credor atualizado na registradora e prova de recusa.
/** 11/10: pagamento do sacado no vencimento (simulado). Credita a face ao financiador e baixa (queima) o token. */
function MaturityPaymentBlock({ receivable, onUpdated }: StepProps) {
  const { t, errorMessage } = useI18n();
  const k = t.maturity;
  const pay = receivable.assignment.maturityPayment;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      onUpdated(await api.requestMaturityPayment(receivable.id));
    } catch (e) {
      setError(errorMessage(toApiError(e)));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-5 rounded-xl border border-divider bg-row p-4" data-testid="maturity-payment">
      <p className="text-sm font-medium">{k.title}</p>
      {!pay || pay.status === "failed" ? (
        <>
          <p className="mt-1 text-sm text-muted">{k.text(formatMoney(receivable.amountCents), receivable.assignment.funderName ?? "—")}</p>
          {pay?.status === "failed" && pay.error && <p className="mt-2 text-sm text-terra">{pay.error.message}</p>}
          <Button variant="secondary" className="mt-3" onClick={() => void run()} loading={busy}>
            {pay?.status === "failed" ? k.retry : k.button}
          </Button>
        </>
      ) : pay.status === "pending" ? (
        <p className="mt-2 text-sm text-muted" role="status">{k.pending}</p>
      ) : (
        <div className="agf-rise mt-2 space-y-2">
          <p className="text-sm text-brand">✓ {k.done(formatMoney(pay.amount), receivable.assignment.funderName ?? "—")}</p>
          {pay.explorerUrl && <ExplorerLink href={pay.explorerUrl}>{k.viewTx}</ExplorerLink>}
        </div>
      )}
      <p className="mt-3 text-[11px] text-faint">{k.note}</p>
      {error && <p className="mt-2 text-sm text-terra" role="alert">{error}</p>}
    </div>
  );
}

export function AssignedSummary({ receivable, onUpdated, proofAvailable }: StepProps & { proofAvailable: boolean }) {
  const { t } = useI18n();
  const a = receivable.assignment;
  const reg = receivable.registry;
  return (
    <Card className="border-sim/40" data-testid="assigned-summary">
      <CardTitle icon={<ShieldCheck className="h-4 w-4 text-sim" aria-hidden />} aside={<Badge tone="sim">{t.status.assignment.settled}</Badge>}>
        {t.assignment.doneTitle}
      </CardTitle>
      <p className="text-sm text-ink">{t.assignment.doneText(a.funderName ?? "—")}</p>
      <div className="mt-4">
        <DescList
          items={[
            ...(a.settlementAmount != null
              ? [{ label: t.assignment.amountSettled, value: <span className="font-semibold tabular-nums">{formatTbrl(a.settlementAmount, t.locale)}</span> }]
              : []),
            { label: t.passport.face, value: formatMoney(receivable.amountCents) },
          ]}
        />
      </div>
      {a.settlementSignature ? (
        a.explorerUrls.settlement && <ExplorerLink href={a.explorerUrls.settlement} className="mt-4">{t.assignment.viewSettlement}</ExplorerLink>
      ) : (
        <Alert tone="warn" title={t.common.confirmedNoSignature} className="mt-4">{t.assignment.noSig} {t.common.notSent}</Alert>
      )}

      {reg.paymentDomicile && (
        <div className="mt-5 flex gap-3 rounded-lg border border-info/25 bg-info-soft p-4" data-testid="payment-domicile">
          <Landmark className="h-5 w-5 shrink-0 text-info" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold text-info">{t.domicile.title}</p>
            <p className="mt-0.5 font-medium text-ink">{reg.paymentDomicile.payeeName}</p>
            <p className="mt-1 text-ink/80">{t.domicile.text}</p>
          </div>
        </div>
      )}

      {proofAvailable && (
        <div className="mt-5">
          <DoubleSpendProof receivable={receivable} onUpdated={onUpdated} />
        </div>
      )}

      {proofAvailable && <MaturityPaymentBlock receivable={receivable} onUpdated={onUpdated} />}
    </Card>
  );
}
