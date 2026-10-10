import { test, expect } from "@playwright/test";
import path from "node:path";

const shots = (name: string, project: string) => `test-results/screens/${project}-${name}.png`;

test.beforeEach(async ({ request }) => {
  await request.post("http://localhost:4010/api/v1/__reset");
});

test("fluxo completo da demonstração", async ({ page }, info) => {
  const p = info.project.name;

  // Dashboard vazio
  await page.goto("/");
  await expect(page.getByText("Nenhum recebível cadastrado")).toBeVisible();
  await expect(page.getByText("Backend conectado")).toBeVisible();
  await page.screenshot({ path: shots("01-dashboard-vazio", p), fullPage: true });

  // Cadastro: validação primeiro
  await page.getByRole("link", { name: "Cadastrar o primeiro" }).click();
  await expect(page.getByRole("heading", { name: "Novo recebível" })).toBeVisible();
  await page.getByRole("button", { name: "Cadastrar recebível" }).click();
  await expect(page.getByText("Use um pseudônimo, sem CPF ou CNPJ.")).toBeVisible();

  await page.getByLabel("Sacado (pseudônimo)").fill("Produtor Demo 03");
  await page.getByLabel("UF do sacado").selectOption("MT");
  await page.getByLabel("Categoria do insumo").selectOption("fertilizer");
  await page.getByLabel("Descrição do insumo").fill("Fertilizante NPK 20-05-20");
  await page.getByLabel("Valor de face (R$)").fill("15000000");
  await expect(page.getByLabel("Valor de face (R$)")).toHaveValue("150.000,00");
  await page.getByLabel("Emissão").fill("2026-10-01");
  await page.getByLabel("Vencimento").fill("2027-03-15");
  await expect(page.getByText("Prazo: 165 dias")).toBeVisible();
  await page.getByTestId("document-input").setInputFiles(path.join(__dirname, "fixtures/nf-teste.pdf"));
  await expect(page.locator("code").first()).toHaveText(/^[0-9a-f]{64}$/);
  const browserHash = await page.locator("code").first().innerText();
  await page.screenshot({ path: shots("02-cadastro", p), fullPage: true });
  await page.getByRole("button", { name: "Cadastrar recebível" }).click();

  // Passaporte criado
  await expect(page.getByText("Recebível cadastrado", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("AGF-0001");
  await expect(page.getByText(browserHash)).toBeVisible(); // hash do backend confere com o do navegador
  await page.screenshot({ path: shots("03-passaporte-criado", p), fullPage: true });

  // Registro na Devnet: pendente -> confirmado
  await page.getByRole("button", { name: "Registrar na Solana Devnet" }).click();
  await expect(page.getByText("Aguardando confirmação da rede")).toBeVisible();
  await page.screenshot({ path: shots("04-registro-pendente", p), fullPage: true });
  await expect(page.getByText("Assinatura da transação")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: /Ver no Solana Explorer/ })).toHaveAttribute("href", /cluster=devnet/);
  await page.getByRole("button", { name: "Verificar na rede" }).click();
  await expect(page.getByText("Registro verificado na Devnet")).toBeVisible();
  await page.screenshot({ path: shots("05-registrado-verificado", p), fullPage: true });

  // v1.1: confirmação do sacado, obrigatória antes da seleção (G1)
  const dcCard = page.getByTestId("debtor-confirmation-card");
  await expect(dcCard.getByText("Confirmação não solicitada")).toBeVisible();
  await page.getByRole("button", { name: "Gerar link de confirmação" }).click();
  await expect(dcCard.getByText("Aguardando a resposta do sacado…")).toBeVisible();
  const link = await dcCard.locator("code").first().innerText();
  expect(link).toMatch(/\/confirmar\/[A-Za-z0-9_-]+$/);
  await page.screenshot({ path: shots("05b-link-confirmacao", p), fullPage: true });

  // O sacado abre o link no próprio aparelho (outra aba, sem a navegação da distribuidora).
  const debtor = await page.context().newPage();
  await debtor.goto(link);
  await expect(debtor.getByText("Simulação — sem verificação de identidade do sacado.")).toBeVisible();
  await expect(debtor.getByRole("heading", { name: "Confirmação de compra a prazo" })).toBeVisible();
  await expect(debtor.getByRole("link", { name: "Novo recebível" })).toHaveCount(0);
  await expect(debtor.getByText("R$ 150.000,00")).toBeVisible();
  await debtor.screenshot({ path: shots("05c-sacado", p), fullPage: true });
  await debtor.getByRole("button", { name: "Confirmar compra" }).click();
  await expect(debtor.getByText("Confirmação registrada")).toBeVisible();
  await debtor.screenshot({ path: shots("05d-sacado-confirmou", p), fullPage: true });
  await debtor.close();

  // O passaporte se atualiza sozinho com a confirmação registrada on-chain.
  await expect(dcCard.getByText("Assinatura da confirmação")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Confirmação do sacado registrada na Solana Devnet (simulação)")).toBeVisible();
  await page.screenshot({ path: shots("05e-sacado-confirmado", p), fullPage: true });

  // Ofertas simuladas
  await page.getByRole("link", { name: "Ver ofertas simuladas" }).first().click();
  await expect(page.getByText("Simulação — ofertas fictícias, sem movimentação financeira")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.screenshot({ path: shots("06-ofertas", p), fullPage: true });
  await page.getByRole("button", { name: "Selecionar esta simulação" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: shots("07-confirmacao", p) });
  await page.getByRole("button", { name: "Confirmar seleção" }).click();

  // Passaporte atualizado
  await expect(page.getByText("A escolha foi registrada no histórico da demonstração.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Oferta simulada selecionada", exact: true })).toBeVisible();
  await expect(page.getByText(/Oferta simulada de Financiador Simulado A selecionada/)).toBeVisible();
  await page.screenshot({ path: shots("08-final", p), fullPage: true });

  // v1.1, função B: cessão tokenizada + liquidação atômica (atrás de NEXT_PUBLIC_FEATURE_ASSIGNMENT)
  const asCard = page.getByTestId("assignment-card");
  await expect(asCard.getByTestId("assignment-notice")).toContainText("Não é oferta de investimento nem cessão jurídica");
  await expect(asCard.getByText("carteiras de demonstração, controladas pelo backend")).toBeVisible();
  await asCard.getByRole("button", { name: "Formalizar cessão (simulação na Devnet)" }).click();
  await expect(asCard.getByText("Assinatura da liquidação atômica")).toBeVisible({ timeout: 20_000 });
  await expect(asCard.getByText(/tBRL-DEMO/).first()).toBeVisible();
  await expect(asCard.getByRole("link", { name: /Ver liquidação no Solana Explorer/ })).toBeVisible();
  await expect(page.getByText("Liquidação atômica confirmada na Solana Devnet (simulação, tBRL-DEMO sem valor)")).toBeVisible();
  await expect(page.getByText("Cessão liquidada").first()).toBeVisible();
  await page.screenshot({ path: shots("08b-cessao", p), fullPage: true });

  // Dashboard reflete o estado
  await page.getByRole("link", { name: "Recebíveis" }).first().click();
  await expect(page.getByText("AGF-0001").filter({ visible: true }).first()).toBeVisible();
  await page.screenshot({ path: shots("09-dashboard", p), fullPage: true });
});

test("recebível inexistente mostra erro claro", async ({ page }) => {
  await page.goto("/recebiveis/rcv_naoexiste");
  await expect(page.getByText("Recebível não encontrado").first()).toBeVisible();
});

test("G1: sem confirmação a seleção fica bloqueada; recusa permite gerar novo link", async ({ page, request }) => {
  // Prepara um recebível registrado direto pela API do dublê.
  const fd = { data: JSON.stringify({ debtor: { alias: "Produtor Demo 05", state: "GO" }, product: { category: "seed", description: "Semente de milho (demo)" }, cropSeason: "2026/27", amountCents: 3_000_000, issueDate: "2026-10-01", dueDate: "2027-01-15", documentKind: "test_invoice" }), document: { name: "nf.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 teste") } };
  const created = await (await request.post("http://localhost:4010/api/v1/receivables", { multipart: fd })).json();
  await request.post(`http://localhost:4010/api/v1/receivables/${created.id}/register`);
  await expect.poll(async () => (await (await request.get(`http://localhost:4010/api/v1/receivables/${created.id}`)).json()).status, { timeout: 15_000 }).toBe("registered");

  // Ofertas visíveis, seleção bloqueada.
  await page.goto(`/recebiveis/${created.id}/ofertas`);
  await expect(page.getByText("Falta a confirmação do sacado")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(3);
  for (const b of await page.getByRole("button", { name: "Selecionar esta simulação" }).all()) await expect(b).toBeDisabled();

  // Recusa pelo sacado.
  await page.goto(`/recebiveis/${created.id}`);
  await page.getByRole("button", { name: "Gerar link de confirmação" }).click();
  const card = page.getByTestId("debtor-confirmation-card");
  const link = await card.locator("code").first().innerText();
  const debtor = await page.context().newPage();
  await debtor.goto(link);
  await debtor.getByRole("button", { name: "Não reconheço esta compra" }).click();
  await debtor.getByRole("button", { name: "Sim, recusar" }).click();
  await expect(debtor.getByText("Você recusou este recebível")).toBeVisible();

  // O link usado mostra o resultado, e o passaporte permite gerar outro.
  await debtor.reload();
  await expect(debtor.getByText("Você recusou este recebível")).toBeVisible();
  await expect(card.getByText("O sacado recusou (simulação)")).toBeVisible({ timeout: 20_000 });
  await card.getByRole("button", { name: "Gerar novo link" }).click();
  await expect(card.getByText("Aguardando a resposta do sacado…")).toBeVisible();
  const newLink = await card.locator("code").first().innerText();
  expect(newLink).not.toBe(link);

  // O link antigo deixou de valer.
  await debtor.goto(link);
  await expect(debtor.getByText("Link vencido ou substituído")).toBeVisible();
  await debtor.close();
});
