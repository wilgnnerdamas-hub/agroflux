# Novas funções aprovadas pela gestão (base para o contrato v1.1)

> **Status:** aprovadas pela gestão em 09/10/2026 como escopo. O **contrato v1.1 ainda não foi escrito**.
> Nada daqui deve ser implementado antes da proposta do contrato v1.1 e do OK da gestão.

Funções:

- **A)** Confirmação do sacado (simulada).
- **B)** Tokenização da cessão do recebível, com liquidação em stablecoin de teste na Solana Devnet.

## Pré-condição

O fluxo principal precisa funcionar de ponta a ponta com o backend real e a Devnet real:
cadastro → hash → registro por memo → passaporte verificável → ofertas simuladas → seleção.
**Situação:** validado em 09/10 (ver checklist em `decisoes-e-dependencias.md`).

## Passo 1: contrato v1.1 (fazer primeiro e PARAR para aprovação)

Propor a versão 1.1 em `docs/api-contract.md`, compatível com a v1.0, atualizando os §13 e §14.
Depois de escrever, **parar** e mostrar à gestão o diff do contrato e a lista de arquivos a alterar.

### A) Confirmação do sacado

- Novo bloco no `Receivable`, independente do status principal:
  `debtorConfirmation: { status: "none"|"requested"|"confirmed"|"declined", isSimulated: true, requestedAt, respondedAt, chain: { signature, explorerUrl } | null }`
- Permitido quando `status = "registered"`.
- **Decisão em aberto:** a confirmação precisa estar `confirmed` antes de selecionar uma oferta? É preciso propor uma resposta e perguntar à gestão.
- Endpoints:
  - `POST /receivables/:id/debtor-confirmation`: gera um link com token aleatório, de uso único e válido por 7 dias.
  - `GET /confirmations/:token`: resumo mínimo (referência, insumo, valor, vencimento, distribuidor), sem o documento.
  - `POST /confirmations/:token/confirm` e `POST /confirmations/:token/decline`.
- Eventos: `debtor_confirmation_requested`, `debtor_confirmed` (`onChain: true`) e `debtor_declined`.
- On-chain: memo SPL no mesmo padrão do §6:
  `{"app":"agroflux","v":1,"evt":"debtor_confirmed","rid":"<id>","ch":"<sha256 do payload canônico da confirmação>"}`
- Interface:
  - Página pública `/confirmar/[token]`, pensada para celular, com o aviso "Simulação — sem verificação de identidade do sacado".
  - No passaporte, o selo "Confirmado pelo sacado (simulado)".

### B) Tokenização da cessão + liquidação

- Disponível somente depois de `status = "offer_selected"`.
- Nova máquina de estados: `offer_selected → assignment_pending → assigned | assignment_failed`, com nova tentativa.
- Novo bloco no `Receivable`:
  `assignment: { status: "none"|"pending"|"settled"|"failed", isSimulated: true, cluster: "devnet", tokenMint, settlementSignature, explorerUrls, settlementAmount (inteiro), settlementAsset: "tBRL-DEMO", error }`
- Endpoint: `POST /receivables/:id/assignment` responde `202`, com polling igual ao do §5.5.
- Desenho on-chain:
  - **Token da cessão:** Token-2022, supply 1, decimals 0, uma mint por recebível. Os metadados levam só a referência e o `payloadHash`, sem nomes, valores em texto aberto ou dados pessoais.
  - **Stablecoin:** uma mint de TESTE própria na Devnet, `tBRL-DEMO`, com 2 decimais. Nunca USDC de mainnet nem valor real.
  - **Liquidação ATÔMICA** por um programa Anchor de escrow. Na MESMA transação, o token da cessão vai do distribuidor para o financiador e o `tBRL-DEMO` vai do financiador para o distribuidor. Ou as duas pernas acontecem, ou nenhuma.
  - As carteiras "distribuidor demo" e "financiador demo" são carteiras de demonstração controladas pelo backend, e a interface precisa dizer isso.
  - O valor liquidado é o `netAmountCents` da oferta simulada selecionada.
- Interface:
  - Botão "Formalizar cessão (simulação na Devnet)".
  - Card "Cessão tokenizada" com o mint, a assinatura da liquidação e links para o Explorer.
  - Faixa fixa: "Simulação em rede de testes. Token e moeda sem valor. Não é oferta de investimento nem cessão jurídica. Uma operação real exigiria adequação às regras da CVM e registro do título em registradora."

## Passo 2: implementação (só depois da aprovação do v1.1)

Em incrementos pequenos. Ao fim de cada um: build, lint e testes, e um resumo curto do que mudou, do que foi testado e do que falta.

- **Frontend:**
  - Tipos e rótulos, cliente da API e modo mock. O mock **nunca** gera assinatura, mint ou liquidação.
  - Página `/confirmar/[token]`, cards e estados de carregando, sucesso, erro e pendência.
  - e2e atualizados no dublê `tests/fake-backend.mjs`, com as assinaturas marcadas como FAKE.
- **Backend:** endpoints, máquina de estados, eventos, link de confirmação, payloads canônicos e idempotência.
- **Blockchain:**
  - Memo da confirmação, mint Token-2022 e mint `tBRL-DEMO`.
  - Programa Anchor de escrow com testes, incluindo o caso de falha (a liquidação não pode ficar pela metade).
  - Deploy na Devnet.

## Regras inegociáveis

1. Nada de documentos ou dados pessoais on-chain.
2. Nenhuma chave privada no frontend ou no git. Keypairs e program IDs sensíveis ficam só no `.env`.
3. Nada de "liquidação" feita com transferências separadas e não atômicas apresentada como liquidação. Se o programa de escrow não estiver pronto, a função NÃO aparece na demo.
4. Toda tela nova deixa claro: simulado, rede de testes, sem valor e sem validação jurídica.
5. Não criar uma API alternativa para contornar uma integração incompleta.
6. Registrar as decisões em `docs/decisoes-e-dependencias.md` e atualizar os "Próximos passos" do `CLAUDE.md`.

## Prazos e cortes

- **10/10:** fluxo principal funcionando (obrigatório).
- **11/10 até 12h:** confirmação do sacado pronta e testada.
- **11/10 até 18h:** tokenização e liquidação atômica na Devnet. Se não estiver estável até lá, a função sai da demo (feature flag `NEXT_PUBLIC_FEATURE_ASSIGNMENT=false`), a gestão é avisada e o tema vira roadmap no pitch.
- **12/10:** só correções críticas e submissão.

## Riscos conhecidos (09/10)

- **Ferramental da função B não instalado:** não há Rust, Solana CLI nem Anchor nesta máquina. Existe WSL 2 com Ubuntu, que é o caminho recomendado para o Anchor no Windows. Instalar e configurar consome horas, então isso começa cedo.
- **Programa Anchor:** é o item de maior risco técnico (escrita, testes e deploy). O corte das 18h de 11/10 existe por causa dele.
