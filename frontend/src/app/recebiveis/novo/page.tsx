"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Check, FileText } from "lucide-react";
import { api, toApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useRole } from "@/lib/role";
import { sha256File } from "@/lib/hash";
import { daysBetween, formatBytes, formatDate, formatMoney, maskMoneyInput, parseMoneyToCents, todayISO } from "@/lib/format";
import { UFS } from "@/lib/labels";
import { useTyping } from "@/lib/motion";
import { validateFile, validateReceivable, type FieldErrors } from "@/lib/validation";
import type { CreateReceivableInput, DocumentKind, ProductCategory } from "@/lib/types";
import { Alert, ButtonLink, PageHeader, cx } from "@/components/ui";

const inputCls =
  "agf-input block h-11 w-full rounded-[10px] border border-border bg-surface px-3 text-sm text-ink placeholder:text-empty aria-[invalid=true]:border-bad";

function Field({
  label,
  hint,
  hintTone,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  hintTone?: "ok" | "warn";
  error?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const descId = `${id}-desc`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink">
        {label}
      </label>
      {children({ id, "aria-invalid": !!error, "aria-describedby": hint || error ? descId : undefined })}
      <p
        id={descId}
        className={cx("mt-1.5 text-xs agf-fade", error ? "font-medium text-bad" : hintTone === "ok" ? "text-brand" : hintTone === "warn" ? "text-amber-ink" : "text-faint")}
      >
        {error ?? hint}
      </p>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border border-border bg-surface p-5 sm:p-6">
      <h2 className="mb-5 flex items-baseline gap-3">
        <span className="font-mono text-xs text-brand">{n}</span>
        <span className="text-base font-medium">{title}</span>
      </h2>
      {children}
    </section>
  );
}

type HashState = { status: "idle" } | { status: "hashing" } | { status: "done"; value: string } | { status: "error"; message: string };

const ITEMS = 9;

