# AgroFlux — Contrato da API (v1.1)

> **Status:** v1.1, aprovada pela gestão em 09/10/2026 (a v1.0 é de 09/10/2026).
> As partes novas da v1.1 estão marcadas com **[v1.1]**.
> **Vale para:** frontend, backend e blockchain.
> **Regra de mudança:** nenhum campo, estado ou endpoint muda sem atualizar este arquivo e avisar as três frentes (ver §13).

---

## 1. Objetivo e limites do MVP

Este contrato define como o frontend e o backend conversam para demonstrar o fluxo:

1. Criar um recebível fictício com um documento de teste.
2. Calcular o hash SHA-256 do documento.
3. Registrar o recebível na **Solana Devnet**.
4. Exibir o passaporte digital com estado, histórico e assinatura verificável da transação.
5. Exibir ofertas de financiamento **simuladas**.
6. Selecionar uma oferta simulada e atualizar o histórico.

**[v1.1]** Duas funções novas, aprovadas pela gestão como escopo:

- **A) Confirmação do sacado (simulada):** o sacado recebe um link, vê um resumo mínimo e confirma ou recusa. A confirmação é registrada por memo na Devnet e é **obrigatória antes de selecionar uma oferta** (decisão G1).
- **B) Cessão tokenizada com liquidação em stablecoin de teste:** depois da seleção, o recebível vira um token Token-2022 e é "cedido" ao financiador simulado, contra `tBRL-DEMO`, numa liquidação **atômica** feita por um programa de escrow na Devnet.

Ordem do fluxo com a v1.1: cadastro → registro → **confirmação do sacado** → ofertas → seleção → **cessão tokenizada (opcional, atrás de feature flag)**.

**Fora do escopo:**

- Autenticação de usuários
- Mainnet
- Movimentação financeira (**[v1.1]** o `tBRL-DEMO` é uma moeda de teste da Devnet, sem valor e sem lastro)
- Validação jurídica do recebível e cessão jurídica (**[v1.1]** o token da cessão é ilustrativo)
- Verificação de identidade do sacado (**[v1.1]** a confirmação é simulada)
- Financiadores reais
- Edição ou exclusão de recebíveis

**Regras inegociáveis:**

| # | Regra |
|---|---|
| R1 | O backend é a fonte de verdade de todos os dados e estados. |
| R2 | Só vão para a blockchain **hashes e identificadores técnicos**. Nada de documentos, nomes, CPF, CNPJ ou valores. |
| R3 | Toda transação é assinada **somente no backend**. Nenhuma chave privada vai para o frontend ou para arquivos versionados. |
| R4 | Toda oferta é simulada (`isSimulated: true`), e a interface deve dizer isso de forma visível. |
| R5 | O frontend nunca exibe uma assinatura Solana que não tenha vindo do backend. |
| R6 | Nenhum texto apresenta o recebível como juridicamente validado ou o financiamento como garantido. |
| R7 | **[v1.1]** A liquidação só existe se for **atômica** (as duas pernas na mesma transação, pelo programa de escrow). Transferências separadas nunca são apresentadas como liquidação. Sem o escrow pronto, a função B não aparece. |
| R8 | **[v1.1]** Toda tela nova deixa claro: simulado, rede de testes, sem valor e sem validação jurídica. |

---

## 2. Convenções gerais

| Item | Convenção |
|---|---|
| URL base | `{API_URL}/api/v1`. Em desenvolvimento, `http://localhost:4000/api/v1`. |
| Formato | JSON UTF-8 (`Content-Type: application/json`), exceto o upload, que usa `multipart/form-data`. |
| Nomes de campos | `camelCase`, em inglês. |
| Valores de enums | `snake_case`, em inglês. Os rótulos em português ficam no frontend (§4.1). |
| Dinheiro | Inteiro em **centavos** (`amountCents: 1500000` = R$ 15.000,00), mais `currency: "BRL"`. Nunca usar float. |
| Taxas | Inteiro em **pontos-base** (`monthlyRateBps: 150` = 1,50% a.m.). |
| Data-hora | ISO 8601 em UTC, por exemplo `2026-10-09T14:32:10.123Z`. |
| Data (sem hora) | `YYYY-MM-DD`, por exemplo `2026-12-15`. |
| IDs | Strings opacas com prefixo: `rcv_`, `doc_`, `evt_`, `ofr_`. O frontend não deve interpretá-las. |
| Token de confirmação | **[v1.1]** String aleatória opaca (32 bytes em base64url). Só aparece na resposta que o gera; o backend guarda apenas o hash dela. |
| Código legível | `reference`, por exemplo `AGF-0001`, sequencial, para exibição. |
| Hash | SHA-256 em **hexadecimal minúsculo** (64 caracteres), calculado sobre os **bytes crus** do arquivo. |
| Autenticação | Nenhuma no MVP. |
| CORS | O backend libera a origem do frontend (`FRONTEND_ORIGIN`). |
| Idioma das mensagens | O campo `message` dos erros vem em português, pronto para exibir. |

---

## 3. Modelo de dados

### 3.1 `Receivable` (recebível)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id` | string | sim | `rcv_...` |
| `reference` | string | sim | Código legível, por exemplo `AGF-0001`. |
| `status` | `ReceivableStatus` | sim | Ver §4.1. |
| `isDemo` | `true` | sim | Sempre `true`. Todo recebível é fictício. |
| `distributor` | `{ name: string }` | sim | Distribuidor fictício. No MVP é fixo: `"Distribuidora Demo"`. |
| `debtor` | `Debtor` | sim | Sacado (comprador) **pseudonimizado**. |
| `product` | `Product` | sim | Insumo vendido. |
| `cropSeason` | string | sim | Safra no formato `AAAA/AA`, por exemplo `2026/27`. |
| `amountCents` | integer | sim | Valor de face. |
| `currency` | `"BRL"` | sim | |
| `issueDate` | date | sim | Data de emissão. |
| `dueDate` | date | sim | Data de vencimento. |
| `termDays` | integer | sim | Prazo em dias, calculado pelo backend (`dueDate - issueDate`). |
| `documents` | `Document[]` | sim | Pelo menos um. |
| `chain` | `ChainRecord` | sim | Registro na Devnet. Começa com `status: "none"`. |
| `events` | `Event[]` | sim | Histórico em ordem cronológica crescente. |
| `selectedOfferId` | string \| null | sim | `null` até uma oferta ser selecionada. |
| `debtorConfirmation` | `DebtorConfirmation` | sim | **[v1.1]** Ver §3.9. Começa com `status: "none"`. |
| `assignment` | `Assignment` | sim | **[v1.1]** Ver §3.10. Começa com `status: "none"`. |
| `createdAt` | datetime | sim | |
| `updatedAt` | datetime | sim | |

