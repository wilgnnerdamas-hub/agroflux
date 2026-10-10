"use client";

import { FileText } from "lucide-react";
import { formatBytes, formatDate, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Receivable } from "@/lib/types";
import { Card, CardTitle, DescList, FieldLabel, MonoValue } from "../ui";

/** Resumo do recebível: o essencial da operação, a registradora e o documento, num só cartão. */
export function ReceivableSummary({ receivable: r, showDebtor = true }: { receivable: Receivable; showDebtor?: boolean }) {
  const { t } = useI18n();
  const doc = r.documents[0];
  const reg = r.registry;
  return (
    <Card data-testid="receivable-summary">
      <CardTitle>{t.passport.summary}</CardTitle>
      <DescList
        items={[
          { label: t.passport.face, value: <span className="font-semibold tabular-nums">{formatMoney(r.amountCents)}</span> },
          { label: t.passport.due, value: `${formatDate(r.dueDate)} · ${t.common.days(r.termDays)}` },
          ...(showDebtor ? [{ label: t.passport.debtor, value: `${r.debtor.alias} · ${r.debtor.state}` }] : []),
          { label: t.passport.product, value: `${t.status.product[r.product.category]} — ${r.product.description}` },
          { label: t.passport.distributor, value: r.distributor.name },
          { label: t.passport.season, value: `${r.cropSeason} · ${t.passport.issue} ${formatDate(r.issueDate)}` },
          ...(reg.registryId ? [{ label: t.passport.registry, value: <span className="font-mono text-xs">{reg.registryId}</span> }] : []),
          { label: t.passport.creditor, value: reg.creditor.name },
        ]}
      />
      {doc && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4 text-muted" aria-hidden />
            <span className="break-all">{doc.filename}</span>
            <span className="text-xs font-normal text-muted">· {t.status.documentKind[doc.kind]} · {formatBytes(doc.sizeBytes)}</span>
          </p>
          <FieldLabel>{t.passport.docHash}</FieldLabel>
          <MonoValue value={doc.sha256} />
          <p className="mt-2 text-xs text-muted">{t.passport.docPrivate}</p>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">{t.passport.fictitious}</p>
    </Card>
  );
}
