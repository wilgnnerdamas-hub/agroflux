import { ExternalLink, Link2 } from "lucide-react";
import { formatDateTime, shorten } from "@/lib/format";
import type { ReceivableEvent } from "@/lib/types";
import { cx } from "./ui";

const DOT: Record<ReceivableEvent["type"], string> = {
  receivable_created: "bg-brand",
  document_attached: "bg-brand",
  chain_registration_requested: "bg-warn",
  chain_registration_confirmed: "bg-chain",
  chain_registration_failed: "bg-bad",
  offers_generated: "bg-sim",
  offer_selected: "bg-sim",
};

export function Timeline({ events }: { events: ReceivableEvent[] }) {
  if (!events.length) return <p className="text-sm text-muted">Nenhum evento registrado.</p>;
  const sorted = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return (
    <ol className="relative space-y-5 border-l border-border pl-6">
      {sorted.map((ev) => (
        <li key={ev.id} className="relative">
          <span className={cx("absolute -left-[31px] top-1 h-3 w-3 rounded-full ring-4 ring-surface", DOT[ev.type])} aria-hidden />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-medium text-ink">{ev.description}</p>
            {ev.onChain && (
              <span className="inline-flex items-center gap-1 rounded-full bg-chain-soft px-2 py-0.5 text-[11px] font-semibold text-chain">
                <Link2 className="h-3 w-3" aria-hidden /> On-chain
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            <time dateTime={ev.occurredAt}>{formatDateTime(ev.occurredAt)}</time> · {ev.actor === "system" ? "Sistema" : "Usuário demo"}
          </p>
          {ev.chain && (
            <a
              href={ev.chain.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-chain hover:underline"
            >
              {shorten(ev.chain.signature, 10, 8)} <ExternalLink className="h-3 w-3" aria-hidden />
              <span className="sr-only">(abre o Solana Explorer em nova aba)</span>
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}
