"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime, shorten } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useCountUp } from "@/lib/motion";
import { useRole } from "@/lib/role";
import { useAsync } from "@/lib/useAsync";
import type { Transparency, TransparencyWallet } from "@/lib/types";
import { AddressPill, Alert, ErrorState, ExplorerLink, LoadingBlock, PageHeader, cx } from "@/components/ui";

function FunnelCell({ n, value, total, label }: { n: string; value: number; total: number; label: string }) {
  const shown = useCountUp(value);
  // A barra parte do zero e anima até a proporção do total.
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setPct(total > 0 ? Math.min(100, (value / total) * 100) : 0));
    return () => cancelAnimationFrame(id);
  }, [value, total]);
  return (
    <div className="bg-surface p-5">
      <p className="font-mono text-[11px] text-brand">{n}</p>
      <p className="big-num mt-2 text-[26px] leading-none sm:text-[30px]">{shown}</p>
      <span className="relative mt-4 block h-0.5" aria-hidden>
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        <span className="agf-bar absolute left-0 top-0 h-0.5 rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </span>
      <p className="mt-3 text-xs text-muted">{label}</p>
    </div>
  );
}

function Funnel({ d }: { d: Transparency }) {
  const { t } = useI18n();
  const tr = t.transparency;
  const s = d.stats;
  const cells = [s.receivables, s.registeredOnChain, s.debtorAccepted, s.published, s.assigned];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-border bg-border md:grid-cols-3 xl:grid-cols-6" data-testid="funnel">
      {cells.map((v, i) => (
        <FunnelCell key={i} n={String(i + 1).padStart(2, "0")} value={v} total={s.receivables} label={tr.funnel[i]} />
      ))}
      <div className="bg-chain-soft p-5">
        <p className="font-mono text-[11px] uppercase text-chain">escrow</p>
        <p className="big-num mt-2 text-[26px] leading-none text-chain sm:text-[30px]">0</p>
        <p className="mt-4 text-xs text-muted">{tr.escrowCell}</p>
        {s.doubleSpendRejected > 0 && <p className="mt-1 font-mono text-[11px] text-chain">{tr.rejectedAttempts(s.doubleSpendRejected)}</p>}
      </div>
    </div>
  );
}

function Panel({ title, aside, children, className }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-[14px] border border-border bg-surface", className)}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-divider px-5 py-4">
        <h2 className="text-base font-medium">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

export default function TransparencyPage() {
  const { t, locale } = useI18n();
  const tr = t.transparency;
  const { role, distributorId } = useRole();
  const { state, reload } = useAsync(() => api.getTransparency());
  const [spin, setSpin] = useState(0);
  const d = state.data;
  const nf = (v: number, digits: number) => v.toLocaleString(locale === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const balance = (w: TransparencyWallet) =>
    w.role === "fee_payer"
      ? w.solLamports == null ? null : { v: nf(w.solLamports / 1e9, 4), unit: "SOL" }
      : w.settlementUnits == null ? null : { v: nf(w.settlementUnits / 100, 2), unit: "tBRL-DEMO" };
  const isMine = (w: TransparencyWallet) =>
    (role === "distributor" && w.role === "distributor" && (w.distributorId ?? "dst_a") === distributorId) ||
    (role === "funder" && w.role === "funder" && w.funderId === "fnd_a") ||
    (role === "admin" && w.role === "treasury");
  const roleLabel = (w: TransparencyWallet) => tr.roles[w.role];
  const programDesc = (r: string) => tr.programDesc[r as keyof typeof tr.programDesc] ?? "";

  return (
    <>
      <PageHeader
        title={tr.title}
        subtitle={tr.subtitle}
        actions={
          <button
            type="button"
            onClick={() => {
              setSpin((n) => n + 1);
              void reload(true);
            }}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-[10px] border border-border bg-surface px-4 text-sm font-medium transition-colors hover:border-ink"
          >
            <RefreshCw key={spin} className={cx("h-4 w-4", spin > 0 && "agf-spin")} strokeWidth={1.5} aria-hidden /> {t.common.refresh}
          </button>
        }
      />
      {!d && state.status === "loading" && <div className="rounded-[14px] border border-border bg-surface p-6"><LoadingBlock lines={5} /></div>}
      {!d && state.status === "error" && <ErrorState message={state.error.message} onRetry={() => reload()} />}
      {d && (
        <div className="space-y-6" data-testid="transparency">
          <Funnel d={d} />
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="rounded-full border border-chain-line bg-chain-soft px-2.5 py-0.5 text-xs font-medium text-chain">{d.registry.name}</span>
            {tr.registryLine(d.registry.titles)}
          </p>

          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <Panel title={tr.programs}>
              <ul className="divide-y divide-divider">
                {d.programs.map((p) => (
                  <li key={p.role} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-row">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{p.label}</p>
                      <p className="text-xs text-faint">{programDesc(p.role)}</p>
                    </div>
                    <AddressPill value={p.address} short={shorten(p.address, 6, 6)} />
                    <ExplorerLink href={p.explorerUrl}>{tr.explorer}</ExplorerLink>
                  </li>
                ))}
              </ul>
            </Panel>

            {d.settlementAsset ? (
              <Panel title={tr.asset}>
                <div className="px-5 py-5">
                  <p className="flex items-baseline gap-3">
                    <span className="big-num text-[26px]">{d.settlementAsset.symbol}</span>
                    <span className="text-xs text-faint">{tr.decimals(d.settlementAsset.decimals)}</span>
                  </p>
                  <p className="mt-2 text-sm text-muted">{tr.assetText}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <AddressPill value={d.settlementAsset.mint} short={shorten(d.settlementAsset.mint, 6, 6)} />
                    <ExplorerLink href={d.settlementAsset.explorerUrl}>{tr.explorer}</ExplorerLink>
                  </div>
                </div>
              </Panel>
            ) : (
              <Alert tone="info">{tr.assignmentOff}</Alert>
            )}
          </div>

          {d.wallets.length > 0 && (
            <Panel
              title={tr.wallets}
              aside={
                <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-faint">
                  <span>{tr.walletsNote}</span>
                  <span className="inline-flex items-center gap-2">
                    <span className="agf-pulse h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
                    {tr.checkedAt(formatDateTime(d.checkedAt))}
                  </span>
                </span>
              }
            >
              <ul className="divide-y divide-divider">
                {d.wallets.map((w) => {
                  const b = balance(w);
                  return (
                    <li
                      key={w.address}
                      className="grid grid-cols-1 items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-row sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_auto_minmax(0,1fr)_auto]"
                    >
                      <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                        <span className="truncate">{w.role === "fee_payer" ? tr.feePayer : w.role === "treasury" ? `${t.admin.treasury} AgroFlux` : w.label}</span>
                        {isMine(w) && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">{tr.you}</span>}
                      </p>
                      <p className="text-xs text-muted">{roleLabel(w)}</p>
                      <AddressPill value={w.address} short={shorten(w.address, 6, 6)} />
                      <p className="font-mono text-sm lg:text-right">
                        {b ? <>{b.v} <span className="text-xs text-faint">{b.unit}</span></> : <span className="text-faint">{tr.balanceUnknown}</span>}
                      </p>
                      <ExplorerLink href={w.explorerUrl}>{tr.explorer}</ExplorerLink>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
        </div>
      )}
      <p className="mt-8 text-center text-xs text-faint">{tr.note}</p>
    </>
  );
}
