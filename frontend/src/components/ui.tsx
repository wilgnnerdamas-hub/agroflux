"use client";

import Link from "next/link";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AlertTriangle, Check, Copy, Info, Loader2, RefreshCw, XCircle, CheckCircle2 } from "lucide-react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 min-h-[42px]";
const btnVariant: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  secondary: "border border-border-strong bg-surface text-ink hover:bg-subtle",
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
    <section className={cx("rounded-xl border border-border bg-surface p-5 sm:p-6", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardTitle({ children, aside, icon }: { children: ReactNode; aside?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
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
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
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
      className={cx("flex gap-3 rounded-lg border p-4 text-sm", toneClass[tone], className)}
    >
      {alertIcon[tone]}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(!!title && "mt-0.5", "text-ink/80")}>{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton h-4", className)} aria-hidden />;
}

export function LoadingBlock({ label = "Carregando…", lines = 3 }: { label?: string; lines?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={i === 0 ? "h-6 w-1/3" : "w-full"} />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry, title = "Não foi possível carregar" }: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <Alert
      tone="bad"
      title={title}
      action={
        onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Tentar novamente
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
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <p className="text-base font-semibold">{title}</p>
      {children && <p className="mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
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
      aria-label={copied ? "Copiado" : label}
      title={copied ? "Copiado" : label}
    >
      {copied ? <Check className="h-4 w-4 text-ok" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
    </button>
  );
}

/** Valor técnico longo (hash, assinatura) em fonte mono, quebrável, com botão de copiar. */
export function MonoValue({ value, copyLabel }: { value: string; copyLabel?: string }) {
  return (
    <div className="flex items-start gap-1 rounded-md bg-subtle px-2.5 py-1.5">
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
          <dt className="text-xs font-medium uppercase tracking-wide text-faint">{it.label}</dt>
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
          <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}
