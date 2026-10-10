"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { ArrowLeft, FileUp, Hash, Loader2, ShieldCheck, X } from "lucide-react";
import { api, toApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { sha256File } from "@/lib/hash";
import { daysBetween, formatBytes, maskMoneyInput, parseMoneyToCents, todayISO } from "@/lib/format";
import { UFS } from "@/lib/labels";
import { validateFile, validateReceivable, type FieldErrors } from "@/lib/validation";
import type { CreateReceivableInput, DocumentKind, ProductCategory } from "@/lib/types";
import { Alert, Button, ButtonLink, Card, CardTitle, MonoValue, PageHeader, cx } from "@/components/ui";

const inputCls =
  "block w-full rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-faint aria-[invalid=true]:border-bad min-h-[42px]";

function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const descId = `${id}-desc`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {children({ id, "aria-invalid": !!error, "aria-describedby": hint || error ? descId : undefined })}
      <p id={descId} className={cx("mt-1 text-xs", error ? "font-medium text-bad" : "text-muted")}>
        {error ?? hint}
      </p>
    </div>
  );
}

type HashState = { status: "idle" } | { status: "hashing" } | { status: "done"; value: string } | { status: "error"; message: string };

export default function NewReceivablePage() {
  const { t, errorMessage } = useI18n();
  const f = t.form;
  const router = useRouter();
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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

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
    };
  }

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
      const created = await api.createReceivable(
        input as CreateReceivableInput,
        file!,
        hash.status === "done" ? hash.value : undefined,
      );
      router.push(`/recebiveis/${created.id}?criado=1`);
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

  const term =
    form.issueDate && form.dueDate && form.dueDate > form.issueDate ? daysBetween(form.issueDate, form.dueDate) : null;

  return (
    <>
      <PageHeader
        back={
          <Link href="/distribuidor" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" aria-hidden /> {f.back}
          </Link>
        }
        title={f.title}
        subtitle={f.subtitle}
      />

      <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardTitle>{f.operation}</CardTitle>
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
          </Card>

          <Card>
            <CardTitle>{f.values}</CardTitle>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={f.amount} hint={f.amountHint} error={errors.amountCents}>
                {(p) => (
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-faint">R$</span>
                    <input {...p} className={cx(inputCls, "pl-9 tabular-nums")} value={form.amount} onChange={set("amount")} placeholder="150.000,00" inputMode="numeric" />
                  </div>
                )}
              </Field>
              <Field label={f.issue} error={errors.issueDate}>
                {(p) => <input {...p} type="date" className={inputCls} value={form.issueDate} max={todayISO()} onChange={set("issueDate")} />}
              </Field>
              <Field label={f.due} hint={term != null ? f.term(term) : f.termHint} error={errors.dueDate}>
                {(p) => <input {...p} type="date" className={inputCls} value={form.dueDate} min={form.issueDate} onChange={set("dueDate")} />}
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle>{f.document}</CardTitle>
            <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
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
                <span className="mb-1.5 block text-sm font-medium text-ink" id="doc-label">{f.file}</span>
                {!file ? (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); void pickFile(e.dataTransfer.files?.[0] ?? null); }}
                    className={cx(
                      "flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center",
                      dragOver ? "border-brand bg-brand-soft" : errors.document ? "border-bad bg-bad-soft" : "border-border-strong bg-subtle",
                    )}
                  >
                    <FileUp className="mb-2 h-6 w-6 text-faint" aria-hidden />
                    <p className="text-sm text-ink">{f.drop}</p>
                    <Button type="button" variant="ghost" className="mt-1" onClick={() => fileInput.current?.click()}>
                      {f.choose}
                    </Button>
                    <p className="mt-1 text-xs text-muted">{f.fileHint}</p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-subtle p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{file.name}</p>
                        <p className="text-xs text-muted">{formatBytes(file.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { void pickFile(null); if (fileInput.current) fileInput.current.value = ""; }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-ink"
                        aria-label={f.remove}
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
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
                {errors.document && <p className="mt-1 text-xs font-medium text-bad">{errors.document}</p>}
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-border p-4" aria-live="polite">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Hash className="h-4 w-4 text-chain" aria-hidden /> {f.hashTitle}
              </p>
              {hash.status === "idle" && <p className="text-sm text-muted">{f.hashIdle}</p>}
              {hash.status === "hashing" && (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {f.hashing}
                </p>
              )}
              {hash.status === "done" && (
                <>
                  <MonoValue value={hash.value} copyLabel={f.copyHash} />
                  <p className="mt-2 text-xs text-muted">{f.hashNote}</p>
                </>
              )}
              {hash.status === "error" && <p className="text-sm font-medium text-bad">{hash.message}</p>}
            </div>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardTitle icon={<ShieldCheck className="h-4 w-4 text-brand" aria-hidden />}>{f.nextTitle}</CardTitle>
            <ol className="space-y-3 text-sm text-muted">
              {f.next.map(([title, text], i) => (
                <li key={title}><strong className="text-ink">{i + 1}. {title}</strong> {text}</li>
              ))}
            </ol>
          </Card>
          {submitError && (
            <Alert
              tone="bad"
              title={duplicate ? f.duplicateTitle : f.submitError}
              action={duplicate?.id && <ButtonLink href={`/recebiveis/${duplicate.id}`} variant="secondary">{f.openExisting(duplicate.reference)}</ButtonLink>}
            >
              {submitError}
            </Alert>
          )}
          <Button type="submit" className="w-full" loading={submitting} disabled={hash.status === "hashing"}>
            {submitting ? f.submitting : f.submit}
          </Button>
        </aside>
      </form>
    </>
  );
}