### 3.2 `Debtor` (sacado)

| Campo | Tipo | Descrição |
|---|---|---|
| `alias` | string | Pseudônimo, por exemplo `"Produtor Demo 01"`. Não pode ter nome real nem CPF/CNPJ (ver §8). |
| `state` | string | UF com 2 letras maiúsculas, por exemplo `"MT"`. |

### 3.3 `Product` (insumo)

| Campo | Tipo | Descrição |
|---|---|---|
| `category` | `"fertilizer" \| "crop_protection" \| "seed" \| "other"` | Rótulos: Fertilizante, Defensivo, Semente, Outro. |
| `description` | string | Texto livre curto, por exemplo `"Fertilizante NPK 20-05-20"`. |

### 3.4 `Document` (documento de teste)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | `doc_...` |
| `kind` | `"test_invoice" \| "test_contract" \| "other"` | Rótulos: Nota fiscal (teste), Contrato (teste), Outro. |
| `filename` | string | Nome original do arquivo. |
| `mimeType` | string | `application/pdf`, `image/png` ou `image/jpeg`. |
| `sizeBytes` | integer | Até 5 MB (5.242.880 bytes). |
| `sha256` | string | Hash calculado **pelo backend**. É o valor oficial. |
| `uploadedAt` | datetime | |

O arquivo fica guardado de forma privada no backend e **nunca** vai para a blockchain.

### 3.5 `ChainRecord` (registro na Solana)

| Campo | Tipo | Descrição |
|---|---|---|
| `status` | `ChainStatus` | Ver §4.2. |
| `cluster` | `"devnet"` | Sempre `devnet` no MVP. |
| `signature` | string \| null | Assinatura da transação (base58). Preenchida em `confirmed` e, se houver, em `failed`. |
| `slot` | integer \| null | Slot em que a transação foi confirmada. |
| `blockTime` | datetime \| null | Horário do bloco. |
| `explorerUrl` | string \| null | `https://explorer.solana.com/tx/{signature}?cluster=devnet` |
| `programId` | string \| null | Programa usado. No MVP é o SPL Memo: `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`. |
| `memo` | string \| null | Conteúdo exato gravado on-chain (ver §6). |
| `payloadHash` | string \| null | SHA-256 do payload canônico do recebível (ver §6.2). |
| `submittedAt` | datetime \| null | Quando o backend enviou a transação. |
| `confirmedAt` | datetime \| null | Quando a transação atingiu o commitment `confirmed`. |
| `error` | `{ code: ChainErrorCode, message: string }` \| null | Preenchido quando `status = "failed"`. |

### 3.6 `Event` (histórico)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | `evt_...` |
| `type` | `EventType` | Ver §4.3. |
| `occurredAt` | datetime | |
| `actor` | `"demo_user" \| "system"` | Quem originou o evento. |
| `description` | string | Texto em português, pronto para exibir, por exemplo `"Documento de teste anexado"`. |
| `onChain` | boolean | `true` só para eventos com transação Solana. |
| `chain` | `{ signature: string, explorerUrl: string }` \| null | Presente quando `onChain = true`. |
| `data` | object | Detalhes do evento (ver §4.3). Pode ser `{}`. |

### 3.7 `Offer` (oferta simulada)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | `ofr_...` |
| `receivableId` | string | |
| `isSimulated` | `true` | **Sempre** `true`. |
| `funder` | `{ name: string, type: FunderType }` | Financiador fictício, por exemplo `"Financiador Simulado A"`. |
| `grossAmountCents` | integer | Valor de face do recebível. |
| `monthlyRateBps` | integer | Taxa de desconto mensal simulada. |
| `feesCents` | integer | Tarifas simuladas. |
| `netAmountCents` | integer | Valor líquido simulado que o distribuidor receberia. |
| `termDays` | integer | Prazo usado no cálculo. |
| `status` | `"available" \| "selected" \| "unavailable"` | |
| `expiresAt` | datetime | Validade simulada. |

`FunderType`: `"simulated_fidc" | "simulated_bank" | "simulated_cooperative"`. Rótulos: FIDC (simulado), Banco (simulado), Cooperativa (simulada).

**Cálculo de referência das ofertas:**

```
discountCents  = round(grossAmountCents × (monthlyRateBps / 10000) × (termDays / 30))
netAmountCents = grossAmountCents − discountCents − feesCents
```

O backend gera **3 ofertas** determinísticas (mesma entrada, mesmas ofertas), com taxas entre 120 e 250 bps a.m. e tarifas entre R$ 50 e R$ 300. O cálculo é ilustrativo e não representa condições de mercado.

### 3.8 `ReceivableSummary` (item da lista do dashboard)

É um subconjunto de `Receivable`:

`id`, `reference`, `status`, `debtor`, `product`, `amountCents`, `currency`, `dueDate`, `chain.status`, `selectedOfferId`, `createdAt`.

**[v1.1]** Mais dois campos: `debtorConfirmation.status` e `assignment.status`.

### 3.9 `DebtorConfirmation` (confirmação do sacado) **[v1.1]**

Bloco independente do status principal.

| Campo | Tipo | Descrição |
|---|---|---|
| `status` | `DebtorConfirmationStatus` | Ver §4.5. |
| `isSimulated` | `true` | Sempre `true`. Não há verificação de identidade. |
| `requestedAt` | datetime \| null | Quando o último link foi gerado. |
| `expiresAt` | datetime \| null | Validade do último link (7 dias). |
| `respondedAt` | datetime \| null | Quando o sacado confirmou ou recusou. |
| `chain` | `{ status: "pending" \| "confirmed" \| "failed", signature: string \| null, explorerUrl: string \| null, memo: string \| null, confirmationHash: string \| null, error: { code: ChainErrorCode, message: string } \| null }` \| null | Registro on-chain da confirmação (§6.3). `null` até o sacado confirmar. Uma recusa não vai on-chain. |

