// DUBLÊ DE TESTE — usado apenas pelos testes e2e (Playwright).
// NÃO é uma API alternativa e não deve ser usado na demo: implementa o contrato v1.0 de forma mínima
// para exercitar o cliente HTTP do frontend. Assinaturas aqui são marcadas como FAKE e não existem na Solana.
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";

const PORT = Number(process.env.FAKE_BACKEND_PORT ?? 4010);
const CONFIRM_MS = Number(process.env.FAKE_CONFIRM_MS ?? 1500);
const FAIL_FIRST_REGISTER = process.env.FAKE_FAIL_FIRST_REGISTER === "1";
const db = new Map();
let n = 0;
let failedOnce = false;

const now = () => new Date().toISOString();
const ev = (type, description, data = {}, extra = {}) => ({ id: `evt_${randomUUID()}`, type, occurredAt: now(), actor: "demo_user", description, onChain: false, chain: null, data, ...extra });
const days = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const err = (res, status, code, message, extra = {}) => send(res, status, { error: { code, message, ...extra } });
function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
}
const summary = (r) => ({ id: r.id, reference: r.reference, status: r.status, debtor: r.debtor, product: r.product, amountCents: r.amountCents, currency: "BRL", dueDate: r.dueDate, chain: { status: r.chain.status }, selectedOfferId: r.selectedOfferId, createdAt: r.createdAt });

