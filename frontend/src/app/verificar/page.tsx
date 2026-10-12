"use client";

// Verificador público: arraste um documento e descubra, pelo hash, se ele está na AgroFlux, em que etapa e se já
// foi cedido. O arquivo não sai do navegador; só o SHA-256 é consultado. A trava on-chain é lida direto da Devnet.
import { useRef, useState } from "react";
import { Check, FileSearch, Loader2, Minus } from "lucide-react";
import { api, toApiError } from "@/lib/api";
import { formatDate, formatDateTime, shorten } from "@/lib/format";
import { sha256File } from "@/lib/hash";
import { useI18n } from "@/lib/i18n";
import type { DocumentVerification, ProofLink } from "@/lib/types";
import { PageHeader, cx } from "@/components/ui";

type State = { status: "idle" } | { status: "hashing"; name: string } | { status: "querying"; name: string; hash: string } | { status: "done"; name: string; result: DocumentVerification } | { status: "error"; message: string };

function Verdict({ v }: { v: DocumentVerification }) {
  const { t } = useI18n();
  const k = t.verifyDoc;
  const assigned = !!v.proofs?.assignment || v.onChainLock.exists;
  const tone = assigned ? "border-terra-line bg-terra-soft text-terra" : v.found ? "border-brand-line bg-brand-softer text-brand" : "border-border bg-subtle text-muted";
  const title = assigned ? k.verdictAssigned : v.found ? k.verdictFree : k.verdictUnknown;
  const text = assigned
    ? k.verdictAssignedText(v.proofs?.assignment?.creditor ?? v.onChainLock.funderName ?? k.someFunder)
    : v.found
      ? k.verdictFreeText
      : k.verdictUnknownText;
  return (
    <div className={cx("agf-rise rounded-[14px] border px-5 py-4", tone)} role="status" data-testid="verify-verdict">
      <p className="text-base font-medium">{title}</p>
      <p className="mt-1 text-sm text-ink/80">{text}</p>
    </div>
  );
}

function ProofRow({ label, proof, extra }: { label: string; proof: ProofLink | null; extra?: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-divider py-3 first:border-t-0">
      <span className="flex items-center gap-2.5 text-sm">
        <span className={cx("flex h-5 w-5 items-center justify-center rounded-full border", proof ? "border-brand bg-brand text-white" : "border-border-strong text-faint")}>
          {proof ? <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden /> : <Minus className="h-3 w-3" aria-hidden />}
        </span>
        {label}
        {extra}
      </span>
      {proof ? (
        <a href={proof.explorerUrl} target="_blank" rel="noreferrer" className="font-mono text-xs text-chain hover:underline">
          tx {shorten(proof.signature, 4, 4)} ↗
        </a>
      ) : (
        <span className="text-xs text-empty">{t.verifyDoc.notYet}</span>
      )}
    </li>
  );
}

