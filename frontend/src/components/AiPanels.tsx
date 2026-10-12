"use client";

// Analista de IA (Claude): conferência do documento e parecer de risco. Só aparece quando o backend tem a IA ligada.
import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { api, toApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { DocumentCheck, Receivable, RiskMemo } from "@/lib/types";
import { cx } from "./ui";

let aiCache: Promise<boolean> | null = null;
/** O backend tem a IA configurada? (lido uma vez do /health). */
export function useAiAvailable() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    aiCache ??= api.health().then((h) => h.features?.ai === true, () => false);
    let alive = true;
    void aiCache.then((v) => alive && setOn(v));
    return () => {
      alive = false;
    };
  }, []);
  return on;
}

const VERDICT_TONE: Record<NonNullable<DocumentCheck["verdict"]>, string> = {
  consistent: "bg-brand-soft text-brand",
  divergent: "bg-terra-soft text-terra",
  unreadable: "bg-amber-soft text-amber-text",
};

export function DocumentCheckCard({ receivable, onUpdated }: { receivable: Receivable; onUpdated: (r: Receivable) => void }) {
  const { t, errorMessage } = useI18n();
  const k = t.ai;
  const dc = receivable.documentCheck;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!dc) return null;

  const retry = async () => {
    setBusy(true);
    setError(null);
    try {
      onUpdated(await api.runDocumentCheck(receivable.id));
    } catch (e) {
      setError(errorMessage(toApiError(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[14px] border border-border bg-surface p-5 sm:p-6" data-testid="document-check">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-medium">
          <Sparkles className="h-4 w-4 text-chain" strokeWidth={1.5} aria-hidden /> {k.checkTitle}
        </h2>
        {dc.status === "done" && dc.verdict && <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-medium", VERDICT_TONE[dc.verdict])}>{k.verdict[dc.verdict]}</span>}
      </div>

      {dc.status === "pending" && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {k.pending}
        </p>
      )}

      {dc.status === "failed" && (
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-muted">{k.failed}</p>
          <button type="button" onClick={() => void retry()} disabled={busy} className="font-medium text-brand hover:underline disabled:opacity-60">
            {busy ? k.checking : k.retry}
          </button>
        </div>
      )}

      {dc.status === "done" && (
        <>
          {dc.summary && <p className="mt-3 text-sm text-ink">{dc.summary}</p>}
          <table className="mt-4 w-full text-left text-sm">
            <thead className="text-xs text-faint">
              <tr>
                <th scope="col" className="py-1.5 font-normal">{k.colField}</th>
                <th scope="col" className="py-1.5 font-normal">{k.colDeclared}</th>
                <th scope="col" className="py-1.5 font-normal">{k.colFound}</th>
                <th scope="col" className="w-6 py-1.5"><span className="sr-only">{k.colStatus}</span></th>
              </tr>
            </thead>
            <tbody>
              {dc.fields.map((f) => (
                <tr key={f.field} className="border-t border-divider align-top">
                  <td className="py-2 pr-2 text-muted">{k.fields[f.field]}</td>
                  <td className="py-2 pr-2">{f.declared}</td>
                  <td className={cx("py-2 pr-2", f.status === "mismatch" ? "text-terra" : f.found ? "text-ink" : "text-empty")}>{f.found ?? "—"}</td>
                  <td className="py-2">
                    {f.status === "match" ? (
                      <Check className="h-4 w-4 text-brand" aria-label={k.status.match} />
                    ) : f.status === "mismatch" ? (
                      <X className="h-4 w-4 text-terra" aria-label={k.status.mismatch} />
                    ) : (
                      <span className="text-xs text-faint" aria-label={k.status.not_found}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-faint">
            {k.by(dc.model)}
            {dc.checkedAt && ` · ${formatDateTime(dc.checkedAt)}`}
          </p>
        </>
      )}
      {error && <p className="mt-2 text-sm text-terra" role="alert">{error}</p>}
    </section>
  );
}

/** Parecer da IA dentro do cartão de risco (sob demanda, em cache no backend por idioma). */
export function RiskMemoBlock({ receivable }: { receivable: Pick<Receivable, "id" | "riskMemos"> }) {
  const { t, locale, errorMessage } = useI18n();
  const k = t.ai;
  const available = useAiAvailable();
  const [memo, setMemo] = useState<RiskMemo | null>(receivable.riskMemos?.[locale] ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setMemo(receivable.riskMemos?.[locale] ?? null), [receivable.riskMemos, locale]);
  if (!available) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setMemo(await api.requestRiskMemo(receivable.id, locale));
    } catch (e) {
      setError(errorMessage(toApiError(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-chain-line bg-chain-soft p-4" data-testid="risk-memo">
      <p className="flex items-center gap-2 text-sm font-medium text-chain">
        <Sparkles className="h-4 w-4" strokeWidth={1.5} aria-hidden /> {k.memoTitle}
      </p>
      {!memo && (
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="mt-3 inline-flex items-center gap-2 rounded-[10px] border border-chain-line bg-surface px-3 py-2 text-sm font-medium text-chain transition-colors hover:border-chain disabled:opacity-70"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {busy ? k.memoLoading : k.memoButton}
        </button>
      )}
      {memo && (
        <div className="agf-rise mt-2 space-y-3 text-sm" aria-live="polite">
          <p className="leading-relaxed text-ink">{memo.memo}</p>
          {memo.strengths.length > 0 && (
            <div>
              <p className="text-xs font-medium text-brand">{k.strengths}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">{memo.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
          {memo.concerns.length > 0 && (
            <div>
              <p className="text-xs font-medium text-terra">{k.concerns}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">{memo.concerns.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
        </div>
      )}
      <p className="mt-3 text-[11px] text-faint">{k.memoNote}</p>
      {error && <p className="mt-2 text-sm text-terra" role="alert">{error}</p>}
    </div>
  );
}