function offersFor(r) {
  if (r.offers) return r.offers;
  const specs = [
    ["Financiador Simulado A", "simulated_fidc", 150, 15000],
    ["Financiador Simulado B", "simulated_bank", 195, 5000],
    ["Financiador Simulado C", "simulated_cooperative", 240, 30000],
  ];
  r.offers = specs.map(([name, type, bps, fees], i) => {
    const discount = Math.round(r.amountCents * (bps / 10000) * (r.termDays / 30));
    return { id: `ofr_${r.id}_${i}`, receivableId: r.id, isSimulated: true, funder: { name, type }, grossAmountCents: r.amountCents, monthlyRateBps: bps, feesCents: fees, netAmountCents: r.amountCents - discount - fees, termDays: r.termDays, status: "available", expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() };
  });
  r.events.push(ev("offers_generated", "Ofertas simuladas geradas", { offerIds: r.offers.map((o) => o.id) }, { actor: "system" }));
  return r.offers;
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname.replace(/^\/api\/v1/, "");
  const m = (re) => p.match(re);
  try {
    if (req.method === "GET" && p === "/health") return send(res, 200, { status: "ok", version: "fake-test", cluster: "devnet", solana: { reachable: true, feePayerBalanceLamports: 2_000_000_000 } });
    if (req.method === "POST" && p === "/__reset") { db.clear(); n = 0; failedOnce = false; return send(res, 204); }
    if (req.method === "GET" && p === "/receivables") {
      const items = [...db.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(summary);
      return send(res, 200, { items, totals: { count: items.length, amountCents: items.reduce((s, i) => s + i.amountCents, 0), registeredCount: items.filter((i) => ["registered", "offer_selected"].includes(i.status)).length, pendingCount: items.filter((i) => i.status === "registration_pending").length, offerSelectedCount: items.filter((i) => i.status === "offer_selected").length } });
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
      n += 1;
      const id = `rcv_test${n}`;
      const reference = `AGF-${String(n).padStart(4, "0")}`;
      const doc = { id: `doc_test${n}`, kind: data.documentKind, filename: file.name, mimeType: file.type, sizeBytes: bytes.length, sha256: sha, uploadedAt: now() };
      const r = { id, reference, status: "created", isDemo: true, distributor: { name: "Distribuidora Demo" }, debtor: data.debtor, product: data.product, cropSeason: data.cropSeason, amountCents: data.amountCents, currency: "BRL", issueDate: data.issueDate, dueDate: data.dueDate, termDays: days(data.issueDate, data.dueDate), documents: [doc], chain: { status: "none", cluster: "devnet", signature: null, slot: null, blockTime: null, explorerUrl: null, programId: null, memo: null, payloadHash: null, submittedAt: null, confirmedAt: null, error: null }, events: [ev("receivable_created", `Recebível ${reference} cadastrado`, { reference }), ev("document_attached", "Documento de teste anexado", { documentId: doc.id, sha256: sha, filename: file.name })], selectedOfferId: null, createdAt: now(), updatedAt: now() };
      db.set(id, r);
      return send(res, 201, r);
    }
    let mm;
    if ((mm = m(/^\/receivables\/([^/]+)$/)) && req.method === "GET") {
      const r = db.get(mm[1]);
      return r ? send(res, 200, r) : err(res, 404, "NOT_FOUND", "Recebível não encontrado.");
    }
    if ((mm = m(/^\/receivables\/([^/]+)\/register$/)) && req.method === "POST") {
      const r = db.get(mm[1]);
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
          const signature = `FAKE_TEST_SIGNATURE_${r.id}_NAO_EXISTE_NA_SOLANA`;
          const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
          r.status = "registered";
          r.chain = { ...r.chain, status: "confirmed", signature, slot: 123456, blockTime: now(), explorerUrl, programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", memo: JSON.stringify({ app: "agroflux", v: 1, evt: "receivable_registered", rid: r.id, doc: r.documents[0].sha256, ph: payloadHash }), confirmedAt: now() };
          r.events.push(ev("chain_registration_confirmed", "Registro confirmado na Solana Devnet", { signature, slot: 123456 }, { actor: "system", onChain: true, chain: { signature, explorerUrl } }));
        }
        r.updatedAt = now();
      }, CONFIRM_MS);
      return send(res, 202, { receivable: r });
    }
    if ((mm = m(/^\/receivables\/([^/]+)\/verification$/)) && req.method === "GET") {
      const r = db.get(mm[1]);
      if (!r) return err(res, 404, "NOT_FOUND", "Recebível não encontrado.");
      if (r.chain.status !== "confirmed") return err(res, 409, "INVALID_STATE", "Ainda não há transação confirmada para verificar.");
      return send(res, 200, { verified: true, checkedAt: now(), signature: r.chain.signature, checks: [
        { name: "transaction_found", passed: true, label: "Transação encontrada na Devnet" },
        { name: "memo_matches", passed: true, label: "Conteúdo on-chain igual ao registrado" },
        { name: "document_hash_matches", passed: true, label: "Hash do documento confere" },
        { name: "payload_hash_matches", passed: true, label: "Hash dos dados do recebível confere" },
      ] });
    }
    if ((mm = m(/^\/receivables\/([^/]+)\/offers$/)) && req.method === "GET") {
      const r = db.get(mm[1]);
      if (!r) return err(res, 404, "NOT_FOUND", "Recebível não encontrado.");
      if (!["registered", "offer_selected"].includes(r.status)) return err(res, 409, "INVALID_STATE", "As ofertas simuladas ficam disponíveis após a confirmação na Devnet.");
      return send(res, 200, { isSimulated: true, disclaimer: "Ofertas fictícias geradas para demonstração. Não há financiador real, proposta vinculante ou movimentação financeira.", items: offersFor(r) });
    }
    if ((mm = m(/^\/receivables\/([^/]+)\/offers\/([^/]+)\/select$/)) && req.method === "POST") {
      const r = db.get(mm[1]);
      if (!r) return err(res, 404, "NOT_FOUND", "Recebível não encontrado.");
      const offers = offersFor(r);
      const o = offers.find((x) => x.id === mm[2]);
      if (!o) return err(res, 404, "NOT_FOUND", "Oferta não encontrada.");
      if (r.selectedOfferId === o.id) return send(res, 200, r);
      if (r.selectedOfferId) return err(res, 409, "OFFER_ALREADY_SELECTED", "Já existe outra oferta selecionada.");
      if (r.status !== "registered") return err(res, 409, "INVALID_STATE", "Ação não permitida no estado atual.");
      offers.forEach((x) => (x.status = x.id === o.id ? "selected" : "unavailable"));
      r.selectedOfferId = o.id;
      r.status = "offer_selected";
      r.events.push(ev("offer_selected", `Oferta simulada de ${o.funder.name} selecionada`, { offerId: o.id, funderName: o.funder.name, netAmountCents: o.netAmountCents }));
      r.updatedAt = now();
      return send(res, 200, r);
    }
    return err(res, 404, "NOT_FOUND", "Rota não encontrada.");
  } catch (e) {
    console.error(e);
    return err(res, 500, "INTERNAL_ERROR", "Erro inesperado.");
  }
});

server.listen(PORT, () => console.log(`fake-backend (somente testes) em http://localhost:${PORT}/api/v1`));
