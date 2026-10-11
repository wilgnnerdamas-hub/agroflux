// DUBLÊ DE TESTE — usado apenas pelos testes e2e (Playwright).
// NÃO é uma API alternativa e não deve ser usado na demo: implementa o contrato v1.3 de forma mínima
// para exercitar o cliente HTTP do frontend. Assinaturas e endereços aqui são marcados como FAKE e não existem na Solana.
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";

const PORT = Number(process.env.FAKE_BACKEND_PORT ?? 4010);
const CONFIRM_MS = Number(process.env.FAKE_CONFIRM_MS ?? 1500);
// Função B: cessão tokenizada com mint e liquidação FAKE (nada vai para a Solana).
const ASSIGNMENT = process.env.FAKE_ASSIGNMENT === "true";
const FAIL_FIRST_REGISTER = process.env.FAKE_FAIL_FIRST_REGISTER === "1";
const TERMS = { isSimulated: true, version: "coobrigacao-demo-v1", text: "TERMO DE COOBRIGAÇÃO — DEMONSTRAÇÃO (SIMULADO, SEM VALOR JURÍDICO)\n1. Texto de teste do dublê.", textSha256: "" };
TERMS.textSha256 = createHash("sha256").update(TERMS.text).digest("hex");
const FUNDERS = [
  { id: "fnd_a", name: "Financiador Demo A", type: "simulated_fidc", mode: "interactive", wallet: ASSIGNMENT ? "FAKEFunderA1111" : null, isSimulated: true },
  { id: "fnd_b", name: "Financiador Demo B", type: "simulated_bank", mode: "automatic", wallet: ASSIGNMENT ? "FAKEFunderB1111" : null, isSimulated: true },
  { id: "fnd_c", name: "Financiador Demo C", type: "simulated_cooperative", mode: "automatic", wallet: ASSIGNMENT ? "FAKEFunderC1111" : null, isSimulated: true },
];
const DISTRIBUTORS = [
  { id: "dst_a", name: "Distribuidora Demo" },
  { id: "dst_b", name: "Cerrado Insumos (demo)" },
  { id: "dst_c", name: "Sul Sementes (demo)" },
];
const RATINGS = ["AA", "A", "B", "C", "D", "E", "F", "G", "H"];
const defaultSettings = () => ({
  cdi: { source: "manual", manualAnnualBps: 1365 },
  platformFeeBps: 50,
  registryFeeCents: 2500,
  iofByFunderType: { simulated_fidc: false, simulated_bank: true, simulated_cooperative: false },
  lgdBps: { withCoobligation: 3500, withoutCoobligation: 6000 },
  ratings: Object.fromEntries(RATINGS.map((r, i) => [r, { pdAnnualBps: [50, 100, 200, 400, 800, 1500, 2500, 4000, 6000][i], spreadBps: [150, 220, 300, 420, 600, 850, 1150, 1600, 2200][i] }])),
});
let settings = defaultSettings();
const revenue = [];
const db = new Map();
const tokens = new Map(); // token → { receivableId, used, revoked, expiresAt }
let n = 0;
let failedOnce = false;

const now = () => new Date().toISOString();
const ev = (type, description, data = {}, extra = {}) => ({ id: `evt_${randomUUID()}`, type, occurredAt: now(), actor: "demo_user", description, onChain: false, chain: null, data, ...extra });
const days = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const fakeSig = (kind, id) => `FAKE_TEST_${kind}_SIGNATURE_${id}_NAO_EXISTE_NA_SOLANA`;
const txUrl = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const addrUrl = (a) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
const err = (res, status, code, message, extra = {}) => send(res, status, { error: { code, message, details: {}, ...extra } });
function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  });
  const isRcv = (b) => b && typeof b === "object" && Array.isArray(b.events) && Array.isArray(b.documents);
  const out = isRcv(body) ? withRisk(body) : body && isRcv(body.receivable) ? { ...body, receivable: withRisk(body.receivable) } : body;
  res.end(out === undefined ? "" : JSON.stringify(out));
}
async function json(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return {};
  }
}
// Risco simplificado (o cálculo oficial é do backend): base 600, mais aceite e coobrigação.
function risk(r) {
  const accepted = r.debtorConfirmation.chain?.status === "confirmed";
  const published = r.listing.status === "published";
  const factors = [
    { key: "acceptance", label: "Aceite do sacado", points: accepted ? 80 : -30, detail: accepted ? "Aceite registrado na Solana Devnet." : "Ainda sem aceite." },
    { key: "coobligation", label: "Coobrigação da distribuidora", points: published ? 40 : 0, detail: published ? "Termo aceito." : "Termo ainda não aceito." },
    { key: "history_payments", label: "Pagamentos em dia (histórico simulado)", points: 70, detail: "95% em dia." },
  ];
  const score = 600 + factors.reduce((t, f) => t + f.points, 0);
  const rating = score >= 850 ? "AA" : score >= 750 ? "A" : score >= 650 ? "B" : score >= 550 ? "C" : "D";
  const cfg = settings.ratings[rating];
  const lgdBps = published ? settings.lgdBps.withCoobligation : settings.lgdBps.withoutCoobligation;
  const pdTermBps = Math.round(cfg.pdAnnualBps * (r.termDays / 365));
  return { score, rating, pdAnnualBps: cfg.pdAnnualBps, pdTermBps, lgdBps, expectedLossCents: Math.round((pdTermBps / 10000) * (lgdBps / 10000) * r.amountCents), spreadBaseBps: cfg.spreadBps, factors, producerHistory: { isSimulated: true, seasons: 6, onTimeRate: 0.95, maxDelayDays: 8 } };
}
const withRisk = (r) => ({ ...r, risk: risk(r) });

