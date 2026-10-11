"use client";

import { Suspense, useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAsync } from "@/lib/useAsync";
import { LoadingBlock, PageHeader, cx } from "@/components/ui";
import { Overview, type OpenReceivables } from "@/components/admin/Overview";
import { Receivables, type ReceivableFilter } from "@/components/admin/Receivables";
import { Distributors, Funders } from "@/components/admin/Participants";
import { Revenue, Risk } from "@/components/admin/RevenueRisk";
import { SettingsPanel } from "@/components/admin/SettingsPanel";
import { STAGES, type StageGroup } from "@/components/admin/shared";

const TABS = ["overview", "receivables", "funders", "distributors", "revenue", "risk", "settings"] as const;
type Tab = (typeof TABS)[number];
// A aba vai para a URL em português (?aba=risco); ?tab= continua aceito.
const SLUG: Record<Tab, string> = {
  overview: "visao-geral",
  receivables: "recebiveis",
  funders: "financiadores",
  distributors: "distribuidoras",
  revenue: "faturamento",
  risk: "risco",
  settings: "configuracoes",
};
const FROM_SLUG = Object.fromEntries(Object.entries(SLUG).map(([k, v]) => [v, k])) as Record<string, Tab>;
const FILTERS: ReceivableFilter[] = ["all", "waiting", "assigned", "failed"];

function AdminConsole() {
  const { t } = useI18n();
  const a = t.admin;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("aba") ?? params.get("tab") ?? "";
  const current: Tab = FROM_SLUG[raw] ?? (TABS.includes(raw as Tab) ? (raw as Tab) : "overview");
  const filterParam = params.get("filtro") as ReceivableFilter | null;
  const filter: ReceivableFilter = filterParam && FILTERS.includes(filterParam) ? filterParam : "all";
  const stageParam = params.get("etapa") as StageGroup | null;
  const stage = stageParam && STAGES.some((s) => s.key === stageParam) ? stageParam : null;

  // Contador de falhas na aba Recebíveis.
  const { state: rows } = useAsync(() => api.adminReceivables(), []);
  const failures = rows.data?.items.filter((r) => r.status === "assignment_failed").length ?? 0;

  // Alterações não salvas nas configurações: confirma antes de sair da aba ou seguir um link interno.
  const dirty = useRef(false);
  const onDirtyChange = useCallback((d: boolean) => void (dirty.current = d), []);
  const canLeave = () => !dirty.current || window.confirm(a.leaveConfirm);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!dirty.current) return;
      const link = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.origin !== window.location.origin) return;
      if (!window.confirm(a.leaveConfirm)) {
        e.preventDefault();
        e.stopPropagation();
      } else dirty.current = false;
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [a.leaveConfirm]);

  const go = (tab: Tab, extra: Record<string, string> = {}) => {
    if (tab !== current && !canLeave()) return;
    if (tab !== current) dirty.current = false;
    const q = new URLSearchParams({ aba: SLUG[tab], ...extra });
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };
  const openReceivables: OpenReceivables = (f) => go("receivables", f.status ? { filtro: f.status } : f.stage ? { etapa: f.stage } : {});
  const setFilter = (f: ReceivableFilter, st?: StageGroup | null) => go("receivables", st ? { etapa: st } : f === "all" ? {} : { filtro: f });

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!n && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (i + n + TABS.length) % TABS.length;
    tabRefs.current[next]?.focus();
    go(TABS[next]);
  };

  return (
    <>
      <PageHeader title={a.title} subtitle={a.subtitle} />
      <div className="-mx-4 mb-8 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <div role="tablist" aria-label={a.title} className="flex min-w-max gap-7 border-b border-border">
          {TABS.map((k, i) => {
            const on = current === k;
            return (
              <button
                key={k}
                ref={(el) => void (tabRefs.current[i] = el)}
                role="tab"
                id={`tab-${k}`}
                aria-selected={on}
                aria-controls={`panel-${k}`}
                tabIndex={on ? 0 : -1}
                onClick={() => go(k)}
                onKeyDown={(e) => onKey(e, i)}
                className={cx("relative -mb-px flex items-center gap-1.5 whitespace-nowrap pb-3 text-sm transition-colors", on ? "font-medium text-ink" : "text-muted hover:text-ink")}
                data-testid={`tab-${k}`}
              >
                {a.tabs[k]}
                {k === "receivables" && failures > 0 && (
                  <span className="rounded-full bg-amber-soft px-1.5 font-mono text-[11px] text-amber-text" aria-label={a.failuresSr(failures)}>{failures}</span>
                )}
                {on && <span key={k} className="agf-grow absolute inset-x-0 bottom-0 h-px bg-brand" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>
      {/* key: cada troca de aba remonta o conteúdo e repete a animação dos números. */}
      <div role="tabpanel" id={`panel-${current}`} aria-labelledby={`tab-${current}`} key={current}>
        {current === "overview" && <Overview onOpen={openReceivables} />}
        {current === "receivables" && <Receivables filter={filter} stage={stage} onFilter={setFilter} />}
        {current === "funders" && <Funders />}
        {current === "distributors" && <Distributors />}
        {current === "revenue" && <Revenue />}
        {current === "risk" && <Risk />}
        {current === "settings" && <SettingsPanel onDirtyChange={onDirtyChange} />}
      </div>
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
