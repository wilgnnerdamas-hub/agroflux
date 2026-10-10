"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, Send, UserCheck } from "lucide-react";
import { api, API_MODE, toApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { newIdempotencyKey } from "@/lib/idempotency";
import type { Receivable } from "@/lib/types";
import { Alert, Button, Card, CardTitle, DescList, MonoValue } from "./ui";
import { DebtorConfirmationBadge } from "./status";

// O token só vem na resposta que gera o link (§5.10). Guardamos o link nesta aba para sobreviver a um recarregamento.
const linkKey = (id: string) => `agroflux.dc-link.${id}`;

function readLink(id: string): { url: string; expiresAt: string } | null {
  try {
    const raw = window.sessionStorage.getItem(linkKey(id));
    return raw ? (JSON.parse(raw) as { url: string; expiresAt: string }) : null;
  } catch {
    return null;
  }
}

function writeLink(id: string, value: { url: string; expiresAt: string } | null) {
  try {
    if (value) window.sessionStorage.setItem(linkKey(id), JSON.stringify(value));
    else window.sessionStorage.removeItem(linkKey(id));
  } catch {
    /* armazenamento indisponível: o link fica só na tela */
  }
}

export function DebtorConfirmationCard({ receivable, onUpdated }: { receivable: Receivable; onUpdated: (r: Receivable) => void }) {
  const dc = receivable.debtorConfirmation;
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState<string | null>(null);

  useEffect(() => {
    // Só vale o link guardado se ele for o do pedido atual.
    const saved = readLink(receivable.id);
    setLink(saved && saved.expiresAt === dc.expiresAt && dc.status === "requested" ? saved : null);
  }, [receivable.id, dc.expiresAt, dc.status]);

  async function requestLink() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.requestDebtorConfirmation(receivable.id);
      const value = { url: `${window.location.origin}${res.confirmationPath}`, expiresAt: res.expiresAt };
      writeLink(receivable.id, value);
      setLink(value);
      onUpdated(res.receivable);
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  }

  async function retryRegister() {
    setError(null);
    setBusy(true);
    const key = retryKey ?? newIdempotencyKey();
    setRetryKey(key);
    try {
      onUpdated(await api.retryDebtorConfirmationRegister(receivable.id, key));
      setRetryKey(null);
    } catch (e) {
      const ae = toApiError(e);
      setError(ae.message);
      if (ae.code !== "NETWORK_ERROR") setRetryKey(null);
    } finally {
      setBusy(false);
    }
  }

  const chain = dc.chain;
  const confirmedOnChain = dc.status === "confirmed" && chain?.status === "confirmed";

  return (
    <Card className={confirmedOnChain ? "border-ok/30" : undefined} data-testid="debtor-confirmation-card">
      <CardTitle icon={<UserCheck className="h-4 w-4 text-ok" aria-hidden />} aside={<DebtorConfirmationBadge status={dc.status} />}>
        Confirmação do sacado
      </CardTitle>

      {dc.status === "none" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Gere um link para o sacado confirmar a compra a prazo. A confirmação é registrada na Solana Devnet e é
            necessária para selecionar uma oferta simulada.
          </p>
          <Button onClick={requestLink} loading={busy}>
            <Send className="h-4 w-4" aria-hidden /> Gerar link de confirmação
          </Button>
        </div>
      )}

      {dc.status === "requested" && (
        <div className="space-y-4" aria-live="polite">
          {link ? (
            <>
              <p className="text-sm text-muted">
                Envie este link ao sacado (por exemplo, por mensagem) ou abra no celular. Esta tela atualiza sozinha
                quando ele responder.
              </p>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">Link de confirmação</p>
                <MonoValue value={link.url} copyLabel="Copiar link de confirmação" />
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-border-strong px-4 py-2.5 text-sm font-semibold hover:bg-subtle"
                >
                  Abrir link <ExternalLink className="h-4 w-4" aria-hidden />
                  <span className="sr-only">(abre em nova aba)</span>
                </a>
                <Button variant="ghost" onClick={requestLink} loading={busy}>
                  <RefreshCw className="h-4 w-4" aria-hidden /> Gerar novo link
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">
                Um link foi gerado{dc.requestedAt ? ` em ${formatDateTime(dc.requestedAt)}` : ""}. Por segurança, ele não
                fica salvo no servidor. Se precisar enviar de novo, gere outro (o anterior deixa de valer).
              </p>
              <Button variant="secondary" onClick={requestLink} loading={busy}>
                <RefreshCw className="h-4 w-4" aria-hidden /> Gerar novo link
              </Button>
            </>
          )}
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-warn" aria-hidden /> Aguardando a resposta do sacado…
          </p>
          {dc.expiresAt && <p className="text-xs text-muted">Válido até {formatDateTime(dc.expiresAt)}</p>}
        </div>
      )}

      {dc.status === "declined" && (
        <div className="space-y-4">
          <Alert tone="warn" title="O sacado recusou (simulação)">
            Sem a confirmação, não é possível selecionar uma oferta. Se foi um engano, gere um novo link.
          </Alert>
          <Button variant="secondary" onClick={requestLink} loading={busy}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Gerar novo link
          </Button>
        </div>
      )}

      {dc.status === "confirmed" && chain?.status === "pending" && (
        <div className="space-y-2" aria-live="polite">
          {API_MODE === "mock" ? (
            <Alert tone="warn" title="Aguardando backend">
              O sacado confirmou. No modo mock nenhuma transação é criada, então o registro da confirmação fica pendente.
            </Alert>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-warn" aria-hidden />
              O sacado confirmou. Registrando a confirmação na Solana Devnet…
            </p>
          )}
        </div>
      )}

      {dc.status === "confirmed" && chain?.status === "failed" && (
        <div className="space-y-4">
          <Alert tone="bad" title="O sacado confirmou, mas o registro na Devnet falhou">
            {chain.error?.message ?? "A transação não foi confirmada."}
          </Alert>
          <Button onClick={retryRegister} loading={busy}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Tentar registrar novamente
          </Button>
        </div>
      )}

      {confirmedOnChain && (
        <div className="space-y-4">
          {chain.signature ? (
            <>
              <DescList
                items={[
                  { label: "Respondido em", value: dc.respondedAt ? formatDateTime(dc.respondedAt) : "—" },
                  { label: "Rede", value: "Solana Devnet (testes)" },
                ]}
              />
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">Assinatura da confirmação</p>
                <MonoValue value={chain.signature} copyLabel="Copiar assinatura da confirmação" />
              </div>
              {chain.memo && (
                <details className="rounded-lg border border-border p-3 text-sm">
                  <summary className="cursor-pointer font-medium">Conteúdo gravado on-chain (memo)</summary>
                  <code className="mt-2 block break-all font-mono text-xs text-muted">{chain.memo}</code>
                </details>
              )}
              {chain.explorerUrl && (
                <a
                  href={chain.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-chain hover:underline"
                >
                  Ver confirmação no Solana Explorer (Devnet) <ExternalLink className="h-4 w-4" aria-hidden />
                  <span className="sr-only">(abre em nova aba)</span>
                </a>
              )}
            </>
          ) : (
            <Alert tone="warn" title="Confirmado sem assinatura">
              O backend marcou a confirmação como registrada, mas não enviou a assinatura. A interface não exibe
              transações sem assinatura.
            </Alert>
          )}
        </div>
      )}

      {error && <Alert tone="bad" className="mt-4">{error}</Alert>}
      <p className="mt-4 text-xs text-muted">Simulação — sem verificação de identidade do sacado.</p>
    </Card>
  );
}
