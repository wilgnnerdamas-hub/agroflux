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
  // Avisos da demo concentrados na faixa fixa e no painel "Sobre a demo".
  await expect(page.getByTestId("demo-strip")).toContainText("dados e valores simulados");
  await page.getByRole("button", { name: "Sobre a demo" }).click();
  await expect(page.getByTestId("about-drawer")).toContainText("regras da CVM");
  await page.getByRole("button", { name: "Fechar" }).click();
  await expect(page.getByTestId("about-drawer")).toHaveCount(0);
  await page.getByRole("link", { name: "Entrar como distribuidora" }).first().click();
  await expect(page.getByText("Nenhum recebível cadastrado")).toBeVisible();
  await expect(page.getByText("Backend conectado")).toBeVisible();
  await expect(page.getByTestId("role-chip")).toContainText("Distribuidora Demo");

  // Cadastro, com validação primeiro.
  await page.getByRole("link", { name: "Cadastrar o primeiro" }).click();
  await expect(page.getByTestId("passport-preview")).toContainText("Rascunho");
  await page.getByRole("button", { name: /^Faltam \d+ itens$/ }).click();
  await expect(page.getByText("Use um pseudônimo, sem CPF ou CNPJ.")).toBeVisible();
  await fillForm(page);
  await expect(page.getByLabel("Valor de face (R$)")).toHaveValue("150.000,00");
  await expect(page.getByText("165 dias · dentro do limite")).toBeVisible();
  await expect(page.getByTestId("passport-preview")).toContainText("Pronto para cadastrar");
  await page.screenshot({ path: shots("00b-novo-recebivel", p), fullPage: true });
  const browserHash = await page.locator("code").first().innerText();
  await page.getByRole("button", { name: "Cadastrar recebível" }).click();

  // Passaporte: registradora simulada e hash conferem.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("AGF-0001");
  await expect(page.getByText("REG-DEMO-000001").first()).toBeVisible();
  await expect(page.getByTestId("risk-card")).toBeVisible();
  await expect(page.locator(`code[title="${browserHash}"]`)).toBeVisible();
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
  await expect(funder.getByTestId("risk-card")).toBeVisible();
  await funder.getByTestId("rate-input").fill("1,50");
  await funder.getByTestId("fees-input").fill("50,00");
  await expect(funder.getByTestId("quote-preview")).toContainText("a.a.");
  await expect(funder.getByTestId("yield-chart").first()).toBeVisible();
  await funder.screenshot({ path: shots("05-financiador-proposta", p), fullPage: true });
  await funder.getByRole("button", { name: "Enviar proposta" }).click();
  await expect(funder.getByText("Proposta enviada.")).toBeVisible();

  // A distribuidora vê a terceira proposta e aceita a do Financiador Demo A.
  await expect(proposals.getByTestId("offer-card")).toHaveCount(3, { timeout: 15_000 });
  await expect(proposals.getByTestId("offer-card").filter({ hasText: "Financiador Demo A" })).toContainText("FIDC (simulado)");
  await page.screenshot({ path: shots("05b-propostas", p), fullPage: true });
  const cardA = proposals.getByTestId("offer-card").filter({ hasText: "Financiador Demo A" });
  await cardA.getByRole("button", { name: "Aceitar proposta" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar aceite" }).click();

  // Cessão tokenizada + liquidação atômica.
  const as = page.getByTestId("assignment-step");
  await as.getByRole("button", { name: "Formalizar cessão (Devnet)" }).click();
  const done = page.getByTestId("assigned-summary");
  await expect(done).toBeVisible({ timeout: 20_000 });
  await expect(done).toContainText("Financiador Demo A");
  await expect(done.getByTestId("payment-domicile")).toContainText("Financiador Demo A");

  // Prova de recusa de segunda venda.
  await done.getByRole("button", { name: "Tentar vender de novo (prova)" }).click();
  await expect(done.getByText("A Solana recusou a segunda venda")).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: shots("06-cessao-e-prova", p), fullPage: true });

  const passportUrl = page.url();

  // Registros on-chain e verificação incluindo a cessão.
  await page.getByTestId("onchain-records").locator("summary").first().click();
  await expect(page.getByTestId("record-settle")).toBeVisible();
  await expect(page.getByTestId("record-lock")).toBeVisible();
  await expect(page.getByTestId("record-proof")).toBeVisible();
  await page.getByTestId("onchain-records").getByRole("button", { name: "Verificar na rede" }).click();
  await expect(page.getByText("Documento travado on-chain contra segunda cessão")).toBeVisible();

  // Painel: o próximo passo mostra que acabou.
  await page.getByRole("link", { name: "Recebíveis" }).first().click();
  await expect(page.getByText("Ver passaporte").filter({ visible: true }).first()).toBeVisible();
  await page.getByTestId("filter-assigned").click();
  await expect(page.getByTestId("receivable-row").filter({ visible: true })).toHaveCount(1);
  await page.getByTestId("view-board").click();
  await expect(page.getByTestId("board")).toContainText("AGF-0001");
  await page.getByTestId("view-list").click();
  await page.screenshot({ path: shots("06b-painel", p), fullPage: true });

  // Verificador público: o mesmo documento aparece como já cedido, com a trava on-chain.
  await page.goto("/verificar");
  await page.getByTestId("verify-input").setInputFiles(path.join(__dirname, "fixtures/nf-teste.pdf"));
  await expect(page.getByTestId("verify-verdict")).toContainText("Já cedido");
  await expect(page.getByTestId("verify-result")).toContainText("AGF-0001");
  await expect(page.getByTestId("verify-lock")).toContainText("Existe");

  // O sacado, reabrindo o link, vê para quem pagar.
  await debtor.reload();
  await expect(debtor.getByTestId("payment-domicile")).toContainText("Financiador Demo A");
  await debtor.close();

  // Carteira do financiador com gráfico de rendimento.
  await funder.goto("/financiador/carteira");
  await expect(funder.getByTestId("portfolio-list")).toContainText("AGF-0001");
  await expect(funder.getByTestId("yield-chart").first()).toBeVisible();
  // Escopo pelo chip (refletido na URL) e data pelo teclado na curva.
  await funder.getByTestId("scope-AGF-0001").click();
  await expect(funder).toHaveURL(/pos=AGF-0001/);
  await expect(funder.getByTestId("scope-label")).toContainText("AGF-0001");
  await funder.getByTestId("yield-chart").focus();
  await funder.keyboard.press("Shift+ArrowRight");
  await expect(funder.getByTestId("value-label")).toContainText("Valor em");
  await funder.keyboard.press("Home");
  await expect(funder.getByTestId("value-label")).toHaveText("Valor hoje");
  await funder.screenshot({ path: shots("07-carteira", p), fullPage: true });

  // Painel AgroFlux: a receita da cessão aparece no faturamento.
  await funder.goto("/");
  await funder.getByTestId("enter-admin").click();
  await expect(funder.getByTestId("rating-mix")).toBeVisible();
  await funder.getByTestId("tab-revenue").click();
  await expect(funder.getByTestId("revenue-entry").filter({ visible: true }).first()).toContainText("AGF-0001");
  await expect(funder).toHaveURL(/aba=faturamento/);
  await funder.screenshot({ path: shots("07b-admin-faturamento", p), fullPage: true });

  // Transparência.
  await funder.getByRole("link", { name: "Transparência" }).click();
  await expect(funder.getByTestId("transparency")).toContainText("Financiador Demo A");
  await funder.screenshot({ path: shots("08-transparencia", p), fullPage: true });
  await funder.close();

  // Pagamento no vencimento (simulado): face ao financiador e token baixado; o verificador mostra a quitação.
  await page.goto(passportUrl);
  await page.getByRole("button", { name: "Simular pagamento do sacado" }).click();
  await expect(page.getByTestId("maturity-payment")).toContainText("Título quitado", { timeout: 20_000 });
  await page.goto("/verificar");
  await page.getByTestId("verify-input").setInputFiles(path.join(__dirname, "fixtures/nf-teste.pdf"));
  await expect(page.getByTestId("verify-result")).toContainText("Pagamento no vencimento");
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

