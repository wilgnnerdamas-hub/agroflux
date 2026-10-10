"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { ArrowLeft, Send, ShieldCheck } from "lucide-react";
import { api, toApiError } from "@/lib/api";
import { formatMoney, formatRateBps, todayISO } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { INTERACTIVE_FUNDER_ID } from "@/lib/labels";
import { useAsync } from "@/lib/useAsync";
import type { Offer } from "@/lib/types";
import { Alert, Button, ButtonLink, Card, CardTitle, ErrorState, LoadingBlock, PageHeader, cx } from "@/components/ui";
import { ReceivableStatusBadge } from "@/components/status";
import { ReceivableSummary } from "@/components/passport/ReceivableSummary";
import { OnChainRecords } from "@/components/passport/OnChainRecords";
import { toMs, YieldChart } from "@/components/YieldChart";

const inputCls =
  "block w-full rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-sm text-ink tabular-nums aria-[invalid=true]:border-bad min-h-[42px]";

// Mesmo cálculo de referência do contrato (§3.7).
const netAmount = (gross: number, bps: number, termDays: number, fees: number) => gross - Math.round(gross * (bps / 10_000) * (termDays / 30)) - fees;
const parseDecimal = (s: string) => {
  const n = Number(s.trim().replace(/\./g, "").replace(",", "."));
  return s.trim() && Number.isFinite(n) ? n : null;
};

