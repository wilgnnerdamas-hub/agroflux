"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useAsync } from "@/lib/useAsync";
import type { Receivable } from "@/lib/types";
import { ButtonLink, Card, ErrorState, LoadingBlock, PageHeader } from "@/components/ui";
import { ProposalsPanel } from "@/components/passport/ProposalsPanel";

// v1.2: as propostas também aparecem no passaporte; esta rota continua para links antigos.
export default function ProposalsPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const { state, setState, reload } = useAsync(() => api.getReceivable(id), [id]);
  const r = state.data;
  const back = (
    <Link href={`/recebiveis/${id}`} className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
      <ArrowLeft className="h-4 w-4" aria-hidden /> {t.proposals.goPassport}
    </Link>
  );

  if (!r && state.status === "loading") return <LoadingBlock />;
  if (!r && state.status === "error") return <ErrorState message={state.error.message} onRetry={() => reload()} />;
  if (!r) return null;

  const opened = !["created", "registration_pending", "registration_failed", "registered"].includes(r.status);
  return (
    <>
      <PageHeader back={back} title={t.proposals.pageTitle} subtitle={`${r.reference} · ${formatMoney(r.amountCents)} · ${t.common.days(r.termDays)}`} />
      {opened ? (
        <ProposalsPanel receivable={r} onUpdated={(next: Receivable) => setState({ status: "success", data: next })} />
      ) : (
        <Card>
          <div className="flex flex-col items-center py-6 text-center">
            <Lock className="mb-3 h-8 w-8 text-faint" aria-hidden />
            <p className="max-w-md text-sm text-muted">{t.proposals.notPublished}</p>
            <ButtonLink href={`/recebiveis/${r.id}`} className="mt-5">{t.proposals.goPassport}</ButtonLink>
          </div>
        </Card>
      )}
    </>
  );
}
