# Decisões técnicas e dependências entre as frentes

As decisões D1 a D7 estão no §13 do [contrato da API](api-contract.md). Este arquivo registra as decisões do frontend e do backend e o que cada frente precisa da outra.

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

## Decisões da gestão

| # | Data | Decisão |
|---|---|---|
| G1 | 09/10 | A confirmação do sacado (função A do v1.1) é **obrigatória** antes de selecionar uma oferta simulada. |
| G2 | 09/10 | O backend da demo vai ser hospedado no **Railway**. |

## Decisões do backend

| # | Data | Decisão | Motivo |
|---|---|---|---|
| B1 | 09/10 | Node + TypeScript + Fastify 5 (`@fastify/multipart`, `@fastify/cors`), rodando via `tsx`. | Mesma linguagem do front, multipart e limite de tamanho prontos. |
| B2 | 09/10 | Persistência em `data/db.json` (escrita atômica) e uploads em `data/uploads/`, fora do git. | Sem banco para instalar no prazo do hackathon. `/demo/reset` recria os dados. |
| B3 | 09/10 | `@solana/web3.js` 1.x com uma instrução SPL Memo assinada pela carteira pagadora. | D2 do contrato; API estável para memo simples. |
| B4 | 09/10 | RPC da Devnet pela Helius (`SOLANA_RPC_URL` com api-key, só no `.env`). | O RPC público limita por IP (429) e é instável em semana de hackathon. |
| B5 | 09/10 | Tipo do arquivo detectado pelo conteúdo (assinatura de PDF/PNG/JPEG), não pelo tipo declarado. | Um arquivo renomeado não passa como PDF. |
| B6 | 09/10 | Assinatura enviada é guardada internamente antes do envio. Nova tentativa após `TIMEOUT` confere essa assinatura antes de enviar outra; pendentes são retomados ao reiniciar. | Evita duas transações para o mesmo recebível e recebível preso em pendente. |
| B7 | 09/10 | Verificação lê o memo dos dados da instrução e recalcula o hash do arquivo guardado e o payload canônico. | Detecta adulteração do arquivo ou divergência on-chain. |
| B8 | 09/10 | Ofertas: 3 financiadores fixos, taxa e tarifa derivadas de um hash do recebível (determinístico), geradas uma vez e persistidas. | §3.7: mesma entrada, mesmas ofertas. |
| B9 | 09/10 | `/demo/reset` espera a confirmação real do exemplo registrado e responde 503 se ela falhar. O registro em andamento ignora recebíveis apagados pelo reset. | A demo nunca começa com um exemplo "registrado" sem transação, e o reset não derruba o servidor. |
| B10 | 09/10 | `tsx` em `dependencies`; `npm start` é o comando de produção no Railway, com raiz em `backend/` e volume persistente montado em `DATA_DIR`. | O Railway pode descartar as dependências de desenvolvimento, e sem volume o `db.json` e os uploads se perdem a cada deploy. |

## O frontend depende de

| De quem | O quê | Quando |
|---|---|---|
| Backend | API em `/api/v1` seguindo o contrato v1.0, com CORS liberado para a origem do frontend | 10/10 |
| Backend | `GET /health` com `feePayerBalanceLamports` | 10/10 |
| Backend + Blockchain | `GET /receivables/:id/verification` | 10/10 |
| Backend | URL pública da API para o deploy da demo | ✔ 09/10: `https://agroflux-production.up.railway.app/api/v1` |

## Pendências de integração (10/10)

- [x] Backend no ar localmente; trocar `.env.development.local` para `http`. (09/10)
- [x] Rodar o fluxo completo contra a API real e a Devnet real. (09/10, tx `bN39u67wVjhCzggQfyaw9CCDuYPX1768JvL76ovaXQQgKQjDY16CCJe5FHeXXwAxjbTL4pLkPDTPKsR6vnz11aR`, confirmada em ~2 s, verificação 4/4.) Carteira `GsvBgHVej6pvz4zKLC1rSMLX9KWfH3V69ZKTPFyRS8oV` abastecida pelo faucet.solana.com.
- [ ] Conferir se o hash do navegador bate com o do backend para PDF e imagem. PDF confere (09/10); falta imagem.
- [x] Testar o caso de falha com a carteira da Devnet sem saldo (`INSUFFICIENT_FUNDS`). Tela de falha e botão de nova tentativa ok (09/10).
- [x] `/demo/reset` com seed (09/10): 1 recebível `registered` com tx real na Devnet (verificação 4/4) + 1 `created`, em ~2,5 s. Ligar com `DEMO_RESET_ENABLED=true`.
- [x] Backend no Railway: `https://agroflux-production.up.railway.app/api/v1` (09/10). Health com saldo, `/demo/reset` e fluxo completo pela API na Devnet real.
- [ ] Conferir se os dados persistem após reiniciar o serviço (volume em `/data`).
- [ ] Deploy do frontend (Vercel) apontando para a URL pública do backend; `FRONTEND_ORIGIN` no Railway com a URL da Vercel.
