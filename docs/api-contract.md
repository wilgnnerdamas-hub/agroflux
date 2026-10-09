# AgroFlux — Contrato da API (v1.0)

> **Status:** v1.0, definida pela gestão do projeto em 09/10/2026.
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

**Fora do escopo:**

- Autenticação de usuários
- Mainnet
- Movimentação financeira
- Validação jurídica do recebível
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

---

## 4. Estados

### 4.1 `ReceivableStatus`

| Código | Rótulo (pt-BR) | Significado |
|---|---|---|
| `created` | Cadastrado | Salvo no backend, ainda não registrado na Devnet. |
| `registration_pending` | Registro pendente | Transação enviada, aguardando confirmação. |
| `registered` | Registrado na Devnet | Transação confirmada. Ofertas simuladas liberadas. |
| `registration_failed` | Falha no registro | A transação falhou. Pode tentar de novo. |
| `offer_selected` | Oferta simulada selecionada | Fim do fluxo da demonstração. |

**Transições permitidas (só o backend muda o estado):**

```
created ──register──▶ registration_pending ──confirma──▶ registered ──select──▶ offer_selected
                              │
                              └──falha/timeout──▶ registration_failed ──register──▶ registration_pending
```

Qualquer outra transição responde `409 INVALID_STATE`.

### 4.2 `ChainStatus`

| Código | Rótulo | Correspondência |
|---|---|---|
| `none` | Não registrado | `created` |
| `pending` | Aguardando confirmação | `registration_pending` |
| `confirmed` | Confirmado | `registered` e `offer_selected` |
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

> **Decisão D3:** no MVP, só o registro do recebível vai on-chain. A seleção de oferta fica só no histórico off-chain, porque é simulada e gravá-la na blockchain sugeriria uma operação real.

### 4.4 Códigos de erro on-chain (`ChainErrorCode`)

| Código | Significado | Mensagem sugerida |
|---|---|---|
| `INSUFFICIENT_FUNDS` | A carteira pagadora da Devnet está sem SOL. | "A carteira de demonstração está sem saldo na Devnet." |
| `RPC_UNAVAILABLE` | O RPC da Devnet não respondeu. | "A rede Solana Devnet não respondeu. Tente novamente." |
| `TIMEOUT` | Não confirmou em 60 s. | "A confirmação demorou mais que o esperado. Tente novamente." |
| `TX_FAILED` | A transação foi rejeitada. | "A transação foi rejeitada pela rede." |

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

`registeredCount` conta `registered` + `offer_selected`.

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

### 5.8 `POST /receivables/:id/offers/:offerId/select`

Corpo vazio. Permitido quando `status = registered` e a oferta está `available`.

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

### 5.9 `POST /demo/reset`

Só existe com `DEMO_RESET_ENABLED=true`. Apaga os recebíveis e recria 2 exemplos:

- um `registered`, com uma transação Devnet real criada no seed;
- um `created`.

Isso deixa a demo reproduzível. Responde `204`.

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
| 500 | `INTERNAL_ERROR` | Erro inesperado. A mensagem é genérica, sem detalhes internos. |

---

## 10. Segurança e privacidade

- **Chave da Devnet:** só em variável de ambiente no backend. `.env` fica no `.gitignore`, e o repositório inclui um `.env.example` sem valores.
- **Nada sensível on-chain:** sem documentos, nomes, CPF, CNPJ ou valores em texto aberto. Só hashes e ids (§6.2).
- **Arquivos:** guardados de forma privada no backend. Não existe URL pública de download no MVP.
- **Dados:** todos os recebíveis são fictícios (`isDemo: true`), e o seed usa apenas pseudônimos.
- **Logs:** o backend não registra a chave nem o conteúdo dos documentos.

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

---

## 12. Modo mock do frontend (somente desenvolvimento)

Enquanto a API não estiver pronta, o frontend pode rodar com `NEXT_PUBLIC_API_MODE=mock`. Nesse modo:

- Os dados seguem exatamente este contrato (mesmos tipos e estados).
- Uma faixa visível mostra **"Modo mock — backend não conectado"**.
- **Nenhuma assinatura Solana é exibida.** O registro fica em "Aguardando backend" e nunca chega a `confirmed`.
- Atrasos e erros são simulados para testar os estados da tela.
- O build de produção recusa o modo mock.

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

**Processo de mudança:** qualquer alteração neste arquivo exige três passos:

1. Abrir um PR ou avisar no canal da equipe.
2. Ter o OK da gestão do projeto.
3. Atualizar o número da versão e o histórico abaixo.

## 14. Histórico

| Versão | Data | Mudança |
|---|---|---|
| 1.0 | 09/10/2026 | Versão inicial. |
