"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Handshake } from "lucide-react";
import { api, toApiError } from "@/lib/api";
import { formatDateTime, formatMoney, formatRateBps } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useAsync } from "@/lib/useAsync";
import type { Offer, Receivable } from "@/lib/types";
import { SimulatedBadge } from "../status";
import { Alert, Badge, Button, Card, CardTitle, LoadingBlock, cx } from "../ui";

const POLL_MS = 4000;

export function SimulationBanner({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-sim/30 bg-sim-soft px-4 py-3" role="note">
      <p className="text-sm font-bold uppercase tracking-wide text-sim">{title}</p>
      <p className="mt-0.5 text-sm text-ink/80">{text}</p>
    </div>
  );
}

export function OfferCard({ offer, best, canAccept, onAccept }: { offer: Offer; best: boolean; canAccept: boolean; onAccept?: (o: Offer) => void }) {
  const { t } = useI18n();
  const discount = offer.grossAmountCents - offer.netAmountCents - offer.feesCents;
  const selected = offer.status === "selected";
  return (
    <article
      className={cx(
        "flex flex-col rounded-xl border bg-surface p-5",
        selected ? "border-sim ring-2 ring-sim/30" : "border-border",
        offer.status === "unavailable" && "opacity-60",
      )}
      aria-label={offer.funder.name}
      data-testid="offer-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold">
            <Building2 className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <span className="truncate">{offer.funder.name}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {t.status.funderType[offer.funder.type]} · {t.proposals.origin[offer.origin ?? "automatic"]}
          </p>
        </div>
        <SimulatedBadge />
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-faint">{t.proposals.net}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{formatMoney(offer.netAmountCents)}</p>
        {best && offer.status === "available" && <p className="mt-1 text-xs font-semibold text-brand">{t.proposals.best}</p>}
      </div>

      <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
        <div className="flex justify-between gap-2"><dt className="text-muted">{t.proposals.rate}</dt><dd className="font-medium tabular-nums">{formatRateBps(offer.monthlyRateBps)}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">{t.proposals.discount}</dt><dd className="tabular-nums">− {formatMoney(discount)}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">{t.proposals.fees}</dt><dd className="tabular-nums">− {formatMoney(offer.feesCents)}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">{t.proposals.validUntil}</dt><dd className="text-right">{formatDateTime(offer.expiresAt)}</dd></div>
      </dl>

      {onAccept && (
        <>
          <div className="mt-4 flex-1" />
          {selected ? (
            <p className="flex items-center justify-center gap-2 rounded-lg bg-sim-soft py-2.5 text-sm font-semibold text-sim">
              <Handshake className="h-4 w-4" aria-hidden /> {t.proposals.accepted}
            </p>
          ) : offer.status === "unavailable" ? (
            <p className="py-2.5 text-center text-sm text-muted">{t.proposals.unavailable}</p>
          ) : (
            <Button variant="secondary" onClick={() => onAccept(offer)} disabled={!canAccept}>
              {t.proposals.accept}
            </Button>
          )}
        </>
      )}
    </article>
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
        <Alert tone="sim" className="mt-4">{t.proposals.confirmNote}</Alert>
        {error && <Alert tone="bad" className="mt-3">{error}</Alert>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>{t.common.cancel}</Button>
          <Button onClick={onConfirm} loading={busy}>{busy ? t.proposals.confirming : t.proposals.confirm}</Button>
        </div>
      </div>
    </dialog>
  );
}

// Etapa 5: a distribuidora vê as propostas e aceita uma (§5.7 e §5.8). Atualiza sozinho para mostrar novas propostas.
export function ProposalsPanel({ receivable, onUpdated }: { receivable: Receivable; onUpdated: (r: Receivable) => void }) {
  const { t, errorMessage } = useI18n();
  const open = receivable.status === "published";
  const { state, reload } = useAsync(() => api.listOffers(receivable.id), [receivable.id, receivable.status]);
  const [choosing, setChoosing] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => void reload(true), POLL_MS);
    return () => clearInterval(timer);
  }, [open, reload]);

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

  const items = state.data?.items ?? [];
  const bestNet = Math.max(...items.filter((o) => o.status === "available").map((o) => o.netAmountCents), -1);

  return (
    <Card data-testid="proposals-panel">
      <CardTitle icon={<Handshake className="h-4 w-4 text-sim" aria-hidden />} aside={<Badge tone="sim">{items.length}</Badge>}>
        {t.proposals.title}
      </CardTitle>
      <SimulationBanner title={t.proposals.banner} text={state.data?.disclaimer || t.proposals.disclaimerFallback} />

      <div className="mt-4" aria-live="polite">
        {!state.data && state.status === "loading" && <LoadingBlock lines={3} />}
        {state.status === "error" && !state.data && <Alert tone="bad">{errorMessage(state.error)}</Alert>}
        {state.data && items.length === 0 && <p className="text-sm text-muted">{t.proposals.empty}</p>}
        {items.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((o) => (
              <OfferCard
                key={o.id}
                offer={o}
                best={o.netAmountCents === bestNet}
                canAccept={open}
                onAccept={(offer) => {
                  setError(null);
                  setChoosing(offer);
                }}
              />
            ))}
          </div>
        )}
        {open && <p className="mt-4 text-xs text-muted">{t.proposals.waitingMore}</p>}
        {error && !choosing && <Alert tone="bad" className="mt-4">{error}</Alert>}
        <p className="mt-3 text-xs text-muted">{t.proposals.formula}</p>
      </div>

      {choosing && <ConfirmDialog offer={choosing} busy={busy} error={error} onConfirm={accept} onCancel={() => setChoosing(null)} />}
    </Card>
  );
}
