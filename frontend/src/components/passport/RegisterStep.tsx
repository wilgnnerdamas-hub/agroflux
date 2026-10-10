"use client";

import { Link2, Loader2, RefreshCw } from "lucide-react";
import { api, API_MODE } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { ChainStatusBadge } from "../status";
import { Alert, Button, Card, CardTitle, FieldLabel, MonoValue } from "../ui";
import { useReceivableAction, type StepProps } from "./shared";

// Etapa 2: registro do recebível na Devnet (§5.5). Depois de confirmado, os detalhes ficam nos registros on-chain.
export function RegisterStep({ receivable, onUpdated, pollingTimedOut, onRefresh }: StepProps & { pollingTimedOut: boolean; onRefresh: () => void }) {
  const { t, errorMessage } = useI18n();
  const c = receivable.chain;
  const action = useReceivableAction(
    (key) => api.registerReceivable(receivable.id, key),
    onUpdated,
    (e) => e.code === "INVALID_STATE" && onRefresh(),
  );

  return (
    <Card data-testid="register-step">
      <CardTitle icon={<Link2 className="h-4 w-4 text-chain" aria-hidden />} aside={<ChainStatusBadge status={c.status} />}>
        {t.chain.title}
      </CardTitle>

      {c.status === "none" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">{t.chain.intro}</p>
          {action.error && <Alert tone="bad" title={t.chain.sendError}>{action.error}</Alert>}
          <Button onClick={action.run} loading={action.busy}>{action.busy ? t.chain.sending : t.chain.send}</Button>
        </div>
      )}

      {c.status === "pending" && (
        <div className="space-y-4" aria-live="polite">
          {API_MODE === "mock" ? (
            <Alert tone="warn" title={t.chain.mockWait}>{t.chain.mockWaitText}</Alert>
          ) : pollingTimedOut ? (
            <Alert
              tone="warn"
              title={t.chain.slowTitle}
              action={
                <Button variant="secondary" onClick={onRefresh}>
                  <RefreshCw className="h-4 w-4" aria-hidden /> {t.chain.refresh}
                </Button>
              }
            >
              {t.chain.slowText}
            </Alert>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-warn" aria-hidden /> {t.chain.waiting}
            </p>
          )}
          {c.submittedAt && <p className="text-xs text-muted">{t.chain.sentAt(formatDateTime(c.submittedAt))}</p>}
        </div>
      )}

      {c.status === "failed" && (
        <div className="space-y-4">
          <Alert tone="bad" title={t.chain.failedTitle}>{c.error ? errorMessage(c.error) : t.chain.failedText}</Alert>
          {c.signature && (
            <div>
              <FieldLabel>{t.chain.failedSig}</FieldLabel>
              <MonoValue value={c.signature} />
            </div>
          )}
          {action.error && <Alert tone="bad">{action.error}</Alert>}
          <Button onClick={action.run} loading={action.busy}>
            <RefreshCw className="h-4 w-4" aria-hidden /> {t.chain.retry}
          </Button>
        </div>
      )}
    </Card>
  );
}
