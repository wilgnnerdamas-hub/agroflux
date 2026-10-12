// Analista de IA (Claude): confere o documento de teste contra os dados declarados e escreve um parecer de risco.
// SIMULAÇÃO: documentos fictícios; o parecer é apoio à análise, não recomendação de crédito.
import { createHash } from "node:crypto";
import { ApiError } from "../errors.js";
import { EXT, getReceivable } from "../receivables.js";
import type { PricingService } from "../pricing/service.js";
import type { Store } from "../store.js";
import type { DocumentCheck, DocumentCheckField, Receivable, RiskMemo } from "../types.js";
import type { ClaudeBlock, ClaudeToolCaller } from "./claude.js";

const FIELDS: DocumentCheckField[] = ["amount", "issueDate", "dueDate", "product", "debtor"];
const brl = (cents: number) => `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const br = (iso: string) => iso.split("-").reverse().join("/");

function declared(r: Receivable): Record<DocumentCheckField, string> {
  return {
    amount: brl(r.amountCents),
    issueDate: br(r.issueDate),
    dueDate: br(r.dueDate),
    product: r.product.description,
    debtor: `${r.debtor.alias} (${r.debtor.state})`,
  };
}

const CHECK_TOOL = {
  name: "report_document_check",
  description: "Relata a conferência entre o documento e os dados declarados do recebível.",
  input_schema: {
    type: "object",
    properties: {
      readable: { type: "boolean", description: "O documento pôde ser lido e parece uma nota fiscal, duplicata ou contrato de venda?" },
      document_type: { type: "string", description: "Tipo do documento, em poucas palavras (ex.: 'NF-e de teste')." },
      fields: {
        type: "array",
        items: {
          type: "object",
          properties: {
            field: { type: "string", enum: FIELDS },
            found: { type: ["string", "null"], description: "Valor encontrado no documento, como está escrito; null se não houver." },
            status: { type: "string", enum: ["match", "mismatch", "not_found"] },
          },
          required: ["field", "found", "status"],
        },
      },
      summary: { type: "string", description: "Uma ou duas frases em português do Brasil, objetivas, sobre a conferência." },
    },
    required: ["readable", "document_type", "fields", "summary"],
  },
};

const MEMO_TOOL = {
  name: "write_credit_memo",
  description: "Escreve um parecer curto de risco de crédito sobre o recebível.",
  input_schema: {
    type: "object",
    properties: {
      memo: { type: "string", description: "Parecer de 3 a 5 frases, tom de analista de crédito, sem jargão desnecessário." },
      strengths: { type: "array", items: { type: "string" }, description: "Até 3 pontos fortes, curtos." },
      concerns: { type: "array", items: { type: "string" }, description: "Até 3 pontos de atenção, curtos." },
    },
    required: ["memo", "strengths", "concerns"],
  },
};

export class AiService {
  constructor(
    private readonly store: Store,
    private readonly pricing: PricingService,
    private readonly call: ClaudeToolCaller,
    private readonly model: string,
  ) {}

  /** Marca a conferência como pendente e roda em segundo plano. */
  startDocumentCheck(id: string): Receivable {
    const r = getReceivable(this.store, id);
    if (r.documentCheck?.status === "pending") return r;
    r.documentCheck = {
      status: "pending",
      model: this.model,
      requestedAt: new Date().toISOString(),
      checkedAt: null,
      verdict: null,
      documentType: null,
      summary: null,
      fields: [],
      error: null,
    };
    this.store.put(r);
    void this.runDocumentCheck(id);
    return r;
  }

  async runDocumentCheck(id: string): Promise<void> {
    const r = getReceivable(this.store, id);
    const doc = r.documents[0];
    const bytes = this.store.readUpload(doc.id, EXT[doc.mimeType] ?? "");
    const finish = (patch: Partial<DocumentCheck>) => {
      const cur = getReceivable(this.store, id);
      cur.documentCheck = { ...cur.documentCheck!, ...patch, checkedAt: new Date().toISOString() };
      this.store.put(cur);
    };
    if (!bytes) return finish({ status: "failed", error: "Documento não encontrado no servidor." });
    const d = declared(r);
    const file: ClaudeBlock =
      doc.mimeType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } }
        : { type: "image", source: { type: "base64", media_type: doc.mimeType === "image/png" ? "image/png" : "image/jpeg", data: bytes.toString("base64") } };
    try {
      const out = (await this.call({
        system:
          "Você confere documentos de vendas a prazo do agronegócio para uma plataforma de recebíveis. " +
          "Compare o documento anexado com os dados declarados pela distribuidora. Valores e datas devem bater exatamente; " +
          "produto e comprador podem ter grafia diferente, mas precisam se referir à mesma coisa. Os documentos são fictícios, de teste. " +
          "Responda apenas pela ferramenta.",
        content: [file, { type: "text", text: `Dados declarados:\n${FIELDS.map((f) => `- ${f}: ${d[f]}`).join("\n")}` }],
        tool: CHECK_TOOL,
      })) as { readable: boolean; document_type: string; fields: { field: DocumentCheckField; found: string | null; status: "match" | "mismatch" | "not_found" }[]; summary: string };
      const fields = FIELDS.map((f) => {
        const hit = out.fields?.find((x) => x.field === f);
        return { field: f, declared: d[f], found: hit?.found ?? null, status: hit?.status ?? ("not_found" as const) };
      });
      const verdict = !out.readable || fields.every((x) => x.status === "not_found") ? "unreadable" : fields.some((x) => x.status === "mismatch") ? "divergent" : "consistent";
      finish({ status: "done", verdict, documentType: out.document_type ?? null, summary: out.summary ?? null, fields, error: null });
    } catch (e) {
      finish({ status: "failed", error: e instanceof Error ? e.message : "Falha na conferência." });
    }
  }

  /** Parecer de risco sob demanda, guardado por idioma enquanto os dados de entrada não mudarem. */
  async riskMemo(id: string, lang: "pt" | "en"): Promise<RiskMemo> {
    const r = getReceivable(this.store, id);
    const risk = this.pricing.risk(r);
    const ref = await this.pricing.reference();
    const inputs = {
      reference: r.reference,
      status: r.status,
      product: `${r.product.category} — ${r.product.description}`,
      debtorState: r.debtor.state,
      amount: brl(r.amountCents),
      cropSeason: r.cropSeason,
      dueDate: r.dueDate,
      rating: risk.rating,
      score: risk.score,
      pdTerm: `${(risk.pdTermBps / 100).toFixed(2)}%`,
      pdAnnual: `${(risk.pdAnnualBps / 100).toFixed(2)}%`,
      lgd: `${(risk.lgdBps / 100).toFixed(0)}%`,
      expectedLoss: brl(risk.expectedLossCents),
      baseSpread: `${(risk.spreadBaseBps / 100).toFixed(2)}% a.a.`,
      cdi: `${(ref.cdiAnnualBps / 100).toFixed(2)}% a.a.`,
      factors: [...risk.factors].sort((a, b) => Math.abs(b.points) - Math.abs(a.points)).slice(0, 8).map((f) => `${f.label}: ${f.points > 0 ? "+" : ""}${f.points} (${f.detail})`),
      documentCheck: r.documentCheck?.status === "done" ? { verdict: r.documentCheck.verdict, summary: r.documentCheck.summary } : null,
      producerHistory: risk.producerHistory,
    };
    const inputsHash = createHash("sha256").update(JSON.stringify(inputs)).digest("hex").slice(0, 16);
    const cached = r.riskMemos?.[lang];
    if (cached && cached.inputsHash === inputsHash) return cached;

    let out: { memo: string; strengths: string[]; concerns: string[] };
    try {
      out = (await this.call({
        system:
          "Você é analista de crédito de uma plataforma de antecipação de recebíveis do agronegócio brasileiro. " +
          "Escreva um parecer curto e objetivo sobre o recebível, usando só os dados fornecidos. " +
          "O rating vem de um modelo estatístico treinado em base sintética e o histórico do produtor é simulado: não trate como dado real. " +
          "Não recomende comprar ou não comprar; descreva riscos e mitigantes. " +
          (lang === "pt" ? "Escreva em português do Brasil." : "Write in English.") +
          " Responda apenas pela ferramenta.",
        content: [{ type: "text", text: JSON.stringify(inputs, null, 2) }],
        tool: MEMO_TOOL,
        maxTokens: 900,
      })) as { memo: string; strengths: string[]; concerns: string[] };
    } catch (e) {
      throw new ApiError(503, "AI_UNAVAILABLE", lang === "pt" ? "A IA não respondeu agora. Tente de novo em instantes." : "The AI did not respond. Try again shortly.", undefined, {
        reason: e instanceof Error ? e.message : "unknown",
      });
    }
    const memo: RiskMemo = {
      lang,
      model: this.model,
      createdAt: new Date().toISOString(),
      inputsHash,
      memo: String(out.memo ?? "").trim(),
      strengths: (out.strengths ?? []).slice(0, 3).map(String),
      concerns: (out.concerns ?? []).slice(0, 3).map(String),
    };
    const cur = getReceivable(this.store, id);
    cur.riskMemos = { ...(cur.riskMemos ?? {}), [lang]: memo };
    this.store.put(cur);
    return memo;
  }
}
