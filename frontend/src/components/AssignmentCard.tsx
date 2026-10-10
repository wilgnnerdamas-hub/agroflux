"use client";

import { useEffect, useState } from "react";
import { Coins, ExternalLink, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { api, toApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/idempotency";
import { ASSIGNMENT_STATUS_LABEL } from "@/lib/labels";
import type { AssignmentStatus, Receivable } from "@/lib/types";
import { Alert, Badge, Button, Card, CardTitle, DescList, MonoValue, type Tone } from "./ui";

// v1.1, função B (§3.10, §5.14 e §6.4). Só aparece com NEXT_PUBLIC_FEATURE_ASSIGNMENT=true e o backend com a cessão ligada.
export const ASSIGNMENT_NOTICE =
  "Simulação em rede de testes. Token e moeda sem valor. Não é oferta de investimento nem cessão jurídica. Uma operação real exigiria adequação às regras da CVM e registro do título em registradora.";

export function AssignmentNotice() {
  return (
    <div className="flex gap-3 rounded-lg border border-sim/30 bg-sim-soft p-3.5" role="note" data-testid="assignment-notice">
      <ShieldAlert className="h-5 w-5 shrink-0 text-sim" aria-hidden />
      <p className="text-sm font-medium text-sim">{ASSIGNMENT_NOTICE}</p>
    </div>
  );
}

const TONE: Record<AssignmentStatus, Tone> = { none: "neutral", pending: "warn", settled: "sim", failed: "bad" };

const formatTbrl = (units: number) =>
  `${(units / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tBRL-DEMO`;

const short = (key: string) => (key.length > 12 ? `${key.slice(0, 4)}…${key.slice(-4)}` : key);

function ExplorerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-chain hover:underline">
      {children} <ExternalLink className="h-4 w-4" aria-hidden />
      <span className="sr-only">(abre em nova aba)</span>
    </a>
  );
}

/** Mostra se a cessão está disponível no backend (health.features.assignment). */
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

export function AssignmentCard({ receivable, onUpdated }: { receivable: Receivable; onUpdated: (r: Receivable) => void }) {
  const a = receivable.assignment;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);

  async function start() {
    setError(null);
    setBusy(true);
    const k = key ?? newIdempotencyKey();
    setKey(k);
    try {
      onUpdated(await api.requestAssignment(receivable.id, k));
      setKey(null);
    } catch (e) {
      const ae = toApiError(e);
      setError(ae.message);
      if (ae.code !== "NETWORK_ERROR") setKey(null);
    } finally {
      setBusy(false);
    }
  }

  const wallets = [
    a.distributorWallet && { label: "Distribuidor demo", value: <span className="font-mono text-xs" title={a.distributorWallet}>{short(a.distributorWallet)}</span> },
    a.funderWallet && { label: "Financiador demo", value: <span className="font-mono text-xs" title={a.funderWallet}>{short(a.funderWallet)}</span> },
  ].filter(Boolean) as { label: string; value: React.ReactNode }[];

  return (
    <Card className={a.status === "settled" ? "border-sim/40" : undefined} data-testid="assignment-card">
      <CardTitle icon={<Coins className="h-4 w-4 text-sim" aria-hidden />} aside={<Badge tone={TONE[a.status]}>{ASSIGNMENT_STATUS_LABEL[a.status]}</Badge>}>
        Cessão tokenizada
      </CardTitle>

      <AssignmentNotice />

      <div className="mt-4 space-y-4" aria-live="polite">
        {a.status === "none" && (
          <>
            <p className="text-sm text-muted">
              Cria um token único (Token-2022) que representa este recebível e, numa única transação na Solana Devnet,
              troca esse token pelo valor líquido da oferta selecionada em tBRL-DEMO, a moeda de teste. As duas pernas
              acontecem juntas ou nenhuma acontece.
            </p>
            <Button onClick={start} loading={busy}>
              <Coins className="h-4 w-4" aria-hidden /> Formalizar cessão (simulação na Devnet)
            </Button>
          </>
        )}

        {a.status === "pending" && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-warn" aria-hidden />
            {a.tokenMint ? "Token da cessão criado. Liquidando de forma atômica na Solana Devnet…" : "Criando o token da cessão na Solana Devnet…"}
          </p>
        )}

        {a.status === "failed" && (
          <>
            <Alert tone="bad" title="A cessão não foi concluída">
              {a.error?.message ?? "A liquidação falhou."} Nenhuma transferência foi feita.
            </Alert>
            <Button onClick={start} loading={busy}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Tentar novamente
            </Button>
          </>
        )}

        {(a.status === "pending" || a.status === "failed" || a.status === "settled") && (
          <DescList
            items={[
              ...(a.settlementAmount != null ? [{ label: a.status === "settled" ? "Valor liquidado" : "Valor a liquidar", value: <span className="font-semibold tabular-nums">{formatTbrl(a.settlementAmount)}</span> }] : []),
              ...(a.settledAt ? [{ label: "Liquidada em", value: formatDateTime(a.settledAt) }] : []),
              ...wallets,
            ]}
          />
        )}

        {a.tokenMint && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">Token da cessão (Token-2022, supply 1)</p>
            <MonoValue value={a.tokenMint} copyLabel="Copiar endereço do token da cessão" />
            {a.explorerUrls.tokenMint && (
              <div className="mt-2">
                <ExplorerLink href={a.explorerUrls.tokenMint}>Ver token no Solana Explorer (Devnet)</ExplorerLink>
              </div>
            )}
          </div>
        )}

        {a.status === "settled" && (
          a.settlementSignature ? (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">Assinatura da liquidação atômica</p>
              <MonoValue value={a.settlementSignature} copyLabel="Copiar assinatura da liquidação" />
              {a.explorerUrls.settlement && (
                <div className="mt-2">
                  <ExplorerLink href={a.explorerUrls.settlement}>Ver liquidação no Solana Explorer (Devnet)</ExplorerLink>
                </div>
              )}
            </div>
          ) : (
            <Alert tone="warn" title="Liquidada sem assinatura">
              O backend marcou a cessão como liquidada, mas não enviou a assinatura. A interface não exibe transações sem assinatura.
            </Alert>
          )
        )}

        {error && <Alert tone="bad">{error}</Alert>}
      </div>

      <p className="mt-4 text-xs text-muted">
        As carteiras do distribuidor e do financiador são carteiras de demonstração, controladas pelo backend.
      </p>
    </Card>
  );
}
