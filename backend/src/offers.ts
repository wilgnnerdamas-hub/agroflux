// Propostas de financiamento SIMULADAS (§3.7, §5.7, §5.8 e §5.18 do contrato v1.2).
// Ilustrativas: não há financiador real, proposta vinculante nem movimentação financeira.
// B e C propõem automaticamente na publicação; A envia a proposta pela tela do financiador.
import { createHash } from "node:crypto";
import { FUNDER_DEFS, funderDef, isFunderId, type FunderDef } from "./funders.js";
import { ApiError, invalidState, notFound } from "./errors.js";
import { getReceivable, makeEvent, newId } from "./receivables.js";
import type { Store } from "./store.js";
import type { Offer, OfferList, Receivable } from "./types.js";

export const OFFERS_DISCLAIMER =
  "Propostas fictícias de financiadores demo. Não há financiador real, proposta vinculante ou movimentação financeira.";

const OFFER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const now = () => new Date().toISOString();

export function netAmount(grossAmountCents: number, monthlyRateBps: number, termDays: number, feesCents: number) {
  const discountCents = Math.round(grossAmountCents * (monthlyRateBps / 10_000) * (termDays / 30));
  return grossAmountCents - discountCents - feesCents;
}

// Determinístico: mesmos dados do recebível, mesmas taxas e tarifas (uma linha por financiador demo).
export function offerTerms(r: Pick<Receivable, "id" | "amountCents" | "termDays">) {
  const seed = createHash("sha256").update(`${r.id}:${r.amountCents}:${r.termDays}`).digest();
  return FUNDER_DEFS.map((f, i) => {
    const pick = ([min, max]: [number, number], byte: number) => min + (byte % (max - min + 1));
    const monthlyRateBps = pick(f.bps, seed.readUInt16BE(i * 4));
    // Tarifas em múltiplos de R$ 5.
    const feesCents = Math.round(pick(f.fees, seed.readUInt16BE(i * 4 + 2)) / 500) * 500;
    return { funder: { id: f.id, name: f.name, type: f.type }, monthlyRateBps, feesCents };
  });
}

function buildOffer(r: Receivable, f: Pick<FunderDef, "id" | "name" | "type">, monthlyRateBps: number, feesCents: number, origin: Offer["origin"]): Offer {
  const at = now();
  return {
    id: newId("ofr"),
    receivableId: r.id,
    isSimulated: true,
    funder: { id: f.id, name: f.name, type: f.type },
    origin,
    grossAmountCents: r.amountCents,
    monthlyRateBps,
    feesCents,
    netAmountCents: netAmount(r.amountCents, monthlyRateBps, r.termDays, feesCents),
    termDays: r.termDays,
    status: "available",
    expiresAt: new Date(Date.now() + OFFER_TTL_MS).toISOString(),
    createdAt: at,
    updatedAt: at,
  };
}

// §5.16: na publicação, só os financiadores automáticos (B e C) propõem. Quem chama grava o recebível.
export function generateAutomaticOffers(store: Store, r: Receivable): Offer[] {
  const auto = offerTerms(r).filter((t) => funderDef(t.funder.id).mode === "automatic");
  const offers = auto.map((t) => buildOffer(r, t.funder, t.monthlyRateBps, t.feesCents, "automatic"));
  store.putOffers(r.id, [...(store.getOffers(r.id) ?? []), ...offers]);
  r.events.push(makeEvent("offers_generated", "Propostas automáticas dos financiadores demo recebidas (simulação)", { offerIds: offers.map((o) => o.id) }, { actor: "system" }));
  return offers;
}

const BEFORE_REGISTRATION: Receivable["status"][] = ["created", "registration_pending", "registration_failed"];

// §5.7: em `registered` ainda não há propostas (o recebível não foi publicado).
export function listOffers(store: Store, id: string): OfferList {
  const r = getReceivable(store, id);
  if (BEFORE_REGISTRATION.includes(r.status)) {
    throw invalidState("As propostas ficam disponíveis depois do registro na Devnet e da publicação para financiadores.");
  }
  return { isSimulated: true, disclaimer: OFFERS_DISCLAIMER, items: store.getOffers(r.id) ?? [] };
}

