"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Handshake } from "lucide-react";
import { api, toApiError } from "@/lib/api";
import { formatBps, formatDate, formatMoney, formatRateBps } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useAsync } from "@/lib/useAsync";
import type { Offer, Receivable } from "@/lib/types";
import { Alert, Badge, Button, Card, CardTitle, InfoTip, LoadingBlock, cx } from "../ui";


const POLL_MS = 4000;
const COLS = "md:grid md:grid-cols-[minmax(0,1fr)_8rem_9rem_5.5rem_auto] md:items-center md:gap-4";
const seenKey = (id: string) => `agroflux.offers-seen.${id}`;

/** Marca quantas propostas a distribuidora já viu (o painel usa para o selo "nova"). */
export function markOffersSeen(id: string, count: number) {
  try {
    window.localStorage.setItem(seenKey(id), String(count));
  } catch {
    /* armazenamento indisponível */
  }
}
export function offersSeen(id: string): number {
  try {
    return Number(window.localStorage.getItem(seenKey(id)) ?? "0");
  } catch {
    return 0;
  }
}

/** Composição do valor (contrato v1.3, §15.1): do valor de face ao líquido da distribuidora. */
export function OfferBreakdown({ offer }: { offer: Offer }) {
  const { t } = useI18n();
  const p = t.pricing;
  if (offer.presentValueCents == null) return null;
  const line = (label: string, cents: number, sign = "", strong = false) => (
    <div className={cx("flex justify-between gap-4", strong && "border-t border-border pt-1 font-semibold")}>
      <span>{label}</span>
      <span className="tabular-nums">{sign}{formatMoney(cents)}</span>
    </div>
  );
  return (
    <div className="space-y-1">
      <p className="font-semibold">{p.breakdown} · {p.businessDays(offer.businessDays!)}</p>
      {line(p.face, offer.grossAmountCents)}
      {line(p.discount, offer.discountCents!, "− ")}
      {line(p.funderFees, offer.feesCents, "− ")}
      {offer.iofCents! > 0 && line(p.iof, offer.iofCents!, "− ")}
      {line(p.cashOut, offer.funderCashOutCents!, "", true)}
      {line(p.platformFee, offer.platformFeeCents!, "− ")}
      {line(p.registryFee, offer.registryFeeCents!, "− ")}
      {line(p.netFull, offer.netAmountCents, "", true)}
      <p className="pt-1 text-faint">{p.yield}: {formatBps(offer.funderYieldAnnualBps!)} {p.perYear}</p>
    </div>
  );
}

/** Taxa da proposta: "CDI + 3,20% a.a." (v1.3) ou a taxa mensal antiga. */
export function OfferRate({ offer }: { offer: Offer }) {
  const { t } = useI18n();
  if (offer.spreadBps == null) return <>{formatRateBps(offer.monthlyRateBps)}</>;
  return (
    <span className="block leading-tight">
      {t.pricing.cdiPlus(formatBps(offer.spreadBps))}
      <span className="block text-xs text-muted">{formatBps(offer.annualRateBps!)} {t.pricing.perYear}</span>
    </span>
  );
}

