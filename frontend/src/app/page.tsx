"use client";

import Link from "next/link";
import { ChevronRight, FileStack, Plus, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { formatDate, formatMoney } from "@/lib/format";
import { PRODUCT_CATEGORY_LABEL } from "@/lib/labels";
import { Button, ButtonLink, EmptyState, ErrorState, PageHeader, Skeleton, cx } from "@/components/ui";
import { ChainStatusBadge, DebtorConfirmationBadge, ReceivableStatusBadge } from "@/components/status";
import { FEATURE_ASSIGNMENT } from "@/lib/features";
import type { ReceivableList } from "@/lib/types";

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

// v1.1: confirmação do sacado e, com a função B ligada, cessões liquidadas.
const KPI_COUNT = FEATURE_ASSIGNMENT ? 5 : 4;
const KPI_COLS = FEATURE_ASSIGNMENT ? "lg:grid-cols-5" : "lg:grid-cols-4";

function KpiRow({ data }: { data?: ReceivableList }) {
  if (!data) {
    return (
      <div className={cx("grid grid-cols-2 gap-3", KPI_COLS)} aria-hidden>
        {Array.from({ length: KPI_COUNT }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-surface p-4">
            <Skeleton className="w-20" />
            <Skeleton className="mt-3 h-7 w-24" />
          </div>
        ))}
      </div>
    );
  }
  const t = data.totals;
  return (
    <div className={cx("grid grid-cols-2 gap-3", KPI_COLS)}>
      <Kpi label="Valor em carteira" value={formatMoney(t.amountCents)} hint={`${t.count} recebível(is)`} />
      <Kpi label="Registrados na Devnet" value={t.registeredCount} hint={t.pendingCount ? `${t.pendingCount} em registro` : undefined} />
      <Kpi label="Confirmados pelo sacado" value={t.debtorConfirmedCount} hint="simulação" />
      {/* Cessões liquidadas também passaram pela seleção de oferta. */}
      <Kpi label="Com oferta simulada" value={t.offerSelectedCount + t.assignedCount} />
      {FEATURE_ASSIGNMENT && <Kpi label="Cessões liquidadas" value={t.assignedCount} hint="tBRL-DEMO, sem valor" />}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface" role="status" aria-live="polite">
      <span className="sr-only">Carregando recebíveis…</span>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border p-4 last:border-0">
          <Skeleton className="w-20" />
          <Skeleton className="w-40" />
          <Skeleton className="ml-auto w-24" />
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { state, reload } = useAsync(() => api.listReceivables());
  const data = state.data;

  return (
    <>
      <PageHeader
        title="Recebíveis"
        subtitle="Passaportes digitais dos recebíveis comerciais da Distribuidora Demo."
        actions={
          <>
            <Button variant="secondary" onClick={() => reload(true)} loading={state.status === "loading" && !!data}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Atualizar
            </Button>
            <ButtonLink href="/recebiveis/novo">
              <Plus className="h-4 w-4" aria-hidden /> Novo recebível
            </ButtonLink>
          </>
        }
      />

      <div className="space-y-6">
        <KpiRow data={data} />

        {state.status === "error" && !data && (
          <ErrorState message={state.error.message} onRetry={() => reload()} title="Não foi possível carregar os recebíveis" />
        )}
        {state.status === "error" && data && (
          <ErrorState message={state.error.message} onRetry={() => reload(true)} title="A lista pode estar desatualizada" />
        )}

        {!data && state.status === "loading" && <ListSkeleton />}

        {data && data.items.length === 0 && (
          <EmptyState
            icon={<FileStack className="h-10 w-10" aria-hidden />}
            title="Nenhum recebível cadastrado"
            action={
              <ButtonLink href="/recebiveis/novo">
                <Plus className="h-4 w-4" aria-hidden /> Cadastrar o primeiro
              </ButtonLink>
            }
          >
            Cadastre um recebível fictício com um documento de teste para gerar o passaporte digital.
          </EmptyState>
        )}

        {data && data.items.length > 0 && (
          <>
            {/* Desktop: tabela */}
            <div className="hidden overflow-hidden rounded-xl border border-border bg-surface md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-subtle text-xs uppercase tracking-wide text-faint">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Código</th>
                    <th scope="col" className="px-4 py-3 font-medium">Sacado</th>
                    <th scope="col" className="hidden px-4 py-3 font-medium 2xl:table-cell">Insumo</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Valor</th>
                    <th scope="col" className="px-4 py-3 font-medium">Vencimento</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    <th scope="col" className="px-4 py-3 font-medium">Devnet</th>
                    <th scope="col" className="px-4 py-3 font-medium">Confirmação</th>
                    <th scope="col" className="w-8 px-2 py-3"><span className="sr-only">Abrir</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.id} className="group relative border-b border-border last:border-0 hover:bg-subtle/60">
                      <td className="whitespace-nowrap px-4 py-3 font-semibold">
                        <Link href={`/recebiveis/${r.id}`} className="after:absolute after:inset-0">
                          {r.reference}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {r.debtor.alias} <span className="text-faint">· {r.debtor.state}</span>
                      </td>
                      <td className="hidden px-4 py-3 text-muted 2xl:table-cell">{PRODUCT_CATEGORY_LABEL[r.product.category]}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">{formatMoney(r.amountCents)}</td>
                      <td className="px-4 py-3 tabular-nums">{formatDate(r.dueDate)}</td>
                      <td className="px-4 py-3"><ReceivableStatusBadge status={r.status} /></td>
                      <td className="px-4 py-3"><ChainStatusBadge status={r.chain.status} /></td>
                      <td className="px-4 py-3"><DebtorConfirmationBadge status={r.debtorConfirmation.status} short /></td>
                      <td className="px-2 py-3 text-faint group-hover:text-ink"><ChevronRight className="h-4 w-4" aria-hidden /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: cartões */}
            <ul className="space-y-3 md:hidden">
              {data.items.map((r) => (
                <li key={r.id}>
                  <Link href={`/recebiveis/${r.id}`} className="block rounded-xl border border-border bg-surface p-4 active:bg-subtle">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{r.reference}</span>
                      <span className="font-semibold tabular-nums">{formatMoney(r.amountCents)}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {r.debtor.alias} · {r.debtor.state} · {PRODUCT_CATEGORY_LABEL[r.product.category]} · vence {formatDate(r.dueDate)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ReceivableStatusBadge status={r.status} />
                      <ChainStatusBadge status={r.chain.status} />
                      {r.debtorConfirmation.status !== "none" && <DebtorConfirmationBadge status={r.debtorConfirmation.status} />}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
