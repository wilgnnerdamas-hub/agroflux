# Decisões técnicas e dependências entre as frentes

As decisões D1 a D7 estão no §13 do [contrato da API](api-contract.md). Este arquivo registra as decisões do frontend e o que cada frente precisa da outra.

## Decisões do frontend

| # | Data | Decisão | Motivo |
|---|---|---|---|
| F1 | 09/10 | Next.js 15 + TypeScript + Tailwind 4, todas as telas como componentes de cliente. | Stack conhecida e rápida; os dados vêm todos da API do backend. |
| F2 | 09/10 | Um único cliente de API (`src/lib/api`) com dois modos: `http` e `mock`. | Isola mudanças de contrato num só lugar. |
| F3 | 09/10 | Modo mock nunca chega a `confirmed` nem exibe assinatura. | Regra R5 do contrato: não inventar transações. |
| F4 | 09/10 | O build de produção falha se `NEXT_PUBLIC_API_MODE=mock`. | Evita que dados de mock apareçam na demo. |
| F5 | 09/10 | Hash SHA-256 calculado no navegador e enviado em `X-Client-Sha256`. | Mostra o hash antes do envio e detecta divergência. O valor oficial é o do backend. |
| F6 | 09/10 | Polling de `GET /receivables/:id` a cada 2 s por até 75 s enquanto o registro está pendente. | §5.5 do contrato. |
| F7 | 09/10 | `Idempotency-Key` reaproveitada enquanto a tentativa de registro não termina. | Clique duplo não gera duas transações. |
| F8 | 09/10 | Testes e2e rodam contra um build de produção e um dublê de teste do backend. | O servidor de desenvolvimento do Next compila rotas sob demanda e deixava o teste instável. |

## O frontend depende de

| De quem | O quê | Quando |
|---|---|---|
| Backend | API em `/api/v1` seguindo o contrato v1.0, com CORS liberado para a origem do frontend | 10/10 |
| Backend | `GET /health` com `feePayerBalanceLamports` | 10/10 |
| Backend + Blockchain | `GET /receivables/:id/verification` | 10/10 |
| Backend | URL pública da API para o deploy da demo | 11/10 |

## Pendências de integração (10/10)

- [ ] Backend no ar localmente; trocar `.env.development.local` para `http`.
- [ ] Rodar o fluxo completo contra a API real e a Devnet real.
- [ ] Conferir se o hash do navegador bate com o do backend para PDF e imagem.
- [ ] Testar o caso de falha com a carteira da Devnet sem saldo (`INSUFFICIENT_FUNDS`).
- [ ] Deploy do frontend (Vercel) apontando para a URL pública do backend.
