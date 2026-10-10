"use client";

import { useState } from "react";
import { CheckCircle2, Link2, ShieldCheck, XCircle } from "lucide-react";
import { api, toApiError } from "@/lib/api";
import { formatDateTime, formatNumber, shorten } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Receivable, Verification } from "@/lib/types";
import { Alert, Button, Collapsible, CopyButton, ExplorerLink } from "../ui";

type RecordRow = { key: string; label: string; value: string; url: string | null; memo?: string | null; extra?: string };

/** Registros on-chain já concluídos do recebível. Só usa assinaturas e endereços que vieram do backend (R5). */
export function onChainRows(r: Receivable, t: ReturnType<typeof useI18n>["t"]): RecordRow[] {
  const rows: RecordRow[] = [];
  const c = r.chain;
  if (c.status === "confirmed" && c.signature) {
    rows.push({
      key: "reg",
      label: t.chain.record,
      value: c.signature,
      url: c.explorerUrl,
      memo: c.memo,
      extra: [c.slot != null ? `${t.chain.slot} ${formatNumber(c.slot)}` : null, c.confirmedAt ? formatDateTime(c.confirmedAt) : null].filter(Boolean).join(" · "),
    });
  }
  const dc = r.debtorConfirmation.chain;
  if (dc?.status === "confirmed" && dc.signature) {
    rows.push({ key: "dc", label: t.debtor.record, value: dc.signature, url: dc.explorerUrl, memo: dc.memo });
  }
  const ls = r.listing.chain;
  if (ls?.status === "confirmed" && ls.signature) {
    rows.push({ key: "terms", label: t.publish.record, value: ls.signature, url: ls.explorerUrl, memo: ls.memo });
  }
  const a = r.assignment;
  if (a.tokenMint) rows.push({ key: "token", label: t.assignment.token, value: a.tokenMint, url: a.explorerUrls.tokenMint });
  if (a.status === "settled" && a.settlementSignature) {
    rows.push({ key: "settle", label: t.assignment.settlementSig, value: a.settlementSignature, url: a.explorerUrls.settlement });
    if (a.documentLock) rows.push({ key: "lock", label: t.assignment.documentLock, value: a.documentLock, url: a.explorerUrls.documentLock });
  }
  const p = a.doubleSpendProof;
  if (p?.status === "rejected" && p.signature) rows.push({ key: "proof", label: t.proof.rejectedTitle, value: p.signature, url: p.explorerUrl });
  return rows;
}

function VerificationPanel({ receivableId }: { receivableId: string }) {
  const { t, errorMessage } = useI18n();
  const [v, setV] = useState<{ status: "idle" } | { status: "loading" } | { status: "done"; data: Verification } | { status: "error"; message: string }>({ status: "idle" });
  const run = async () => {
    setV({ status: "loading" });
    try {
      setV({ status: "done", data: await api.getVerification(receivableId) });
    } catch (e) {
      setV({ status: "error", message: errorMessage(toApiError(e)) });
    }
  };
  return (
    <div className="rounded-lg border border-border p-4" data-testid="verification-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{t.verify.title}</p>
          <p className="text-xs text-muted">{t.verify.hint}</p>
        </div>
        <Button variant="secondary" onClick={run} loading={v.status === "loading"}>
          <ShieldCheck className="h-4 w-4" aria-hidden /> {v.status === "done" ? t.verify.again : t.verify.run}
        </Button>
      </div>
      <div aria-live="polite">
        {v.status === "error" && <Alert tone="warn" title={t.verify.fail} className="mt-3">{v.message}</Alert>}
        {v.status === "done" && (
          <div className="mt-3">
            <p className={`mb-2 flex items-center gap-2 text-sm font-semibold ${v.data.verified ? "text-ok" : "text-bad"}`}>
              {v.data.verified ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <XCircle className="h-5 w-5" aria-hidden />}
              {v.data.verified ? t.verify.ok : t.verify.bad}
            </p>
            <ul className="space-y-1.5">
              {v.data.checks.map((c) => (
                <li key={c.name} className="flex items-start gap-2 text-sm">
                  {c.passed ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-label={t.verify.passed} />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-label={t.verify.failed} />
                  )}
                  {t.verify.checks[c.name] ?? c.label}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">{t.verify.at(formatDateTime(v.data.checkedAt))}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Seção "Registros on-chain": lista o que está na rede e oferece a verificação independente. */
export function OnChainRecords({ receivable, defaultOpen = false }: { receivable: Receivable; defaultOpen?: boolean }) {
  const { t } = useI18n();
  const rows = onChainRows(receivable, t);
  if (!rows.length) return null;
  return (
    <Collapsible
      title={t.passport.records}
      icon={<Link2 className="h-4 w-4 text-chain" aria-hidden />}
      aside={<span className="rounded-full bg-chain-soft px-2 py-0.5 text-xs font-semibold text-chain">{rows.length}</span>}
      defaultOpen={defaultOpen}
      testId="onchain-records"
    >
      <p className="mb-4 text-sm text-muted">{t.passport.recordsHint}</p>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.key} className="py-3 first:pt-0" data-testid={`record-${row.key}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{row.label}</p>
              {row.url && <ExplorerLink href={row.url}>{t.common.explorer}</ExplorerLink>}
            </div>
            <div className="mt-1 flex items-center gap-1">
              <code className="min-w-0 truncate font-mono text-xs text-muted" title={row.value}>{shorten(row.value, 14, 10)}</code>
              <CopyButton value={row.value} />
            </div>
            {row.extra && <p className="text-xs text-faint">{row.extra}</p>}
            {row.memo && (
              <details className="mt-1 text-xs">
                <summary className="cursor-pointer text-muted">{t.common.memo}</summary>
                <code className="mt-1 block break-all font-mono text-muted">{row.memo}</code>
              </details>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <VerificationPanel receivableId={receivable.id} />
      </div>
    </Collapsible>
  );
}

export { VerificationPanel };
