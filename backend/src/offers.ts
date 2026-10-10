// Ofertas de financiamento SIMULADAS (§3.7, §5.7 e §5.8). Ilustrativas: não há financiador real nem proposta vinculante.
import { createHash } from "node:crypto";
import { ApiError, invalidState, notFound } from "./errors.js";
import { getReceivable, makeEvent, newId } from "./receivables.js";
import type { Store } from "./store.js";
import type { FunderType, Offer, OfferList, Receivable } from "./types.js";

export const OFFERS_DISCLAIMER =
  "Ofertas fictícias geradas para demonstração. Não há financiador real, proposta vinculante ou movimentação financeira.";

const OFFER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Faixas por financiador: taxa (bps a.m.) e tarifas (centavos). Tudo dentro de 120–250 bps e R$ 50–300.
const FUNDERS: { name: string; type: FunderType; bps: [number, number]; fees: [number, number] }[] = [
  { name: "Financiador Simulado A", type: "simulated_fidc", bps: [120, 160], fees: [10_000, 20_000] },
  { name: "Financiador Simulado B", type: "simulated_bank", bps: [160, 200], fees: [5_000, 12_000] },
  { name: "Financiador Simulado C", type: "simulated_cooperative", bps: [200, 250], fees: [15_000, 30_000] },
];

export function netAmount(grossAmountCents: number, monthlyRateBps: number, termDays: number, feesCents: number) {
  const discountCents = Math.round(grossAmountCents * (monthlyRateBps / 10_000) * (termDays / 30));
  return grossAmountCents - discountCents - feesCents;
}

// Determinístico: mesmos dados do recebível, mesmas taxas e tarifas.
export function offerTerms(r: Pick<Receivable, "id" | "amountCents" | "termDays">) {
  const seed = createHash("sha256").update(`${r.id}:${r.amountCents}:${r.termDays}`).digest();
  return FUNDERS.map((f, i) => {
    const pick = ([min, max]: [number, number], byte: number) => min + (byte % (max - min + 1));
    const monthlyRateBps = pick(f.bps, seed.readUInt16BE(i * 4));
    // Tarifas em múltiplos de R$ 5.
    const feesCents = Math.round(pick(f.fees, seed.readUInt16BE(i * 4 + 2)) / 500) * 500;
    return { funder: { name: f.name, type: f.type }, monthlyRateBps, feesCents };
  });
}

function ensureOffers(store: Store, r: Receivable): Offer[] {
  const existing = store.getOffers(r.id);
  if (existing) return existing;
  const expiresAt = new Date(Date.now() + OFFER_TTL_MS).toISOString();
  const offers: Offer[] = offerTerms(r).map((t) => ({
    id: newId("ofr"),
    receivableId: r.id,
    isSimulated: true,
    funder: t.funder,
    grossAmountCents: r.amountCents,
    monthlyRateBps: t.monthlyRateBps,
    feesCents: t.feesCents,
    netAmountCents: netAmount(r.amountCents, t.monthlyRateBps, r.termDays, t.feesCents),
    termDays: r.termDays,
    status: "available",
    expiresAt,
  }));
  store.putOffers(r.id, offers);
  r.events.push(makeEvent("offers_generated", "Ofertas simuladas geradas", { offerIds: offers.map((o) => o.id) }, { actor: "system" }));
  r.updatedAt = new Date().toISOString();
  store.put(r);
  return offers;
}

const assertRegistered = (r: Receivable) => {
  if (r.status !== "registered" && r.status !== "offer_selected") {
    throw invalidState("As ofertas simuladas ficam disponíveis após a confirmação na Devnet.");
  }
};

export function listOffers(store: Store, id: string): OfferList {
  const r = getReceivable(store, id);
  assertRegistered(r);
  return { isSimulated: true, disclaimer: OFFERS_DISCLAIMER, items: ensureOffers(store, r) };
}

export function selectOffer(store: Store, id: string, offerId: string): Receivable {
  const r = getReceivable(store, id);
  assertRegistered(r);
  const offers = ensureOffers(store, r);
  const offer = offers.find((o) => o.id === offerId);
  if (!offer) throw notFound("Oferta não encontrada.");

  // Idempotente: a mesma oferta de novo não cria outro evento.
  if (r.selectedOfferId === offer.id) return r;
  if (r.selectedOfferId) throw new ApiError(409, "OFFER_ALREADY_SELECTED", "Já existe outra oferta simulada selecionada.");
  // G1 (v1.1): a seleção exige a confirmação do sacado registrada on-chain.
  const dc = r.debtorConfirmation;
  if (dc.status !== "confirmed" || dc.chain?.status !== "confirmed") {
    throw new ApiError(
      409,
      "DEBTOR_CONFIRMATION_REQUIRED",
      dc.status === "confirmed"
        ? "A confirmação do sacado ainda está sendo registrada na Devnet."
        : "Antes de selecionar uma oferta, o sacado precisa confirmar o recebível.",
    );
  }
  if (r.status !== "registered" || offer.status !== "available") throw invalidState();

  for (const o of offers) o.status = o.id === offer.id ? "selected" : "unavailable";
  store.putOffers(r.id, offers);
  r.status = "offer_selected";
  r.selectedOfferId = offer.id;
  r.events.push(
    makeEvent("offer_selected", `Oferta simulada de ${offer.funder.name} selecionada`, {
      offerId: offer.id,
      funderName: offer.funder.name,
      netAmountCents: offer.netAmountCents,
    }),
  );
  r.updatedAt = new Date().toISOString();
  store.put(r);
  return r;
}