O token do link **não** faz parte deste bloco (ver §5.10).

### 3.10 `Assignment` (cessão tokenizada) **[v1.1]**

| Campo | Tipo | Descrição |
|---|---|---|
| `status` | `AssignmentStatus` | Ver §4.6. |
| `isSimulated` | `true` | Sempre `true`. Não é cessão jurídica nem oferta de investimento. |
| `cluster` | `"devnet"` | |
| `offerId` | string \| null | Oferta simulada usada na liquidação. |
| `tokenMint` | string \| null | Mint Token-2022 do recebível (supply 1, decimals 0). |
| `settlementMint` | string \| null | Mint do `tBRL-DEMO`. |
| `settlementAsset` | `"tBRL-DEMO"` | Moeda de teste com 2 casas decimais. |
| `settlementAmount` | integer \| null | Valor liquidado na menor unidade do `tBRL-DEMO`. Igual ao `netAmountCents` da oferta selecionada (2 casas decimais, então 1 unidade = 1 centavo de tBRL). |
| `distributorWallet` | string \| null | Chave pública da carteira de demonstração "distribuidor demo" (controlada pelo backend). |
| `funderWallet` | string \| null | Chave pública da carteira de demonstração "financiador demo" (controlada pelo backend). |
| `escrowProgramId` | string \| null | Programa Anchor de escrow. |
| `mintSignature` | string \| null | Transação que criou o token da cessão. |
| `settlementSignature` | string \| null | Transação atômica da liquidação. |
| `explorerUrls` | `{ tokenMint: string \| null, mint: string \| null, settlement: string \| null }` | Links do Explorer (`?cluster=devnet`). |
| `submittedAt` | datetime \| null | |
| `settledAt` | datetime \| null | |
| `error` | `{ code: AssignmentErrorCode, message: string }` \| null | Preenchido quando `status = "failed"`. |

---

## 4. Estados

### 4.1 `ReceivableStatus`

| Código | Rótulo (pt-BR) | Significado |
|---|---|---|
| `created` | Cadastrado | Salvo no backend, ainda não registrado na Devnet. |
| `registration_pending` | Registro pendente | Transação enviada, aguardando confirmação. |
| `registered` | Registrado na Devnet | Transação confirmada. Ofertas simuladas liberadas. |
| `registration_failed` | Falha no registro | A transação falhou. Pode tentar de novo. |
| `offer_selected` | Oferta simulada selecionada | Fim do fluxo principal da demonstração. |
| `assignment_pending` | Cessão em liquidação | **[v1.1]** Transação de cessão enviada, aguardando confirmação. |
| `assigned` | Cessão tokenizada (simulada) | **[v1.1]** Liquidação atômica confirmada na Devnet. |
| `assignment_failed` | Falha na cessão | **[v1.1]** A liquidação falhou por inteiro (nenhuma perna aconteceu). Pode tentar de novo. |

**Transições permitidas (só o backend muda o estado):**

```
created ──register──▶ registration_pending ──confirma──▶ registered ──select──▶ offer_selected
                              │
                              └──falha/timeout──▶ registration_failed ──register──▶ registration_pending
```

**[v1.1]** Continuação, depois de `offer_selected`:

```
offer_selected ──assignment──▶ assignment_pending ──liquida──▶ assigned
                                      │
                                      └──falha/timeout──▶ assignment_failed ──assignment──▶ assignment_pending
```

**[v1.1]** O `select` passa a exigir `debtorConfirmation.status = "confirmed"` **e** `debtorConfirmation.chain.status = "confirmed"` (decisão G1). Sem isso, a resposta é `409 DEBTOR_CONFIRMATION_REQUIRED`.

Qualquer outra transição responde `409 INVALID_STATE`.

### 4.2 `ChainStatus`

| Código | Rótulo | Correspondência |
|---|---|---|
| `none` | Não registrado | `created` |
| `pending` | Aguardando confirmação | `registration_pending` |
| `confirmed` | Confirmado | `registered`, `offer_selected` e **[v1.1]** os três estados da cessão |
| `failed` | Falhou | `registration_failed` |

### 4.3 `EventType`

| Código | Quando | `onChain` | `data` |
|---|---|---|---|
| `receivable_created` | `POST /receivables` concluído | false | `{ reference }` |
| `document_attached` | Documento salvo | false | `{ documentId, sha256, filename }` |
| `chain_registration_requested` | `POST /register` aceito | false | `{ payloadHash }` |
| `chain_registration_confirmed` | Transação confirmada | **true** | `{ signature, slot }` |
| `chain_registration_failed` | Falha ou timeout | false | `{ code, message }` |
| `offers_generated` | Primeira consulta de ofertas | false | `{ offerIds: string[] }` |
| `offer_selected` | Oferta simulada escolhida | false | `{ offerId, funderName, netAmountCents }` |
| `debtor_confirmation_requested` | **[v1.1]** Link de confirmação gerado | false | `{ expiresAt }` |
| `debtor_confirmed` | **[v1.1]** Memo da confirmação confirmado na Devnet | **true** | `{ signature, confirmationHash }` |
| `debtor_confirmation_chain_failed` | **[v1.1]** Falha ao registrar a confirmação on-chain | false | `{ code, message }` |
| `debtor_declined` | **[v1.1]** Sacado recusou | false | `{}` |
| `assignment_requested` | **[v1.1]** `POST /assignment` aceito | false | `{ offerId, settlementAmount }` |
| `assignment_token_minted` | **[v1.1]** Token da cessão criado | **true** | `{ tokenMint, signature }` |
| `assignment_settled` | **[v1.1]** Liquidação atômica confirmada | **true** | `{ signature, settlementAmount, settlementAsset }` |
| `assignment_failed` | **[v1.1]** Falha na cessão | false | `{ code, message }` |

> **Decisão D3:** no MVP, só o registro do recebível vai on-chain. A seleção de oferta fica só no histórico off-chain, porque é simulada e gravá-la na blockchain sugeriria uma operação real.

### 4.4 Códigos de erro on-chain (`ChainErrorCode`)