function ProposalForm({ receivableId, gross, termDays, dueDate, mine, onSent }: { receivableId: string; gross: number; termDays: number; dueDate: string; mine: Offer | null; onSent: () => void }) {
  const { t, errorMessage, locale } = useI18n();
  const f = t.funder;
  const fmt = (n: number) => n.toLocaleString(locale === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
  const [rate, setRate] = useState(mine ? fmt(mine.monthlyRateBps / 100) : fmt(1.4));
  const [fees, setFees] = useState(mine ? fmt(mine.feesCents / 100) : fmt(100));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const rateId = useId();
  const feesId = useId();

  // Em inglês, o separador decimal é o ponto.
  const parse = (s: string) => (locale === "pt" ? parseDecimal(s) : (s.trim() && Number.isFinite(Number(s.replace(/,/g, ""))) ? Number(s.replace(/,/g, "")) : null));
  const bps = parse(rate) != null ? Math.round(parse(rate)! * 100) : null;
  const feesCents = parse(fees) != null ? Math.round(parse(fees)! * 100) : null;
  const net = bps != null && feesCents != null ? netAmount(gross, bps, termDays, feesCents) : null;
  const preview = useMemo(
    () => (net && net > 0 ? [{ paidCents: net, faceCents: gross, startMs: toMs(todayISO()), endMs: toMs(dueDate) }] : []),
    [net, gross, dueDate],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSent(false);
    if (bps == null || feesCents == null) {
      setFieldErrors({ ...(bps == null ? { monthlyRateBps: f.rateHint } : {}), ...(feesCents == null ? { feesCents: f.feesHint } : {}) });
      return;
    }
    setBusy(true);
    try {
      await api.proposeOffer(receivableId, { funderId: INTERACTIVE_FUNDER_ID, monthlyRateBps: bps, feesCents });
      setSent(true);
      onSent();
    } catch (err) {
      const ae = toApiError(err);
      setFieldErrors(ae.fieldErrors ?? {});
      setError(errorMessage(ae));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" data-testid="proposal-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={rateId} className="mb-1.5 block text-sm font-medium">{f.rate}</label>
          <input id={rateId} className={inputCls} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={!!fieldErrors.monthlyRateBps} data-testid="rate-input" />
          <p className={cx("mt-1 text-xs", fieldErrors.monthlyRateBps ? "font-medium text-bad" : "text-muted")}>{fieldErrors.monthlyRateBps ?? f.rateHint}</p>
        </div>
        <div>
          <label htmlFor={feesId} className="mb-1.5 block text-sm font-medium">{f.fees}</label>
          <input id={feesId} className={inputCls} inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} aria-invalid={!!fieldErrors.feesCents} data-testid="fees-input" />
          <p className={cx("mt-1 text-xs", fieldErrors.feesCents ? "font-medium text-bad" : "text-muted")}>{fieldErrors.feesCents ?? f.feesHint}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg bg-subtle p-4 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-faint">{f.preview}</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums">{net != null && net > 0 ? formatMoney(net) : "—"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-faint">{f.previewIncome}</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-brand">{net != null && net > 0 ? formatMoney(gross - net) : "—"}</p>
        </div>
        {net != null && net <= 0 && <p className="col-span-2 text-xs font-medium text-bad">{f.previewInvalid}</p>}
      </div>
      {preview.length > 0 && <YieldChart positions={preview} refMs={Date.now()} title={f.chartTitle} />}

      {error && <Alert tone="bad" title={f.sendError}>{error}</Alert>}
      {sent && <Alert tone="ok">{f.sent}</Alert>}
      <Button type="submit" loading={busy} disabled={net != null && net <= 0} className="w-full sm:w-auto">
        <Send className="h-4 w-4" aria-hidden /> {busy ? f.sending : mine ? f.revise : f.send}
      </Button>
    </form>
  );
}

export default function FunderReceivablePage() {
  const { t } = useI18n();
  const f = t.funder;
  const { id } = useParams<{ id: string }>();
  const { state, reload } = useAsync(async () => {
    const receivable = await api.getReceivable(id);
    const offers = receivable.chain.status === "confirmed" ? (await api.listOffers(id)).items : [];
    return { receivable, offers };
  }, [id]);
  const d = state.data;

  // Enquanto aberto, acompanha a decisão da distribuidora.
  const open = d?.receivable.status === "published";
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => void reload(true), 5000);
    return () => clearInterval(timer);
  }, [open, reload]);

  const back = (
    <Link href="/financiador" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
      <ArrowLeft className="h-4 w-4" aria-hidden /> {f.back}
    </Link>
  );
  if (!d && state.status === "loading") return <LoadingBlock lines={4} />;
  if (!d && state.status === "error") return <>{back}<div className="mt-4"><ErrorState message={state.error.message} onRetry={() => reload()} /></div></>;
  if (!d) return null;

  const r = d.receivable;
  const mine = d.offers.find((o) => o.funder.id === INTERACTIVE_FUNDER_ID) ?? null;
  const others = d.offers.filter((o) => o.funder.id !== INTERACTIVE_FUNDER_ID);
  const won = r.assignment.funderId === INTERACTIVE_FUNDER_ID || (!!mine && r.selectedOfferId === mine.id);

  return (
    <>
      <PageHeader
        back={back}
        title={<span className="flex flex-wrap items-center gap-3">{r.reference}<ReceivableStatusBadge status={r.status} /></span>}
        subtitle={f.analysisTitle}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="order-2 min-w-0 space-y-6 lg:order-1">
          <ReceivableSummary receivable={r} />
          <div>
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-faint">
              <ShieldCheck className="h-4 w-4" aria-hidden /> {f.checkTitle}
            </h2>
            <OnChainRecords receivable={r} defaultOpen />
          </div>
        </div>

        <div className="order-1 space-y-6 lg:sticky lg:top-20 lg:order-2 lg:self-start">
          <Card>
            <CardTitle>{f.proposalTitle}</CardTitle>
            {open ? (
              <ProposalForm receivableId={r.id} gross={r.amountCents} termDays={r.termDays} dueDate={r.dueDate} mine={mine} onSent={() => void reload(true)} />
            ) : won ? (
              <Alert tone="ok" action={<ButtonLink href="/financiador/carteira" variant="secondary">{t.shell.navPortfolio}</ButtonLink>}>{f.won}</Alert>
            ) : r.selectedOfferId ? (
              <Alert tone="info">{f.lost}</Alert>
            ) : (
              <Alert tone="info">{f.closed}</Alert>
            )}
          </Card>

          {others.length > 0 && (
            <Card>
              <CardTitle>{f.competing}</CardTitle>
              <ul className="divide-y divide-border text-sm">
                {others.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                    <span>{o.funder.name}</span>
                    <span className="tabular-nums text-muted">{formatMoney(o.netAmountCents)} · {formatRateBps(o.monthlyRateBps)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
