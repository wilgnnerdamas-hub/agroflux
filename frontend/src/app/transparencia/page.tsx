"use client";

import { Boxes, Coins, Landmark, RefreshCw, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber, shorten } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useAsync } from "@/lib/useAsync";
import { Alert, Badge, Button, Card, CardTitle, CopyButton, ErrorState, ExplorerLink, LoadingBlock, PageHeader } from "@/components/ui";

function AddressRow({ label, address, url, aside }: { label: string; address: string; url: string; aside?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <div className="flex items-center gap-1">
          <code className="truncate font-mono text-xs text-muted" title={address}>{shorten(address, 10, 8)}</code>
          <CopyButton value={address} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {aside}
        <ExplorerLink href={url} />
      </div>
    </li>
  );
}

export default function TransparencyPage() {
  const { t, locale } = useI18n();
  const tr = t.transparency;
  const { state, reload } = useAsync(() => api.getTransparency());
  const d = state.data;
  const sol = (l: number | null) => (l == null ? tr.balanceUnknown : `${(l / 1e9).toLocaleString(locale === "pt" ? "pt-BR" : "en-US", { maximumFractionDigits: 4 })} SOL`);
  const tbrl = (u: number | null) => (u == null ? tr.balanceUnknown : `${(u / 100).toLocaleString(locale === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tBRL-DEMO`);

  return (
    <>
      <PageHeader
        title={tr.title}
        subtitle={tr.subtitle}
        actions={
          <Button variant="secondary" onClick={() => reload(true)} loading={state.status === "loading" && !!d}>
            <RefreshCw className="h-4 w-4" aria-hidden /> {t.common.refresh}
          </Button>
        }
      />
      {!d && state.status === "loading" && <Card><LoadingBlock lines={5} /></Card>}
      {!d && state.status === "error" && <ErrorState message={state.error.message} onRetry={() => reload()} />}
      {d && (
        <div className="grid gap-6 lg:grid-cols-2" data-testid="transparency">
          <Card>
            <CardTitle icon={<Boxes className="h-4 w-4 text-chain" aria-hidden />}>{tr.programs}</CardTitle>
            <ul className="divide-y divide-border">
              {d.programs.map((p) => <AddressRow key={p.role} label={p.label} address={p.address} url={p.explorerUrl} />)}
            </ul>
          </Card>

          <Card>
            <CardTitle icon={<Landmark className="h-4 w-4 text-info" aria-hidden />}>{tr.stats}</CardTitle>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {Object.entries(d.stats).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs uppercase tracking-wide text-faint">{tr.s[k] ?? k}</dt>
                  <dd className="mt-0.5 text-xl font-bold tabular-nums">{formatNumber(v)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-sm text-muted">
              <Badge tone="info">{d.registry.name}</Badge> <span className="ml-1">{tr.titles(d.registry.titles)}</span>
            </p>
          </Card>

          {d.settlementAsset ? (
            <Card>
              <CardTitle icon={<Coins className="h-4 w-4 text-sim" aria-hidden />}>{tr.asset}</CardTitle>
              <ul className="divide-y divide-border">
                <AddressRow label={`${d.settlementAsset.symbol} · ${d.settlementAsset.decimals}`} address={d.settlementAsset.mint} url={d.settlementAsset.explorerUrl} />
              </ul>
            </Card>
          ) : (
            <Alert tone="info">{tr.assignmentOff}</Alert>
          )}

          {d.wallets.length > 0 && (
            <Card className="lg:col-span-2">
              <CardTitle icon={<Wallet className="h-4 w-4 text-muted" aria-hidden />}>{tr.wallets}</CardTitle>
              <ul className="divide-y divide-border">
                {d.wallets.map((w) => (
                  <AddressRow
                    key={w.address}
                    label={w.role === "fee_payer" ? tr.feePayer : w.role === "treasury" ? `${t.admin.treasury} AgroFlux` : w.label}
                    address={w.address}
                    url={w.explorerUrl}
                    aside={
                      <span className="text-xs tabular-nums text-muted">
                        {w.role === "fee_payer" ? sol(w.solLamports) : tbrl(w.settlementUnits)}
                      </span>
                    }
                  />
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">{tr.checkedAt(formatDateTime(d.checkedAt))}</p>
            </Card>
          )}
        </div>
      )}
      <p className="mt-6 text-xs text-muted">{tr.note}</p>
    </>
  );
}