export default function NewReceivablePage() {
  const { t, errorMessage } = useI18n();
  const f = t.form;
  const router = useRouter();
  const { distributorId } = useRole();
  const [duplicate, setDuplicate] = useState<{ reference: string; id: string | null } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    alias: "",
    state: "",
    category: "" as ProductCategory | "",
    description: "",
    cropSeason: "2026/27",
    amount: "",
    issueDate: todayISO(),
    dueDate: "",
    documentKind: "test_invoice" as DocumentKind,
  });
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<HashState>({ status: "idle" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [nextRef, setNextRef] = useState<string | null>(null);
  const typed = useTyping(hash.status === "done" ? hash.value : null);

  // Próximo código, só para a prévia: o backend é quem numera.
  useEffect(() => {
    api.listReceivables().then(
      (l) => setNextRef(`AGF-${String(l.totals.count + 1).padStart(4, "0")}`),
      () => setNextRef(null),
    );
  }, []);

  const ERROR_KEY: Record<keyof typeof form, string> = {
    alias: "debtor.alias",
    state: "debtor.state",
    category: "product.category",
    description: "product.description",
    cropSeason: "cropSeason",
    amount: "amountCents",
    issueDate: "issueDate",
    dueDate: "dueDate",
    documentKind: "documentKind",
  };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: k === "amount" ? maskMoneyInput(e.target.value) : e.target.value }));
    // Ao editar, some o erro daquele campo (e o do vencimento, que depende da emissão).
    setErrors((errs) => ({ ...errs, [ERROR_KEY[k]]: undefined, ...(k === "issueDate" ? { dueDate: undefined } : {}) }));
  };

  async function pickFile(f: File | null) {
    setErrors((e) => ({ ...e, document: undefined }));
    setDuplicate(null);
    setFile(f);
    if (!f) {
      setHash({ status: "idle" });
      return;
    }
    const err = validateFile(f, t.form.v);
    if (err) {
      setErrors((e) => ({ ...e, document: err }));
      setHash({ status: "idle" });
      return;
    }
    setHash({ status: "hashing" });
    try {
      setHash({ status: "done", value: await sha256File(f) });
    } catch (e) {
      setHash({ status: "error", message: e instanceof Error ? e.message : t.form.hashError });
    }
  }

  function buildInput(): Partial<CreateReceivableInput> {
    return {
      debtor: { alias: form.alias.trim(), state: form.state },
      product: { category: form.category as ProductCategory, description: form.description.trim() },
      cropSeason: form.cropSeason.trim(),
      amountCents: parseMoneyToCents(form.amount) ?? undefined,
      issueDate: form.issueDate,
      dueDate: form.dueDate,
      documentKind: form.documentKind,
      distributorId,
    };
  }

  // Itens que faltam: campos ainda inválidos + documento com hash calculado.
  const pending = Object.keys(validateReceivable(buildInput(), f.v)).filter((k) => k !== "documentKind").length + (hash.status === "done" ? 0 : 1);
  const ready = pending === 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setDuplicate(null);
    const input = buildInput();
    const errs = validateReceivable(input, f.v);
    const fileErr = validateFile(file, f.v);
    if (fileErr) errs.document = fileErr;
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = document.querySelector<HTMLElement>("[aria-invalid=true]");
      first?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const rec = await api.createReceivable(input as CreateReceivableInput, file!, hash.status === "done" ? hash.value : undefined);
      setCreated(true);
      setTimeout(() => router.push(`/recebiveis/${rec.id}?criado=1`), 600);
    } catch (err) {
      const ae = toApiError(err);
      if (ae.code === "DUPLICATE_DOCUMENT") {
        // v1.2: a registradora simulada recusou o documento. Mostra qual recebível já tem esse título.
        const reference = String(ae.details?.reference ?? "");
        let existingId: string | null = null;
        try {
          existingId = (await api.listReceivables()).items.find((i) => i.reference === reference)?.id ?? null;
        } catch {
          /* sem o link direto, a mensagem já basta */
        }
        setDuplicate({ reference, id: existingId });
      } else {
        if (ae.fieldErrors) setErrors(ae.fieldErrors);
      }
      setSubmitError(errorMessage(ae));
      setSubmitting(false);
    }
  }

  const term = form.issueDate && form.dueDate && form.dueDate > form.issueDate ? daysBetween(form.issueDate, form.dueDate) : null;
  const termOk = term != null && term >= 15 && term <= 720;
  const amountCents = parseMoneyToCents(form.amount);
  const filled = ITEMS - pending;

  const preview: { k: string; v: string | null }[] = [
    { k: f.previewDebtor, v: form.alias.trim() ? `${form.alias.trim()}${form.state ? ` · ${form.state}` : ""}` : null },
    { k: f.previewProduct, v: form.description.trim() || (form.category ? t.status.product[form.category] : null) },
    { k: f.previewAmount, v: amountCents ? formatMoney(amountCents) : null },
    { k: f.season, v: form.cropSeason.trim() || null },
    { k: f.issue, v: form.issueDate ? formatDate(form.issueDate) : null },
    { k: f.due, v: form.dueDate ? formatDate(form.dueDate) : null },
  ];
  const status = created ? f.statusCreated : ready ? f.statusReady : f.statusDraft;

  return (
    <>
      <PageHeader
        back={
          <Link href="/distribuidor" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden /> {f.back}
          </Link>
        }
        title={f.title}
        subtitle={f.subtitle}
        actions={
          <div className="flex items-center gap-3 pt-2" aria-label={f.progress(filled, ITEMS)}>
            <span className="font-mono text-xs text-muted">{f.progress(filled, ITEMS)}</span>
            <span className="relative h-0.5 w-[120px]" aria-hidden>
              <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
              <span className="agf-bar absolute left-0 top-0 h-0.5 rounded-full bg-brand" style={{ width: `${(filled / ITEMS) * 100}%` }} />
            </span>
          </div>
        }
      />

      <form onSubmit={onSubmit} noValidate className="grid gap-6 min-[1000px]:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Section n="01" title={f.operation}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={f.alias} hint={f.aliasHint} error={errors["debtor.alias"]}>
                {(p) => <input {...p} className={inputCls} value={form.alias} onChange={set("alias")} placeholder="Produtor Demo 04" maxLength={60} autoComplete="off" />}
              </Field>
              <Field label={f.state} error={errors["debtor.state"]}>
                {(p) => (
                  <select {...p} className={inputCls} value={form.state} onChange={set("state")}>
                    <option value="">{f.select}</option>
                    {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                )}
              </Field>
              <Field label={f.category} error={errors["product.category"]}>
                {(p) => (
                  <select {...p} className={inputCls} value={form.category} onChange={set("category")}>
                    <option value="">{f.select}</option>
                    {(Object.keys(t.status.product) as ProductCategory[]).map((c) => (
                      <option key={c} value={c}>{t.status.product[c]}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label={f.season} hint={f.seasonHint} error={errors.cropSeason}>
                {(p) => <input {...p} className={inputCls} value={form.cropSeason} onChange={set("cropSeason")} placeholder="2026/27" inputMode="numeric" />}
              </Field>
              <Field label={f.description} error={errors["product.description"]} className="sm:col-span-2">
                {(p) => <input {...p} className={inputCls} value={form.description} onChange={set("description")} placeholder="Fertilizante NPK 20-05-20" maxLength={120} />}
              </Field>
            </div>
          </Section>

          <Section n="02" title={f.values}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={f.amount} hint={f.amountHint} error={errors.amountCents}>
                {(p) => (
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-faint">R$</span>
                    <input {...p} className={cx(inputCls, "tnum pl-9")} value={form.amount} onChange={set("amount")} placeholder="150.000,00" inputMode="numeric" />
                  </div>
                )}
              </Field>
              <Field label={f.issue} error={errors.issueDate}>
                {(p) => <input {...p} type="date" className={inputCls} value={form.issueDate} max={todayISO()} onChange={set("issueDate")} />}
              </Field>
              <Field
                label={f.due}
                hint={term == null ? f.termHint : termOk ? f.termLiveOk(term) : f.termLiveOut(term)}
                hintTone={term == null ? undefined : termOk ? "ok" : "warn"}
                error={errors.dueDate}
              >
                {(p) => <input {...p} type="date" className={inputCls} value={form.dueDate} min={form.issueDate} onChange={set("dueDate")} />}
              </Field>
            </div>
          </Section>

          <Section n="03" title={f.document}>
            <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
              <Field label={f.kind} error={errors.documentKind}>
                {(p) => (
                  <select {...p} className={inputCls} value={form.documentKind} onChange={set("documentKind")}>
                    {(Object.keys(t.status.documentKind) as DocumentKind[]).map((k) => (
                      <option key={k} value={k}>{t.status.documentKind[k]}</option>
                    ))}
                  </select>
                )}
              </Field>
              <div>
                <span className="mb-1.5 block text-[13px] font-medium text-ink" id="doc-label">{f.file}</span>
                {!file ? (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); void pickFile(e.dataTransfer.files?.[0] ?? null); }}
                    onClick={() => fileInput.current?.click()}
                    className={cx(
                      "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-7 text-center agf-fade hover:border-brand hover:bg-brand-softer",
                      dragOver ? "border-brand bg-brand-softer" : errors.document ? "border-bad bg-bad-soft" : "border-[#b9c7be] bg-surface",
                    )}
                  >
                    <FileText className="mb-2 h-6 w-6 text-faint" strokeWidth={1.25} aria-hidden />
                    <p className="text-sm text-ink">
                      {f.drop}{" "}
                      <button type="button" onClick={(e) => { e.stopPropagation(); fileInput.current?.click(); }} className="font-medium text-brand underline-offset-2 hover:underline">
                        {f.choose}
                      </button>
                    </p>
                    <p className="mt-1 text-xs text-faint">{f.fileHint}</p>
                  </div>
                ) : (
                  <div className="agf-rise flex items-center justify-between gap-3 rounded-xl border border-brand bg-brand-softer px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText className="h-5 w-5 shrink-0 text-brand" strokeWidth={1.25} aria-hidden />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{file.name}</p>
                        <p className="text-xs text-muted">{formatBytes(file.size)}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => fileInput.current?.click()} className="shrink-0 text-sm font-medium text-brand hover:underline" aria-label={f.replaceFile}>
                      {f.replace}
                    </button>
                  </div>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  className="sr-only"
                  aria-labelledby="doc-label"
                  data-testid="document-input"
                  onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
                />
                {errors.document && <p className="mt-1.5 text-xs font-medium text-bad">{errors.document}</p>}
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-divider bg-row px-4 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-medium"><span className="font-mono text-faint">#</span> {f.hashTitle}</p>
                <p
                  aria-live="polite"
                  className={cx("text-xs", hash.status === "done" ? "text-brand" : hash.status === "error" ? "font-medium text-bad" : "text-faint")}
                >
                  {hash.status === "idle" && f.hashWaiting}
                  {hash.status === "hashing" && f.hashing}
                  {hash.status === "done" && `✓ ${f.hashDone}`}
                  {hash.status === "error" && hash.message}
                </p>
              </div>
              <p className="mt-2 min-h-[1.5rem] break-all font-mono text-xs leading-relaxed text-muted">
                {hash.status === "done" ? (
                  <>
                    <code title={hash.value}>{typed.shown}</code>
                    {typed.typing && <span className="lp-caret" aria-hidden />}
                  </>
                ) : (
                  <span className="text-empty">{f.hashIdle}</span>
                )}
              </p>
              {hash.status === "done" && <p className="mt-1.5 text-xs text-faint">{f.hashNote}</p>}
            </div>
          </Section>
        </div>

        {/* Prévia viva do passaporte */}
        <aside className="min-[1000px]:sticky min-[1000px]:top-24 min-[1000px]:self-start">
          <div className="rounded-[18px] border border-border bg-surface p-5 sm:p-6" style={{ boxShadow: "0 30px 60px -36px rgba(22,32,27,.28)" }} data-testid="passport-preview">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint">{f.previewLabel}</p>
                <p className="mt-1 font-mono text-sm font-medium">{nextRef ?? "AGF-····"}</p>
              </div>
              <span
                className={cx(
                  "rounded-full px-2.5 py-1 text-xs font-medium agf-fade",
                  created ? "bg-ink text-white" : ready ? "bg-brand-soft text-brand" : "bg-subtle text-muted",
                )}
              >
                {status}
              </span>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-divider pt-5">
              {preview.map((p) => (
                <div key={p.k} className="min-w-0">
                  <dt className="text-[11px] text-faint">{p.k}</dt>
                  <dd className={cx("mt-0.5 truncate text-sm agf-fade", p.v ? "text-ink" : "text-empty")}>{p.v ?? "—"}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-4 border-t border-divider pt-4 font-mono text-[11px] text-faint">
              sha256{" "}
              <span className={cx("agf-fade", hash.status === "done" ? "text-muted" : "text-empty")}>
                {hash.status === "done" ? `${hash.value.slice(0, 14)}…${hash.value.slice(-8)}` : "—"}
              </span>
            </p>

            <p className="mt-5 text-[11px] text-faint">{f.nextTitle}</p>
            <ol className="mt-2 space-y-1.5">
              {t.gates.names.map((g, i) => {
                const first = i === 0;
                return (
                  <li
                    key={g}
                    className={cx(
                      "flex items-start gap-3 rounded-[10px] border px-3 py-2 agf-fade",
                      first && created ? "border-brand bg-brand-soft" : first && ready ? "border-brand" : "border-divider",
                    )}
                  >
                    <span className={cx("mt-0.5 w-5 shrink-0 font-mono text-[11px]", first && (ready || created) ? "text-brand" : "text-faint")}>
                      {first && created ? <Check className="h-3.5 w-3.5" aria-hidden /> : String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm">{g}</span>
                      <span className="block text-[11px] text-faint">{f.gateHints[i]}</span>
                    </span>
                  </li>
                );
              })}
            </ol>

            {submitError && (
              <Alert
                className="mt-4"
                tone="bad"
                title={duplicate ? f.duplicateTitle : f.submitError}
                action={duplicate?.id && <ButtonLink href={`/recebiveis/${duplicate.id}`} variant="secondary">{f.openExisting(duplicate.reference)}</ButtonLink>}
              >
                {submitError}
              </Alert>
            )}

            <button
              type="submit"
              disabled={submitting || created || hash.status === "hashing"}
              aria-busy={submitting || undefined}
              className={cx(
                "mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors duration-200",
                created ? "bg-ink text-white" : ready ? "bg-brand text-white hover:bg-ink" : "bg-subtle text-muted hover:text-ink",
                submitting && "opacity-80",
              )}
            >
              {created ? `✓ ${f.createdNext}` : submitting ? f.submitting : ready ? f.submit : f.missing(pending)}
            </button>
            <p className="mt-2 text-center text-xs text-faint">{f.nothingSent}</p>
          </div>
        </aside>
      </form>
    </>
  );
}
