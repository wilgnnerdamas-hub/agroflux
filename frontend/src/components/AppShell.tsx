"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FlaskConical, Sprout } from "lucide-react";
import { api, API_MODE } from "@/lib/api";
import { Badge, cx } from "./ui";

type Conn = "checking" | "ok" | "down" | "mock";

function ConnectionBadge() {
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
    const t = setInterval(check, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="chain">Solana Devnet</Badge>
      {conn === "mock" && <Badge tone="warn">Backend não conectado</Badge>}
      {conn === "checking" && <Badge>Verificando backend…</Badge>}
      {conn === "ok" && <Badge tone="ok">Backend conectado</Badge>}
      {conn === "down" && <Badge tone="bad">Backend indisponível</Badge>}
      {lowBalance && <Badge tone="warn">Carteira Devnet com pouco saldo</Badge>}
    </div>
  );
}

// v1.1: página pública do sacado (/confirmar/[token]). Sem navegação interna da distribuidora.
function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-3 font-bold text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
            <Sprout className="h-5 w-5" aria-hidden />
          </span>
          AgroFlux
          <Badge tone="chain" className="ml-auto">Solana Devnet</Badge>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-border bg-surface">
        <p className="mx-auto max-w-xl px-4 py-4 text-xs leading-relaxed text-muted">
          <strong className="text-ink">Ambiente de demonstração.</strong> Recebível fictício, sem validação jurídica. A
          confirmação é simulada e não verifica a identidade de quem responde.
        </p>
      </footer>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/confirmar/")) return <PublicShell>{children}</PublicShell>;
  const nav = [
    { href: "/", label: "Recebíveis", active: pathname === "/" || (pathname.startsWith("/recebiveis/") && pathname !== "/recebiveis/novo") },
    { href: "/recebiveis/novo", label: "Novo recebível", active: pathname === "/recebiveis/novo" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      {API_MODE === "mock" && (
        <div className="bg-warn text-white">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-xs font-semibold sm:px-6">
            <FlaskConical className="h-4 w-4" aria-hidden />
            Modo mock — backend não conectado. Dados locais de desenvolvimento; nenhuma transação é criada.
          </div>
        </div>
      )}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 font-bold text-ink">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
                <Sprout className="h-5 w-5" aria-hidden />
              </span>
              AgroFlux
            </Link>
            <nav aria-label="Principal" className="flex gap-1">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={n.active ? "page" : undefined}
                  className={cx(
                    "rounded-md px-3 py-2 text-sm font-medium",
                    n.active ? "bg-brand-soft text-brand" : "text-muted hover:bg-subtle hover:text-ink",
                  )}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <ConnectionBadge />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs leading-relaxed text-muted sm:px-6">
          <strong className="text-ink">Ambiente de demonstração.</strong> Recebíveis fictícios, registrados na Solana
          Devnet (rede de testes). Não há validação jurídica dos recebíveis, as ofertas são simuladas e nenhum
          financiamento é oferecido ou garantido.
        </div>
      </footer>
    </div>
  );
}