| Código | Significado | Mensagem sugerida |
|---|---|---|
| `INSUFFICIENT_FUNDS` | A carteira pagadora da Devnet está sem SOL. | "A carteira de demonstração está sem saldo na Devnet." |
| `RPC_UNAVAILABLE` | O RPC da Devnet não respondeu. | "A rede Solana Devnet não respondeu. Tente novamente." |
| `TIMEOUT` | Não confirmou em 60 s. | "A confirmação demorou mais que o esperado. Tente novamente." |
| `TX_FAILED` | A transação foi rejeitada. | "A transação foi rejeitada pela rede." |

### 4.5 `DebtorConfirmationStatus` **[v1.1]**

| Código | Rótulo (pt-BR) | Significado |
|---|---|---|
| `none` | Confirmação não solicitada | Estado inicial. |
| `requested` | Aguardando o sacado | Há um link válido. |
| `confirmed` | Confirmado pelo sacado (simulado) | O sacado confirmou. O registro on-chain fica em `chain.status`. |
| `declined` | Recusado pelo sacado (simulado) | O sacado recusou. |

Regras:

- Pedir o link é permitido quando o recebível está `registered` e a confirmação está `none`, `requested` ou `declined`.
- Pedir de novo gera um link novo e invalida o anterior. Isso cobre link perdido, link expirado e uma nova tentativa depois de uma recusa.
- Depois de `confirmed`, não há volta.

### 4.6 `AssignmentStatus` **[v1.1]**

| Código | Rótulo | Correspondência |
|---|---|---|
| `none` | Sem cessão | até `offer_selected` |
| `pending` | Em liquidação | `assignment_pending` |
| `settled` | Liquidada (simulação) | `assigned` |
| `failed` | Falhou | `assignment_failed` |

### 4.7 Códigos de erro da cessão (`AssignmentErrorCode`) **[v1.1]**

Incluem os quatro códigos do §4.4, mais:

| Código | Significado | Mensagem sugerida |
|---|---|---|
| `INSUFFICIENT_TEST_TOKENS` | A carteira "financiador demo" não tem `tBRL-DEMO` suficiente. | "A carteira de demonstração do financiador não tem tBRL-DEMO suficiente." |
| `ESCROW_REJECTED` | O programa de escrow recusou a liquidação (termos divergentes). | "O programa de liquidação recusou a operação. Nenhuma transferência foi feita." |

---

## 5. Endpoints

Resumo:

| Método | Rota | Uso | Sucesso |
|---|---|---|---|
| GET | `/health` | Saúde da API e da Devnet | 200 |
| GET | `/receivables` | Dashboard | 200 |
| POST | `/receivables` | Cadastro + documento | 201 |
| GET | `/receivables/:id` | Passaporte digital | 200 |
| POST | `/receivables/:id/register` | Registrar na Devnet | 202 |
| GET | `/receivables/:id/verification` | Verificar a transação na rede | 200 |
| GET | `/receivables/:id/offers` | Ofertas simuladas | 200 |
| POST | `/receivables/:id/offers/:offerId/select` | Selecionar oferta simulada | 200 |
| POST | `/demo/reset` | Reiniciar dados da demo (só com `DEMO_RESET_ENABLED=true`) | 204 |
| POST | `/receivables/:id/debtor-confirmation` | **[v1.1]** Gerar link de confirmação do sacado | 201 |
| GET | `/confirmations/:token` | **[v1.1]** Resumo mínimo para o sacado | 200 |
| POST | `/confirmations/:token/confirm` | **[v1.1]** Sacado confirma | 202 |
| POST | `/confirmations/:token/decline` | **[v1.1]** Sacado recusa | 200 |
| POST | `/receivables/:id/debtor-confirmation/register` | **[v1.1]** Repetir o registro on-chain da confirmação que falhou | 202 |
| POST | `/receivables/:id/assignment` | **[v1.1]** Formalizar a cessão tokenizada (só com `ASSIGNMENT_ENABLED=true`) | 202 |

### 5.1 `GET /health`

```json
200
{
  "status": "ok",
  "version": "1.0.0",
  "cluster": "devnet",
  "solana": { "reachable": true, "feePayerBalanceLamports": 1999995000 }
}
```

O frontend usa este endpoint para mostrar "Backend conectado / indisponível" e avisar quando a carteira da Devnet está sem saldo.

**[v1.1]** Campo novo: `"features": { "debtorConfirmation": true, "assignment": false }`. Assim, o frontend sabe se a cessão está ligada no backend (`ASSIGNMENT_ENABLED`). A versão passa a `1.1.0`.

### 5.2 `GET /receivables`

Lista em ordem de `createdAt` decrescente. Não há paginação no MVP (máximo de 100 itens).

```json
200
{
  "items": [
    {
      "id": "rcv_01J9Z3K7Q2",
      "reference": "AGF-0001",
      "status": "registered",
      "debtor": { "alias": "Produtor Demo 01", "state": "MT" },
      "product": { "category": "fertilizer", "description": "Fertilizante NPK 20-05-20" },
      "amountCents": 15000000,
      "currency": "BRL",
      "dueDate": "2027-03-15",
      "chain": { "status": "confirmed" },
      "selectedOfferId": null,
      "createdAt": "2026-10-09T14:30:00.000Z"
    }
  ],
  "totals": {
    "count": 1,
    "amountCents": 15000000,
    "registeredCount": 1,
    "pendingCount": 0,
    "offerSelectedCount": 0
  }
}
```

`registeredCount` conta `registered` + `offer_selected`. **[v1.1]** Também conta os três estados da cessão. Totais novos: `debtorConfirmedCount` e `assignedCount`.

### 5.3 `POST /receivables`

`multipart/form-data` com duas partes:

| Parte | Tipo | Conteúdo |
|---|---|---|
| `data` | texto (JSON) | `CreateReceivableInput` |
| `document` | arquivo | PDF, PNG ou JPEG, até 5 MB |

Cabeçalho opcional: `X-Client-Sha256: <hash calculado no navegador>`. Se vier e for diferente do hash calculado pelo backend, a resposta é `422 HASH_MISMATCH` e nada é salvo.

`CreateReceivableInput`:

```json
{
  "debtor": { "alias": "Produtor Demo 01", "state": "MT" },
  "product": { "category": "fertilizer", "description": "Fertilizante NPK 20-05-20" },
  "cropSeason": "2026/27",
  "amountCents": 15000000,
  "issueDate": "2026-10-09",
  "dueDate": "2027-03-15",
  "documentKind": "test_invoice"
}
```