// Preço simplificado com as mesmas fórmulas do backend (dias úteis aproximados por 252/365 dos corridos).
function quote(r, funderType, spreadBps, feesCents) {
  const dc = Math.max(1, days(new Date().toISOString().slice(0, 10), r.dueDate));
  const du = Math.max(1, Math.round((dc * 252) / 365));
  const cdi = settings.cdi.manualAnnualBps / 10000;
  const annual = (1 + cdi) * (1 + spreadBps / 10000) - 1;
  const pv = Math.round(r.amountCents / Math.pow(1 + annual, du / 252));
  const iof = settings.iofByFunderType[funderType] ? Math.round(pv * (0.000041 * Math.min(dc, 365) + 0.0038)) : 0;
  const cashOut = pv - feesCents - iof;
  const platform = Math.round((r.amountCents * settings.platformFeeBps) / 10000);
  const net = cashOut - platform - settings.registryFeeCents;
  const bps = (x) => Math.round(x * 10000);
  const cet = Math.pow(r.amountCents / net, 252 / du) - 1;
  return {
    spreadBps, feesCents, cdiBps: settings.cdi.manualAnnualBps, annualRateBps: bps(annual), monthlyRateBps: bps(Math.pow(1 + annual, 1 / 12) - 1),
    businessDays: du, presentValueCents: pv, discountCents: r.amountCents - pv, iofCents: iof, funderCashOutCents: cashOut,
    platformFeeCents: platform, registryFeeCents: settings.registryFeeCents, netAmountCents: net,
    cetAnnualBps: bps(cet), cetMonthlyBps: bps(Math.pow(1 + cet, 1 / 12) - 1), funderYieldAnnualBps: bps(Math.pow(r.amountCents / (pv - feesCents), 252 / du) - 1),
    pricedAt: new Date().toISOString().slice(0, 10),
  };
}

