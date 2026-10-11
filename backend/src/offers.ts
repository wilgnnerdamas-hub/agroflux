// Propostas de financiamento SIMULADAS (§3.7, §5.7, §5.8, §5.18 e §15.1 do contrato v1.3).
// Preço de mercado: CDI + spread, juros compostos sobre dias úteis. B e C propõem sozinhos na publicação,
// com spread = spread-base do rating + ajuste do financiador; A envia o próprio spread.
import { createHash } from "node:crypto";
import { ApiError, invalidState, notFound } from "./errors.js";
import { FUNDER_DEFS, funderDef, isFunderId, type FunderDef } from "./funders.js";
import type { PricingService } from "./pricing/service.js";
import { getReceivable, makeEvent, newId } from "./receivables.js";
import type { Store } from "./store.js";
import type { Offer, OfferList, Quote, Receivable } from "./types.js";

export const OFFERS_DISCLAIMER =
  "Propostas fictícias de financiadores demo. Não há financiador real, proposta vinculante ou movimentação financeira.";

const OFFER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const now = () => new Date().toISOString();
// Ajuste de spread dos financiadores automáticos sobre o spread-base do rating (pontos-base ao ano).
const SPREAD_ADJUST: Partial<Record<FunderDef["id"], number>> = { fnd_b: 60, fnd_c: 120 };

/** Cálculo antigo (v1.1/v1.2), mantido para propostas já gravadas. */
export function netAmount(grossAmountCents: number, monthlyRateBps: number, termDays: number, feesCents: number) {
  const discountCents = Math.round(grossAmountCents * (monthlyRateBps / 10_000) * (termDays / 30));
  return grossAmountCents - discountCents - feesCents;
}

// Determinístico: mesmos dados do recebível, mesmas tarifas e o mesmo ajuste fino de spread (0 a 30 bps).
export function offerTerms(r: Pick<Receivable, "id" | "amountCents" | "termDays">) {
  const seed = createHash("sha256").update(`${r.id}:${r.amountCents}:${r.termDays}`).digest();
  return FUNDER_DEFS.map((f, i) => {
    const pick = ([min, max]: [number, number], byte: number) => min + (byte % (max - min + 1));
    const feesCents = Math.round(pick(f.fees, seed.readUInt16BE(i * 4 + 2)) / 500) * 500;
    const jitterBps = seed[i * 4] % 31;
    return { funder: { id: f.id, name: f.name, type: f.type }, feesCents, jitterBps };
  });
}

function buildOffer(r: Receivable, f: Pick<FunderDef, "id" | "name" | "type">, q: Quote, origin: Offer["origin"]): Offer {
  const at = now();
  return {
    id: newId("ofr"),
    receivableId: r.id,
    isSimulated: true,
    funder: { id: f.id, name: f.name, type: f.type },
    origin,
    grossAmountCents: r.amountCents,
    termDays: r.termDays,
    status: "available",
    expiresAt: new Date(Date.now() + OFFER_TTL_MS).toISOString(),
    createdAt: at,
    updatedAt: at,
    ...q,
  };
}

// §5.16: na publicação, só os financiadores automáticos (B e C) propõem. Quem chama grava o recebível.
export async function generateAutomaticOffers(store: Store, pricing: PricingService, r: Receivable): Promise<Offer[]> {
  const ref = await pricing.reference();
  const base = pricing.risk(r).spreadBaseBps;
  const offers: Offer[] = [];
  for (const t of offerTerms(r)) {
    const f = funderDef(t.funder.id);
    if (f.mode !== "automatic") continue;
    const q = await pricing.quote(r, f.type, base + (SPREAD_ADJUST[f.id] ?? 0) + t.jitterBps, t.feesCents, ref);
    offers.push(buildOffer(r, t.funder, q, "automatic"));
  }
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

function validateProposal(body: unknown) {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const fieldErrors: Record<string, string> = {};
  if (!(isFunderId(b.funderId) && funderDef(b.funderId).mode === "interactive")) fieldErrors.funderId = "Selecione um financiador demo válido.";
  const spread = b.spreadBps;
  if (!Number.isInteger(spread) || (spread as number) < 50 || (spread as number) > 3_000) fieldErrors.spreadBps = "Informe um spread entre 0,50% e 30,00% ao ano.";
  const fees = b.feesCents;
  if (!Number.isInteger(fees) || (fees as number) < 0 || (fees as number) > 100_000) fieldErrors.feesCents = "Informe tarifas entre R$ 0 e R$ 1.000.";
  return { fieldErrors, funderId: b.funderId as Offer["funder"]["id"], spreadBps: spread as number, feesCents: fees as number };
}

// §15.1: simulação de preço sem alterar estado (prévia do formulário do financiador).
export async function quoteOffer(store: Store, pricing: PricingService, id: string, body: unknown): Promise<Quote> {
  const r = getReceivable(store, id);
  const v = validateProposal(body);
  if (Object.keys(v.fieldErrors).length) throw new ApiError(422, "VALIDATION_ERROR", "Alguns campos precisam de ajuste.", v.fieldErrors);
  return pricing.quote(r, funderDef(v.funderId).type, v.spreadBps, v.feesCents);
}

// §5.18: o financiador interativo envia ou revisa a proposta (uma por financiador e recebível).
export async function proposeOffer(store: Store, pricing: PricingService, id: string, body: unknown): Promise<{ offer: Offer; receivable: Receivable }> {
  const r = getReceivable(store, id);
  const v = validateProposal(body);
  if (Object.keys(v.fieldErrors).length) throw new ApiError(422, "VALIDATION_ERROR", "Alguns campos precisam de ajuste.", v.fieldErrors);
  if (r.status !== "published") throw invalidState("Este recebível não está aberto para propostas.");
  const f = funderDef(v.funderId);
  const q = await pricing.quote(r, f.type, v.spreadBps, v.feesCents);
  if (q.netAmountCents <= 0) {
    throw new ApiError(422, "VALIDATION_ERROR", "Alguns campos precisam de ajuste.", { spreadBps: "Com esse spread e esse prazo, o valor líquido ficaria negativo." });
  }

  const fresh = getReceivable(store, id);
  if (fresh.status !== "published") throw invalidState("Este recebível não está aberto para propostas.");
  const offers = store.getOffers(fresh.id) ?? [];
  const existing = offers.find((o) => o.funder.id === f.id);
  let offer: Offer;
  if (existing) {
    const next = buildOffer(fresh, f, q, "proposal");
    offer = Object.assign(existing, { ...next, id: existing.id, createdAt: existing.createdAt });
  } else {
    offer = buildOffer(fresh, f, q, "proposal");
    offers.push(offer);
  }
  store.putOffers(fresh.id, offers);
  fresh.events.push(
    makeEvent(
      "offer_proposed",
      `${existing ? "Proposta revisada" : "Proposta recebida"} de ${f.name} (simulação)`,
      { offerId: offer.id, funderId: f.id, funderName: f.name, monthlyRateBps: offer.monthlyRateBps, netAmountCents: offer.netAmountCents },
      { actor: "demo_user" },
    ),
  );
  fresh.updatedAt = now();
  store.put(fresh);
  return { offer, receivable: fresh };
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