Resposta `201` com o `Receivable` completo (§7). Gera os eventos `receivable_created` e `document_attached`.

Erros: `422 VALIDATION_ERROR` (com `fieldErrors`), `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_FILE_TYPE`, `422 HASH_MISMATCH`.

### 5.4 `GET /receivables/:id`

Resposta `200` com o `Receivable` completo. Erro: `404 NOT_FOUND`.

### 5.5 `POST /receivables/:id/register`

Corpo vazio. Cabeçalho recomendado: `Idempotency-Key: <uuid>`. Um clique duplo com a mesma chave não cria uma segunda transação.

Permitido quando `status` é `created` ou `registration_failed`.

```json
202
{
  "receivable": { "...": "Receivable com status registration_pending e chain.status pending" }
}
```

O backend envia a transação de forma assíncrona e atualiza o recebível para `registered` ou `registration_failed`.

- **Commitment:** `confirmed`.
- **Prazo máximo:** 60 s. Depois disso, `registration_failed` com `TIMEOUT`.

Erros:

- `409 INVALID_STATE`: já está pendente, registrado ou com oferta selecionada.
- `503 CHAIN_UNAVAILABLE`: o RPC está fora antes mesmo do envio. Nesse caso o estado não muda.

**Polling no frontend:** enquanto `status = registration_pending`, o frontend chama `GET /receivables/:id` a cada 2 s, por no máximo 75 s. Depois disso, mostra "Ainda aguardando confirmação" com um botão de atualizar.

### 5.6 `GET /receivables/:id/verification`

O backend busca a transação na Devnet pela `signature` e compara com os dados guardados. É o que sustenta o "verificável" na demo.

```json
200
{
  "verified": true,
  "checkedAt": "2026-10-09T14:35:00.000Z",
  "signature": "5Kx...",
  "checks": [
    { "name": "transaction_found",    "passed": true, "label": "Transação encontrada na Devnet" },
    { "name": "memo_matches",         "passed": true, "label": "Conteúdo on-chain igual ao registrado" },
    { "name": "document_hash_matches","passed": true, "label": "Hash do documento confere" },
    { "name": "payload_hash_matches", "passed": true, "label": "Hash dos dados do recebível confere" }
  ]
}
```

Erros:

- `409 INVALID_STATE`: ainda não há transação confirmada.
- `503 CHAIN_UNAVAILABLE`: não deu para consultar a rede. O frontend mostra "Não foi possível verificar agora".

### 5.7 `GET /receivables/:id/offers`

Permitido quando `status` é `registered` ou `offer_selected`. Na primeira chamada o backend gera as ofertas e o evento `offers_generated`. Nas seguintes, devolve as mesmas.

```json
200
{
  "isSimulated": true,
  "disclaimer": "Ofertas fictícias geradas para demonstração. Não há financiador real, proposta vinculante ou movimentação financeira.",
  "items": [
    {
      "id": "ofr_01J9Z4A1",
      "receivableId": "rcv_01J9Z3K7Q2",
      "isSimulated": true,
      "funder": { "name": "Financiador Simulado A", "type": "simulated_fidc" },
      "grossAmountCents": 15000000,
      "monthlyRateBps": 150,
      "feesCents": 15000,
      "netAmountCents": 13807500,
      "termDays": 157,
      "status": "available",
      "expiresAt": "2026-10-16T14:31:00.000Z"
    }
  ]
}
```

Erro: `409 INVALID_STATE` (o recebível ainda não está registrado).

O frontend **deve** exibir o `disclaimer` e um selo "Simulação" em cada card.

**[v1.1]** As ofertas continuam visíveis a partir de `registered`, mesmo sem a confirmação do sacado. Assim, a tela pode mostrar as condições e indicar que falta a confirmação. Só a **seleção** exige a confirmação (§5.8).

### 5.8 `POST /receivables/:id/offers/:offerId/select`

Corpo vazio. Permitido quando `status = registered` e a oferta está `available`.

**[v1.1]** Também exige `debtorConfirmation.status = "confirmed"` e `debtorConfirmation.chain.status = "confirmed"` (decisão G1).

Resposta `200` com o `Receivable` completo:

- `status` vira `offer_selected`.
- `selectedOfferId` passa a ter o id da oferta.
- Entra o evento `offer_selected`.
- As outras ofertas passam a `unavailable`.

Idempotente: selecionar de novo a **mesma** oferta devolve `200` sem criar outro evento.

Erros:

- `404 NOT_FOUND`
- `409 OFFER_ALREADY_SELECTED`: já existe outra oferta selecionada.
- `409 INVALID_STATE`
- **[v1.1]** `409 DEBTOR_CONFIRMATION_REQUIRED`: falta a confirmação do sacado, ou o registro on-chain dela ainda não foi confirmado.

### 5.9 `POST /demo/reset`

Só existe com `DEMO_RESET_ENABLED=true`. Apaga os recebíveis e recria 2 exemplos:

- um `registered`, com uma transação Devnet real criada no seed;
- um `created`.

Isso deixa a demo reproduzível. Responde `204`.

**[v1.1]** Os exemplos continuam os mesmos, com `debtorConfirmation` e `assignment` em `none`. Na demo, a confirmação e a cessão são feitas ao vivo.

### 5.10 `POST /receivables/:id/debtor-confirmation` **[v1.1]**

Corpo vazio. Permitido quando `status = registered` e a confirmação está `none`, `requested` ou `declined` (§4.5).

```json
201
{
  "token": "Zk3...base64url",
  "confirmationPath": "/confirmar/Zk3...base64url",
  "expiresAt": "2026-10-17T14:40:00.000Z",
  "receivable": { "...": "Receivable com debtorConfirmation.status = requested" }
}
```

- O frontend monta o link completo com a própria origem: `window.location.origin + confirmationPath`. O backend não precisa saber a URL do frontend.
- O token só aparece nesta resposta. O backend guarda só o hash, e um novo pedido invalida o link anterior.
- Gera o evento `debtor_confirmation_requested`.

Erros: `404 NOT_FOUND`, `409 INVALID_STATE`.

### 5.11 `GET /confirmations/:token` **[v1.1]**