/** Uma linha por proposta: tabela no computador, cartão empilhado no celular. Nome do financiador sempre inteiro. */
export function OfferRow({ offer, best, canAccept, onAccept }: { offer: Offer; best: boolean; canAccept: boolean; onAccept?: (o: Offer) => void }) {
  const { t } = useI18n();
  const p = t.proposals;
  const selected = offer.status === "selected";
  const cell = (label: string, value: React.ReactNode, cls = "") => (
    <div className={cx("flex items-baseline justify-between gap-3 md:block", cls)}>
      <span className="text-xs text-muted md:hidden">{label}</span>
      <span className="whitespace-nowrap tabular-nums">{value}</span>
    </div>
  );
  return (
    <li
      className={cx(
        "space-y-2 rounded-lg border p-4 md:space-y-0 md:rounded-none md:border-0 md:border-t md:px-1 md:py-3 md:first:border-t-0",
        COLS,
        selected ? "border-sim bg-sim-soft/60" : best && offer.status === "available" ? "border-brand/40 bg-brand-soft/40" : "border-border",
        offer.status === "unavailable" && "opacity-55",
      )}
      data-testid="offer-card"
    >
      <div className="min-w-0">
        <p className="whitespace-nowrap font-semibold text-ink">{offer.funder.name}</p>
        <p className="text-xs text-muted">
          {t.status.funderType[offer.funder.type]} · {p.origin[offer.origin ?? "automatic"]} · {p.validUntil.toLowerCase()} {formatDate(offer.expiresAt.slice(0, 10))}
        </p>
      </div>
      {cell(p.rate, <OfferRate offer={offer} />)}
      {cell(
        p.colNet,
        <span className="inline-flex items-start gap-1 font-bold text-ink">
          <span>
            {formatMoney(offer.netAmountCents)}
            {best && offer.status === "available" && <span className="block text-xs font-semibold text-brand">{p.best}</span>}
          </span>
          {offer.presentValueCents != null && <InfoTip><OfferBreakdown offer={offer} /></InfoTip>}
        </span>,
      )}
      {cell(t.pricing.cet, offer.cetAnnualBps != null ? `${formatBps(offer.cetAnnualBps)}` : "—")}
      {onAccept && (
        <div className="pt-1 md:pt-0 md:text-right">
          {selected ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-sim">
              <Check className="h-4 w-4" aria-hidden /> {p.accepted}
            </span>
          ) : offer.status === "unavailable" ? (
            <span className="text-sm text-muted">{p.unavailable}</span>
          ) : (
            <Button variant={best ? "primary" : "secondary"} onClick={() => onAccept(offer)} disabled={!canAccept} className="w-full md:w-auto">
              {p.accept}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/** Lista comparativa de propostas, com cabeçalho de colunas no computador. */
export function OfferList({ items, canAccept, onAccept }: { items: Offer[]; canAccept: boolean; onAccept?: (o: Offer) => void }) {
  const { t } = useI18n();
  const p = t.proposals;
  const bestNet = Math.max(...items.filter((o) => o.status === "available").map((o) => o.netAmountCents), -1);
  return (
    <div>
      <div className={cx("hidden border-b border-border px-1 pb-2 text-xs font-medium uppercase tracking-wide text-faint", COLS)}>
        <span>{p.colFunder}</span>
        <span className="flex items-center gap-1">
          {p.rate}
          <InfoTip>{t.pricing.formula}</InfoTip>
        </span>
        <span>{p.colNet}</span>
        <span className="flex items-center gap-1">
          {t.pricing.cet} {t.pricing.perYear}
          <InfoTip>{t.pricing.cetHint}</InfoTip>
        </span>
        {onAccept && <span className="sr-only">{p.accept}</span>}
      </div>
      <ul className="space-y-3 md:space-y-0">
        {items.map((o) => (
          <OfferRow key={o.id} offer={o} best={o.netAmountCents === bestNet} canAccept={canAccept} onAccept={onAccept} />
        ))}
      </ul>
    </div>
  );
}

function ConfirmDialog({ offer, busy, error, onConfirm, onCancel }: { offer: Offer; busy: boolean; error: string | null; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-surface p-0 text-ink backdrop:bg-ink/40"
      aria-labelledby="accept-title"
    >
      <div className="p-6">
        <h2 id="accept-title" className="text-lg font-bold">{t.proposals.confirmTitle}</h2>
        <p className="mt-2 text-sm text-muted">{t.proposals.confirmText(offer.funder.name, formatMoney(offer.netAmountCents))}</p>
        <p className="mt-3 text-sm text-muted">{t.proposals.confirmNote}</p>
        {error && <Alert tone="bad" className="mt-3">{error}</Alert>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>{t.common.cancel}</Button>
          <Button onClick={onConfirm} loading={busy}>{busy ? t.proposals.confirming : t.proposals.confirm}</Button>
        </div>
      </div>
    </dialog>
  );
}

// Etapa 5: a distribuidora compara as propostas e aceita uma (§5.7 e §5.8). Atualiza sozinho para mostrar novas propostas.
export function ProposalsPanel({ receivable, onUpdated }: { receivable: Receivable; onUpdated: (r: Receivable) => void }) {
  const { t, errorMessage } = useI18n();
  const open = receivable.status === "published";
  const { state, reload } = useAsync(() => api.listOffers(receivable.id), [receivable.id, receivable.status]);
  const [choosing, setChoosing] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = state.data?.items ?? [];

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => void reload(true), POLL_MS);
    return () => clearInterval(timer);
  }, [open, reload]);

  // Ao ver a lista, as propostas deixam de contar como "novas" no painel.
  useEffect(() => {
    if (state.data) markOffersSeen(receivable.id, state.data.items.length);
  }, [state.data, receivable.id]);

  async function accept() {
    if (!choosing) return;
    setBusy(true);
    setError(null);
    try {
      onUpdated(await api.selectOffer(receivable.id, choosing.id));
      setChoosing(null);
    } catch (e) {
      const ae = toApiError(e);
      setError(errorMessage(ae));
      if (ae.code === "OFFER_ALREADY_SELECTED" || ae.code === "INVALID_STATE") {
        setChoosing(null);
        void reload(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="proposals-panel">
      <CardTitle icon={<Handshake className="h-4 w-4 text-sim" aria-hidden />} aside={<Badge>{items.length}</Badge>}>
        {t.proposals.title}
      </CardTitle>
      <div aria-live="polite">
        {!state.data && state.status === "loading" && <LoadingBlock lines={3} />}
        {state.status === "error" && !state.data && <Alert tone="bad">{errorMessage(state.error)}</Alert>}
        {state.data && items.length === 0 && <p className="text-sm text-muted">{t.proposals.empty}</p>}
        {items.length > 0 && (
          <OfferList
            items={items}
            canAccept={open}
            onAccept={(offer) => {
              setError(null);
              setChoosing(offer);
            }}
          />
        )}
        {open && <p className="mt-4 text-xs text-muted">{t.proposals.waitingMore}</p>}
        {error && !choosing && <Alert tone="bad" className="mt-4">{error}</Alert>}
      </div>
      {choosing && <ConfirmDialog offer={choosing} busy={busy} error={error} onConfirm={accept} onCancel={() => setChoosing(null)} />}
    </Card>
  );
}
