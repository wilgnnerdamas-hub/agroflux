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

  // Dashboard reflete o estado
  await page.getByRole("link", { name: "Recebíveis" }).first().click();
  await expect(page.getByText("AGF-0001").filter({ visible: true }).first()).toBeVisible();
  await page.screenshot({ path: shots("09-dashboard", p), fullPage: true });
});

test("recebível inexistente mostra erro claro", async ({ page }) => {
  await page.goto("/recebiveis/rcv_naoexiste");
  await expect(page.getByText("Recebível não encontrado").first()).toBeVisible();
});