Resumo mínimo, para a página pública `/confirmar/[token]`. Não leva o documento, o pseudônimo, a UF nem os ids internos.

```json
200
{
  "isSimulated": true,
  "disclaimer": "Simulação — sem verificação de identidade do sacado.",
  "reference": "AGF-0001",
  "distributor": { "name": "Distribuidora Demo" },
  "product": { "category": "fertilizer", "description": "Fertilizante NPK 20-05-20" },
  "amountCents": 15000000,
  "currency": "BRL",
  "dueDate": "2027-03-15",
  "status": "requested",
  "expiresAt": "2026-10-17T14:40:00.000Z"
}
```

`status` mostra o estado atual. Se o sacado já respondeu, a página exibe o resultado em vez dos botões.

Erros:

- `404 NOT_FOUND`: token desconhecido.
- `410 CONFIRMATION_LINK_EXPIRED`: link vencido ou substituído por um mais novo.

### 5.12 `POST /confirmations/:token/confirm` e `/decline` **[v1.1]**

Corpo vazio. Uso único: o token é consumido na primeira resposta.

- **`confirm` → `202`**, com o mesmo resumo do §5.11 e `status: "confirmed"`. No `Receivable`, `debtorConfirmation.status` vira `confirmed` e `chain.status` vira `pending`. O backend envia o memo (§6.3) de forma assíncrona, com as mesmas regras do §5.5 (commitment `confirmed`, 60 s). Ao confirmar, entra o evento `debtor_confirmed` (`onChain: true`). Se falhar, `chain.status` vira `failed` e entra o evento `debtor_confirmation_chain_failed`.
- **`decline` → `200`**, com `status: "declined"`. Entra o evento `debtor_declined`. A recusa não vai on-chain.

Erros: `404 NOT_FOUND`, `410 CONFIRMATION_LINK_EXPIRED`, `409 CONFIRMATION_ALREADY_ANSWERED` (o link já foi usado).

### 5.13 `POST /receivables/:id/debtor-confirmation/register` **[v1.1]**

Repete o registro on-chain de uma confirmação cujo `chain.status` está `failed`. Corpo vazio e `Idempotency-Key` recomendada, com as mesmas regras do §5.5. Responde `202` com o `Receivable`.

Erros: `409 INVALID_STATE` (não há confirmação com registro falho) e `503 CHAIN_UNAVAILABLE`.

### 5.14 `POST /receivables/:id/assignment` **[v1.1]**

Só existe com `ASSIGNMENT_ENABLED=true` no backend; sem isso, responde `404`. Corpo vazio e `Idempotency-Key` recomendada.

Permitido quando `status` é `offer_selected` ou `assignment_failed`.

```json
202
{ "receivable": { "...": "Receivable com status assignment_pending e assignment.status pending" } }
```

O backend faz, de forma assíncrona:

1. Se ainda não existir, cria o token da cessão (Token-2022) na carteira "distribuidor demo". Evento `assignment_token_minted`.
2. Executa a **liquidação atômica** pelo programa de escrow (§6.4). Evento `assignment_settled`.

Uma nova tentativa reaproveita o token já criado. A liquidação nunca fica pela metade: se a transação falhar, nenhuma das duas pernas acontece.

**Polling no frontend:** o mesmo do §5.5, enquanto `status = assignment_pending`.

Erros: `409 INVALID_STATE`, `503 CHAIN_UNAVAILABLE`.

---

## 6. Registro on-chain (Solana Devnet)

### 6.1 Transação

