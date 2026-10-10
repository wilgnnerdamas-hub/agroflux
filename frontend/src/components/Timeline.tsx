"use client";

import { ExternalLink, Link2 } from "lucide-react";
import { formatDateTime, shorten } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { EventType, ReceivableEvent } from "@/lib/types";
import { cx } from "./ui";

const DOT: Record<EventType, string> = {
  receivable_created: "bg-brand",
  document_attached: "bg-brand",
  registry_registered: "bg-info",
  chain_registration_requested: "bg-warn",
  chain_registration_confirmed: "bg-chain",
  chain_registration_failed: "bg-bad",
  debtor_confirmation_requested: "bg-warn",
  debtor_confirmed: "bg-chain",
  debtor_confirmation_chain_failed: "bg-bad",
  debtor_declined: "bg-bad",
  listing_published: "bg-info",
  listing_terms_anchored: "bg-chain",
  listing_chain_failed: "bg-bad",
  offers_generated: "bg-sim",
  offer_proposed: "bg-sim",
  offer_selected: "bg-sim",
  assignment_requested: "bg-warn",
  assignment_token_minted: "bg-chain",
  assignment_settled: "bg-chain",
  assignment_failed: "bg-bad",
  registry_creditor_updated: "bg-info",
  double_assignment_rejected: "bg-chain",
};

export function Timeline({ events }: { events: ReceivableEvent[] }) {
  const { t, locale } = useI18n();
  if (!events.length) return <p className="text-sm text-muted">{t.passport.noEvents}</p>;
  const sorted = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return (
    <ol className="relative space-y-5 border-l border-border pl-6">
      {sorted.map((ev) => (
        <li key={ev.id} className="relative">
          <span className={cx("absolute -left-[31px] top-1 h-3 w-3 rounded-full ring-4 ring-surface", DOT[ev.type] ?? "bg-faint")} aria-hidden />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* Em português, a descrição do backend (mais específica); em inglês, o rótulo pelo tipo. */}
            <p className="text-sm font-medium text-ink">{locale === "pt" ? ev.description : (t.status.event[ev.type] ?? ev.description)}</p>
            {ev.onChain && (
              <span className="inline-flex items-center gap-1 rounded-full bg-chain-soft px-2 py-0.5 text-[11px] font-semibold text-chain">
                <Link2 className="h-3 w-3" aria-hidden /> On-chain
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            <time dateTime={ev.occurredAt}>{formatDateTime(ev.occurredAt)}</time> · {t.actor[ev.actor]}
          </p>
          {ev.chain && (
            <a
              href={ev.chain.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-chain hover:underline"
            >
              {shorten(ev.chain.signature, 10, 8)} <ExternalLink className="h-3 w-3" aria-hidden />
              <span className="sr-only">{t.common.openNewTab}</span>
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}
