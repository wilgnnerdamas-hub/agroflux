"use client";

import Link from "next/link";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, Copy, ExternalLink, Info, Loader2, RefreshCw, XCircle, CheckCircle2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 min-h-[42px]";
const btnVariant: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  secondary: "border border-border bg-surface text-ink hover:border-ink",
  ghost: "text-brand hover:bg-brand-soft",
  danger: "bg-bad text-white hover:opacity-90",
};

export function Button({
  variant = "primary",
  loading = false,
  children,
  className,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      className={cx(btnBase, btnVariant[variant], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  children,
  className,
}: {
  href: string;
  variant?: Variant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cx(btnBase, btnVariant[variant], className)}>
      {children}
    </Link>
  );
}

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx("rounded-[14px] border border-border bg-surface p-5 sm:p-6", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardTitle({ children, aside, icon }: { children: ReactNode; aside?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-base font-medium text-ink">
        {icon}
        {children}
      </h2>
      {aside}
    </div>
  );
}

export type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "chain" | "sim" | "brand";

const toneClass: Record<Tone, string> = {
  neutral: "bg-subtle text-muted border-border",
  ok: "bg-ok-soft text-ok border-ok/20",
  warn: "bg-warn-soft text-warn border-warn/20",
  bad: "bg-bad-soft text-bad border-bad/20",
  info: "bg-info-soft text-info border-info/20",
  chain: "bg-chain-soft text-chain border-chain/20",
  sim: "bg-sim-soft text-sim border-sim/25",
  brand: "bg-brand-soft text-brand border-brand/20",
};

export function Badge({ tone = "neutral", children, icon, className }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneClass[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

const alertIcon: Record<"info" | "warn" | "bad" | "ok" | "sim", ReactNode> = {
  info: <Info className="h-5 w-5 shrink-0" aria-hidden />,
  warn: <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />,
  bad: <XCircle className="h-5 w-5 shrink-0" aria-hidden />,
  ok: <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />,
  sim: <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />,
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: "info" | "warn" | "bad" | "ok" | "sim";
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className={cx("flex gap-3 rounded-[10px] border p-4 text-sm", toneClass[tone], className)}
    >
      {alertIcon[tone]}
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cx(!!title && "mt-0.5", "text-ink/80")}>{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton h-4", className)} aria-hidden />;
}

export function LoadingBlock({ label, lines = 3 }: { label?: string; lines?: number }) {
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label ?? t.common.loading}</span>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={i === 0 ? "h-6 w-1/3" : "w-full"} />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry, title }: { message: string; onRetry?: () => void; title?: string }) {
  const { t } = useI18n();
  return (
    <Alert
      tone="bad"
      title={title ?? t.common.loadError}
      action={
        onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" aria-hidden /> {t.common.retry}
          </Button>
        )
      }
    >
      {message}
    </Alert>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[14px] border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <p className="text-base font-medium">{title}</p>
      {children && <p className="mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const text = copied ? t.common.copied : (label ?? t.common.copy);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard indisponível */
        }
      }}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-ink"
      aria-label={text}
      title={text}
    >
      {copied ? <Check className="h-4 w-4 text-ok" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
    </button>
  );
}

/** Botão textual "copiar" → "copiado ✓" (1,4 s), anunciado a leitores de tela. */
export function CopyText({ value, className }: { value: string; className?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          /* clipboard indisponível */
        }
      }}
      className={cx("shrink-0 rounded px-1 text-[11px] font-medium agf-fade", copied ? "text-brand" : "text-faint hover:text-ink", className)}
    >
      <span aria-live="polite">{copied ? t.common.copiedCheck : t.common.copyShort}</span>
    </button>
  );
}

/** Endereço público em pílula mono, com "copiar". */
export function AddressPill({ value, short }: { value: string; short: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-divider bg-row py-0.5 pl-2.5 pr-1.5">
      <code className="truncate font-mono text-xs text-muted" title={value}>{short}</code>
      <CopyText value={value} />
    </span>
  );
}

/** Valor técnico longo (hash, assinatura) em fonte mono, quebrável, com botão de copiar. */
export function MonoValue({ value, copyLabel }: { value: string; copyLabel?: string }) {
  return (
    <div className="flex items-start gap-1 rounded-[10px] border border-divider bg-row px-2.5 py-1.5">
      <code className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-ink">{value}</code>
      <CopyButton value={value} label={copyLabel} />
    </div>
  );
}

export function DescList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-xs text-faint">{it.label}</dt>
          <dd className="mt-1 text-sm text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-6">
      {back && <div className="mb-3">{back}</div>}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] font-medium leading-tight tracking-[-0.03em] text-ink sm:text-[32px]">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** Link para o Solana Explorer. Só recebe URLs que vieram do backend (regra R5). */
export function ExplorerLink({ href, children, className }: { href: string; children?: ReactNode; className?: string }) {
  const { t } = useI18n();
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cx("inline-flex items-center gap-1.5 text-sm font-medium text-chain hover:underline", className)}>
      {children ?? t.common.viewExplorer} <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
      <span className="sr-only">{t.common.openNewTab}</span>
    </a>
  );
}

/** Seção recolhível (usa <details>, acessível por teclado sem JavaScript extra). */
export function Collapsible({
  title,
  aside,
  icon,
  defaultOpen = false,
  children,
  className,
  testId,
}: {
  title: ReactNode;
  aside?: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <details open={defaultOpen} className={cx("group rounded-[14px] border border-border bg-surface", className)} data-testid={testId}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
        {icon}
        <span className="text-base font-medium text-ink">{title}</span>
        <span className="ml-auto flex items-center gap-2">
          {aside}
          <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
        </span>
      </summary>
      <div className="border-t border-divider px-5 py-5 sm:px-6">{children}</div>
    </details>
  );
}

/** Rótulo pequeno em caixa alta, usado acima de valores técnicos. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-xs text-faint">{children}</p>;
}

/** Dica curta atrás de um ícone ⓘ (abre ao tocar ou focar; fecha ao sair). Para detalhes que não precisam ficar na tela. */
export function InfoTip({ children, label }: { children: ReactNode; label?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-faint hover:text-ink"
        aria-label={label ?? t.common.info}
        aria-expanded={open}
      >
        <Info className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <span role="tooltip" className="absolute left-1/2 top-6 z-30 w-64 -translate-x-1/2 rounded-[10px] border border-border bg-surface p-3 text-xs font-normal normal-case leading-relaxed tracking-normal text-ink shadow-lg">
          {children}
        </span>
      )}
    </span>
  );
}
