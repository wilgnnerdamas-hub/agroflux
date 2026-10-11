"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, toApiError } from "@/lib/api";
import { formatBps, formatDate, formatDateTime, formatMoney, shorten } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { nextStep } from "@/lib/nextStep";
import { DISTRIBUTORS } from "@/lib/role";
import { useAsync } from "@/lib/useAsync";
import type { AdminRiskGroup, FunderType, Rating, Settings } from "@/lib/types";
import { Alert, Button, Card, CardTitle, ErrorState, ExplorerLink, LoadingBlock, PageHeader, cx } from "@/components/ui";
import { RatingBadge, ratingTone } from "@/components/RiskCard";

const TABS = ["overview", "receivables", "funders", "distributors", "revenue", "risk", "settings"] as const;
type Tab = (typeof TABS)[number];
const FUNDER_NAMES: Record<string, string> = { fnd_a: "Financiador Demo A", fnd_b: "Financiador Demo B", fnd_c: "Financiador Demo C" };
const RATINGS: Rating[] = ["AA", "A", "B", "C", "D", "E", "F", "G", "H"];
const th = "px-3 py-2 text-left text-xs font-medium text-muted";
const td = "px-3 py-2.5 text-sm";

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}

/** Tabela com rolagem horizontal no celular. */
function Table({ head, children }: { head: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[640px]">
        <thead className="border-b border-border">
          <tr>{head.map((h, i) => <th key={i} className={th}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

function useLoad<T>(fn: () => Promise<T>) {
  const { state, reload } = useAsync(fn, []);
  const { errorMessage } = useI18n();
  const view = (render: (d: T) => React.ReactNode) =>
    !state.data && state.status === "loading" ? <Card><LoadingBlock lines={4} /></Card> :
    !state.data && state.status === "error" ? <ErrorState message={errorMessage(state.error)} onRetry={() => reload()} /> :
    state.data ? render(state.data) : null;
  return { view, reload };
}

function Overview() {
  const { t } = useI18n();
  const a = t.admin;
  const { view } = useLoad(() => api.adminOverview());
  return view((o) => {
    const maxMix = Math.max(1, ...Object.values(o.ratingMix));
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label={a.portfolio} value={formatMoney(o.portfolioCents)} hint={t.common.receivables(o.receivables)} />
          <Kpi label={a.assigned} value={formatMoney(o.assignedVolumeCents)} hint={`${o.assignedCount}`} />
          <Kpi label={a.revenue} value={formatMoney(o.revenueCents)} />
          <Kpi label={a.expectedLoss} value={formatMoney(o.expectedLossCents)} />
          <Kpi label={a.avgTicket} value={o.averageTicketCents != null ? formatMoney(o.averageTicketCents) : "—"} />
          <Kpi label={a.avgTerm} value={o.averageTermDays != null ? t.common.days(o.averageTermDays) : "—"} />
          <Kpi label={a.avgRate} value={o.averageAnnualRateBps != null ? `${formatBps(o.averageAnnualRateBps)} ${t.pricing.perYear}` : "—"} />
          <Kpi label={a.avgCet} value={o.averageCetAnnualBps != null ? `${formatBps(o.averageCetAnnualBps)} ${t.pricing.perYear}` : "—"} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardTitle>{a.byStatus}</CardTitle>
            <ul className="divide-y divide-border text-sm">
              {Object.entries(o.byStatus).map(([s, n]) => (
                <li key={s} className="flex justify-between py-2">
                  <span>{t.status.receivable[s as keyof typeof t.status.receivable] ?? s}</span>
                  <span className="font-semibold tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardTitle>{a.ratingMix}</CardTitle>
            <ul className="space-y-1.5" data-testid="rating-mix">
              {RATINGS.map((r) => (
                <li key={r} className="flex items-center gap-3 text-sm">
                  <span className={cx("w-9 rounded border text-center text-xs font-bold", ratingTone(r))}>{r}</span>
                  <span className="h-2 flex-1 rounded-full bg-subtle">
                    <span className="block h-2 rounded-full bg-brand" style={{ width: `${(o.ratingMix[r] / maxMix) * 100}%` }} />
                  </span>
                  <span className="w-6 text-right tabular-nums">{o.ratingMix[r]}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    );
  });
}

function Receivables() {
  const { t } = useI18n();
  const a = t.admin;
  const { view } = useLoad(() => api.adminReceivables());
  return view((d) => (
    <Table head={[t.dashboard.colCode, a.distributor, t.dashboard.colDebtor, t.dashboard.colAmount, t.dashboard.colDue, t.risk.rating, t.dashboard.colNext, a.accepted]}>
      {d.items.map((r) => (
        <tr key={r.id} className="hover:bg-subtle/60">
          <td className={cx(td, "font-semibold")}><Link href={`/recebiveis/${r.id}`} className="hover:underline">{r.reference}</Link></td>
          <td className={td}>{r.distributor.name}</td>
          <td className={td}>{r.debtor.alias} <span className="text-faint">· {r.debtor.state}</span></td>
          <td className={cx(td, "whitespace-nowrap tabular-nums")}>{formatMoney(r.amountCents)}</td>
          <td className={cx(td, "whitespace-nowrap tabular-nums")}>{formatDate(r.dueDate)}</td>
          <td className={td}><RatingBadge rating={r.rating} score={r.score} /></td>
          <td className={cx(td, "whitespace-nowrap text-muted")}>{nextStep({ status: r.status, debtorConfirmation: { status: "none" }, offerCount: r.offerCount }, t).label}</td>
          <td className={cx(td, "whitespace-nowrap")}>
            {r.acceptedOffer ? (
              <>
                {r.acceptedOffer.funderName}
                <span className="block text-xs text-muted">{r.acceptedOffer.annualRateBps != null ? `${formatBps(r.acceptedOffer.annualRateBps)} ${t.pricing.perYear}` : ""}</span>
              </>
            ) : "—"}
          </td>
        </tr>
      ))}
    </Table>
  ));
}

function Funders() {
  const { t } = useI18n();
  const a = t.admin;
  const { view } = useLoad(() => api.adminFunders());
  return view((d) => (
    <Table head={[a.funder, a.proposals, a.acceptedCount, a.bought, a.boughtVolume, a.avgRate, a.avgYield, a.balance]}>
      {d.items.map((f) => (
        <tr key={f.id}>
          <td className={td}><span className="font-semibold">{f.name}</span><span className="block text-xs text-muted">{t.status.funderType[f.type]}</span></td>
          <td className={cx(td, "tabular-nums")}>{f.proposals}</td>
          <td className={cx(td, "tabular-nums")}>{f.accepted}</td>
          <td className={cx(td, "tabular-nums")}>{f.boughtCount}</td>
          <td className={cx(td, "whitespace-nowrap tabular-nums")}>{formatMoney(f.boughtFaceCents)}</td>
          <td className={cx(td, "whitespace-nowrap tabular-nums")}>{f.averageAnnualRateBps != null ? formatBps(f.averageAnnualRateBps) : "—"}</td>
          <td className={cx(td, "whitespace-nowrap tabular-nums")}>{f.averageYieldAnnualBps != null ? formatBps(f.averageYieldAnnualBps) : "—"}</td>
          <td className={cx(td, "whitespace-nowrap tabular-nums")}>{f.settlementUnits != null ? formatMoney(f.settlementUnits).replace("R$", "").trim() : "—"}</td>
        </tr>
      ))}
    </Table>
  ));
}

function Distributors() {
  const { t } = useI18n();
  const a = t.admin;
  const { view } = useLoad(() => api.adminDistributors());
  return view((d) => (
    <Table head={[a.distributor, a.receivablesCol, a.volume, a.assignedVolume, a.avgCet, a.topDebtor]}>
      {d.items.map((x) => (
        <tr key={x.id}>
          <td className={cx(td, "font-semibold")}>{x.name}</td>
          <td className={cx(td, "tabular-nums")}>{x.receivables}</td>
          <td className={cx(td, "whitespace-nowrap tabular-nums")}>{formatMoney(x.volumeCents)}</td>
          <td className={cx(td, "whitespace-nowrap tabular-nums")}>{formatMoney(x.assignedVolumeCents)} <span className="text-faint">({x.assignedCount})</span></td>
          <td className={cx(td, "whitespace-nowrap tabular-nums")}>{x.averageCetAnnualBps != null ? formatBps(x.averageCetAnnualBps) : "—"}</td>
          <td className={td}>{x.topDebtor ? <>{x.topDebtor.alias} <span className="text-faint">· {formatBps(x.topDebtor.shareBps, 0)}</span></> : "—"}</td>
        </tr>
      ))}
    </Table>
  ));
}

function Revenue() {
  const { t } = useI18n();
  const a = t.admin;
  const { view } = useLoad(() => api.adminRevenue());
  return view((d) => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={a.total} value={formatMoney(d.totals.platformFeeCents + d.totals.registryFeeCents)} hint={`${d.totals.count} ${a.entries.toLowerCase()}`} />
        <Kpi label={a.platformFee} value={formatMoney(d.totals.platformFeeCents)} />
        <Kpi label={a.registryFee} value={formatMoney(d.totals.registryFeeCents)} />
        <Kpi label={a.treasury} value={d.treasuryWallet ? shorten(d.treasuryWallet, 6, 6) : "—"} />
      </div>
      {d.entries.length === 0 ? (
        <Card><p className="text-sm text-muted">{a.noRevenue}</p></Card>
      ) : (
        <>
          <Table head={[a.month, a.platformFee, a.registryFee, a.total, a.count]}>
            {d.byMonth.map((m) => (
              <tr key={m.month}>
                <td className={td}>{m.month}</td>
                <td className={cx(td, "tabular-nums")}>{formatMoney(m.platformFeeCents)}</td>
                <td className={cx(td, "tabular-nums")}>{formatMoney(m.registryFeeCents)}</td>
                <td className={cx(td, "font-semibold tabular-nums")}>{formatMoney(m.platformFeeCents + m.registryFeeCents)}</td>
                <td className={cx(td, "tabular-nums")}>{m.count}</td>
              </tr>
            ))}
          </Table>
          <Table head={[t.dashboard.colCode, a.distributor, a.funder, t.passport.face, a.platformFee, a.registryFee, t.common.explorer]}>
            {d.entries.map((e) => (
              <tr key={e.id} data-testid="revenue-entry">
                <td className={cx(td, "font-semibold")}>{e.reference}<span className="block text-xs font-normal text-muted">{formatDateTime(e.settledAt)}</span></td>
                <td className={td}>{DISTRIBUTORS.find((x) => x.id === e.distributorId)?.name ?? e.distributorId}</td>
                <td className={td}>{FUNDER_NAMES[e.funderId] ?? e.funderId}</td>
                <td className={cx(td, "tabular-nums")}>{formatMoney(e.faceAmountCents)}</td>
                <td className={cx(td, "tabular-nums")}>{formatMoney(e.platformFeeCents)}</td>
                <td className={cx(td, "tabular-nums")}>{formatMoney(e.registryFeeCents)}</td>
                <td className={td}><ExplorerLink href={`https://explorer.solana.com/tx/${e.settlementSignature}?cluster=devnet`}>{shorten(e.settlementSignature, 6, 4)}</ExplorerLink></td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </div>
  ));
}

function GroupTable({ title, rows, label }: { title: string; rows: AdminRiskGroup[]; label?: (k: string) => string }) {
  const { t } = useI18n();
  const a = t.admin;
  const total = rows.reduce((s, r) => s + r.amountCents, 0) || 1;
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <ul className="space-y-2 text-sm">
        {rows.slice(0, 6).map((r) => (
          <li key={r.key}>
            <div className="flex justify-between gap-2">
              <span className="truncate">{label ? label(r.key) : r.key}</span>
              <span className="whitespace-nowrap tabular-nums">{formatMoney(r.amountCents)} · {a.share.toLowerCase()} {formatBps(Math.round((r.amountCents / total) * 10_000), 0)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-subtle"><div className="h-1.5 rounded-full bg-chain" style={{ width: `${(r.amountCents / total) * 100}%` }} /></div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Risk() {
  const { t } = useI18n();
  const a = t.admin;
  const { view } = useLoad(() => api.adminRisk());
  return view((d) => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label={a.portfolio} value={formatMoney(d.portfolioCents)} />
        <Kpi label={t.risk.el} value={formatMoney(d.expectedLossCents)} hint={formatBps(Math.round((d.expectedLossCents / (d.portfolioCents || 1)) * 10_000))} />
      </div>
      <Table head={[t.risk.rating, a.count, a.volume, t.risk.el, a.pdCol, a.spreadCol]}>
        {d.ratings.map((r) => (
          <tr key={r.rating}>
            <td className={td}><RatingBadge rating={r.rating} /></td>
            <td className={cx(td, "tabular-nums")}>{r.count}</td>
            <td className={cx(td, "tabular-nums")}>{formatMoney(r.amountCents)}</td>
            <td className={cx(td, "tabular-nums")}>{formatMoney(r.expectedLossCents)}</td>
            <td className={cx(td, "tabular-nums")}>{formatBps(r.pdAnnualBps)}</td>
            <td className={cx(td, "tabular-nums")}>{formatBps(r.spreadBps)}</td>
          </tr>
        ))}
      </Table>
      <div className="grid gap-6 lg:grid-cols-3">
        <GroupTable title={a.byDebtor} rows={d.byDebtor} />
        <GroupTable title={a.byState} rows={d.byState} />
        <GroupTable title={a.byCategory} rows={d.byCategory} label={(k) => t.status.product[k as keyof typeof t.status.product] ?? k} />
      </div>
    </div>
  ));
}

const pctInput = "w-24 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm tabular-nums";

function SettingsForm() {
  const { t, errorMessage, locale } = useI18n();
  const a = t.admin;
  const { state, setState } = useAsync(() => api.getSettings(), []);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  useEffect(() => {
    if (state.data && !draft) setDraft(state.data);
  }, [state.data, draft]);
  if (!draft) return state.status === "error" ? <ErrorState message={errorMessage(state.error)} /> : <Card><LoadingBlock lines={5} /></Card>;

  const sep = locale === "pt" ? "," : ".";
  const show = (bps: number, digits = 2) => (bps / 100).toFixed(digits).replace(".", sep);
  const parse = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);
  const set = (fn: (d: Settings) => void) => setDraft((d) => {
    const next = JSON.parse(JSON.stringify(d)) as Settings;
    fn(next);
    return next;
  });

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const saved = await api.updateSettings(draft);
      setState({ status: "success", data: saved });
      setDraft(saved);
      setMsg({ tone: "ok", text: a.saved });
    } catch (e) {
      const ae = toApiError(e);
      setMsg({ tone: "bad", text: [errorMessage(ae), ...Object.values(ae.fieldErrors ?? {})].join(" ") });
    } finally {
      setBusy(false);
    }
  }

  const field = (label: string, input: React.ReactNode) => (
    <label className="flex items-center justify-between gap-4 py-2 text-sm">
      <span>{label}</span>
      {input}
    </label>
  );
  const types: FunderType[] = ["simulated_fidc", "simulated_bank", "simulated_cooperative"];

  return (
    <div className="space-y-6" data-testid="settings-form">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{t.pricing.rate}</CardTitle>
          {field(
            a.cdiSource,
            <select className={pctInput + " w-auto"} value={draft.cdi.source} onChange={(e) => set((d) => void (d.cdi.source = e.target.value as "bcb" | "manual"))}>
              <option value="bcb">{a.cdiBcb}</option>
              <option value="manual">{a.cdiManual}</option>
            </select>,
          )}
          {field(a.cdiManualValue, <input className={pctInput} defaultValue={show(draft.cdi.manualAnnualBps)} onBlur={(e) => set((d) => void (d.cdi.manualAnnualBps = parse(e.target.value)))} />)}
          {field(a.platformFeeField, <input className={pctInput} defaultValue={show(draft.platformFeeBps)} onBlur={(e) => set((d) => void (d.platformFeeBps = parse(e.target.value)))} data-testid="platform-fee-input" />)}
          {field(a.registryFeeField, <input className={pctInput} defaultValue={show(draft.registryFeeCents)} onBlur={(e) => set((d) => void (d.registryFeeCents = parse(e.target.value)))} />)}
        </Card>
        <Card>
          <CardTitle>{a.iof}</CardTitle>
          {types.map((ty) =>
            field(
              t.status.funderType[ty],
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={draft.iofByFunderType[ty]} onChange={(e) => set((d) => void (d.iofByFunderType[ty] = e.target.checked))} />,
            ),
          )}
          {field(a.lgdWith, <input className={pctInput} defaultValue={show(draft.lgdBps.withCoobligation, 0)} onBlur={(e) => set((d) => void (d.lgdBps.withCoobligation = parse(e.target.value)))} />)}
          {field(a.lgdWithout, <input className={pctInput} defaultValue={show(draft.lgdBps.withoutCoobligation, 0)} onBlur={(e) => set((d) => void (d.lgdBps.withoutCoobligation = parse(e.target.value)))} />)}
        </Card>
      </div>
      <Card>
        <CardTitle>{a.ratingTable}</CardTitle>
        <div className="overflow-x-auto">
          <table className="min-w-[420px]">
            <thead><tr><th className={th}>{t.risk.rating}</th><th className={th}>{a.pdCol}</th><th className={th}>{a.spreadCol}</th></tr></thead>
            <tbody>
              {RATINGS.map((r) => (
                <tr key={r}>
                  <td className={td}><RatingBadge rating={r} /></td>
                  <td className={td}><input className={pctInput} defaultValue={show(draft.ratings[r].pdAnnualBps)} onBlur={(e) => set((d) => void (d.ratings[r].pdAnnualBps = parse(e.target.value)))} /></td>
                  <td className={td}><input className={pctInput} defaultValue={show(draft.ratings[r].spreadBps)} onBlur={(e) => set((d) => void (d.ratings[r].spreadBps = parse(e.target.value)))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted">{a.settingsNote}</p>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Button onClick={save} loading={busy}>{busy ? a.saving : a.save}</Button>
    </div>
  );
}

function AdminConsole() {
  const { t } = useI18n();
  const a = t.admin;
  const router = useRouter();
  const tab = (useSearchParams().get("tab") as Tab) ?? "overview";
  const current: Tab = TABS.includes(tab) ? tab : "overview";
  return (
    <>
      <PageHeader title={a.title} subtitle={a.subtitle} />
      <div className="-mx-4 mb-6 overflow-x-auto px-4 [scrollbar-width:none]">
        <div role="tablist" className="inline-flex gap-1 rounded-lg border border-border bg-surface p-1">
          {TABS.map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={current === k}
              onClick={() => router.replace(`/admin?tab=${k}`)}
              className={cx("whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium", current === k ? "bg-ink text-white" : "text-muted hover:text-ink")}
              data-testid={`tab-${k}`}
            >
              {a.tabs[k]}
            </button>
          ))}
        </div>
      </div>
      {current === "overview" && <Overview />}
      {current === "receivables" && <Receivables />}
      {current === "funders" && <Funders />}
      {current === "distributors" && <Distributors />}
      {current === "revenue" && <Revenue />}
      {current === "risk" && <Risk />}
      {current === "settings" && <SettingsForm />}
    </>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <AdminConsole />
    </Suspense>
  );
}