const summary = (r) => ({ id: r.id, reference: r.reference, status: r.status, debtor: r.debtor, product: r.product, amountCents: r.amountCents, currency: "BRL", dueDate: r.dueDate, chain: { status: r.chain.status }, selectedOfferId: r.selectedOfferId, debtorConfirmation: { status: r.debtorConfirmation.status }, assignment: { status: r.assignment.status }, registry: { registryId: r.registry.registryId }, listing: { status: r.listing.status }, offerCount: (r.offers ?? []).length, distributor: r.distributor, risk: (({ score, rating }) => ({ score, rating }))(risk(r)), createdAt: r.createdAt });
const emptyDc = () => ({ status: "none", isSimulated: true, requestedAt: null, expiresAt: null, respondedAt: null, chain: null });
const emptyAssignment = () => ({ platformFeeAmount: null, treasuryWallet: null, status: "none", isSimulated: true, cluster: "devnet", offerId: null, tokenMint: null, settlementMint: null, settlementAsset: "tBRL-DEMO", settlementAmount: null, distributorWallet: null, funderWallet: null, escrowProgramId: null, mintSignature: null, settlementSignature: null, explorerUrls: { tokenMint: null, mint: null, settlement: null, documentLock: null }, submittedAt: null, settledAt: null, error: null, funderId: null, funderName: null, documentLock: null, doubleSpendProof: null });
const dcSummary = (r, expiresAt) => ({ isSimulated: true, disclaimer: "Simulação — sem verificação de identidade do sacado.", reference: r.reference, distributor: r.distributor, product: r.product, amountCents: r.amountCents, currency: "BRL", dueDate: r.dueDate, status: r.debtorConfirmation.status, expiresAt, registryId: r.registry.registryId, paymentDomicile: r.registry.paymentDomicile });
const REGISTERED = ["registered", "published", "offer_selected", "assignment_pending", "assigned", "assignment_failed"];
const net = (gross, bps, term, fees) => gross - Math.round(gross * (bps / 10000) * (term / 30)) - fees;
const offer = (r, f, spreadBps, fees, origin) => ({ id: `ofr_${r.id}_${f.id}`, receivableId: r.id, isSimulated: true, funder: { id: f.id, name: f.name, type: f.type }, origin, grossAmountCents: r.amountCents, termDays: r.termDays, status: "available", expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), createdAt: now(), updatedAt: now(), ...quote(r, f.type, spreadBps, fees) });

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname.replace(/^\/api\/v1/, "");
  const m = (re) => p.match(re);
  const find = (id) => db.get(id);
  try {
    if (req.method === "GET" && p === "/health") return send(res, 200, { status: "ok", version: "fake-test", cluster: "devnet", solana: { reachable: true, feePayerBalanceLamports: 2_000_000_000 }, features: { debtorConfirmation: true, assignment: ASSIGNMENT, marketplace: true, doubleSpendProof: ASSIGNMENT } });
    if (req.method === "POST" && p === "/__reset") { db.clear(); tokens.clear(); n = 0; failedOnce = false; settings = defaultSettings(); revenue.length = 0; return send(res, 204); }
    if (req.method === "GET" && p === "/distributors") return send(res, 200, { items: DISTRIBUTORS.map((d) => ({ ...d, wallet: null, isSimulated: true })) });
    if (req.method === "GET" && p === "/pricing/reference") return send(res, 200, { cdiAnnualBps: settings.cdi.manualAnnualBps, cdiSource: "manual", cdiReferenceDate: null, platformFeeBps: settings.platformFeeBps, registryFeeCents: settings.registryFeeCents, pricedAt: now().slice(0, 10) });
    if (p === "/admin/settings") {
      if (req.method === "GET") return send(res, 200, settings);
      if (req.method === "PUT") {
        const b = await json(req);
        if (b.platformFeeBps !== undefined && !(Number.isInteger(b.platformFeeBps) && b.platformFeeBps >= 0 && b.platformFeeBps <= 500)) return err(res, 422, "VALIDATION_ERROR", "Alguns campos precisam de ajuste.", { fieldErrors: { platformFeeBps: "Informe a taxa entre 0% e 5% do valor de face." } });
        settings = { ...settings, ...b, cdi: { ...settings.cdi, ...(b.cdi ?? {}) } };
        return send(res, 200, settings);
      }
    }
    if (req.method === "GET" && p.startsWith("/admin/")) {
      const all = [...db.values()];
      const assigned = all.filter((r) => r.status === "assigned");
      if (p === "/admin/overview") {
        const byStatus = {};
        all.forEach((r) => (byStatus[r.status] = (byStatus[r.status] ?? 0) + 1));
        const ratingMix = Object.fromEntries(RATINGS.map((k) => [k, 0]));
        all.forEach((r) => ratingMix[risk(r).rating]++);
        return send(res, 200, { isSimulated: true, receivables: all.length, portfolioCents: all.reduce((t, r) => t + r.amountCents, 0), assignedCount: assigned.length, assignedVolumeCents: assigned.reduce((t, r) => t + r.amountCents, 0), revenueCents: revenue.reduce((t, e) => t + e.platformFeeCents + e.registryFeeCents, 0), averageTicketCents: all.length ? Math.round(all.reduce((t, r) => t + r.amountCents, 0) / all.length) : null, averageTermDays: null, averageAnnualRateBps: null, averageCetAnnualBps: null, byStatus, ratingMix, expectedLossCents: 0 });
      }
      if (p === "/admin/receivables") return send(res, 200, { items: all.map((r) => ({ id: r.id, reference: r.reference, status: r.status, distributor: r.distributor, debtor: r.debtor, product: r.product, amountCents: r.amountCents, dueDate: r.dueDate, registryId: r.registry.registryId, rating: risk(r).rating, score: risk(r).score, expectedLossCents: risk(r).expectedLossCents, offerCount: r.offers.length, acceptedOffer: null, createdAt: r.createdAt })) });
      if (p === "/admin/funders") return send(res, 200, { items: FUNDERS.map((f) => ({ id: f.id, name: f.name, type: f.type, mode: f.mode, proposals: all.filter((r) => r.offers.some((o) => o.funder.id === f.id)).length, accepted: all.filter((r) => r.offers.some((o) => o.funder.id === f.id && o.status === "selected")).length, boughtCount: assigned.filter((r) => r.assignment.funderId === f.id).length, boughtFaceCents: assigned.filter((r) => r.assignment.funderId === f.id).reduce((t, r) => t + r.amountCents, 0), averageAnnualRateBps: null, averageYieldAnnualBps: null, wallet: f.wallet, settlementUnits: null })) });
      if (p === "/admin/distributors") return send(res, 200, { items: DISTRIBUTORS.map((d) => { const mine = all.filter((r) => r.distributor.id === d.id); return { id: d.id, name: d.name, receivables: mine.length, volumeCents: mine.reduce((t, r) => t + r.amountCents, 0), assignedCount: mine.filter((r) => r.status === "assigned").length, assignedVolumeCents: mine.filter((r) => r.status === "assigned").reduce((t, r) => t + r.amountCents, 0), averageCetAnnualBps: null, topDebtor: mine[0] ? { alias: mine[0].debtor.alias, shareBps: 10000 } : null }; }) });
      if (p === "/admin/revenue") return send(res, 200, { isSimulated: true, treasuryWallet: "FAKETreasury1111", totals: { platformFeeCents: revenue.reduce((t, e) => t + e.platformFeeCents, 0), registryFeeCents: revenue.reduce((t, e) => t + e.registryFeeCents, 0), count: revenue.length }, byMonth: revenue.length ? [{ month: now().slice(0, 7), platformFeeCents: revenue.reduce((t, e) => t + e.platformFeeCents, 0), registryFeeCents: revenue.reduce((t, e) => t + e.registryFeeCents, 0), count: revenue.length }] : [], entries: revenue });
      if (p === "/admin/risk") {
        const group = (key) => { const m = new Map(); all.forEach((r) => { const g = m.get(key(r)) ?? { key: key(r), count: 0, amountCents: 0, expectedLossCents: 0 }; g.count++; g.amountCents += r.amountCents; g.expectedLossCents += risk(r).expectedLossCents; m.set(key(r), g); }); return [...m.values()]; };
        return send(res, 200, { isSimulated: true, ratings: RATINGS.map((rating) => ({ rating, count: all.filter((r) => risk(r).rating === rating).length, amountCents: 0, expectedLossCents: 0, pdAnnualBps: settings.ratings[rating].pdAnnualBps, spreadBps: settings.ratings[rating].spreadBps })), expectedLossCents: all.reduce((t, r) => t + risk(r).expectedLossCents, 0), portfolioCents: all.reduce((t, r) => t + r.amountCents, 0), byDebtor: group((r) => r.debtor.alias), byState: group((r) => r.debtor.state), byCategory: group((r) => r.product.category) });
      }
    }
    if (req.method === "GET" && p === "/terms") return send(res, 200, TERMS);
    if (req.method === "GET" && p === "/funders") return send(res, 200, { items: FUNDERS });
    if (req.method === "GET" && p === "/receivables") {
      const dist = url.searchParams.get("distributorId");
      const all = [...db.values()].filter((r) => !dist || r.distributor.id === dist);
      const items = all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(summary);
      return send(res, 200, { items, totals: { count: items.length, amountCents: items.reduce((s, i) => s + i.amountCents, 0), registeredCount: items.filter((i) => REGISTERED.includes(i.status)).length, pendingCount: items.filter((i) => i.status === "registration_pending").length, offerSelectedCount: items.filter((i) => i.status === "offer_selected").length, debtorConfirmedCount: items.filter((i) => i.debtorConfirmation.status === "confirmed").length, assignedCount: items.filter((i) => i.status === "assigned").length, publishedCount: items.filter((i) => i.status === "published").length } });
    }
    if (req.method === "POST" && p === "/receivables") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const form = await new Request("http://x", { method: "POST", headers: { "content-type": req.headers["content-type"] }, body: Buffer.concat(chunks) }).formData();
      const data = JSON.parse(form.get("data"));
      const file = form.get("document");
      if (!file || typeof file === "string") return err(res, 422, "VALIDATION_ERROR", "Alguns campos precisam de ajuste.", { fieldErrors: { document: "Envie um PDF, PNG ou JPEG de até 5 MB." } });
      const bytes = Buffer.from(await file.arrayBuffer());
      const sha = createHash("sha256").update(bytes).digest("hex");
      const client = req.headers["x-client-sha256"];
      if (client && client !== sha) return err(res, 422, "HASH_MISMATCH", "O hash do documento não confere.");
      const dup = [...db.values()].find((x) => x.documents[0].sha256 === sha);
      if (dup) return err(res, 409, "DUPLICATE_DOCUMENT", `Este documento já está registrado na registradora (simulada) como ${dup.reference} (${dup.registry.registryId}).`, { details: { reference: dup.reference, registryId: dup.registry.registryId } });
      n += 1;
      const id = `rcv_test${n}`;
      const reference = `AGF-${String(n).padStart(4, "0")}`;
      const registryId = `REG-DEMO-${String(n).padStart(6, "0")}`;
      const doc = { id: `doc_test${n}`, kind: data.documentKind, filename: file.name, mimeType: file.type, sizeBytes: bytes.length, sha256: sha, uploadedAt: now() };
      const r = {
        id, reference, status: "created", isDemo: true, distributor: DISTRIBUTORS.find((d) => d.id === (data.distributorId ?? "dst_a")) ?? DISTRIBUTORS[0], debtor: data.debtor, product: data.product, cropSeason: data.cropSeason, amountCents: data.amountCents, currency: "BRL", issueDate: data.issueDate, dueDate: data.dueDate, termDays: days(data.issueDate, data.dueDate), documents: [doc],
        chain: { status: "none", cluster: "devnet", signature: null, slot: null, blockTime: null, explorerUrl: null, programId: null, memo: null, payloadHash: null, submittedAt: null, confirmedAt: null, error: null },
        events: [ev("receivable_created", `Recebível ${reference} cadastrado`, { reference }), ev("document_attached", "Documento de teste anexado", { documentId: doc.id, sha256: sha, filename: file.name }), ev("registry_registered", `Título registrado na registradora (simulada) sob o número ${registryId}`, { registryId }, { actor: "system" })],
        selectedOfferId: null, debtorConfirmation: emptyDc(), assignment: emptyAssignment(),
        registry: { status: "registered", isSimulated: true, registrarName: "Registradora Demo (simulada)", registryId, registeredAt: now(), documentSha256: sha, creditor: { kind: "distributor", name: "Distribuidora Demo", wallet: null }, paymentDomicile: null },
        listing: { status: "none", publishedAt: null, terms: null, chain: null },
        offers: [], createdAt: now(), updatedAt: now(),
      };
      db.set(id, r);
      return send(res, 201, r);
    }
    let mm;
    if ((mm = m(/^\/receivables\/([^/]+)$/)) && req.method === "GET") {
      const r = find(mm[1]);
      return r ? send(res, 200, r) : err(res, 404, "NOT_FOUND", "Recebível não encontrado.");
    }
    if ((mm = m(/^\/receivables\/([^/]+)\/register$/)) && req.method === "POST") {
      const r = find(mm[1]);
      if (!r) return err(res, 404, "NOT_FOUND", "Recebível não encontrado.");
      if (!["created", "registration_failed"].includes(r.status)) return err(res, 409, "INVALID_STATE", "Este recebível já foi enviado para registro.");
      const payloadHash = createHash("sha256").update(r.id).digest("hex");
      r.status = "registration_pending";
      r.chain = { ...r.chain, status: "pending", submittedAt: now(), payloadHash, error: null };
      r.events.push(ev("chain_registration_requested", "Registro na Solana Devnet solicitado", { payloadHash }));
      const shouldFail = FAIL_FIRST_REGISTER && !failedOnce;
      setTimeout(() => {
        if (shouldFail) {
          failedOnce = true;
          r.status = "registration_failed";
          r.chain = { ...r.chain, status: "failed", error: { code: "RPC_UNAVAILABLE", message: "A rede Solana Devnet não respondeu. Tente novamente." } };
          r.events.push(ev("chain_registration_failed", "Falha no registro na Solana Devnet", { code: "RPC_UNAVAILABLE" }, { actor: "system" }));
        } else {
          const signature = fakeSig("REG", r.id);
          r.status = "registered";
          r.chain = { ...r.chain, status: "confirmed", signature, slot: 123456, blockTime: now(), explorerUrl: txUrl(signature), programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", memo: JSON.stringify({ app: "agroflux", v: 1, evt: "receivable_registered", rid: r.id, doc: r.documents[0].sha256, ph: payloadHash }), confirmedAt: now() };
          r.events.push(ev("chain_registration_confirmed", "Registro confirmado na Solana Devnet", { signature, slot: 123456 }, { actor: "system", onChain: true, chain: { signature, explorerUrl: txUrl(signature) } }));
        }
        r.updatedAt = now();
      }, CONFIRM_MS);
      return send(res, 202, { receivable: r });
    }
    if ((mm = m(/^\/receivables\/([^/]+)\/verification$/)) && req.method === "GET") {
      const r = find(mm[1]);
      if (!r) return err(res, 404, "NOT_FOUND", "Recebível não encontrado.");
      if (r.chain.status !== "confirmed") return err(res, 409, "INVALID_STATE", "Ainda não há transação confirmada para verificar.");
      const checks = ["transaction_found", "memo_matches", "document_hash_matches", "payload_hash_matches"];
      if (r.debtorConfirmation.chain?.status === "confirmed") checks.push("debtor_confirmation_matches");
      if (r.listing.chain?.status === "confirmed") checks.push("terms_matches");
      if (r.status === "assigned") checks.push("asset_token_unique", "asset_metadata_matches", "asset_held_by_funder", "settlement_record_matches", "document_lock_matches");
      return send(res, 200, { verified: true, checkedAt: now(), signature: r.chain.signature, checks: checks.map((name) => ({ name, passed: true, label: name })) });
    }
    if ((mm = m(/^\/receivables\/([^/]+)\/offers$/)) && req.method === "GET") {
      const r = find(mm[1]);
      if (!r) return err(res, 404, "NOT_FOUND", "Recebível não encontrado.");
      if (!REGISTERED.includes(r.status)) return err(res, 409, "INVALID_STATE", "As propostas ficam disponíveis depois do registro e da publicação.");
      return send(res, 200, { isSimulated: true, disclaimer: "Propostas fictícias de financiadores demo. Não há financiador real, proposta vinculante ou movimentação financeira.", items: r.offers });
    }
    if ((mm = m(/^\/receivables\/([^/]+)\/offers$/)) && req.method === "POST") {
      const r = find(mm[1]);
      if (!r) return err(res, 404, "NOT_FOUND", "Recebível não encontrado.");
      const b = await json(req);
      const f = FUNDERS.find((x) => x.id === b.funderId && x.mode === "interactive");
      const fe = {};
      if (!f) fe.funderId = "Selecione um financiador demo válido.";
      if (!Number.isInteger(b.spreadBps) || b.spreadBps < 50 || b.spreadBps > 3000) fe.spreadBps = "Informe um spread entre 0,50% e 30,00% ao ano.";
      if (!Number.isInteger(b.feesCents) || b.feesCents < 0 || b.feesCents > 100000) fe.feesCents = "Informe tarifas entre R$ 0 e R$ 1.000.";
      if (Object.keys(fe).length) return err(res, 422, "VALIDATION_ERROR", "Alguns campos precisam de ajuste.", { fieldErrors: fe });
      if (r.status !== "published") return err(res, 409, "INVALID_STATE", "Este recebível não está aberto para propostas.");
      const fresh = offer(r, f, b.spreadBps, b.feesCents, "proposal");
      const i = r.offers.findIndex((o) => o.funder.id === f.id);
      if (i >= 0) r.offers[i] = { ...fresh, createdAt: r.offers[i].createdAt };
      else r.offers.push(fresh);
      r.events.push(ev("offer_proposed", `${i >= 0 ? "Proposta revisada" : "Proposta recebida"} de ${f.name} (simulação)`, { offerId: fresh.id, funderId: f.id }));
      r.updatedAt = now();
      return send(res, 201, { offer: r.offers.find((o) => o.funder.id === f.id), receivable: r });
    }
    if ((mm = m(/^\/receivables\/([^/]+)\/quote$/)) && req.method === "POST") {
      const r = find(mm[1]);
      if (!r) return err(res, 404, "NOT_FOUND", "Recebível não encontrado.");
      const b = await json(req);
      if (!Number.isInteger(b.spreadBps) || b.spreadBps < 50 || b.spreadBps > 3000) return err(res, 422, "VALIDATION_ERROR", "Alguns campos precisam de ajuste.", { fieldErrors: { spreadBps: "Informe um spread entre 0,50% e 30,00% ao ano." } });
      return send(res, 200, quote(r, "simulated_fidc", b.spreadBps, b.feesCents ?? 0));
    }
    if ((mm = m(/^\/receivables\/([^/]+)\/offers\/([^/]+)\/select$/)) && req.method === "POST") {
      const r = find(mm[1]);
      if (!r) return err(res, 404, "NOT_FOUND", "Recebível não encontrado.");
      const o = r.offers.find((x) => x.id === mm[2]);
      if (!o) return err(res, 404, "NOT_FOUND", "Proposta não encontrada.");
      if (r.selectedOfferId === o.id) return send(res, 200, r);
      if (r.selectedOfferId) return err(res, 409, "OFFER_ALREADY_SELECTED", "Já existe outra proposta aceita.");
      if (r.status !== "published") return err(res, 409, "INVALID_STATE", "Ação não permitida no estado atual.");
      r.offers.forEach((x) => (x.status = x.id === o.id ? "selected" : "unavailable"));
      r.selectedOfferId = o.id;
      r.status = "offer_selected";
      r.events.push(ev("offer_selected", `Proposta simulada de ${o.funder.name} aceita`, { offerId: o.id, funderName: o.funder.name, netAmountCents: o.netAmountCents }));
      r.updatedAt = now();
      return send(res, 200, r);
    }
    if ((mm = m(/^\/receivables\/([^/]+)\/publish$/)) && req.method === "POST") {
      const r = find(mm[1]);
      if (!r) return err(res, 404, "NOT_FOUND", "Recebível não encontrado.");
      const b = await json(req);
      if (b.acceptTerms !== true || b.termsVersion !== TERMS.version) return err(res, 422, "VALIDATION_ERROR", "Alguns campos precisam de ajuste.", { fieldErrors: { acceptTerms: "Aceite o termo." } });
      if (r.status !== "registered") return err(res, 409, "INVALID_STATE", "Ação não permitida no estado atual.");
      if (r.debtorConfirmation.chain?.status !== "confirmed") return err(res, 409, "DEBTOR_CONFIRMATION_REQUIRED", "Antes de publicar, o sacado precisa aceitar o título.");
      const th = createHash("sha256").update(`${r.id}:terms`).digest("hex");
      r.status = "published";
      r.listing = { status: "published", publishedAt: now(), terms: { version: TERMS.version, textSha256: TERMS.textSha256, termsHash: th, acceptedAt: now() }, chain: { status: "pending", signature: null, explorerUrl: null, memo: JSON.stringify({ app: "agroflux", v: 1, evt: "receivable_published", rid: r.id, th }), error: null } };
      const base = risk(r).spreadBaseBps;
      r.offers = [offer(r, FUNDERS[1], base + 60, 8000, "automatic"), offer(r, FUNDERS[2], base + 120, 20000, "automatic")];
      r.events.push(ev("listing_published", "Publicado para financiadores com termo de coobrigação aceito (simulação)", { termsHash: th }), ev("offers_generated", "Propostas automáticas dos financiadores demo recebidas (simulação)", { offerIds: r.offers.map((o) => o.id) }, { actor: "system" }));
      r.updatedAt = now();
      setTimeout(() => {
        const signature = fakeSig("TERMS", r.id);
        r.listing.chain = { ...r.listing.chain, status: "confirmed", signature, explorerUrl: txUrl(signature) };
        r.events.push(ev("listing_terms_anchored", "Termo de coobrigação registrado na Solana Devnet (simulação)", { signature, termsHash: th }, { actor: "system", onChain: true, chain: { signature, explorerUrl: txUrl(signature) } }));
        r.updatedAt = now();
      }, CONFIRM_MS);
      return send(res, 202, { receivable: r });
    }
    if (req.method === "GET" && p === "/marketplace") {
      const fid = url.searchParams.get("funderId");
      const items = [...db.values()].filter((r) => r.status === "published").map((r) => {
        const av = r.offers.filter((o) => o.status === "available");
        const best = av.reduce((b, o) => (!b || o.netAmountCents > b.netAmountCents ? o : b), null);
        return { receivable: { ...summary(r), cropSeason: r.cropSeason, issueDate: r.issueDate, termDays: r.termDays }, registryId: r.registry.registryId, debtorAccepted: true, offerCount: av.length, bestOffer: best && { funderName: best.funder.name, monthlyRateBps: best.monthlyRateBps, netAmountCents: best.netAmountCents }, myOffer: av.find((o) => o.funder.id === fid) ?? null };
      });
      return send(res, 200, { isSimulated: true, disclaimer: "Recebíveis fictícios publicados para demonstração. Não é oferta de investimento.", items });
    }
    if ((mm = m(/^\/funders\/([^/]+)\/portfolio$/)) && req.method === "GET") {
      const f = FUNDERS.find((x) => x.id === mm[1]);
      if (!f) return err(res, 404, "NOT_FOUND", "Financiador não encontrado.");
      const items = [...db.values()].filter((r) => r.assignment.funderId === f.id && ["assignment_pending", "assigned"].includes(r.status)).map((r) => {
        const o = r.offers.find((x) => x.id === r.assignment.offerId);
        return { receivableId: r.id, reference: r.reference, registryId: r.registry.registryId, status: r.status === "assigned" ? "settled" : "settling", product: r.product, debtorState: r.debtor.state, faceAmountCents: r.amountCents, paidAmountCents: o.presentValueCents - o.feesCents, monthlyRateBps: o.monthlyRateBps, feesCents: o.feesCents, annualRateBps: o.annualRateBps, spreadBps: o.spreadBps, funderYieldAnnualBps: o.funderYieldAnnualBps, settledAt: r.assignment.settledAt, dueDate: r.dueDate, tokenMint: r.assignment.tokenMint, settlementSignature: r.assignment.settlementSignature, explorerUrls: { tokenMint: r.assignment.explorerUrls.tokenMint, settlement: r.assignment.explorerUrls.settlement } };
      });
      const s = items.filter((i) => i.status === "settled");
      const paid = s.reduce((a, i) => a + i.paidAmountCents, 0);
      const face = s.reduce((a, i) => a + i.faceAmountCents, 0);
      return send(res, 200, { isSimulated: true, funder: f, items, totals: { count: s.length, paidAmountCents: paid, faceAmountCents: face, projectedIncomeCents: face - paid } });
    }
    if (req.method === "GET" && p === "/transparency") {
      const all = [...db.values()];
      return send(res, 200, {
        isSimulated: true, cluster: "devnet", checkedAt: now(),
        programs: [{ role: "memo", label: "SPL Memo", address: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", explorerUrl: addrUrl("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr") }, ...(ASSIGNMENT ? [{ role: "escrow", label: "Escrow AgroFlux (Anchor)", address: "FAKE_ESCROW", explorerUrl: addrUrl("FAKE_ESCROW") }] : [])],
        settlementAsset: ASSIGNMENT ? { symbol: "tBRL-DEMO", mint: "FAKE_TBRL_MINT", decimals: 2, explorerUrl: addrUrl("FAKE_TBRL_MINT") } : null,
        wallets: ASSIGNMENT ? [{ role: "treasury", label: "Tesouraria AgroFlux (taxas)", address: "FAKETreasury1111", explorerUrl: addrUrl("FAKETreasury1111"), solLamports: 0, settlementUnits: revenue.reduce((t, e) => t + e.platformFeeCents + e.registryFeeCents, 0) }, ...FUNDERS.map((f) => ({ role: "funder", funderId: f.id, label: f.name, address: f.wallet, explorerUrl: addrUrl(f.wallet), solLamports: 0, settlementUnits: 100000000 }))] : [],
        registry: { name: "Registradora Demo (simulada)", isSimulated: true, titles: all.length },
        stats: { receivables: all.length, registeredOnChain: all.filter((r) => r.chain.status === "confirmed").length, debtorAccepted: all.filter((r) => r.debtorConfirmation.chain?.status === "confirmed").length, published: all.filter((r) => r.listing.status === "published").length, assigned: all.filter((r) => r.status === "assigned").length, doubleSpendRejected: all.filter((r) => r.assignment.doubleSpendProof?.status === "rejected").length },
      });
    }
    // Cessão tokenizada (§5.14), só com FAKE_ASSIGNMENT=true
    if (ASSIGNMENT && (mm = m(/^\/receivables\/([^/]+)\/assignment$/)) && req.method === "POST") {
      const r = find(mm[1]);
      if (!r) return err(res, 404, "NOT_FOUND", "Recebível não encontrado.");
      if (!["offer_selected", "assignment_failed"].includes(r.status)) return err(res, 409, "INVALID_STATE", "A cessão fica disponível depois que uma proposta é aceita.");
      const o = r.offers.find((x) => x.id === r.selectedOfferId);
      const f = FUNDERS.find((x) => x.id === o.funder.id);
      const lock = `FAKE_DOC_LOCK_${r.id}`;
      r.status = "assignment_pending";
      r.assignment = { ...r.assignment, status: "pending", offerId: o.id, settlementAmount: o.funderCashOutCents, platformFeeAmount: o.platformFeeCents + o.registryFeeCents, treasuryWallet: "FAKETreasury1111", settlementMint: "FAKE_TBRL_MINT", distributorWallet: "FAKEDistributor1111", funderWallet: f.wallet, funderId: f.id, funderName: f.name, escrowProgramId: "FAKE_ESCROW", documentLock: lock, explorerUrls: { ...r.assignment.explorerUrls, documentLock: addrUrl(lock) }, submittedAt: now(), error: null };
      r.events.push(ev("assignment_requested", "Cessão tokenizada solicitada (simulação na Devnet)", { offerId: o.id, settlementAmount: o.netAmountCents }));
      r.updatedAt = now();
      setTimeout(() => {
        const mint = `FAKE_ASSET_MINT_${r.id}`;
        const sig = fakeSig("MINT", r.id);
        r.assignment = { ...r.assignment, tokenMint: mint, mintSignature: sig, explorerUrls: { ...r.assignment.explorerUrls, tokenMint: addrUrl(mint), mint: txUrl(sig) } };
        r.events.push(ev("assignment_token_minted", "Token da cessão criado na Solana Devnet (Token-2022, supply 1)", { tokenMint: mint, signature: sig }, { actor: "system", onChain: true, chain: { signature: sig, explorerUrl: txUrl(sig) } }));
        r.updatedAt = now();
      }, CONFIRM_MS / 2);
      setTimeout(() => {
        const sig = fakeSig("SETTLEMENT", r.id);
        r.status = "assigned";
        r.assignment = { ...r.assignment, status: "settled", settlementSignature: sig, settledAt: now(), explorerUrls: { ...r.assignment.explorerUrls, settlement: txUrl(sig) } };
        r.registry = { ...r.registry, creditor: { kind: "funder", name: f.name, wallet: f.wallet }, paymentDomicile: { payeeName: f.name, instruction: `Pagar ao credor atual: ${f.name} (simulado).`, updatedAt: now() } };
        revenue.push({ id: `rev_${r.id}`, receivableId: r.id, reference: r.reference, distributorId: r.distributor.id, funderId: f.id, settledAt: now(), faceAmountCents: r.amountCents, platformFeeCents: o.platformFeeCents, registryFeeCents: o.registryFeeCents, settlementSignature: sig });
        r.events.push(
          ev("assignment_settled", "Liquidação atômica confirmada na Solana Devnet (simulação, tBRL-DEMO sem valor)", { signature: sig }, { actor: "system", onChain: true, chain: { signature: sig, explorerUrl: txUrl(sig) } }),
          ev("registry_creditor_updated", `Registradora (simulada): credor atualizado para ${f.name}`, { funderId: f.id }, { actor: "system" }),
        );
        r.updatedAt = now();
      }, CONFIRM_MS);
      return send(res, 202, { receivable: r });
    }
    if (ASSIGNMENT && (mm = m(/^\/receivables\/([^/]+)\/assignment\/double-spend-test$/)) && req.method === "POST") {
      const r = find(mm[1]);
      if (!r) return err(res, 404, "NOT_FOUND", "Recebível não encontrado.");
      if (r.status !== "assigned" || (r.assignment.doubleSpendProof && r.assignment.doubleSpendProof.status !== "error")) return err(res, 409, "INVALID_STATE", "Ação não permitida no estado atual.");
      const other = FUNDERS.find((f) => f.id !== r.assignment.funderId);
      r.assignment.doubleSpendProof = { status: "pending", attemptedAt: now(), tokenMint: null, funderId: other.id, signature: null, explorerUrl: null, reason: null, error: null };
      setTimeout(() => {
        const sig = fakeSig("REJECTED", r.id);
        r.assignment.doubleSpendProof = { ...r.assignment.doubleSpendProof, status: "rejected", tokenMint: `FAKE_ATTEMPT_MINT_${r.id}`, signature: sig, explorerUrl: txUrl(sig), reason: "Documento já cedido." };
        r.events.push(ev("double_assignment_rejected", "Prova de recusa: a Solana recusou uma segunda cessão do mesmo documento", { signature: sig }, { actor: "system", onChain: true, chain: { signature: sig, explorerUrl: txUrl(sig) } }));
        r.updatedAt = now();
      }, CONFIRM_MS);
      return send(res, 202, { receivable: r });
    }
    // Aceite do sacado (confirmação v1.1)
    if ((mm = m(/^\/receivables\/([^/]+)\/debtor-confirmation$/)) && req.method === "POST") {
      const r = find(mm[1]);
      if (!r) return err(res, 404, "NOT_FOUND", "Recebível não encontrado.");
      if (r.status !== "registered" || r.debtorConfirmation.status === "confirmed") return err(res, 409, "INVALID_STATE", "O aceite fica disponível depois do registro na Devnet.");
      for (const t of tokens.values()) if (t.receivableId === r.id) t.revoked = true;
      const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 11);
      const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      tokens.set(token, { receivableId: r.id, used: false, revoked: false, expiresAt });
      r.debtorConfirmation = { ...emptyDc(), status: "requested", requestedAt: now(), expiresAt };
      r.events.push(ev("debtor_confirmation_requested", "Aceite solicitado ao sacado (simulação)", { expiresAt }));
      r.updatedAt = now();
      return send(res, 201, { token, confirmationPath: `/confirmar/${token}`, expiresAt, receivable: r });
    }
    if ((mm = m(/^\/receivables\/([^/]+)\/(debtor-confirmation|publish)\/register$/)) && req.method === "POST") {
      return err(res, 409, "INVALID_STATE", "Não há registro com falha para repetir.");
    }
    if ((mm = m(/^\/confirmations\/([^/]+)(?:\/(confirm|decline))?$/))) {
      const t = tokens.get(mm[1]);
      const r = t && find(t.receivableId);
      if (!t || !r) return err(res, 404, "NOT_FOUND", "Link de aceite não encontrado.");
      if (t.revoked) return err(res, 410, "CONFIRMATION_LINK_EXPIRED", "Este link venceu ou foi substituído por um mais novo.");
      const action = mm[2];
      if (!action && req.method === "GET") return send(res, 200, dcSummary(r, t.expiresAt));
      if (action && req.method === "POST") {
        if (t.used) return err(res, 409, "CONFIRMATION_ALREADY_ANSWERED", "Este link já foi usado.");
        t.used = true;
        if (action === "decline") {
          r.debtorConfirmation = { ...r.debtorConfirmation, status: "declined", respondedAt: now() };
          r.events.push(ev("debtor_declined", "Sacado recusou o título (simulação)", {}, { actor: "system" }));
          r.updatedAt = now();
          return send(res, 200, dcSummary(r, t.expiresAt));
        }
        const ch = createHash("sha256").update(`${r.id}:${now()}`).digest("hex");
        const memo = JSON.stringify({ app: "agroflux", v: 1, evt: "debtor_confirmed", rid: r.id, ch });
        r.debtorConfirmation = { ...r.debtorConfirmation, status: "confirmed", respondedAt: now(), chain: { status: "pending", signature: null, explorerUrl: null, memo, confirmationHash: ch, error: null } };
        r.updatedAt = now();
        setTimeout(() => {
          const signature = fakeSig("DC", r.id);
          r.debtorConfirmation.chain = { ...r.debtorConfirmation.chain, status: "confirmed", signature, explorerUrl: txUrl(signature) };
          r.events.push(ev("debtor_confirmed", "Aceite do sacado registrado na Solana Devnet (simulação)", { signature, confirmationHash: ch }, { actor: "system", onChain: true, chain: { signature, explorerUrl: txUrl(signature) } }));
          r.updatedAt = now();
        }, CONFIRM_MS);
        return send(res, 202, dcSummary(r, t.expiresAt));
      }
    }
    return err(res, 404, "NOT_FOUND", "Rota não encontrada.");
  } catch (e) {
    console.error(e);
    return err(res, 500, "INTERNAL_ERROR", "Erro inesperado.");
  }
});

server.listen(PORT, () => console.log(`fake-backend (somente testes) em http://localhost:${PORT}/api/v1`));
