"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, FileText, Handshake, History } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { formatBytes, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { DOCUMENT_KIND_LABEL, FUNDER_TYPE_LABEL, PRODUCT_CATEGORY_LABEL } from "@/lib/labels";
import type { Offer, Receivable } from "@/lib/types";
import { Alert, ButtonLink, Card, CardTitle, DescList, ErrorState, LoadingBlock, MonoValue, PageHeader } from "@/components/ui";
import { ReceivableStatusBadge, SimulatedBadge } from "@/components/status";
import { ChainCard } from "@/components/ChainCard";
import { Timeline } from "@/components/Timeline";
import { FlowSteps } from "@/components/FlowSteps";

const POLL_MS = 2000;
const POLL_MAX_MS = 75_000;

function SelectedOfferCard({ receivable }: { receivable: Receivable }) {
  const [offer, setOffer] = useState<Offer | null | "error">(null);
  useEffect(() => {
    let alive = true;
    api
      .listOffers(receivable.id)
      .then((l) => alive && setOffer(l.items.find((o) => o.id === receivable.selectedOfferId) ?? "error"))
      .catch(() => alive && setOffer("error"));
    return () => {
      alive = false;
    };
  }, [receivable.id, receivable.selectedOfferId]);

  return (
    <Card className="border-sim/30">
      <CardTitle icon={<Handshake className="h-4 w-4 text-sim" aria-hidden />} aside={<SimulatedBadge />}>
        Oferta simulada selecionada
      </CardTitle>
      {offer === null && <LoadingBlock lines={2} />}
      {offer === "error" && <p className="text-sm text-muted">Não foi possível carregar os detalhes da oferta.</p>}
      {offer && offer !== "error" && (
        <DescList
          items={[
            { label: "Financiador (fictício)", value: `${offer.funder.name} · ${FUNDER_TYPE_LABEL[offer.funder.type]}` },
            { label: "Valor líquido simulado", value: <span className="font-semibold tabular-nums">{formatMoney(offer.netAmountCents)}</span> },
          ]}
        />
      )}
      <p className="mt-4 text-xs text-muted">Seleção registrada apenas no histórico da demonstração. Não há contratação nem movimentação financeira.</p>
    </Card>
  );
}

function Passport() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const justCreated = search.get("criado") === "1";
  const justSelected = search.get("oferta") === "1";
  const { state, setState, reload } = useAsync(() => api.getReceivable(id), [id]);
  const r = state.data;

  // Polling enquanto o registro está pendente (§5.5 do contrato).
  const pollStart = useRef<number | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const pending = r?.status === "registration_pending";
  useEffect(() => {
    if (!pending) {
      pollStart.current = null;
      setPollTimedOut(false);
      return;
    }
    if (pollTimedOut) return;
    if (pollStart.current == null) pollStart.current = Date.now();
    const t = setInterval(() => {
      if (Date.now() - (pollStart.current ?? 0) > POLL_MAX_MS) {
        setPollTimedOut(true);
        clearInterval(t);
        return;
      }
      void reload(true);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [pending, pollTimedOut, reload]);

  const refreshNow = () => {
    pollStart.current = Date.now();
    setPollTimedOut(false);
    void reload(true);
  };

  if (!r && state.status === "loading") {
    return (
      <div className="space-y-6">
        <LoadingBlock label="Carregando passaporte…" lines={2} />
        <Card><LoadingBlock lines={4} /></Card>
      </div>
    );
  }
  if (!r && state.status === "error") {
    return (
      <>
        <BackLink />
        <ErrorState
          title={state.error.code === "NOT_FOUND" ? "Recebível não encontrado" : "Não foi possível carregar o passaporte"}
          message={state.error.message}
          onRetry={state.error.code === "NOT_FOUND" ? undefined : () => reload()}
        />
      </>
    );
  }
  if (!r) return null;

  const offersReady = r.status === "registered" || r.status === "offer_selected";
  const doc = r.documents[0];

  return (
    <>
      <PageHeader
        back={<BackLink />}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {r.reference}
            <ReceivableStatusBadge status={r.status} />
          </span>
        }
        subtitle={`Passaporte digital · atualizado em ${formatDateTime(r.updatedAt)}`}
        actions={
          offersReady && (
            <ButtonLink href={`/recebiveis/${r.id}/ofertas`} variant={r.status === "registered" ? "primary" : "secondary"}>
              {r.status === "registered" ? "Ver ofertas simuladas" : "Rever ofertas simuladas"} <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
          )
        }
      />

      <div className="space-y-6">
        {justCreated && r.status === "created" && (
          <Alert tone="ok" title="Recebível cadastrado">
            O passaporte digital foi criado. Próximo passo: registrar na Solana Devnet.
          </Alert>
        )}
        {justSelected && r.status === "offer_selected" && (
          <Alert tone="ok" title="Oferta simulada selecionada">
            A escolha foi registrada no histórico da demonstração.
          </Alert>
        )}
        {state.status === "error" && (
          <ErrorState title="Não foi possível atualizar" message={state.error.message} onRetry={refreshNow} />
        )}

        <Card className="py-4 sm:py-5">
          <FlowSteps status={r.status} />
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <ChainCard
              receivable={r}
              onUpdated={(next) => setState({ status: "success", data: next })}
              pollingTimedOut={pollTimedOut}
              onRefresh={refreshNow}
            />

            {r.status === "offer_selected" && r.selectedOfferId && <SelectedOfferCard receivable={r} />}

            <Card>
              <CardTitle>Dados da operação</CardTitle>
              <DescList
                items={[
                  { label: "Distribuidor", value: r.distributor.name },
                  { label: "Sacado (pseudônimo)", value: `${r.debtor.alias} · ${r.debtor.state}` },
                  { label: "Insumo", value: `${PRODUCT_CATEGORY_LABEL[r.product.category]} — ${r.product.description}` },
                  { label: "Safra", value: r.cropSeason },
                  { label: "Valor de face", value: <span className="font-semibold tabular-nums">{formatMoney(r.amountCents)}</span> },
                  { label: "Prazo", value: `${r.termDays} dias` },
                  { label: "Emissão", value: formatDate(r.issueDate) },
                  { label: "Vencimento", value: formatDate(r.dueDate) },
                ]}
              />
              <p className="mt-5 text-xs text-muted">Recebível fictício para demonstração. Não há validação jurídica.</p>
            </Card>

            {doc && (
              <Card>
                <CardTitle icon={<FileText className="h-4 w-4 text-muted" aria-hidden />}>Documento</CardTitle>
                <DescList
                  items={[
                    { label: "Arquivo", value: <span className="break-all">{doc.filename}</span> },
                    { label: "Tipo", value: `${DOCUMENT_KIND_LABEL[doc.kind]} · ${formatBytes(doc.sizeBytes)}` },
                  ]}
                />
                <div className="mt-4">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">SHA-256 (calculado pelo backend)</p>
                  <MonoValue value={doc.sha256} copyLabel="Copiar hash do documento" />
                </div>
                <p className="mt-3 text-xs text-muted">O arquivo fica guardado de forma privada. Apenas este hash é registrado on-chain.</p>
              </Card>
            )}
          </div>

          <Card className="lg:self-start">
            <CardTitle icon={<History className="h-4 w-4 text-muted" aria-hidden />}>Histórico</CardTitle>
            <Timeline events={r.events} />
          </Card>
        </div>
      </div>
    </>
  );
}

function BackLink() {
  return (
    <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Recebíveis
    </Link>
  );
}

export default function PassportPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Carregando passaporte…" />}>
      <Passport />
    </Suspense>
  );
}
