"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, ShieldCheck, XCircle, Link2 } from "lucide-react";
import { api, API_MODE, toApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/idempotency";
import type { Receivable, Verification } from "@/lib/types";
import { Alert, Button, Card, CardTitle, DescList, MonoValue } from "./ui";
import { ChainStatusBadge } from "./status";


type VerifyState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: Verification }
  | { status: "error"; message: string };

function VerificationPanel({ receivableId }: { receivableId: string }) {
  const [v, setV] = useState<VerifyState>({ status: "idle" });
  const run = async () => {
    setV({ status: "loading" });
    try {
      setV({ status: "done", data: await api.getVerification(receivableId) });
    } catch (e) {
      setV({ status: "error", message: toApiError(e).message });
    }
  };
  return (
    <div className="mt-5 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Verificação independente</p>
          <p className="text-xs text-muted">Busca a transação na Devnet e confere os hashes com os dados guardados.</p>
        </div>
        <Button variant="secondary" onClick={run} loading={v.status === "loading"}>
          <ShieldCheck className="h-4 w-4" aria-hidden /> {v.status === "done" ? "Verificar de novo" : "Verificar na rede"}
        </Button>
      </div>
      <div aria-live="polite">
        {v.status === "error" && (
          <Alert tone="warn" title="Não foi possível verificar agora" className="mt-3">
            {v.message}
          </Alert>
        )}
        {v.status === "done" && (
          <div className="mt-3 rounded-lg border border-border p-4">
            <p className={`mb-3 flex items-center gap-2 text-sm font-semibold ${v.data.verified ? "text-ok" : "text-bad"}`}>
              {v.data.verified ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <XCircle className="h-5 w-5" aria-hidden />}
              {v.data.verified ? "Registro verificado na Devnet" : "A verificação encontrou divergências"}
            </p>
            <ul className="space-y-2">
              {v.data.checks.map((c) => (
                <li key={c.name} className="flex items-start gap-2 text-sm">
                  {c.passed ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-label="Aprovado" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-label="Reprovado" />
                  )}
                  {c.label}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Verificado em {formatDateTime(v.data.checkedAt)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChainCard({
  receivable,
  onUpdated,
  pollingTimedOut,
  onRefresh,
}: {
  receivable: Receivable;
  onUpdated: (r: Receivable) => void;
  pollingTimedOut: boolean;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idemKey, setIdemKey] = useState<string | null>(null);
  const c = receivable.chain;

  async function register() {
    setError(null);
    setBusy(true);
    // Mesma chave enquanto a tentativa não termina: um clique duplo não cria duas transações.
    const key = idemKey ?? newIdempotencyKey();
    setIdemKey(key);
    try {
      onUpdated(await api.registerReceivable(receivable.id, key));
      setIdemKey(null);
    } catch (e) {
      const ae = toApiError(e);
      setError(ae.message);
      if (ae.code === "INVALID_STATE") onRefresh();
      if (ae.code !== "NETWORK_ERROR") setIdemKey(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={c.status === "confirmed" ? "border-chain/30" : undefined} data-testid="chain-card">
      <CardTitle icon={<Link2 className="h-4 w-4 text-chain" aria-hidden />} aside={<ChainStatusBadge status={c.status} />}>
        Registro na Solana Devnet
      </CardTitle>

      {c.status === "none" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Grava na rede de testes da Solana um memo com o identificador do recebível, o hash do documento e o hash dos
            dados. Nomes, valores e o próprio documento não vão para a blockchain.
          </p>
          {error && <Alert tone="bad" title="Não foi possível enviar o registro">{error}</Alert>}
          <Button onClick={register} loading={busy}>
            {busy ? "Enviando…" : "Registrar na Solana Devnet"}
          </Button>
        </div>
      )}

      {c.status === "pending" && (
        <div className="space-y-4" aria-live="polite">
          {API_MODE === "mock" ? (
            <Alert tone="warn" title="Aguardando backend">
              No modo mock nenhuma transação é criada, então o registro permanece pendente. Com o backend conectado, a
              confirmação costuma levar alguns segundos.
            </Alert>
          ) : pollingTimedOut ? (
            <Alert
              tone="warn"
              title="Ainda aguardando confirmação"
              action={
                <Button variant="secondary" onClick={onRefresh}>
                  <RefreshCw className="h-4 w-4" aria-hidden /> Atualizar status
                </Button>
              }
            >
              A confirmação está demorando mais que o normal. A rede pode estar lenta.
            </Alert>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-warn" aria-hidden />
              Transação enviada. Aguardando confirmação da rede…
            </p>
          )}
          {c.submittedAt && <p className="text-xs text-muted">Enviado em {formatDateTime(c.submittedAt)}</p>}
        </div>
      )}

      {c.status === "failed" && (
        <div className="space-y-4">
          <Alert tone="bad" title="O registro não foi concluído">
            {c.error?.message ?? "A transação não foi confirmada."}
          </Alert>
          {c.signature && <DescList items={[{ label: "Assinatura (falhou)", value: <MonoValue value={c.signature} /> }]} />}
          {error && <Alert tone="bad">{error}</Alert>}
          <Button onClick={register} loading={busy}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Tentar registrar novamente
          </Button>
        </div>
      )}

      {c.status === "confirmed" && (
        <div>
          {c.signature ? (
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">Assinatura da transação</p>
                <MonoValue value={c.signature} copyLabel="Copiar assinatura" />
              </div>
              <DescList
                items={[
                  { label: "Slot", value: c.slot != null ? <span className="tabular-nums">{c.slot.toLocaleString("pt-BR")}</span> : "—" },
                  { label: "Confirmado em", value: c.confirmedAt ? formatDateTime(c.confirmedAt) : "—" },
                  { label: "Rede", value: "Solana Devnet (testes)" },
                  { label: "Programa", value: c.programId ? <code className="break-all font-mono text-xs">{c.programId}</code> : "—" },
                ]}
              />
              {c.payloadHash && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">Hash dos dados do recebível</p>
                  <MonoValue value={c.payloadHash} copyLabel="Copiar hash dos dados" />
                </div>
              )}
              {c.memo && (
                <details className="rounded-lg border border-border p-3 text-sm">
                  <summary className="cursor-pointer font-medium">Conteúdo gravado on-chain (memo)</summary>
                  <code className="mt-2 block break-all font-mono text-xs text-muted">{c.memo}</code>
                </details>
              )}
              {c.explorerUrl && (
                <a
                  href={c.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-chain hover:underline"
                >
                  Ver no Solana Explorer (Devnet) <ExternalLink className="h-4 w-4" aria-hidden />
                  <span className="sr-only">(abre em nova aba)</span>
                </a>
              )}
              <VerificationPanel receivableId={receivable.id} />
            </div>
          ) : (
            <Alert tone="warn" title="Confirmado sem assinatura">
              O backend marcou o registro como confirmado, mas não enviou a assinatura da transação. Avise a equipe de
              backend: a interface não exibe transações sem assinatura.
            </Alert>
          )}
        </div>
      )}
    </Card>
  );
}
