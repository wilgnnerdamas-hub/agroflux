# AgroFlux — Frontend

Next.js 15 (App Router) + TypeScript + Tailwind CSS 4.

## Comandos

| Comando | O que faz |
|---|---|
| `npm install` | Instala as dependências (rode no seu próprio computador). |
| `npm run dev` | Servidor de desenvolvimento em http://localhost:3000 |
| `npm run build` | Build de produção. Recusa o modo mock. |
| `npm run start` | Sobe o build de produção. |
| `npm run lint` | ESLint. |
| `npm run test:e2e` | Teste do fluxo completo (Playwright, desktop e celular). Na primeira vez rode `npx playwright install chromium`. |

## Variáveis de ambiente

| Variável | Valores | Uso |
|---|---|---|
| `NEXT_PUBLIC_API_MODE` | `http` (padrão) ou `mock` | `mock` só em desenvolvimento, sem backend. |
| `NEXT_PUBLIC_API_URL` | ex.: `http://localhost:4000/api/v1` | URL base da API real. |
| `NEXT_PUBLIC_MOCK_SCENARIO` | `register_fail` | Opcional, no mock: simula falha no registro. |

## Telas

| Rota | Tela |
|---|---|
| `/` | Dashboard de recebíveis (indicadores + lista; tabela no desktop, cartões no celular) |
| `/recebiveis/novo` | Cadastro + upload do documento de teste + hash SHA-256 no navegador |
| `/recebiveis/[id]` | Passaporte digital: etapas, registro na Devnet, verificação, dados, documento e histórico |
| `/recebiveis/[id]/ofertas` | Ofertas simuladas + confirmação da seleção |

## Organização do código

```
src/
├─ app/                 Páginas (rotas acima)
├─ components/          UI compartilhada (ui.tsx, status.tsx, ChainCard, Timeline, FlowSteps, AppShell)
└─ lib/
   ├─ types.ts          Tipos do contrato da API v1.0 — não alterar sem mudar o contrato
   ├─ labels.ts         Rótulos em português para os enums
   ├─ api/              Única porta de entrada para a API
   │  ├─ http.ts        Cliente real
   │  └─ mock.ts        Modo mock (desenvolvimento; nunca gera assinatura Solana)
   ├─ validation.ts     Espelho das regras do §8 do contrato
   ├─ hash.ts           SHA-256 no navegador
   └─ format.ts         Moeda, datas, hashes
```

## Regras da interface

- Toda tela tem estados de **carregando, sucesso, erro e pendência**.
- A interface **nunca exibe uma assinatura** que não veio do backend. No mock, o registro fica em "Aguardando backend".
- Ofertas sempre com a faixa e o selo **"Simulação"**.
- Textos não apresentam o recebível como validado juridicamente nem o financiamento como garantido.

## Testes

`tests/fake-backend.mjs` é um **dublê de teste** usado só pelo Playwright para exercitar o cliente HTTP. Não é uma API alternativa e não deve ser usado na demo: as assinaturas dele são marcadas como `FAKE_TEST_SIGNATURE…` e não existem na Solana.
