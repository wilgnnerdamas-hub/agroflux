// Serviço de preço e risco (contrato v1.3, §15.1 e §15.2): junta CDI, configurações, risco e calendário.
import { assessRisk } from "../risk.js";
import type { Store } from "../store.js";
import type { FunderType, PricingReference, Quote, Receivable, ReceivableSummary, Risk } from "../types.js";
import { todayBrasilia } from "./calendar.js";
import type { CdiProvider } from "./cdi.js";
import { price, toBps } from "./pricing.js";
import { IOF_RULE } from "./settings.js";

export class PricingService {
  constructor(
    private readonly store: Store,
    private readonly cdi: CdiProvider,
    private readonly today: () => string = () => todayBrasilia(),
  ) {}

  async reference(): Promise<PricingReference> {
    const s = this.store.getSettings();
    const q = await this.cdi(s.cdi);
    return {
      cdiAnnualBps: q.annualBps,
      cdiSource: q.source,
      cdiReferenceDate: q.referenceDate,
      platformFeeBps: s.platformFeeBps,
      registryFeeCents: s.registryFeeCents,
      pricedAt: this.today(),
    };
  }

  risk(r: Receivable): Risk {
    return assessRisk(r, this.store.all(), this.store.getSettings(), this.today());
  }

  /** Recebível para resposta da API: cópia com o risco calculado agora. */
  present(r: Receivable): Receivable {
    return { ...r, risk: this.risk(r) };
  }

  summaryRisk(r: Receivable): ReceivableSummary["risk"] {
    const k = this.risk(r);
    return { score: k.score, rating: k.rating };
  }

  async quote(r: Receivable, funderType: FunderType, spreadBps: number, feesCents: number, ref?: PricingReference): Promise<Quote> {
    const s = this.store.getSettings();
    const reference = ref ?? (await this.reference());
    const p = price({
      faceCents: r.amountCents,
      pricedAt: reference.pricedAt,
      dueDate: r.dueDate,
      cdiAnnual: reference.cdiAnnualBps / 10_000,
      spreadAnnual: spreadBps / 10_000,
      funderFeesCents: feesCents,
      iof: s.iofByFunderType[funderType] ? IOF_RULE : null,
      platformFeeBps: s.platformFeeBps,
      registryFeeCents: s.registryFeeCents,
    });
    return {
      spreadBps,
      feesCents,
      cdiBps: reference.cdiAnnualBps,
      annualRateBps: toBps(p.annualRate),
      monthlyRateBps: toBps(p.monthlyEquivalent),
      businessDays: p.businessDays,
      presentValueCents: p.presentValueCents,
      discountCents: p.discountCents,
      iofCents: p.iofCents,
      funderCashOutCents: p.funderCashOutCents,
      platformFeeCents: p.platformFeeCents,
      registryFeeCents: p.registryFeeCents,
      netAmountCents: p.distributorNetCents,
      cetAnnualBps: toBps(p.cetAnnual),
      cetMonthlyBps: toBps(p.cetMonthly),
      funderYieldAnnualBps: toBps(p.funderYieldAnnual),
      pricedAt: p.pricedAt,
    };
  }
}