test("painel mostra próximo passo e proposta nova", async ({ page, request }) => {
  const fd = { data: JSON.stringify({ debtor: { alias: "Produtor Demo 06", state: "PR" }, product: { category: "seed", description: "Semente (demo)" }, cropSeason: "2026/27", amountCents: 5_000_000, issueDate: "2026-10-01", dueDate: "2027-02-15", documentKind: "test_invoice" }), document: { name: "nf.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 painel") } };
  const r = await (await request.post(`${API}/receivables`, { multipart: fd })).json();
  await request.post(`${API}/receivables/${r.id}/register`);
  await expect.poll(async () => (await (await request.get(`${API}/receivables/${r.id}`)).json()).status, { timeout: 15_000 }).toBe("registered");
  const link = await (await request.post(`${API}/receivables/${r.id}/debtor-confirmation`)).json();
  await request.post(`${API}/confirmations/${link.token}/confirm`);
  await expect.poll(async () => (await (await request.get(`${API}/receivables/${r.id}`)).json()).debtorConfirmation.chain?.status, { timeout: 15_000 }).toBe("confirmed");
  await request.post(`${API}/receivables/${r.id}/publish`, { data: { acceptTerms: true, termsVersion: "coobrigacao-demo-v1" } });

  await page.goto("/distribuidor");
  const row = page.getByText("Escolher proposta (2)").filter({ visible: true });
  await expect(row).toBeVisible();
  await expect(page.getByText("nova").filter({ visible: true }).first()).toBeVisible();

  // Ao abrir o passaporte, as propostas contam como vistas; uma nova proposta volta a acender o selo.
  await page.goto(`/recebiveis/${r.id}`);
  await expect(page.getByTestId("offer-card")).toHaveCount(2);
  await page.goto("/distribuidor");
  await expect(page.getByText("Escolher proposta (2)").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("nova").filter({ visible: true })).toHaveCount(0);
  await request.post(`${API}/receivables/${r.id}/offers`, { data: { funderId: "fnd_a", spreadBps: 300, feesCents: 0 } });
  await expect(page.getByText("Escolher proposta (3)").filter({ visible: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("nova").filter({ visible: true }).first()).toBeVisible();
});

test("distribuidoras demo e configurações do painel", async ({ page }) => {
  // Entrar como a Cerrado Insumos e cadastrar: o recebível é dela e não aparece para a Distribuidora Demo.
  await page.goto("/");
  await page.getByTestId("enter-dst_b").click();
  await expect(page.getByTestId("role-chip")).toContainText("Cerrado Insumos");
  await page.goto("/recebiveis/novo");
  await fillForm(page);
  await page.getByRole("button", { name: "Cadastrar recebível" }).click();
  await expect(page.getByText("Cerrado Insumos (demo)").filter({ visible: true }).first()).toBeVisible();
  await page.goto("/distribuidor");
  await expect(page.getByText("AGF-0001").filter({ visible: true })).toBeVisible();
  await page.goto("/");
  await page.getByTestId("enter-dst_a").click();
  await expect(page.getByText("Nenhum recebível cadastrado")).toBeVisible();

  // Painel: taxa da AgroFlux configurável.
  await page.goto("/admin?aba=configuracoes");
  // Origem do CDI (segmentado) e IOF (switch) marcam alterações não salvas.
  await page.getByTestId("cdi-source-bcb").click();
  await expect(page.getByTestId("unsaved-bar")).toContainText("1 alteração não salva");
  await page.getByTestId("cdi-source-manual").click();
  await expect(page.getByTestId("unsaved-bar")).toHaveCount(0);
  await expect(page.getByTestId("iof-simulated_bank")).toHaveAttribute("aria-checked", "true");
  const fee = page.getByTestId("platform-fee-input");
  await fee.fill("0,80");
  await fee.blur();
  await page.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(page.getByText("Configurações salvas")).toBeVisible();
  await page.getByTestId("tab-distributors").click();
  await expect(page.getByText("Cerrado Insumos (demo)")).toBeVisible();
});
