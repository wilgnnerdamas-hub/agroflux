"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Building2, Handshake, Lock, UserCheck } from "lucide-react";
import { api, toApiError } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { formatDateTime, formatMoney, formatRateBps } from "@/lib/format";
import { FUNDER_TYPE_LABEL, OFFERS_DISCLAIMER_FALLBACK } from "@/lib/labels";
import type { Offer, OfferList, Receivable } from "@/lib/types";
import { Alert, Button, ButtonLink, Card, ErrorState, PageHeader, Skeleton, cx } from "@/components/ui";
import { SimulatedBadge } from "@/components/status";

function SimulationBanner({ text }: { text: string }) {
  return (
    <div className="sticky top-0 z-10 -mx-4 mb-6 border-y border-sim/30 bg-sim-soft px-4 py-3 sm:mx-0 sm:rounded-lg sm:border" role="note">
      <p className="text-sm font-bold uppercase tracking-wide text-sim">Simulação — ofertas fictícias, sem movimentação financeira</p>
      <p className="mt-0.5 text-sm text-ink/80">{text}</p>
    </div>
  );
}

function OfferCard({
  offer,
  best,
  disabled,
  onSelect,
}: {
  offer: Offer;
  best: boolean;
  disabled: boolean;
  onSelect: (o: Offer) => void;
}) {
  const discount = offer.grossAmountCents - offer.netAmountCents - offer.feesCents;
  const selected = offer.status === "selected";
  return (
    <article
      className={cx(
        "flex flex-col rounded-xl border bg-surface p-5",
        selected ? "border-sim ring-2 ring-sim/30" : "border-border",
        offer.status === "unavailable" && "opacity-60",
      )}
      aria-label={`Oferta simulada de ${offer.funder.name}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold">
            <Building2 className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <span className="truncate">{offer.funder.name}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">{FUNDER_TYPE_LABEL[offer.funder.type]}</p>
        </div>
        <SimulatedBadge />
      </div>

      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-faint">Valor líquido simulado</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{formatMoney(offer.netAmountCents)}</p>
        {best && offer.status === "available" && (
          <p className="mt-1 text-xs font-semibold text-brand">Maior valor líquido entre as simulações</p>
        )}
      </div>

      <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
        <div className="flex justify-between gap-2"><dt className="text-muted">Taxa simulada</dt><dd className="font-medium tabular-nums">{formatRateBps(offer.monthlyRateBps)}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">Desconto</dt><dd className="tabular-nums">− {formatMoney(discount)}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">Tarifas</dt><dd className="tabular-nums">− {formatMoney(offer.feesCents)}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">Prazo</dt><dd className="tabular-nums">{offer.termDays} dias</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">Validade</dt><dd className="text-right">{formatDateTime(offer.expiresAt)}</dd></div>
      </dl>

      <div className="mt-5 flex-1" />
      {selected ? (
        <p className="flex items-center justify-center gap-2 rounded-lg bg-sim-soft py-2.5 text-sm font-semibold text-sim">
          <Handshake className="h-4 w-4" aria-hidden /> Selecionada (simulação)
        </p>
      ) : offer.status === "unavailable" ? (
        <p className="py-2.5 text-center text-sm text-muted">Indisponível</p>
      ) : (
        <Button variant="secondary" onClick={() => onSelect(offer)} disabled={disabled}>
          Selecionar esta simulação
        </Button>
      )}
    </article>
  );
}

function ConfirmDialog({
  offer,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  offer: Offer;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-surface p-0 text-ink backdrop:bg-ink/40"
      aria-labelledby="confirm-title"
    >
      <div className="p-6">
        <h2 id="confirm-title" className="text-lg font-bold">Selecionar oferta simulada?</h2>
        <p className="mt-2 text-sm text-muted">
          Você está escolhendo a simulação de <strong className="text-ink">{offer.funder.name}</strong>, com valor líquido
          simulado de <strong className="text-ink">{formatMoney(offer.netAmountCents)}</strong>.
        </p>
        <Alert tone="sim" className="mt-4">
          Esta é uma simulação. Nenhum contrato é firmado, nenhum valor é transferido e as demais ofertas ficam
          indisponíveis nesta demonstração.
        </Alert>
        {error && <Alert tone="bad" className="mt-3">{error}</Alert>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button onClick={onConfirm} loading={busy}>{busy ? "Registrando…" : "Confirmar seleção"}</Button>
        </div>
      </div>
    </dialog>
  );
}

export default function OffersPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { state, reload } = useAsync(
    async () => {
      const receivable = await api.getReceivable(id);
      let offers: OfferList | null = null;
      let offersError: ReturnType<typeof toApiError> | null = null;
      if (receivable.chain.status === "confirmed") {
        try {
          offers = await api.listOffers(id);
        } catch (e) {
          offersError = toApiError(e);
        }
      }
      return { receivable, offers, offersError } as { receivable: Receivable; offers: OfferList | null; offersError: ReturnType<typeof toApiError> | null };
    },
    [id],
  );
  const [choosing, setChoosing] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);

  async function confirm() {
    if (!choosing) return;
    setBusy(true);
    setSelectError(null);
    try {
      await api.selectOffer(id, choosing.id);
      router.push(`/recebiveis/${id}?oferta=1`);
    } catch (e) {
      const ae = toApiError(e);
      setSelectError(ae.message);
      setBusy(false);
      if (ae.code === "OFFER_ALREADY_SELECTED" || ae.code === "INVALID_STATE" || ae.code === "DEBTOR_CONFIRMATION_REQUIRED") {
        setChoosing(null);
        void reload(true);
      }
    }
  }

  const back = (
    <Link href={`/recebiveis/${id}`} className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Passaporte
    </Link>
  );

  const d = state.data;

  if (!d && state.status === "loading") {
    return (
      <>
        <PageHeader back={back} title="Ofertas simuladas" />
        <div className="grid gap-4 md:grid-cols-3" role="status" aria-live="polite">
          <span className="sr-only">Carregando ofertas simuladas…</span>
          {[0, 1, 2].map((i) => (
            <Card key={i}><Skeleton className="w-32" /><Skeleton className="mt-6 h-8 w-40" /><Skeleton className="mt-6" /><Skeleton className="mt-2" /></Card>
          ))}
        </div>
      </>
    );
  }
  if (!d && state.status === "error") {
    return (
      <>
        <PageHeader back={back} title="Ofertas simuladas" />
        <ErrorState message={state.error.message} onRetry={() => reload()} />
      </>
    );
  }
  if (!d) return null;

  const { receivable: r, offers, offersError } = d;
  const ready = r.chain.status === "confirmed";
  // G1 (v1.1): a seleção exige a confirmação do sacado registrada on-chain.
  const dc = r.debtorConfirmation;
  const dcConfirmed = dc.status === "confirmed" && dc.chain?.status === "confirmed";
  const needsConfirmation = r.status === "registered" && !dcConfirmed;
  const items = offers?.items ?? [];
  const bestNet = Math.max(...items.filter((o) => o.status === "available").map((o) => o.netAmountCents), -1);

  return (
    <>
      <PageHeader
        back={back}
        title="Ofertas simuladas"
        subtitle={`${r.reference} · valor de face ${formatMoney(r.amountCents)} · ${r.termDays} dias`}
      />

      <SimulationBanner text={offers?.disclaimer || OFFERS_DISCLAIMER_FALLBACK} />

      {!ready && (
        <Card>
          <div className="flex flex-col items-center py-6 text-center">
            <Lock className="mb-3 h-8 w-8 text-faint" aria-hidden />
            <p className="font-semibold">Disponível após a confirmação na Devnet</p>
            <p className="mt-1 max-w-md text-sm text-muted">
              Registre o recebível na Solana Devnet e aguarde a confirmação para gerar as ofertas simuladas.
            </p>
            <ButtonLink href={`/recebiveis/${r.id}`} className="mt-5">Ir para o passaporte</ButtonLink>
          </div>
        </Card>
      )}

      {ready && offersError && (
        <ErrorState title="Não foi possível carregar as ofertas simuladas" message={offersError.message} onRetry={() => reload()} />
      )}

      {ready && offers && items.length === 0 && (
        <Card><p className="py-6 text-center text-sm text-muted">Nenhuma oferta simulada foi gerada para este recebível.</p></Card>
      )}

      {ready && items.length > 0 && (
        <>
          {needsConfirmation && (
            <Alert
              tone="warn"
              title="Falta a confirmação do sacado"
              className="mb-4"
              action={
                <ButtonLink href={`/recebiveis/${r.id}`} variant="secondary">
                  <UserCheck className="h-4 w-4" aria-hidden /> Ir para a confirmação
                </ButtonLink>
              }
            >
              {dc.status === "confirmed"
                ? "O sacado confirmou e o registro na Devnet está em andamento. Assim que terminar, a seleção fica liberada."
                : "Você pode ver as condições simuladas, mas só poderá selecionar uma oferta depois que o sacado confirmar o recebível."}
            </Alert>
          )}
          {selectError && !choosing && <Alert tone="bad" className="mb-4">{selectError}</Alert>}
          {r.status !== "registered" && r.selectedOfferId && (
            <Alert tone="ok" title="Você já selecionou uma oferta simulada" className="mb-4">
              As demais ficaram indisponíveis nesta demonstração.
            </Alert>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            {items.map((o) => (
              <OfferCard
                key={o.id}
                offer={o}
                best={o.netAmountCents === bestNet}
                disabled={r.status !== "registered" || !dcConfirmed}
                onSelect={(offer) => { setSelectError(null); setChoosing(offer); }}
              />
            ))}
          </div>
          <p className="mt-6 text-xs text-muted">
            Cálculo ilustrativo: desconto = valor de face × taxa mensal × (prazo ÷ 30), menos tarifas. Não representa
            condições de mercado nem proposta de financiamento.
          </p>
        </>
      )}

      {choosing && (
        <ConfirmDialog
          offer={choosing}
          busy={busy}
          error={selectError}
          onConfirm={confirm}
          onCancel={() => setChoosing(null)}
        />
      )}
    </>
  );
}
