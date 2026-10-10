"use client";

import { useId, useState } from "react";
import { Loader2, Megaphone, RefreshCw, ScrollText } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAsync } from "@/lib/useAsync";
import { Alert, Button, Card, CardTitle, LoadingBlock } from "../ui";
import { useReceivableAction, type StepProps } from "./shared";

// Etapa 4: publicação para financiadores com o termo de coobrigação simulado (§5.15 e §5.16).
export function PublishStep({ receivable, onUpdated }: StepProps) {
  const { t } = useI18n();
  const terms = useAsync(() => api.getTerms(), []);
  const [accepted, setAccepted] = useState(false);
  const checkId = useId();
  const version = terms.state.data?.version;
  const action = useReceivableAction((key) => api.publish(receivable.id, version!, key), onUpdated);

  return (
    <Card data-testid="publish-step">
      <CardTitle icon={<Megaphone className="h-4 w-4 text-info" aria-hidden />}>{t.publish.title}</CardTitle>
      <p className="text-sm text-muted">{t.publish.intro}</p>

      <div className="mt-4 rounded-lg border border-border bg-subtle p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <ScrollText className="h-4 w-4 text-muted" aria-hidden /> {t.publish.termsTitle}
        </p>
        {terms.state.status === "loading" && <LoadingBlock lines={3} />}
        {terms.state.status === "error" && <p className="text-sm text-bad">{t.publish.loadTermsError}</p>}
        {terms.state.data && (
          <div className="max-h-48 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-ink/80" tabIndex={0} data-testid="terms-text">
            {terms.state.data.text}
          </div>
        )}
      </div>

      <label htmlFor={checkId} className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
        <input
          id={checkId}
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          disabled={!version}
        />
        <span>{t.publish.accept}</span>
      </label>

      {action.error && <Alert tone="bad" title={t.publish.error} className="mt-4">{action.error}</Alert>}
      <Button className="mt-4" onClick={action.run} loading={action.busy} disabled={!accepted || !version}>
        <Megaphone className="h-4 w-4" aria-hidden /> {action.busy ? t.publish.publishing : t.publish.submit}
      </Button>
    </Card>
  );
}

/** Situação do memo do termo depois de publicado: só aparece enquanto registra ou se falhou. */
export function TermsChainNotice({ receivable, onUpdated }: StepProps) {
  const { t } = useI18n();
  const retry = useReceivableAction((key) => api.retryPublishRegister(receivable.id, key), onUpdated);
  const chain = receivable.listing.chain;
  if (chain?.status === "pending") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin text-warn" aria-hidden /> {t.publish.anchoring}
      </p>
    );
  }
  if (chain?.status === "failed") {
    return (
      <Alert
        tone="warn"
        title={t.publish.chainFailed}
        action={
          <Button variant="secondary" onClick={retry.run} loading={retry.busy}>
            <RefreshCw className="h-4 w-4" aria-hidden /> {t.publish.retry}
          </Button>
        }
      >
        {retry.error}
      </Alert>
    );
  }
  return null;
}