export default function VerifyPage() {
  const { t, errorMessage } = useI18n();
  const k = t.verifyDoc;
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ status: "idle" });
  const [drag, setDrag] = useState(false);
  const [manual, setManual] = useState("");

  const query = async (hash: string, name: string) => {
    setState({ status: "querying", name, hash });
    try {
      setState({ status: "done", name, result: await api.verifyDocument(hash) });
    } catch (e) {
      setState({ status: "error", message: errorMessage(toApiError(e)) });
    }
  };
  const pick = async (file: File | null) => {
    if (!file) return;
    setState({ status: "hashing", name: file.name });
    try {
      await query(await sha256File(file), file.name);
    } catch {
      setState({ status: "error", message: t.form.hashError });
    }
  };

  const v = state.status === "done" ? state.result : null;

  return (
    <>
      <PageHeader title={k.title} subtitle={k.subtitle} />
      <div className="grid gap-6 min-[1000px]:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void pick(e.dataTransfer.files?.[0] ?? null);
            }}
            onClick={() => input.current?.click()}
            className={cx(
              "flex cursor-pointer flex-col items-center justify-center rounded-[14px] border border-dashed px-6 py-12 text-center agf-fade hover:border-brand hover:bg-brand-softer",
              drag ? "border-brand bg-brand-softer" : "border-[#b9c7be] bg-surface",
            )}
          >
            <FileSearch className="mb-3 h-8 w-8 text-faint" strokeWidth={1.25} aria-hidden />
            <p className="text-sm">
              {k.drop}{" "}
              <button type="button" onClick={(e) => { e.stopPropagation(); input.current?.click(); }} className="font-medium text-brand hover:underline">
                {k.choose}
              </button>
            </p>
            <p className="mt-1 text-xs text-faint">{k.privacy}</p>
            <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" aria-label={k.choose} data-testid="verify-input" onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) void query(manual.trim(), k.manualName);
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">{k.manualLabel}</span>
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder={k.manualPlaceholder}
                className="agf-input h-10 w-full rounded-[10px] border border-border bg-surface px-3 font-mono text-xs placeholder:font-sans placeholder:text-empty"
              />
            </label>
            <button type="submit" className="h-10 rounded-[10px] border border-border bg-surface px-4 text-sm font-medium transition-colors hover:border-ink">
              {k.manualButton}
            </button>
          </form>

          {(state.status === "hashing" || state.status === "querying") && (
            <p className="flex items-center gap-2 text-sm text-muted" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {state.status === "hashing" ? k.hashing : k.querying}
            </p>
          )}
          {state.status === "error" && <p className="rounded-[10px] border border-terra-line bg-terra-soft px-4 py-3 text-sm text-terra" role="alert">{state.message}</p>}

          {v && (
            <div className="space-y-4" data-testid="verify-result">
              <Verdict v={v} />
              <p className="font-mono text-[11px] text-faint">
                {state.status === "done" && state.name} · sha256 <span className="text-muted">{v.sha256}</span>
              </p>
              {v.receivable && v.proofs && (
                <section className="rounded-[14px] border border-border bg-surface p-5">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                    <div><dt className="text-xs text-faint">{k.reference}</dt><dd className="font-mono">{v.receivable.reference}</dd></div>
                    <div><dt className="text-xs text-faint">{k.registry}</dt><dd className="font-mono">{v.receivable.registryId ?? "—"}</dd></div>
                    <div><dt className="text-xs text-faint">{k.status}</dt><dd>{t.status.receivable[v.receivable.status]}</dd></div>
                    <div><dt className="text-xs text-faint">{k.distributor}</dt><dd>{v.receivable.distributor}</dd></div>
                    <div><dt className="text-xs text-faint">{k.debtor}</dt><dd>{v.receivable.debtorAlias} · {v.receivable.debtorState}</dd></div>
                    <div><dt className="text-xs text-faint">{k.due}</dt><dd>{formatDate(v.receivable.dueDate)}</dd></div>
                  </dl>
                  <ul className="mt-5 border-t border-divider pt-1">
                    <ProofRow label={k.proofRegistration} proof={v.proofs.registration} />
                    <ProofRow label={k.proofAcceptance} proof={v.proofs.debtorConfirmation} />
                    <ProofRow label={k.proofTerms} proof={v.proofs.publication} />
                    <ProofRow
                      label={k.proofAssignment}
                      proof={v.proofs.assignment}
                      extra={v.proofs.assignment && <span className="text-xs text-muted">→ {v.proofs.assignment.creditor}</span>}
                    />
                  </ul>
                  {v.receivable.registeredAt && <p className="mt-3 text-xs text-faint">{k.registeredAt(formatDateTime(v.receivable.registeredAt))}</p>}
                </section>
              )}
              <section className="rounded-[14px] border border-chain-line bg-chain-soft p-5" data-testid="verify-lock">
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-chain">{k.lockTitle}</p>
                <p className="mt-2 text-sm text-ink">
                  {!v.onChainLock.checked ? k.lockUnchecked : v.onChainLock.exists ? k.lockExists(v.onChainLock.funderName ?? k.someFunder) : k.lockAbsent}
                </p>
                {v.onChainLock.address && v.onChainLock.explorerUrl && (
                  <a href={v.onChainLock.explorerUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block font-mono text-xs text-chain hover:underline">
                    {shorten(v.onChainLock.address, 6, 6)} ↗
                  </a>
                )}
                <p className="mt-2 text-xs text-muted">{k.lockHint}</p>
              </section>
            </div>
          )}
        </div>

        <aside className="space-y-3 rounded-[14px] border border-border bg-surface p-5 text-sm min-[1000px]:self-start">
          <p className="font-medium">{k.howTitle}</p>
          <ol className="space-y-2 text-muted">
            {k.how.map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="font-mono text-xs text-brand">{String(i + 1).padStart(2, "0")}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <p className="border-t border-divider pt-3 text-xs text-faint">{k.note}</p>
        </aside>
      </div>
    </>
  );
}