- **Rede:** Devnet (`https://api.devnet.solana.com` ou o RPC definido em `SOLANA_RPC_URL`).
- **Programa:** SPL Memo (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`). Uma instrução de memo por recebível.
- **Pagador e signatário:** uma carteira de demonstração do backend. A chave fica em `SOLANA_FEE_PAYER_SECRET` (variável de ambiente, fora do git).
- **Commitment:** `confirmed`.

### 6.2 Conteúdo do memo

JSON compacto, sem espaços e com as chaves nesta ordem:

```json
{"app":"agroflux","v":1,"evt":"receivable_registered","rid":"rcv_01J9Z3K7Q2","doc":"<sha256 do documento>","ph":"<payloadHash>"}
```

`payloadHash` é o SHA-256 (hex minúsculo) do **payload canônico**: um JSON com as chaves em ordem alfabética, sem espaços, com estes campos e nada mais:

```json
{"amountCents":15000000,"cropSeason":"2026/27","currency":"BRL","documentSha256":"<sha256>","dueDate":"2027-03-15","id":"rcv_01J9Z3K7Q2","issueDate":"2026-10-09","productCategory":"fertilizer"}
```

O memo não leva nomes, pseudônimos, UF nem valores em texto aberto. O valor entra apenas dentro do hash.

### 6.3 Memo da confirmação do sacado **[v1.1]**

Mesmo programa, mesma carteira e mesmo commitment do §6.1. JSON compacto, com as chaves nesta ordem:

```json
{"app":"agroflux","v":1,"evt":"debtor_confirmed","rid":"rcv_01J9Z3K7Q2","ch":"<confirmationHash>"}
```

`confirmationHash` é o SHA-256 (hex minúsculo) deste payload canônico, com as chaves em ordem alfabética e sem espaços:

```json
{"confirmedAt":"2026-10-10T13:02:11.000Z","receivableId":"rcv_01J9Z3K7Q2","receivablePayloadHash":"<chain.payloadHash do registro>","response":"confirmed"}
```

O `receivablePayloadHash` liga a confirmação aos dados que foram registrados. O `GET /verification` (§5.6) ganha a checagem `debtor_confirmation_matches` ("Confirmação do sacado confere on-chain") quando houver confirmação registrada.

### 6.4 Cessão tokenizada e liquidação atômica **[v1.1]**

Preparação, feita uma vez por script do backend. As secrets ficam só no `.env`.

- Carteiras de demonstração "distribuidor demo" e "financiador demo", controladas pelo backend.
- Mint de teste `tBRL-DEMO` (2 casas decimais), com saldo de teste para o financiador demo. Nunca USDC de mainnet nem valor real.
- Deploy do programa Anchor de escrow na Devnet (`ESCROW_PROGRAM_ID` no `.env`).

Por recebível:

- **Token da cessão:** Token-2022 com supply 1, decimals 0 e uma mint por recebível. Depois de emitido, a autoridade de mint é removida. Os metadados (extensão de metadata) levam só `name: "AgroFlux <reference>"`, `symbol: "AGFX"` e o campo adicional `payloadHash`. Nada de nomes, valores em texto aberto ou dados pessoais.
- **Liquidação:** uma única transação chama o programa de escrow, que, na mesma instrução:
  1. confere os termos (mint do token da cessão, mint do `tBRL-DEMO`, valor, carteiras);
  2. transfere o token da cessão do distribuidor demo para o financiador demo;
  3. transfere `settlementAmount` de `tBRL-DEMO` do financiador demo para o distribuidor demo.

  Se qualquer passo falhar, a transação inteira é revertida.
- **Testes obrigatórios do programa:** o caminho feliz e o caso de falha (por exemplo, financiador sem saldo), provando que nenhuma perna acontece.

A interface mostra a faixa fixa: "Simulação em rede de testes. Token e moeda sem valor. Não é oferta de investimento nem cessão jurídica. Uma operação real exigiria adequação às regras da CVM e registro do título em registradora." Ela também diz que as carteiras do distribuidor e do financiador são de demonstração, controladas pelo backend.

---

## 7. Exemplo completo de `Receivable`

```json
{
  "id": "rcv_01J9Z3K7Q2",
  "reference": "AGF-0001",
  "status": "registered",
  "isDemo": true,
  "distributor": { "name": "Distribuidora Demo" },
  "debtor": { "alias": "Produtor Demo 01", "state": "MT" },
  "product": { "category": "fertilizer", "description": "Fertilizante NPK 20-05-20" },
  "cropSeason": "2026/27",
  "amountCents": 15000000,
  "currency": "BRL",
  "issueDate": "2026-10-09",
  "dueDate": "2027-03-15",
  "termDays": 157,
  "documents": [
    {
      "id": "doc_01J9Z3K8AB",
      "kind": "test_invoice",
      "filename": "nf-teste-001.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 48213,
      "sha256": "9f2c1e...e4a7",
      "uploadedAt": "2026-10-09T14:30:00.000Z"
    }
  ],
  "chain": {
    "status": "confirmed",
    "cluster": "devnet",
    "signature": "5KxP...q9Zt",
    "slot": 312456789,
    "blockTime": "2026-10-09T14:30:21.000Z",
    "explorerUrl": "https://explorer.solana.com/tx/5KxP...q9Zt?cluster=devnet",
    "programId": "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
    "memo": "{\"app\":\"agroflux\",\"v\":1,\"evt\":\"receivable_registered\",\"rid\":\"rcv_01J9Z3K7Q2\",\"doc\":\"9f2c1e...e4a7\",\"ph\":\"a81b...07cd\"}",
    "payloadHash": "a81b...07cd",
    "submittedAt": "2026-10-09T14:30:18.000Z",
    "confirmedAt": "2026-10-09T14:30:21.400Z",
    "error": null
  },
  "events": [
    { "id": "evt_1", "type": "receivable_created", "occurredAt": "2026-10-09T14:30:00.000Z", "actor": "demo_user", "description": "Recebível AGF-0001 cadastrado", "onChain": false, "chain": null, "data": { "reference": "AGF-0001" } },
    { "id": "evt_2", "type": "document_attached", "occurredAt": "2026-10-09T14:30:00.100Z", "actor": "demo_user", "description": "Documento de teste anexado", "onChain": false, "chain": null, "data": { "documentId": "doc_01J9Z3K8AB", "sha256": "9f2c1e...e4a7", "filename": "nf-teste-001.pdf" } },
    { "id": "evt_3", "type": "chain_registration_requested", "occurredAt": "2026-10-09T14:30:18.000Z", "actor": "demo_user", "description": "Registro na Solana Devnet solicitado", "onChain": false, "chain": null, "data": { "payloadHash": "a81b...07cd" } },
    { "id": "evt_4", "type": "chain_registration_confirmed", "occurredAt": "2026-10-09T14:30:21.400Z", "actor": "system", "description": "Registro confirmado na Solana Devnet", "onChain": true, "chain": { "signature": "5KxP...q9Zt", "explorerUrl": "https://explorer.solana.com/tx/5KxP...q9Zt?cluster=devnet" }, "data": { "signature": "5KxP...q9Zt", "slot": 312456789 } }
  ],
  "selectedOfferId": null,
  "createdAt": "2026-10-09T14:30:00.000Z",
  "updatedAt": "2026-10-09T14:30:21.400Z"
}
```

---

## 8. Validação (backend valida; frontend repete para dar retorno imediato)

| Campo | Regra | Mensagem |
|---|---|---|
| `debtor.alias` | 2 a 60 caracteres. Não pode ter sequência de 11 ou mais dígitos (bloqueia CPF/CNPJ). | "Use um pseudônimo, sem CPF ou CNPJ." |
| `debtor.state` | Uma das 27 UFs. | "Selecione uma UF válida." |
| `product.category` | Um valor do enum. | "Selecione a categoria do insumo." |
| `product.description` | 3 a 120 caracteres. | "Descreva o insumo (3 a 120 caracteres)." |
| `cropSeason` | `^\d{4}/\d{2}$`, e o segundo ano é o primeiro + 1. | "Use o formato 2026/27." |
| `amountCents` | Inteiro de 100000 (R$ 1.000) até 1000000000 (R$ 10 milhões). | "Informe um valor entre R$ 1.000 e R$ 10.000.000." |
| `issueDate` | Data válida, no máximo hoje. | "A emissão não pode ser futura." |
| `dueDate` | De 15 a 720 dias depois de `issueDate`. | "O vencimento deve ficar entre 15 e 720 dias após a emissão." |
| `documentKind` | Um valor do enum. | "Selecione o tipo de documento." |
| `document` | PDF, PNG ou JPEG, até 5 MB, obrigatório. | "Envie um PDF, PNG ou JPEG de até 5 MB." |

---

## 9. Erros

Todo erro segue este envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Alguns campos precisam de ajuste.",
    "fieldErrors": { "dueDate": "O vencimento deve ficar entre 15 e 720 dias após a emissão." },
    "details": {}
  }
}
```

| HTTP | `code` | Quando |
|---|---|---|
| 400 | `BAD_REQUEST` | JSON malformado ou parte `data` ausente. |
| 404 | `NOT_FOUND` | Recebível ou oferta não existe. |
| 409 | `INVALID_STATE` | Ação não permitida no estado atual. |
| 409 | `OFFER_ALREADY_SELECTED` | Já existe outra oferta selecionada. |
| 413 | `FILE_TOO_LARGE` | Arquivo acima de 5 MB. |
| 415 | `UNSUPPORTED_FILE_TYPE` | Tipo de arquivo fora da lista. |
| 422 | `VALIDATION_ERROR` | Regras do §8. Inclui `fieldErrors`. |
| 422 | `HASH_MISMATCH` | O `X-Client-Sha256` não bate com o hash do backend. |
| 503 | `CHAIN_UNAVAILABLE` | RPC da Devnet indisponível. |
| 409 | `DEBTOR_CONFIRMATION_REQUIRED` | **[v1.1]** Seleção de oferta sem a confirmação do sacado registrada. |
| 409 | `CONFIRMATION_ALREADY_ANSWERED` | **[v1.1]** O link de confirmação já foi usado. |
| 410 | `CONFIRMATION_LINK_EXPIRED` | **[v1.1]** Link vencido ou substituído. |
| 500 | `INTERNAL_ERROR` | Erro inesperado. A mensagem é genérica, sem detalhes internos. |

---

## 10. Segurança e privacidade

- **Chave da Devnet:** só em variável de ambiente no backend. `.env` fica no `.gitignore`, e o repositório inclui um `.env.example` sem valores.
- **Nada sensível on-chain:** sem documentos, nomes, CPF, CNPJ ou valores em texto aberto. Só hashes e ids (§6.2).
- **Arquivos:** guardados de forma privada no backend. Não existe URL pública de download no MVP.
- **Dados:** todos os recebíveis são fictícios (`isDemo: true`), e o seed usa apenas pseudônimos.
- **Logs:** o backend não registra a chave nem o conteúdo dos documentos.
- **[v1.1] Link de confirmação:** token aleatório de 32 bytes, guardado só como hash, de uso único e válido por 7 dias. Os logs não registram o token.
- **[v1.1] Carteiras da cessão:** as secrets do distribuidor demo, do financiador demo e da autoridade do `tBRL-DEMO` ficam só no `.env` do backend.

---

## 11. Responsabilidades

| Item | Frontend | Backend | Blockchain |
|---|---|---|---|
| Telas, estados de carregamento/erro/pendência, textos | ● | | |
| Hash no navegador (prévia + `X-Client-Sha256`) | ● | | |
| Validação e fonte de verdade dos dados | | ● | |
| Armazenamento de documentos e hash oficial | | ● | |
| Máquina de estados e histórico de eventos | | ● | |
| Montagem do memo e do payload canônico | | ● | ● |
| Envio, confirmação e consulta de transações | | | ● |
| Carteira Devnet com saldo (airdrop/faucet) | | | ● |
| Endpoint de verificação | | ● | ● |
| Geração das ofertas simuladas | | ● | |
| **[v1.1]** Página `/confirmar/[token]`, cards da confirmação e da cessão, feature flag | ● | | |
| **[v1.1]** Link de confirmação, máquinas de estado, eventos e payloads canônicos | | ● | |
| **[v1.1]** Memo da confirmação, mint Token-2022, mint `tBRL-DEMO`, programa de escrow e testes | | ● | ● |

---

## 12. Modo mock do frontend (somente desenvolvimento)

Enquanto a API não estiver pronta, o frontend pode rodar com `NEXT_PUBLIC_API_MODE=mock`. Nesse modo:

- Os dados seguem exatamente este contrato (mesmos tipos e estados).
- Uma faixa visível mostra **"Modo mock — backend não conectado"**.
- **Nenhuma assinatura Solana é exibida.** O registro fica em "Aguardando backend" e nunca chega a `confirmed`.
- Atrasos e erros são simulados para testar os estados da tela.
- O build de produção recusa o modo mock.
- **[v1.1]** O mock simula o link e a resposta do sacado, mas **nunca** gera assinatura, mint ou liquidação. A confirmação fica em "Aguardando registro (backend)" e a cessão não chega a `settled`.

---

## 13. Decisões registradas

| # | Decisão |
|---|---|
| D1 | Monorepo `agroflux/` com `frontend/`, `backend/` e `docs/`. |
| D2 | SPL Memo em vez de um programa próprio: menos risco e prazo menor. |
| D3 | Só o registro do recebível vai on-chain. A seleção de oferta fica off-chain. |
| D4 | Valores em centavos e taxas em pontos-base, sempre inteiros. |
| D5 | Assinatura e envio de transações exclusivamente no backend. |
| D6 | Sem autenticação no MVP. Usuário único "demo". |
| D7 | Enums em inglês, rótulos em português no frontend. |
| D8 | **[v1.1]** Confirmação do sacado obrigatória antes da seleção de oferta (G1 da gestão). |
| D9 | **[v1.1]** A recusa do sacado não vai on-chain; só a confirmação vai, por memo. |
| D10 | **[v1.1]** O link de confirmação pode ser gerado de novo (invalida o anterior), inclusive depois de uma recusa. |
| D11 | **[v1.1]** Liquidação atômica por um programa Anchor de escrow; sem ele, a função B fica desligada (`ASSIGNMENT_ENABLED` / `NEXT_PUBLIC_FEATURE_ASSIGNMENT`). |
| D12 | **[v1.1]** O código do programa de escrow fica numa pasta nova, `blockchain/`, no monorepo (amplia a D1). |

**Processo de mudança:** qualquer alteração neste arquivo exige três passos:

1. Abrir um PR ou avisar no canal da equipe.
2. Ter o OK da gestão do projeto.
3. Atualizar o número da versão e o histórico abaixo.

## 14. Histórico

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 09/10/2026 | Versão inicial. |
| 1.1 | 09/10/2026 | Aprovada pela gestão. Confirmação do sacado (§3.9, §4.5, §5.10–5.13, §6.3), cessão tokenizada (§3.10, §4.6, §4.7, §5.14, §6.4), confirmação obrigatória antes da seleção (G1), `features` no health e novos totais. |
