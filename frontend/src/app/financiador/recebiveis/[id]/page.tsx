"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { ArrowLeft, Send, ShieldCheck } from "lucide-react";
import { api, toApiError } from "@/lib/api";
import { formatBps, formatMoney, todayISO } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { INTERACTIVE_FUNDER_ID } from "@/lib/labels";
import { useAsync } from "@/lib/useAsync";
import type { Offer, Quote, Receivable } from "@/lib/types";
import { Alert, Button, ButtonLink, Card, CardTitle, ErrorState, InfoTip, LoadingBlock, PageHeader, cx } from "@/components/ui";
import { ReceivableStatusBadge } from "@/components/status";
import { ReceivableSummary } from "@/components/passport/ReceivableSummary";
import { OnChainRecords } from "@/components/passport/OnChainRecords";
import { OfferBreakdown, OfferRate } from "@/components/passport/ProposalsPanel";
import { RatingBadge, RiskCard } from "@/components/RiskCard";
import { DocumentCheckCard } from "@/components/AiPanels";
import { toMs, YieldChart } from "@/components/YieldChart";

const inputCls =
  "block w-full rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-sm text-ink tabular-nums aria-[invalid=true]:border-bad min-h-[42px]";

/** "4,25" (pt) ou "4.25" (en) → 4.25. */
function parseDecimal(s: string, locale: "pt" | "en"): number | null {
  const clean = locale === "pt" ? s.trim().replace(/\./g, "").replace(",", ".") : s.trim().replace(/,/g, "");
  const n = Number(clean);
  return clean && Number.isFinite(n) ? n : null;
}

