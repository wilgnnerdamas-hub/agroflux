"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { ArrowLeft, FileUp, Hash, Loader2, ShieldCheck, X } from "lucide-react";
import { api, toApiError } from "@/lib/api";
import { sha256File } from "@/lib/hash";
import { daysBetween, formatBytes, maskMoneyInput, parseMoneyToCents, todayISO } from "@/lib/format";
import { DOCUMENT_KIND_LABEL, PRODUCT_CATEGORY_LABEL, UFS } from "@/lib/labels";
import { validateFile, validateReceivable, type FieldErrors } from "@/lib/validation";
import type { CreateReceivableInput, DocumentKind, ProductCategory } from "@/lib/types";
import { Alert, Button, Card, CardTitle, MonoValue, PageHeader, cx } from "@/components/ui";

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
  const router = useRouter();
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
    setFile(f);
    if (!f) {
      setHash({ status: "idle" });
      return;
    }
    const err = validateFile(f);
    if (err) {
      setErrors((e) => ({ ...e, document: err }));
      setHash({ status: "idle" });
      return;
    }
    setHash({ status: "hashing" });
    try {
      setHash({ status: "done", value: await sha256File(f) });
    } catch (e) {
      setHash({ status: "error", message: e instanceof Error ? e.message : "Não foi possível calcular o hash." });
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
    const input = buildInput();
    const errs = validateReceivable(input);
    const fileErr = validateFile(file);
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
      if (ae.fieldErrors) setErrors(ae.fieldErrors);
      setSubmitError(ae.message);
      setSubmitting(false);
    }
  }

  const term =
    form.issueDate && form.dueDate && form.dueDate > form.issueDate ? daysBetween(form.issueDate, form.dueDate) : null;

  return (
    <>
      <PageHeader
        back={
          <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Recebíveis
          </Link>
        }
        title="Novo recebível"
        subtitle="Cadastre uma venda a prazo fictícia e anexe um documento de teste."
      />

      <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardTitle>Operação</CardTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sacado (pseudônimo)" hint="Ex.: Produtor Demo 03. Não use nome real, CPF ou CNPJ." error={errors["debtor.alias"]}>
                {(p) => <input {...p} className={inputCls} value={form.alias} onChange={set("alias")} placeholder="Produtor Demo 03" maxLength={60} autoComplete="off" />}
              </Field>
              <Field label="UF do sacado" error={errors["debtor.state"]}>
                {(p) => (
                  <select {...p} className={inputCls} value={form.state} onChange={set("state")}>
                    <option value="">Selecione</option>
                    {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Categoria do insumo" error={errors["product.category"]}>
                {(p) => (
                  <select {...p} className={inputCls} value={form.category} onChange={set("category")}>
                    <option value="">Selecione</option>
                    {(Object.keys(PRODUCT_CATEGORY_LABEL) as ProductCategory[]).map((c) => (
                      <option key={c} value={c}>{PRODUCT_CATEGORY_LABEL[c]}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Safra" hint="Formato 2026/27" error={errors.cropSeason}>
                {(p) => <input {...p} className={inputCls} value={form.cropSeason} onChange={set("cropSeason")} placeholder="2026/27" inputMode="numeric" />}
              </Field>
              <Field label="Descrição do insumo" error={errors["product.description"]} className="sm:col-span-2">
                {(p) => <input {...p} className={inputCls} value={form.description} onChange={set("description")} placeholder="Fertilizante NPK 20-05-20" maxLength={120} />}
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle>Valores e prazo</CardTitle>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Valor de face (R$)" hint="Entre R$ 1.000 e R$ 10.000.000" error={errors.amountCents}>
                {(p) => (
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-faint">R$</span>
                    <input {...p} className={cx(inputCls, "pl-9 tabular-nums")} value={form.amount} onChange={set("amount")} placeholder="150.000,00" inputMode="numeric" />
                  </div>
                )}
              </Field>
              <Field label="Emissão" error={errors.issueDate}>
                {(p) => <input {...p} type="date" className={inputCls} value={form.issueDate} max={todayISO()} onChange={set("issueDate")} />}
              </Field>
              <Field label="Vencimento" hint={term != null ? `Prazo: ${term} dias` : "15 a 720 dias após a emissão"} error={errors.dueDate}>
                {(p) => <input {...p} type="date" className={inputCls} value={form.dueDate} min={form.issueDate} onChange={set("dueDate")} />}
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle>Documento de teste</CardTitle>
            <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
              <Field label="Tipo" error={errors.documentKind}>
                {(p) => (
                  <select {...p} className={inputCls} value={form.documentKind} onChange={set("documentKind")}>
                    {(Object.keys(DOCUMENT_KIND_LABEL) as DocumentKind[]).map((k) => (
                      <option key={k} value={k}>{DOCUMENT_KIND_LABEL[k]}</option>
                    ))}
                  </select>
                )}
              </Field>
              <div>
                <span className="mb-1.5 block text-sm font-medium text-ink" id="doc-label">Arquivo</span>
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
                    <p className="text-sm text-ink">Arraste o arquivo aqui ou</p>
                    <Button type="button" variant="ghost" className="mt-1" onClick={() => fileInput.current?.click()}>
                      Escolher arquivo
                    </Button>
                    <p className="mt-1 text-xs text-muted">PDF, PNG ou JPEG, até 5 MB. Use apenas documentos de teste.</p>
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
                        aria-label="Remover arquivo"
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
                <Hash className="h-4 w-4 text-chain" aria-hidden /> Hash SHA-256 do documento
              </p>
              {hash.status === "idle" && <p className="text-sm text-muted">Selecione um arquivo para calcular o hash no seu navegador.</p>}
              {hash.status === "hashing" && (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calculando…
                </p>
              )}
              {hash.status === "done" && (
                <>
                  <MonoValue value={hash.value} copyLabel="Copiar hash" />
                  <p className="mt-2 text-xs text-muted">
                    Prévia calculada no navegador. O backend recalcula e confere este valor; o documento em si nunca vai para a blockchain.
                  </p>
                </>
              )}
              {hash.status === "error" && <p className="text-sm font-medium text-bad">{hash.message}</p>}
            </div>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardTitle icon={<ShieldCheck className="h-4 w-4 text-brand" aria-hidden />}>O que acontece depois</CardTitle>
            <ol className="space-y-3 text-sm text-muted">
              <li><strong className="text-ink">1. Passaporte criado</strong> com os dados e o hash do documento.</li>
              <li><strong className="text-ink">2. Registro na Devnet</strong> — você decide quando enviar. Só hashes e identificadores vão para a rede.</li>
              <li><strong className="text-ink">3. Ofertas simuladas</strong> ficam disponíveis após a confirmação.</li>
            </ol>
          </Card>
          {submitError && <Alert tone="bad" title="Não foi possível cadastrar">{submitError}</Alert>}
          <Button type="submit" className="w-full" loading={submitting} disabled={hash.status === "hashing"}>
            {submitting ? "Cadastrando…" : "Cadastrar recebível"}
          </Button>
          <p className="text-center text-xs text-muted">Recebível fictício, sem validação jurídica.</p>
        </aside>
      </form>
    </>
  );
}
