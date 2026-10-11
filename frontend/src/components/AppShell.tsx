"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FlaskConical, Repeat, Sprout } from "lucide-react";
import { api, API_MODE } from "@/lib/api";
import { useI18n, type Locale } from "@/lib/i18n";
import { roleFromPath, useRole } from "@/lib/role";
import { DemoStrip } from "./DemoNotice";
import { cx } from "./ui";

type Conn = "checking" | "ok" | "down" | "mock";

/** Estado do backend e da Devnet num ponto discreto; o texto aparece ao passar o mouse e para leitores de tela. */
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
  const text = `${t.common.devnet} · ${label}${lowBalance ? ` · ${t.shell.lowBalance}` : ""}`;
  const color = conn === "ok" ? (lowBalance ? "bg-warn" : "bg-ok") : conn === "down" ? "bg-bad" : "bg-faint";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-muted" title={text}>
      <span className={cx("h-2 w-2 rounded-full", color)} aria-hidden />
      <span className="hidden lg:inline">{t.common.devnet}</span>
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
    <div role="group" aria-label={t.shell.language} className="inline-flex rounded-lg border border-border p-0.5">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => setLocale(o.v)}
          aria-pressed={locale === o.v}
          className={cx("rounded-md px-2 py-0.5 text-xs font-semibold", locale === o.v ? "bg-ink text-white" : "text-muted hover:text-ink")}
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
    <Link href="/" className="flex shrink-0 items-center gap-2 font-bold text-ink">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white">
        <Sprout className="h-4 w-4" aria-hidden />
      </span>
      <span className="hidden sm:inline">{t.shell.brand}</span>
    </Link>
  );
}

// Página pública do sacado (/confirmar/[token]): sem navegação interna.
function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <DemoStrip width="max-w-xl" />
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-2.5">
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
  const { role: storedRole, distributorName } = useRole();
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
        : role === "admin"
          ? [{ href: "/admin", label: t.shell.navAdmin, active: pathname.startsWith("/admin") }]
          : [];
  nav.push({ href: "/transparencia", label: t.shell.navTransparency, active: pathname === "/transparencia" });

  return (
    <div className="flex min-h-screen flex-col">
      {API_MODE === "mock" && (
        <div className="bg-warn text-white">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-1.5 text-xs font-semibold sm:px-6">
            <FlaskConical className="h-4 w-4" aria-hidden /> {t.shell.mockBanner}
          </div>
        </div>
      )}
      <DemoStrip />
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:gap-6 sm:px-6">
          <Brand />
          <nav aria-label="Principal" className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={n.active ? "page" : undefined}
                className={cx(
                  "shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium",
                  n.active ? "bg-brand-soft text-brand" : "text-muted hover:bg-subtle hover:text-ink",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {!isLanding && <ConnectionDot />}
            {role && (
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs font-medium text-muted hover:text-ink"
                title={t.shell.switchProfile}
                data-testid="role-chip"
              >
                <span className="hidden font-semibold text-ink md:inline">{role === "distributor" ? distributorName : role === "funder" ? t.shell.roleFunder : t.shell.roleAdmin}</span>
                <Repeat className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">{t.shell.switchProfile}</span>
              </Link>
            )}
            <LanguageToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
