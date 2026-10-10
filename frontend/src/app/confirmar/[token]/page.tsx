"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Landmark, XCircle } from "lucide-react";
import { api, toApiError } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useAsync } from "@/lib/useAsync";
import type { ConfirmationSummary } from "@/lib/types";
import { Alert, Button, Card, DescList, ErrorState, LoadingBlock } from "@/components/ui";

// §5.11 e §5.12 (v1.2: aceite do título na registradora simulada). Página pública, pensada para o celular do sacado.
function Result({ s }: { s: ConfirmationSummary }) {
  const { t } = useI18n();
  if (s.status === "confirmed") return <Alert tone="ok" title={t.confirm.okTitle}>{t.confirm.okText}</Alert>;
  if (s.status === "declined") return <Alert tone="warn" title={t.confirm.declinedTitle}>{t.confirm.declinedText}</Alert>;
  return null;
}

export default function ConfirmPage() {
  const { t, errorMessage } = useI18n();
  const c = t.confirm;
  const { token } = useParams<{ token: string }>();
  const { state, setState } = useAsync(() => api.getConfirmation(token), [token]);
  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
  const [askDecline, setAskDecline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(kind: "confirm" | "decline") {
    setBusy(kind);
    setError(null);
    try {
      const next = kind === "confirm" ? await api.confirmDebtor(token) : await api.declineDebtor(token);
      setState({ status: "success", data: next });
    } catch (e) {
      const ae = toApiError(e);
      setError(errorMessage(ae));
      // Link já usado em outra aba: mostra o resultado atual.
      if (ae.code === "CONFIRMATION_ALREADY_ANSWERED") {
        try {
          setState({ status: "success", data: await api.getConfirmation(token) });
        } catch {
          /* mantém a mensagem de erro */
        }
      }
    } finally {
      setBusy(null);
      setAskDecline(false);
    }
  }

  const s = state.data;

  if (!s && state.status === "loading") {
    return (
      <Card>
        <LoadingBlock label={c.loading} lines={4} />
      </Card>
    );
  }
  if (!s && state.status === "error") {
    const code = state.error.code;
    if (code === "NOT_FOUND" || code === "CONFIRMATION_LINK_EXPIRED") {
      return (
        <Card>
          <div className="flex flex-col items-center py-6 text-center">
            <XCircle className="mb-3 h-10 w-10 text-faint" aria-hidden />
            <h1 className="text-lg font-bold">{code === "NOT_FOUND" ? c.notFound : c.expired}</h1>
            <p className="mt-1 text-sm text-muted">{code === "NOT_FOUND" ? c.notFoundText : c.expiredText}</p>
          </div>
        </Card>
      );
    }
    return <ErrorState title={c.loadError} message={errorMessage(state.error)} />;
  }
  if (!s) return null;

  return (
    <>
      <h1 className="text-xl font-bold tracking-tight">{c.title}</h1>
      <p className="mt-1 text-sm text-muted">{c.lead(s.distributor.name, s.reference)}</p>

      {s.paymentDomicile && (
        <div className="mt-5 flex gap-3 rounded-lg border border-info/25 bg-info-soft p-4" data-testid="payment-domicile">
          <Landmark className="h-5 w-5 shrink-0 text-info" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold text-info">{c.payTitle}</p>
            <p className="mt-0.5 text-ink/80">{c.payText(s.paymentDomicile.payeeName)}</p>
          </div>
        </div>
      )}

      <Card className="mt-5">
        <DescList
          items={[
            { label: c.distributor, value: s.distributor.name },
            { label: c.reference, value: s.reference },
            ...(s.registryId ? [{ label: c.registry, value: <span className="font-mono text-xs">{s.registryId}</span> }] : []),
            { label: c.product, value: `${t.status.product[s.product.category]} — ${s.product.description}` },
            { label: c.amount, value: <span className="text-lg font-bold tabular-nums">{formatMoney(s.amountCents)}</span> },
            { label: c.due, value: formatDate(s.dueDate) },
          ]}
        />
      </Card>

      <div className="mt-5 space-y-3" aria-live="polite">
        {s.status === "requested" ? (
          <>
            <p className="text-sm text-muted">{c.explain}</p>
            {!askDecline ? (
              <div className="flex flex-col gap-2">
                <Button onClick={() => answer("confirm")} loading={busy === "confirm"} disabled={busy !== null} className="w-full py-3">
                  <CheckCircle2 className="h-5 w-5" aria-hidden /> {c.accept}
                </Button>
                <Button variant="secondary" onClick={() => setAskDecline(true)} disabled={busy !== null} className="w-full">
                  {c.decline}
                </Button>
              </div>
            ) : (
              <Alert
                tone="warn"
                title={c.declineTitle}
                action={
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button variant="danger" onClick={() => answer("decline")} loading={busy === "decline"}>{c.declineYes}</Button>
                    <Button variant="secondary" onClick={() => setAskDecline(false)} disabled={busy !== null}>{t.common.back}</Button>
                  </div>
                }
              >
                {c.declineText}
              </Alert>
            )}
          </>
        ) : (
          <Result s={s} />
        )}
        {error && <Alert tone="bad">{error}</Alert>}
      </div>
    </>
  );
}
