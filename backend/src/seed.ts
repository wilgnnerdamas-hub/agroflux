// POST /demo/reset (§5.9): apaga os recebíveis e recria 3 exemplos fictícios, todos com transações REAIS quando há.
// AGF-0001: registrado na Devnet. AGF-0002: só cadastrado, para registrar ao vivo.
// AGF-0003 (v1.2): registrado, aceito pelo sacado e publicado, para a tela do financiador começar com um recebível.
import type { ConfirmationService } from "./confirmation.js";
import { ApiError } from "./errors.js";
import { TERMS_VERSION, type ListingService } from "./listing.js";
import { createReceivable } from "./receivables.js";
import type { Registrar } from "./registration.js";
import type { Store } from "./store.js";
import type { CreateReceivableInput } from "./types.js";

const isoDaysFromToday = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

// PDF mínimo e válido, gerado na hora, com um texto que deixa claro que é fictício.
export function demoPdf(title: string): Buffer {
  const text = `${title} - documento ficticio de teste AgroFlux, sem valor juridico`.replace(/[()\\]/g, "");
  const stream = `BT /F1 12 Tf 50 750 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

type Stage = "created" | "registered" | "published";

const EXAMPLES: { input: () => CreateReceivableInput; filename: string; title: string; stage: Stage }[] = [
  {
    stage: "registered",
    filename: "nf-teste-demo-01.pdf",
    title: "Nota fiscal de teste 01",
    input: () => ({
      debtor: { alias: "Produtor Demo 01", state: "MT" },
      product: { category: "fertilizer", description: "Fertilizante NPK 20-05-20" },
      cropSeason: "2026/27",
      amountCents: 15_000_000,
      issueDate: isoDaysFromToday(-7),
      dueDate: isoDaysFromToday(150),
      documentKind: "test_invoice",
    }),
  },
  {
    stage: "created",
    filename: "contrato-teste-demo-02.pdf",
    title: "Contrato de teste 02",
    input: () => ({
      debtor: { alias: "Produtor Demo 02", state: "GO" },
      product: { category: "crop_protection", description: "Herbicida pós-emergente (demo)" },
      cropSeason: "2026/27",
      amountCents: 8_500_000,
      issueDate: isoDaysFromToday(-2),
      dueDate: isoDaysFromToday(120),
      documentKind: "test_contract",
    }),
  },
  {
    stage: "published",
    filename: "nf-teste-demo-03.pdf",
    title: "Nota fiscal de teste 03",
    input: () => ({
      debtor: { alias: "Produtor Demo 03", state: "PR" },
      product: { category: "seed", description: "Semente de soja certificada (demo)" },
      cropSeason: "2026/27",
      amountCents: 22_000_000,
      issueDate: isoDaysFromToday(-5),
      dueDate: isoDaysFromToday(180),
      documentKind: "test_invoice",
    }),
  },
];

const fail = (reason: string) => new ApiError(503, "CHAIN_UNAVAILABLE", `Dados da demo recriados, mas um exemplo falhou: ${reason}`);

export async function resetDemo(store: Store, registrar: Registrar, confirmations: ConfirmationService, listings: ListingService) {
  store.reset();
  for (const ex of EXAMPLES) {
    const r = createReceivable(store, ex.input(), { filename: ex.filename, mimeType: "application/pdf", bytes: demoPdf(ex.title) });
    if (ex.stage === "created") continue;
    await registrar.register(r.id);
    await registrar.settle(r.id);
    let after = store.get(r.id);
    if (after?.status !== "registered") throw fail(after?.chain.error?.message ?? "o registro não foi confirmado");
    if (ex.stage !== "published") continue;

    // Aceite do sacado (simulado) e publicação com o termo, como na demo ao vivo.
    const { token } = confirmations.request(r.id);
    confirmations.confirm(token);
    await confirmations.settle(r.id);
    after = store.get(r.id);
    if (after?.debtorConfirmation.chain?.status !== "confirmed") throw fail(after?.debtorConfirmation.chain?.error?.message ?? "o aceite do sacado não foi confirmado");
    await listings.publish(r.id, { acceptTerms: true, termsVersion: TERMS_VERSION });
    await listings.settle(r.id);
    after = store.get(r.id);
    if (after?.listing.chain?.status !== "confirmed") throw fail(after?.listing.chain?.error?.message ?? "o termo não foi confirmado");
  }
}
