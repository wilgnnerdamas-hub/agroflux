import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const shots = (name: string, project: string) => `test-results/screens/${project}-${name}.png`;
const API = "http://localhost:4010/api/v1";

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__reset`);
});

async function fillForm(page: Page) {
  await page.getByLabel("Sacado (pseudônimo)").fill("Produtor Demo 04");
  await page.getByLabel("UF do sacado").selectOption("MT");
  await page.getByLabel("Categoria do insumo").selectOption("fertilizer");
  await page.getByLabel("Descrição do insumo").fill("Fertilizante NPK 20-05-20");
  await page.getByLabel("Valor de face (R$)").fill("15000000");
  await page.getByLabel("Emissão").fill("2026-10-01");
  await page.getByLabel("Vencimento").fill("2027-03-15");
  await page.getByTestId("document-input").setInputFiles(path.join(__dirname, "fixtures/nf-teste.pdf"));
  await expect(page.locator("code").first()).toHaveText(/^[0-9a-f]{64}$/);
}

test("fluxo completo v1.2: distribuidora, sacado e financiador", async ({ page }, info) => {
  const p = info.project.name;

  // Landing e entrada sem senha.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("passaporte digital");
  await page.screenshot({ path: shots("00-landing", p), fullPage: true });
  await page.getByRole("link", { name: "Entrar como distribuidora" }).first().click();
  await expect(page.getByText("Nenhum recebível cadastrado")).toBeVisible();
  await expect(page.getByText("Backend conectado")).toBeVisible();
  await expect(page.getByTestId("role-chip")).toContainText("Distribuidora Demo");

  // Cadastro, com validação primeiro.
  await page.getByRole("link", { name: "Cadastrar o primeiro" }).click();
  await page.getByRole("button", { name: "Cadastrar recebível" }).click();
  await expect(page.getByText("Use um pseudônimo, sem CPF ou CNPJ.")).toBeVisible();
  await fillForm(page);
  await expect(page.getByLabel("Valor de face (R$)")).toHaveValue("150.000,00");
  await expect(page.getByText("Prazo: 165 dias")).toBeVisible();
  const browserHash = await page.locator("code").first().innerText();
  await page.getByRole("button", { name: "Cadastrar recebível" }).click();

  // Passaporte: registradora simulada e hash conferem.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("AGF-0001");
  await expect(page.getByText("REG-DEMO-000001").first()).toBeVisible();
  await expect(page.getByText(browserHash)).toBeVisible();
  await page.screenshot({ path: shots("01-passaporte-criado", p), fullPage: true });

  // Registro na Devnet.
  await page.getByRole("button", { name: "Registrar na Solana Devnet" }).click();
  await expect(page.getByText("Aguardando confirmação da rede")).toBeVisible();

  // Aceite do sacado por QR code / link.
  const step = page.getByTestId("debtor-step");
  await step.getByRole("button", { name: "Gerar QR code e link de aceite" }).click({ timeout: 15_000 });
  await expect(step.getByTestId("acceptance-qr")).toBeVisible();
  const link = await step.locator("code").first().innerText();
  expect(link).toMatch(/\/confirmar\/[A-Za-z0-9_-]+$/);
  await page.screenshot({ path: shots("02-aceite-qr", p), fullPage: true });

  const debtor = await page.context().newPage();
  await debtor.goto(link);
  await expect(debtor.getByRole("heading", { name: "Aceite de título (compra a prazo)" })).toBeVisible();
  await expect(debtor.getByText("REG-DEMO-000001")).toBeVisible();
  await expect(debtor.getByRole("link", { name: "Novo recebível" })).toHaveCount(0);
  await debtor.getByRole("button", { name: "Aceitar título" }).click();
  await expect(debtor.getByText("Aceite registrado")).toBeVisible();

  // Publicação com termo de coobrigação (o passaporte se atualiza sozinho).
  const publish = page.getByTestId("publish-step");
  await expect(publish.getByTestId("terms-text")).toContainText("SEM VALOR JURÍDICO", { timeout: 20_000 });
  const publishBtn = publish.getByRole("button", { name: "Publicar para financiadores" });
  await expect(publishBtn).toBeDisabled();
  await publish.getByLabel(/Li e aceito o termo de coobrigação/).check();
  await page.screenshot({ path: shots("03-publicacao", p), fullPage: true });
  await publishBtn.click();
  const proposals = page.getByTestId("proposals-panel");
  await expect(proposals.getByTestId("offer-card")).toHaveCount(2);
  await expect(page.getByTestId("onchain-records")).toBeVisible();

  // Financiador A analisa e propõe.
  const funder = await page.context().newPage();
  await funder.goto("/");
  await funder.getByRole("link", { name: "Entrar como financiador" }).first().click();
  await expect(funder.getByTestId("market-list")).toContainText("AGF-0001");
  await funder.screenshot({ path: shots("04-financiador-lista", p), fullPage: true });
  await funder.getByRole("link", { name: /AGF-0001/ }).click();
  await expect(funder.getByTestId("onchain-records")).toBeVisible();
  await funder.getByRole("button", { name: "Verificar na rede" }).click();
  await expect(funder.getByText("Tudo confere na Devnet")).toBeVisible();
  await funder.getByTestId("rate-input").fill("1,10");
  await funder.getByTestId("fees-input").fill("50,00");
  await expect(funder.getByTestId("yield-chart").first()).toBeVisible();
  await funder.screenshot({ path: shots("05-financiador-proposta", p), fullPage: true });
  await funder.getByRole("button", { name: "Enviar proposta" }).click();
  await expect(funder.getByText("Proposta enviada.")).toBeVisible();

  // A distribuidora vê a terceira proposta e aceita a do Financiador Demo A.
  await expect(proposals.getByTestId("offer-card")).toHaveCount(3, { timeout: 15_000 });
  const cardA = proposals.getByTestId("offer-card").filter({ hasText: "Financiador Demo A" });
  await cardA.getByRole("button", { name: "Aceitar proposta" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar aceite" }).click();

  // Cessão tokenizada + liquidação atômica.
  const as = page.getByTestId("assignment-step");
  await expect(as.getByTestId("assignment-notice")).toContainText("Não é oferta de investimento nem cessão jurídica");
  await as.getByRole("button", { name: "Formalizar cessão (simulação na Devnet)" }).click();
  const done = page.getByTestId("assigned-summary");
  await expect(done).toBeVisible({ timeout: 20_000 });
  await expect(done).toContainText("Financiador Demo A");
  await expect(done.getByTestId("payment-domicile")).toContainText("Financiador Demo A");

  // Prova de recusa de segunda venda.
  await done.getByRole("button", { name: "Tentar vender de novo (prova)" }).click();
  await expect(done.getByText("A Solana recusou a segunda venda")).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: shots("06-cessao-e-prova", p), fullPage: true });

  // Registros on-chain e verificação incluindo a cessão.
  await page.getByTestId("onchain-records").locator("summary").first().click();
  await expect(page.getByTestId("record-settle")).toBeVisible();
  await expect(page.getByTestId("record-lock")).toBeVisible();
  await expect(page.getByTestId("record-proof")).toBeVisible();
  await page.getByTestId("onchain-records").getByRole("button", { name: "Verificar na rede" }).click();
  await expect(page.getByText("Documento travado on-chain contra segunda cessão")).toBeVisible();

  // O sacado, reabrindo o link, vê para quem pagar.
  await debtor.reload();
  await expect(debtor.getByTestId("payment-domicile")).toContainText("Financiador Demo A");
  await debtor.close();

  // Carteira do financiador com gráfico de rendimento.
  await funder.goto("/financiador/carteira");
  await expect(funder.getByTestId("portfolio-list")).toContainText("AGF-0001");
  await expect(funder.getByTestId("yield-chart").first()).toBeVisible();
  await funder.getByTestId("ref-date").fill("60");
  await funder.screenshot({ path: shots("07-carteira", p), fullPage: true });

  // Transparência.
  await funder.getByRole("link", { name: "Transparência" }).click();
  await expect(funder.getByTestId("transparency")).toContainText("Financiador Demo A");
  await funder.screenshot({ path: shots("08-transparencia", p), fullPage: true });
  await funder.close();
});

test("registradora simulada recusa documento repetido", async ({ page }) => {
  await page.goto("/recebiveis/novo");
  await fillForm(page);
  await page.getByRole("button", { name: "Cadastrar recebível" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("AGF-0001");

  await page.goto("/recebiveis/novo");
  await fillForm(page);
  await page.getByRole("button", { name: "Cadastrar recebível" }).click();
  await expect(page.getByText("Documento já registrado")).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir AGF-0001" })).toBeVisible();
});

test("recusa do sacado permite gerar novo link; link antigo deixa de valer", async ({ page, request }) => {
  const fd = { data: JSON.stringify({ debtor: { alias: "Produtor Demo 05", state: "GO" }, product: { category: "seed", description: "Semente de milho (demo)" }, cropSeason: "2026/27", amountCents: 3_000_000, issueDate: "2026-10-01", dueDate: "2027-01-15", documentKind: "test_invoice" }), document: { name: "nf.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 teste") } };
  const created = await (await request.post(`${API}/receivables`, { multipart: fd })).json();
  await request.post(`${API}/receivables/${created.id}/register`);
  await expect.poll(async () => (await (await request.get(`${API}/receivables/${created.id}`)).json()).status, { timeout: 15_000 }).toBe("registered");

  // Sem aceite, não há publicação nem propostas.
  await page.goto(`/recebiveis/${created.id}/ofertas`);
  await expect(page.getByText("As propostas aparecem depois que o recebível é publicado.")).toBeVisible();

  await page.goto(`/recebiveis/${created.id}`);
  const step = page.getByTestId("debtor-step");
  await step.getByRole("button", { name: "Gerar QR code e link de aceite" }).click();
  const link = await step.locator("code").first().innerText();
  const debtor = await page.context().newPage();
  await debtor.goto(link);
  await debtor.getByRole("button", { name: "Não reconheço esta compra" }).click();
  await debtor.getByRole("button", { name: "Sim, recusar" }).click();
  await expect(debtor.getByText("Você recusou este título")).toBeVisible();

  await expect(step.getByText("O sacado recusou (simulação)")).toBeVisible({ timeout: 20_000 });
  await step.getByRole("button", { name: "Gerar novo link" }).click();
  await expect(step.getByText("Aguardando a resposta do sacado…")).toBeVisible();
  const newLink = await step.locator("code").first().innerText();
  expect(newLink).not.toBe(link);
  await debtor.goto(link);
  await expect(debtor.getByText("Link vencido ou substituído")).toBeVisible();
  await debtor.close();
});

test("versão em inglês", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("lang-en").click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("verifiable digital passport");
  await page.getByRole("link", { name: "Enter as funder" }).first().click();
  await expect(page.getByRole("heading", { name: "Available receivables" })).toBeVisible();
  // A escolha persiste ao navegar.
  await page.getByRole("link", { name: "Transparency" }).click();
  await expect(page.getByRole("heading", { name: "Transparency" })).toBeVisible();
});

test("recebível inexistente mostra erro claro", async ({ page }) => {
  await page.goto("/recebiveis/rcv_naoexiste");
  await expect(page.getByText("Recebível não encontrado").first()).toBeVisible();
});
