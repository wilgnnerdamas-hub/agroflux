"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FlaskConical, Repeat, Sprout } from "lucide-react";
import { api, API_MODE } from "@/lib/api";
import { useI18n, type Locale } from "@/lib/i18n";
import { roleFromPath, useRole } from "@/lib/role";
import { Badge, cx } from "./ui";

type Conn = "checking" | "ok" | "down" | "mock";

function ConnectionBadge() {
  const { t } = useI18n();
  const [conn, setConn] = useState<Conn>(API_MODE === "mock" ? "mock" : "checking");
  const [lowBalance, setLowBalance] = useState(false);

  useEffect(() => {
    if (API_MODE === "mock") return;
    let alive = true;
    const check = async () => {
      try {
        const h = await api.health();
        if (!alive) return;
        setConn(h.status === "ok" ? "ok" : "down");
        const bal = h.solana?.feePayerBalanceLamports;
        setLowBalance(bal != null && bal < 10_000_000); // < 0,01 SOL
      } catch {
        if (alive) setConn("down");
      }
    };
    void check();
    const timer = setInterval(check, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="chain">{t.common.devnet}</Badge>
      {conn === "mock" && <Badge tone="warn">{t.shell.backendMock}</Badge>}
      {conn === "checking" && <Badge>{t.shell.backendChecking}</Badge>}
      {conn === "ok" && <Badge tone="ok">{t.shell.backendOk}</Badge>}
      {conn === "down" && <Badge tone="bad">{t.shell.backendDown}</Badge>}
      {lowBalance && <Badge tone="warn">{t.shell.lowBalance}</Badge>}
    </div>
  );
}

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const opts: { v: Locale; label: string }[] = [
    { v: "pt", label: "PT" },
    { v: "en", label: "EN" },
  ];
  return (
    <div role="group" aria-label={t.shell.language} className="inline-flex rounded-lg border border-border-strong p-0.5">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => setLocale(o.v)}
          aria-pressed={locale === o.v}
          className={cx("rounded-md px-2.5 py-1 text-xs font-semibold", locale === o.v ? "bg-ink text-white" : "text-muted hover:text-ink")}
          data-testid={`lang-${o.v}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Brand() {
  const { t } = useI18n();
  return (
    <Link href="/" className="flex items-center gap-2 font-bold text-ink">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
        <Sprout className="h-5 w-5" aria-hidden />
      </span>
      {t.shell.brand}
    </Link>
  );
}

// Página pública do sacado (/confirmar/[token]): sem navegação interna.
function PublicShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-3">
          <Brand />
          <span className="ml-auto flex items-center gap-2">
            <LanguageToggle />
            <Badge tone="chain">{t.common.devnet}</Badge>
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-border bg-surface">
        <p className="mx-auto max-w-xl px-4 py-4 text-xs leading-relaxed text-muted">
          <strong className="text-ink">{t.shell.footerTitle}</strong> {t.shell.publicFooter}
        </p>
      </footer>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const { role: storedRole } = useRole();
  if (pathname.startsWith("/confirmar/")) return <PublicShell>{children}</PublicShell>;

  const isLanding = pathname === "/";
  const role = roleFromPath(pathname) ?? (isLanding ? null : storedRole);
  const nav =
    role === "distributor"
      ? [
          { href: "/distribuidor", label: t.shell.navReceivables, active: pathname === "/distribuidor" || (pathname.startsWith("/recebiveis/") && pathname !== "/recebiveis/novo") },
          { href: "/recebiveis/novo", label: t.shell.navNew, active: pathname === "/recebiveis/novo" },
        ]
      : role === "funder"
        ? [
            { href: "/financiador", label: t.shell.navMarket, active: pathname === "/financiador" || pathname.startsWith("/financiador/recebiveis") },
            { href: "/financiador/carteira", label: t.shell.navPortfolio, active: pathname === "/financiador/carteira" },
          ]
        : [];
  nav.push({ href: "/transparencia", label: t.shell.navTransparency, active: pathname === "/transparencia" });

  return (
    <div className="flex min-h-screen flex-col">
      {API_MODE === "mock" && (
        <div className="bg-warn text-white">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-xs font-semibold sm:px-6">
            <FlaskConical className="h-4 w-4" aria-hidden /> {t.shell.mockBanner}
          </div>
        </div>
      )}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Brand />
            <nav aria-label="Principal" className="flex flex-wrap gap-1">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={n.active ? "page" : undefined}
                  className={cx("rounded-md px-3 py-2 text-sm font-medium", n.active ? "bg-brand-soft text-brand" : "text-muted hover:bg-subtle hover:text-ink")}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {role && (
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted hover:text-ink"
                title={t.shell.switchProfile}
                data-testid="role-chip"
              >
                <span className="font-semibold text-ink">{role === "distributor" ? t.shell.roleDistributor : t.shell.roleFunder}</span>
                <Repeat className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">{t.shell.switchProfile}</span>
              </Link>
            )}
            <LanguageToggle />
            {!isLanding && <ConnectionBadge />}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs leading-relaxed text-muted sm:px-6">
          <strong className="text-ink">{t.shell.footerTitle}</strong> {t.shell.footer}
        </div>
      </footer>
    </div>
  );
}