function ProposalForm({ r, mine, onSent }: { r: Receivable; mine: Offer | null; onSent: () => void }) {
  const { t, errorMessage, locale } = useI18n();
  const f = t.funder;
  const fmt = (n: number) => n.toLocaleString(locale === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
  const suggested = r.risk?.spreadBaseBps ?? 400;
  const [spread, setSpread] = useState(fmt((mine?.spreadBps ?? suggested) / 100));
  const [fees, setFees] = useState(fmt((mine?.feesCents ?? 10_000) / 100));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const spreadId = useId();
  const feesId = useId();

  const spreadBps = parseDecimal(spread, locale) != null ? Math.round(parseDecimal(spread, locale)! * 100) : null;
  const feesCents = parseDecimal(fees, locale) != null ? Math.round(parseDecimal(fees, locale)! * 100) : null;

  // Prévia calculada pelo backend (mesma conta da proposta), com uma pequena espera enquanto digita.
  useEffect(() => {
    if (spreadBps == null || feesCents == null) return;
    let alive = true;
    const timer = setTimeout(() => {
      api
        .quote(r.id, { funderId: INTERACTIVE_FUNDER_ID, spreadBps, feesCents })
        .then((q) => {
          if (!alive) return;
          setQuote(q);
          setQuoteError(null);
        })
        .catch((e) => alive && (setQuote(null), setQuoteError(errorMessage(toApiError(e)))));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [r.id, spreadBps, feesCents, errorMessage]);

  const preview = useMemo(
    () => (quote && quote.netAmountCents > 0 ? [{ paidCents: quote.presentValueCents - quote.feesCents, faceCents: r.amountCents, startMs: toMs(todayISO()), endMs: toMs(r.dueDate) }] : []),
    [quote, r.amountCents, r.dueDate],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSent(false);
    if (spreadBps == null || feesCents == null) {
      setFieldErrors({ ...(spreadBps == null ? { spreadBps: f.rateHint } : {}), ...(feesCents == null ? { feesCents: f.feesHint } : {}) });
      return;
    }
    setBusy(true);
    try {
      await api.proposeOffer(r.id, { funderId: INTERACTIVE_FUNDER_ID, spreadBps, feesCents });
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

  const negative = quote != null && quote.netAmountCents <= 0;
  return (
    <form onSubmit={submit} noValidate className="space-y-4" data-testid="proposal-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={spreadId} className="mb-1.5 block text-sm font-medium">{f.rate}</label>
          <input id={spreadId} className={inputCls} inputMode="decimal" value={spread} onChange={(e) => setSpread(e.target.value)} aria-invalid={!!fieldErrors.spreadBps} data-testid="rate-input" />
          <p className={cx("mt-1 text-xs", fieldErrors.spreadBps ? "font-medium text-bad" : "text-muted")}>
            {fieldErrors.spreadBps ?? f.suggested(`${formatBps(suggested)} ${t.pricing.perYear}`)}
          </p>
        </div>
        <div>
          <label htmlFor={feesId} className="mb-1.5 block text-sm font-medium">{f.fees}</label>
          <input id={feesId} className={inputCls} inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} aria-invalid={!!fieldErrors.feesCents} data-testid="fees-input" />
          <p className={cx("mt-1 text-xs", fieldErrors.feesCents ? "font-medium text-bad" : "text-muted")}>{fieldErrors.feesCents ?? f.feesHint}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg bg-subtle p-4 text-sm" data-testid="quote-preview">
        <div>
          <p className="text-xs text-muted">{f.preview}</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums">{quote && !negative ? formatMoney(quote.presentValueCents - quote.feesCents) : "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted">{f.previewYield}</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-brand">{quote && !negative ? `${formatBps(quote.funderYieldAnnualBps)} ${t.pricing.perYear}` : "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted">{f.previewIncome}</p>
          <p className="mt-0.5 font-semibold tabular-nums">{quote && !negative ? formatMoney(r.amountCents - (quote.presentValueCents - quote.feesCents)) : "—"}</p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-xs text-muted">
            {t.pricing.net}
            {quote && !negative && (
              <InfoTip>
                <OfferBreakdown offer={{ ...quote, grossAmountCents: r.amountCents } as unknown as Offer} />
              </InfoTip>
            )}
          </p>
          <p className="mt-0.5 font-semibold tabular-nums">{quote && !negative ? formatMoney(quote.netAmountCents) : "—"}</p>
        </div>
        {negative && <p className="col-span-2 text-xs font-medium text-bad">{f.previewInvalid}</p>}
        {quoteError && <p className="col-span-2 text-xs font-medium text-bad">{quoteError}</p>}
        {quote && <p className="col-span-2 text-xs text-faint">CDI {formatBps(quote.cdiBps)} {t.pricing.perYear} · {t.pricing.businessDays(quote.businessDays)}</p>}
      </div>
      {preview.length > 0 && <YieldChart positions={preview} refMs={Date.now()} title={f.chartTitle} />}

      {error && <Alert tone="bad" title={f.sendError}>{error}</Alert>}
      {sent && <Alert tone="ok">{f.sent}</Alert>}
      <Button type="submit" loading={busy} disabled={negative} className="w-full sm:w-auto">
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
        title={
          <span className="flex flex-wrap items-center gap-3">
            {r.reference}
            <ReceivableStatusBadge status={r.status} />
            {r.risk && <RatingBadge rating={r.risk.rating} score={r.risk.score} />}
          </span>
        }
        subtitle={`${r.distributor.name} · ${f.analysisTitle}`}
        actions={
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums text-ink">{formatMoney(r.amountCents)}</p>
            <p className="text-xs text-muted">{t.passport.due} {r.dueDate.split("-").reverse().join("/")}</p>
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="order-2 min-w-0 space-y-6 lg:order-1">
          {r.risk && <RiskCard risk={r.risk} compact receivable={r} />}
          <ReceivableSummary receivable={r} />
          <DocumentCheckCard receivable={r} onUpdated={() => void reload(true)} />
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
              <ProposalForm r={r} mine={mine} onSent={() => void reload(true)} />
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
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="font-medium">{o.funder.name}</span>
                    <span className="text-right tabular-nums text-muted">
                      <OfferRate offer={o} />
                    </span>
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
