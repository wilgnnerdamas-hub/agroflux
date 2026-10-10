"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ExternalLink, Loader2, QrCode, RefreshCw, UserCheck } from "lucide-react";
import { api, API_MODE, toApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { DebtorConfirmationBadge } from "../status";
import { Alert, Button, Card, CardTitle, FieldLabel, MonoValue } from "../ui";
import { useReceivableAction, type StepProps } from "./shared";

// O token só vem na resposta que gera o link (§5.10). Guardamos o link nesta aba para sobreviver a um recarregamento.
const linkKey = (id: string) => `agroflux.dc-link.${id}`;
type SavedLink = { url: string; expiresAt: string };

function readLink(id: string): SavedLink | null {
  try {
    const raw = window.sessionStorage.getItem(linkKey(id));
    return raw ? (JSON.parse(raw) as SavedLink) : null;
  } catch {
    return null;
  }
}

function writeLink(id: string, value: SavedLink | null) {
  try {
    if (value) window.sessionStorage.setItem(linkKey(id), JSON.stringify(value));
    else window.sessionStorage.removeItem(linkKey(id));
  } catch {
    /* armazenamento indisponível: o link fica só na tela */
  }
}

/** QR code gerado no navegador a partir do link (nenhum serviço externo). */
function LinkQr({ url }: { url: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(null));
    return () => {
      alive = false;
    };
  }, [url]);
  if (!svg) return null;
  return (
    <div
      className="h-44 w-44 shrink-0 rounded-lg border border-border bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
      role="img"
      aria-label="QR code"
      data-testid="acceptance-qr"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// Etapa 3: aceite do sacado na registradora (simulado), por QR code ou link.
export function DebtorStep({ receivable, onUpdated }: StepProps) {
  const { t, errorMessage } = useI18n();
  const dc = receivable.debtorConfirmation;
  const [link, setLink] = useState<SavedLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retry = useReceivableAction((key) => api.retryDebtorConfirmationRegister(receivable.id, key), onUpdated);

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
      setError(errorMessage(toApiError(e)));
    } finally {
      setBusy(false);
    }
  }

  const chain = dc.chain;

  return (
    <Card data-testid="debtor-step">
      <CardTitle icon={<UserCheck className="h-4 w-4 text-ok" aria-hidden />} aside={<DebtorConfirmationBadge status={dc.status} />}>
        {t.debtor.title}
      </CardTitle>

      {dc.status === "none" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">{t.debtor.intro}</p>
          <Button onClick={requestLink} loading={busy}>
            <QrCode className="h-4 w-4" aria-hidden /> {t.debtor.generate}
          </Button>
        </div>
      )}

      {dc.status === "requested" && (
        <div className="space-y-4" aria-live="polite">
          {link ? (
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <LinkQr url={link.url} />
              <div className="min-w-0 flex-1 space-y-3">
                <p className="text-sm text-muted">{t.debtor.qrHint}</p>
                <div>
                  <FieldLabel>{t.debtor.link}</FieldLabel>
                  <MonoValue value={link.url} copyLabel={t.debtor.copyLink} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-border-strong px-4 py-2.5 text-sm font-semibold hover:bg-subtle"
                  >
                    {t.debtor.open} <ExternalLink className="h-4 w-4" aria-hidden />
                    <span className="sr-only">{t.common.openNewTab}</span>
                  </a>
                  <Button variant="ghost" onClick={requestLink} loading={busy}>
                    <RefreshCw className="h-4 w-4" aria-hidden /> {t.debtor.regenerate}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted">{t.debtor.lostLink(dc.requestedAt ? formatDateTime(dc.requestedAt) : "")}</p>
              <Button variant="secondary" onClick={requestLink} loading={busy}>
                <RefreshCw className="h-4 w-4" aria-hidden /> {t.debtor.regenerate}
              </Button>
            </>
          )}
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-warn" aria-hidden /> {t.debtor.waiting}
          </p>
          {dc.expiresAt && <p className="text-xs text-muted">{t.debtor.validUntil(formatDateTime(dc.expiresAt))}</p>}
        </div>
      )}

      {dc.status === "declined" && (
        <div className="space-y-4">
          <Alert tone="warn" title={t.debtor.declinedTitle}>{t.debtor.declinedText}</Alert>
          <Button variant="secondary" onClick={requestLink} loading={busy}>
            <RefreshCw className="h-4 w-4" aria-hidden /> {t.debtor.regenerate}
          </Button>
        </div>
      )}

      {dc.status === "confirmed" && chain?.status === "pending" && (
        <div aria-live="polite">
          {API_MODE === "mock" ? (
            <Alert tone="warn" title={t.chain.mockWait}>{t.debtor.mockPending}</Alert>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-warn" aria-hidden /> {t.debtor.registering}
            </p>
          )}
        </div>
      )}

      {dc.status === "confirmed" && chain?.status === "failed" && (
        <div className="space-y-4">
          <Alert tone="bad" title={t.debtor.chainFailed}>{chain.error ? errorMessage(chain.error) : t.chain.failedText}</Alert>
          {retry.error && <Alert tone="bad">{retry.error}</Alert>}
          <Button onClick={retry.run} loading={retry.busy}>
            <RefreshCw className="h-4 w-4" aria-hidden /> {t.debtor.retry}
          </Button>
        </div>
      )}

      {error && <Alert tone="bad" className="mt-4">{error}</Alert>}
    </Card>
  );
}
