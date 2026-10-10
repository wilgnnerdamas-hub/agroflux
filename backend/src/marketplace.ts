// Visão do financiador (§5.19–5.21 do contrato v1.2): recebíveis publicados e carteira de cessões. Tudo SIMULADO.
import { notFound } from "./errors.js";
import { funderDef, isFunderId, toFunder, type FunderWallets } from "./funders.js";
import { toSummary } from "./receivables.js";
import type { Store } from "./store.js";
import type { Marketplace, Portfolio, PortfolioItem } from "./types.js";

export const MARKETPLACE_DISCLAIMER = "Recebíveis fictícios publicados para demonstração. Não é oferta de investimento.";

const byNewest = <T extends { createdAt: string }>(a: T, b: T) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

export function marketplace(store: Store, funderId?: string): Marketplace {
  const items = store
    .all()
    .filter((r) => r.status === "published")
    .sort(byNewest)
    .map((r) => {
      const offers = (store.getOffers(r.id) ?? []).filter((o) => o.status === "available");
      const best = offers.reduce<(typeof offers)[number] | null>((b, o) => (!b || o.netAmountCents > b.netAmountCents ? o : b), null);
      return {
        receivable: { ...toSummary(r), cropSeason: r.cropSeason, issueDate: r.issueDate, termDays: r.termDays },
        registryId: r.registry.registryId,
        debtorAccepted: r.debtorConfirmation.status === "confirmed" && r.debtorConfirmation.chain?.status === "confirmed",
        offerCount: offers.length,
        bestOffer: best ? { funderName: best.funder.name, monthlyRateBps: best.monthlyRateBps, netAmountCents: best.netAmountCents } : null,
        myOffer: funderId ? (offers.find((o) => o.funder.id === funderId) ?? null) : null,
      };
    });
  return { isSimulated: true, disclaimer: MARKETPLACE_DISCLAIMER, items };
}

export function portfolio(store: Store, funderId: string, wallets: FunderWallets | null): Portfolio {
  if (!isFunderId(funderId)) throw notFound("Financiador não encontrado.");
  const items: PortfolioItem[] = store
    .all()
    .filter((r) => r.assignment.funderId === funderId && (r.status === "assignment_pending" || r.status === "assigned"))
    .sort(byNewest)
    .map((r) => {
      const a = r.assignment;
      const offer = store.getOffers(r.id)?.find((o) => o.id === a.offerId);
      return {
        receivableId: r.id,
        reference: r.reference,
        registryId: r.registry.registryId,
        status: r.status === "assigned" ? "settled" : "settling",
        product: r.product,
        debtorState: r.debtor.state,
        faceAmountCents: r.amountCents,
        paidAmountCents: a.settlementAmount ?? offer?.netAmountCents ?? 0,
        monthlyRateBps: offer?.monthlyRateBps ?? 0,
        feesCents: offer?.feesCents ?? 0,
        settledAt: a.settledAt,
        dueDate: r.dueDate,
        tokenMint: a.tokenMint,
        settlementSignature: a.settlementSignature,
        explorerUrls: { tokenMint: a.explorerUrls.tokenMint, settlement: a.explorerUrls.settlement },
      };
    });
  const settled = items.filter((i) => i.status === "settled");
  const paid = settled.reduce((s, i) => s + i.paidAmountCents, 0);
  const face = settled.reduce((s, i) => s + i.faceAmountCents, 0);
  return {
    isSimulated: true,
    funder: toFunder(funderDef(funderId), wallets),
    items,
    totals: { count: settled.length, paidAmountCents: paid, faceAmountCents: face, projectedIncomeCents: face - paid },
  };
}
