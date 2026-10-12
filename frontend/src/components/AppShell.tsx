"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeftRight, Sprout } from "lucide-react";
import { api, API_MODE } from "@/lib/api";
import { useI18n, type Locale } from "@/lib/i18n";
import { roleFromPath, useRole } from "@/lib/role";
import { DemoStrip } from "./DemoNotice";
import { cx } from "./ui";

type Conn = "checking" | "ok" | "down" | "mock";

const WRAP = "mx-auto w-full max-w-[1200px] px-4 sm:px-8 lg:px-14";

/** "● Solana Devnet": ponto pulsando quando o backend e a rede respondem; o detalhe fica no title e para leitores de tela. */
function ConnectionDot() {
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

  const label = { checking: t.shell.backendChecking, ok: t.shell.backendOk, down: t.shell.backendDown, mock: t.shell.backendMock }[conn];
  const text = `${t.shell.devnetLabel} · ${label}${lowBalance ? ` · ${t.shell.lowBalance}` : ""}`;
  const color = conn === "ok" ? (lowBalance ? "bg-amber" : "bg-brand") : conn === "down" ? "bg-bad" : "bg-empty";
  return (
    <span className="inline-flex items-center gap-2 px-1 text-xs text-muted" title={text}>
      <span className={cx("h-1.5 w-1.5 rounded-full", color, conn === "ok" && !lowBalance && "agf-pulse")} aria-hidden />
      <span className="hidden lg:inline">{t.shell.devnetLabel}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const opts: { v: Locale; label: string }[] = [
    { v: "pt", label: "PT" },
    { v: "en", label: "EN" },
  ];
  return (
    <div role="group" aria-label={t.shell.language} className="inline-flex rounded-full border border-border bg-surface p-0.5">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => setLocale(o.v)}
          aria-pressed={locale === o.v}
          className={cx("rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors", locale === o.v ? "bg-ink text-white" : "text-muted hover:text-ink")}
          data-testid={`lang-${o.v}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Brand({ alwaysText }: { alwaysText?: boolean }) {
  const { t } = useI18n();
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5 font-semibold text-ink">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-brand text-brand">
        <Sprout className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      </span>
      <span className={alwaysText ? undefined : "hidden sm:inline"}>{t.shell.brand}</span>
    </Link>
  );
}

function MockBanner() {
  const { t } = useI18n();
  if (API_MODE !== "mock") return null;
  return <div className="bg-warn px-4 py-1.5 text-center text-xs font-medium text-white">{t.shell.mockBanner}</div>;
}

// Landing: cabeçalho leve (logo, Transparência, idioma) e página de largura total.
function LandingShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="lp flex min-h-screen flex-col">
      <MockBanner />
      <DemoStrip />
      <header className="border-b border-border bg-surface">
        <div className={cx(WRAP, "flex items-center gap-6 py-3")}>
          <Brand alwaysText />
          <nav aria-label="Principal" className="flex items-center gap-4">
            <Link href="/verificar" className="hidden rounded-md px-1 py-1 text-sm text-muted hover:text-ink sm:inline">
              {t.shell.navVerify}
            </Link>
            <Link href="/transparencia" className="rounded-md px-1 py-1 text-sm text-muted hover:text-ink">
              {t.shell.navTransparency}
            </Link>
          </nav>
          <span className="ml-auto">
            <LanguageToggle />
          </span>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

// Página pública do sacado (/confirmar/[token]): sem navegação interna.
function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <DemoStrip width="max-w-xl" />
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-4">
          <Brand />
          <span className="ml-auto flex items-center gap-2">
            <LanguageToggle />
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const { role: storedRole, distributorName, funderName } = useRole();
  if (pathname.startsWith("/confirmar/")) return <PublicShell>{children}</PublicShell>;
  if (pathname === "/") return <LandingShell>{children}</LandingShell>;

  const role = roleFromPath(pathname) ?? storedRole;
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
        : role === "admin"
          ? [{ href: "/admin", label: t.shell.navAdmin, active: pathname.startsWith("/admin") }]
          : [];
  nav.push({ href: "/verificar", label: t.shell.navVerify, active: pathname === "/verificar" });
  nav.push({ href: "/transparencia", label: t.shell.navTransparency, active: pathname === "/transparencia" });

  return (
    <div className="flex min-h-screen flex-col">
      <MockBanner />
      <DemoStrip />
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className={cx(WRAP, "flex flex-wrap items-stretch gap-x-3 sm:h-16 sm:flex-nowrap sm:gap-8")}>
          <span className="flex h-14 items-center sm:h-auto">
            <Brand />
          </span>
          <nav
            aria-label="Principal"
            className="order-last -mx-1 flex h-11 w-full min-w-0 gap-5 overflow-x-auto border-t border-divider px-1 [scrollbar-width:none] sm:order-none sm:h-auto sm:w-auto sm:flex-1 sm:gap-6 sm:border-0"
          >
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={n.active ? "page" : undefined}
                className={cx(
                  "relative flex shrink-0 items-center whitespace-nowrap text-sm transition-colors",
                  n.active
                    ? "font-medium text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-brand"
                    : "text-muted hover:text-ink",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex h-14 shrink-0 items-center gap-1.5 sm:ml-0 sm:h-auto sm:gap-3">
            <ConnectionDot />
            {role && (
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-ink hover:text-ink sm:px-3"
                title={t.shell.switchProfile}
                data-testid="role-chip"
              >
                <span className="hidden font-medium text-ink md:inline">{role === "distributor" ? distributorName : role === "funder" ? funderName : t.shell.roleAdmin}</span>
                <ArrowLeftRight className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                <span className="sr-only">{t.shell.switchProfile}</span>
              </Link>
            )}
            <LanguageToggle />
          </div>
        </div>
      </header>
      <main className={cx(WRAP, "flex-1 py-8 lg:py-12")}>{children}</main>
    </div>
  );
}
