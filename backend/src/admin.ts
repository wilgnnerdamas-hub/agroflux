// Painel de administração da AgroFlux (contrato v1.3, §15.5). Visão da operação inteira; tudo SIMULADO.
import type { AssignmentGateway } from "./chain/assignment.js";
import { DISTRIBUTOR_DEFS } from "./distributors.js";
import { FUNDER_DEFS } from "./funders.js";
import { RATINGS } from "./pricing/settings.js";
import type { PricingService } from "./pricing/service.js";
import type { Store } from "./store.js";
import type { Offer, Rating, Receivable } from "./types.js";

const SETTLED: Receivable["status"][] = ["assigned"];
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const round = (x: number | null) => (x == null ? null : Math.round(x));

function acceptedOffer(store: Store, r: Receivable): Offer | null {
  return store.getOffers(r.id)?.find((o) => o.id === r.selectedOfferId) ?? null;
}

export class AdminService {
  constructor(
    private readonly store: Store,
    private readonly pricing: PricingService,
    private readonly gateway: AssignmentGateway | null,
  ) {}

  private all() {
    return this.store.all().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  overview() {
    const all = this.all();
    const settled = all.filter((r) => SETTLED.includes(r.status));
    const offers = settled.map((r) => acceptedOffer(this.store, r)).filter((o): o is Offer => !!o);
    const revenue = this.store.revenue();
    const byStatus: Record<string, number> = {};
    for (const r of all) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const ratingMix = Object.fromEntries(RATINGS.map((k) => [k, 0])) as Record<Rating, number>;
    let expectedLossCents = 0;
    for (const r of all) {
      const k = this.pricing.risk(r);
      ratingMix[k.rating]++;
      if (SETTLED.includes(r.status)) expectedLossCents += k.expectedLossCents;
    }
    return {
      isSimulated: true,
      receivables: all.length,
      portfolioCents: all.reduce((s, r) => s + r.amountCents, 0),
      assignedCount: settled.length,
      assignedVolumeCents: settled.reduce((s, r) => s + r.amountCents, 0),
      revenueCents: revenue.reduce((s, e) => s + e.platformFeeCents + e.registryFeeCents, 0),
      averageTicketCents: round(avg(all.map((r) => r.amountCents))),
      averageTermDays: round(avg(all.map((r) => r.termDays))),
      averageAnnualRateBps: round(avg(offers.map((o) => o.annualRateBps).filter((x): x is number => x != null))),
      averageCetAnnualBps: round(avg(offers.map((o) => o.cetAnnualBps).filter((x): x is number => x != null))),
      byStatus,
      ratingMix,
      expectedLossCents,
    };
  }

  receivables() {
    return {
      items: this.all().map((r) => {
        const k = this.pricing.risk(r);
        const o = acceptedOffer(this.store, r);
        return {
          id: r.id,
          reference: r.reference,
          status: r.status,
          distributor: r.distributor,
          debtor: r.debtor,
          product: r.product,
          amountCents: r.amountCents,
          dueDate: r.dueDate,
          registryId: r.registry.registryId,
          rating: k.rating,
          score: k.score,
          expectedLossCents: k.expectedLossCents,
          offerCount: this.store.getOffers(r.id)?.length ?? 0,
          acceptedOffer: o ? { funderName: o.funder.name, annualRateBps: o.annualRateBps ?? null, netAmountCents: o.netAmountCents } : null,
          createdAt: r.createdAt,
        };
      }),
    };
  }

  async funders() {
    const all = this.all();
    const offersOf = (fid: string) => all.flatMap((r) => (this.store.getOffers(r.id) ?? []).filter((o) => o.funder.id === fid).map((o) => ({ o, r })));
    const wallets = this.gateway?.parties.funderWallets ?? null;
    const balances = this.gateway && wallets ? await this.gateway.readBalances(Object.values(wallets)).catch(() => []) : [];
    return {
      items: FUNDER_DEFS.map((f) => {
        const mine = offersOf(f.id);
        const won = mine.filter(({ o }) => o.status === "selected");
        const bought = won.filter(({ r }) => SETTLED.includes(r.status));
        const wallet = wallets?.[f.id] ?? null;
        return {
          id: f.id,
          name: f.name,
          type: f.type,
          mode: f.mode,
          proposals: mine.length,
          accepted: won.length,
          boughtCount: bought.length,
          boughtFaceCents: bought.reduce((s, { r }) => s + r.amountCents, 0),
          averageAnnualRateBps: round(avg(mine.map(({ o }) => o.annualRateBps).filter((x): x is number => x != null))),
          averageYieldAnnualBps: round(avg(bought.map(({ o }) => o.funderYieldAnnualBps).filter((x): x is number => x != null))),
          wallet,
          settlementUnits: balances.find((b) => b.address === wallet)?.settlementUnits ?? null,
        };
      }),
    };
  }

  distributors() {
    const all = this.all();
    return {
      items: DISTRIBUTOR_DEFS.map((d) => {
        const mine = all.filter((r) => r.distributor.id === d.id);
        const settled = mine.filter((r) => SETTLED.includes(r.status));
        const total = mine.reduce((s, r) => s + r.amountCents, 0);
        const byDebtor = new Map<string, number>();
        for (const r of mine) byDebtor.set(r.debtor.alias, (byDebtor.get(r.debtor.alias) ?? 0) + r.amountCents);
        const top = [...byDebtor.entries()].sort((a, b) => b[1] - a[1])[0];
        return {
          id: d.id,
          name: d.name,
          receivables: mine.length,
          volumeCents: total,
          assignedCount: settled.length,
          assignedVolumeCents: settled.reduce((s, r) => s + r.amountCents, 0),
          averageCetAnnualBps: round(avg(settled.map((r) => acceptedOffer(this.store, r)?.cetAnnualBps).filter((x): x is number => x != null))),
          topDebtor: top ? { alias: top[0], shareBps: Math.round((top[1] / (total || 1)) * 10_000) } : null,
        };
      }),
    };
  }

  revenue() {
    const entries = [...this.store.revenue()].sort((a, b) => (a.settledAt < b.settledAt ? 1 : -1));
    const byMonth: Record<string, { platformFeeCents: number; registryFeeCents: number; count: number }> = {};
    for (const e of entries) {
      const m = e.settledAt.slice(0, 7);
      byMonth[m] ??= { platformFeeCents: 0, registryFeeCents: 0, count: 0 };
      byMonth[m].platformFeeCents += e.platformFeeCents;
      byMonth[m].registryFeeCents += e.registryFeeCents;
      byMonth[m].count++;
    }
    return {
      isSimulated: true,
      treasuryWallet: this.gateway?.parties.treasuryWallet ?? null,
      totals: {
        platformFeeCents: entries.reduce((s, e) => s + e.platformFeeCents, 0),
        registryFeeCents: entries.reduce((s, e) => s + e.registryFeeCents, 0),
        count: entries.length,
      },
      byMonth: Object.entries(byMonth).map(([month, v]) => ({ month, ...v })).sort((a, b) => (a.month < b.month ? 1 : -1)),
      entries,
    };
  }

  risk() {
    const all = this.all();
    const rows = all.map((r) => ({ r, k: this.pricing.risk(r) }));
    const group = (key: (r: Receivable) => string) => {
      const m = new Map<string, { count: number; amountCents: number; expectedLossCents: number }>();
      for (const { r, k } of rows) {
        const g = m.get(key(r)) ?? { count: 0, amountCents: 0, expectedLossCents: 0 };
        g.count++;
        g.amountCents += r.amountCents;
        g.expectedLossCents += k.expectedLossCents;
        m.set(key(r), g);
      }
      return [...m.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.amountCents - a.amountCents);
    };
    const settings = this.store.getSettings();
    return {
      isSimulated: true,
      ratings: RATINGS.map((rating) => {
        const inRating = rows.filter(({ k }) => k.rating === rating);
        return {
          rating,
          count: inRating.length,
          amountCents: inRating.reduce((s, { r }) => s + r.amountCents, 0),
          expectedLossCents: inRating.reduce((s, { k }) => s + k.expectedLossCents, 0),
          pdAnnualBps: settings.ratings[rating].pdAnnualBps,
          spreadBps: settings.ratings[rating].spreadBps,
        };
      }),
      expectedLossCents: rows.reduce((s, { k }) => s + k.expectedLossCents, 0),
      portfolioCents: all.reduce((s, r) => s + r.amountCents, 0),
      byDebtor: group((r) => r.debtor.alias),
      byState: group((r) => r.debtor.state),
      byCategory: group((r) => r.product.category),
    };
  }
}