// §5.18: o financiador interativo envia ou revisa a proposta (uma por financiador e recebível).
export function proposeOffer(store: Store, id: string, body: unknown): { offer: Offer; receivable: Receivable } {
  const r = getReceivable(store, id);
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const fieldErrors: Record<string, string> = {};
  const funderOk = isFunderId(b.funderId) && funderDef(b.funderId).mode === "interactive";
  if (!funderOk) fieldErrors.funderId = "Selecione um financiador demo válido.";
  const rate = b.monthlyRateBps;
  if (!Number.isInteger(rate) || (rate as number) < 50 || (rate as number) > 500) fieldErrors.monthlyRateBps = "Informe uma taxa entre 0,50% e 5,00% ao mês.";
  const fees = b.feesCents;
  if (!Number.isInteger(fees) || (fees as number) < 0 || (fees as number) > 100_000) fieldErrors.feesCents = "Informe tarifas entre R$ 0 e R$ 1.000.";
  if (!fieldErrors.monthlyRateBps && !fieldErrors.feesCents && netAmount(r.amountCents, rate as number, r.termDays, fees as number) <= 0) {
    fieldErrors.monthlyRateBps = "Com essa taxa e esse prazo, o valor líquido ficaria negativo.";
  }
  if (Object.keys(fieldErrors).length) throw new ApiError(422, "VALIDATION_ERROR", "Alguns campos precisam de ajuste.", fieldErrors);
  if (r.status !== "published") throw invalidState("Este recebível não está aberto para propostas.");

  const f = funderDef(b.funderId as Offer["funder"]["id"]);
  const offers = store.getOffers(r.id) ?? [];
  const existing = offers.find((o) => o.funder.id === f.id);
  let offer: Offer;
  if (existing) {
    const fresh = buildOffer(r, f, rate as number, fees as number, "proposal");
    offer = Object.assign(existing, { ...fresh, id: existing.id, createdAt: existing.createdAt });
  } else {
    offer = buildOffer(r, f, rate as number, fees as number, "proposal");
    offers.push(offer);
  }
  store.putOffers(r.id, offers);
  r.events.push(
    makeEvent(
      "offer_proposed",
      `${existing ? "Proposta revisada" : "Proposta recebida"} de ${f.name} (simulação)`,
      { offerId: offer.id, funderId: f.id, funderName: f.name, monthlyRateBps: offer.monthlyRateBps, netAmountCents: offer.netAmountCents },
      { actor: "demo_user" },
    ),
  );
  r.updatedAt = now();
  store.put(r);
  return { offer, receivable: r };
}

// §5.8: a distribuidora aceita uma proposta.
export function selectOffer(store: Store, id: string, offerId: string): Receivable {
  const r = getReceivable(store, id);
  const offers = store.getOffers(r.id) ?? [];
  const offer = offers.find((o) => o.id === offerId);
  if (!offer) throw notFound("Proposta não encontrada.");

  // Idempotente: a mesma proposta de novo não cria outro evento.
  if (r.selectedOfferId === offer.id) return r;
  if (r.selectedOfferId) throw new ApiError(409, "OFFER_ALREADY_SELECTED", "Já existe outra proposta aceita.");
  // G1 (v1.1): a seleção exige a confirmação do sacado registrada on-chain (a publicação já garante isso).
  const dc = r.debtorConfirmation;
  if (dc.status !== "confirmed" || dc.chain?.status !== "confirmed") {
    throw new ApiError(
      409,
      "DEBTOR_CONFIRMATION_REQUIRED",
      dc.status === "confirmed"
        ? "O aceite do sacado ainda está sendo registrado na Devnet."
        : "Antes de aceitar uma proposta, o sacado precisa aceitar o título.",
    );
  }
  if (r.status !== "published" || offer.status !== "available") throw invalidState();

  for (const o of offers) o.status = o.id === offer.id ? "selected" : "unavailable";
  store.putOffers(r.id, offers);
  r.status = "offer_selected";
  r.selectedOfferId = offer.id;
  r.events.push(
    makeEvent("offer_selected", `Proposta simulada de ${offer.funder.name} aceita`, {
      offerId: offer.id,
      funderName: offer.funder.name,
      netAmountCents: offer.netAmountCents,
    }),
  );
  r.updatedAt = now();
  store.put(r);
  return r;
}
