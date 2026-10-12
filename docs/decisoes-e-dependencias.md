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
| F9 | 10/10 | Página pública `/confirmar/[token]` com um shell próprio (sem a navegação da distribuidora), pensada para o celular. | Quem abre é o sacado, não a distribuidora. |
| F10 | 10/10 | O link de confirmação fica guardado só na aba (`sessionStorage`); depois de recarregar, a tela oferece "Gerar novo link". | O token só vem na resposta que o gera (§5.10) e não fica no servidor. |
| F11 | 10/10 | O passaporte se atualiza a cada 3 s, por até 15 min, enquanto espera a resposta do sacado ou o memo da confirmação. | O sacado responde em outro aparelho; a demo mostra a mudança sem recarregar. |
| F12 | 10/10 | As ofertas aparecem antes da confirmação, mas os botões de seleção ficam desligados, com um aviso e um atalho para a confirmação. | G1, com a proposta 2 do v1.1. |
| F13 | 10/10 | Card "Cessão tokenizada" e quinta etapa "Cessão liquidada" atrás de `NEXT_PUBLIC_FEATURE_ASSIGNMENT`; com a flag ligada, o card só aparece se o `health` disser `features.assignment: true` (ou se a cessão já existir). A faixa de aviso fica no topo do card. | Regra 3 do v1.1: sem escrow pronto, a função não aparece. |

| F14 | 10/10 | v1.2: landing em `/`, painel da distribuidora em `/distribuidor`, telas do financiador em `/financiador` (disponíveis, análise e proposta, carteira) e `/transparencia`. Sem login: "Entrar como" guarda o perfil só no navegador. | Decisões D14 e D18 do contrato v1.2. |
| F15 | 10/10 | Passaporte enxuto: etapas, "Próxima ação" (um único cartão por estado), resumo do recebível, registros on-chain e histórico recolhíveis. Cartões antigos (`ChainCard`, `DebtorConfirmationCard`, `AssignmentCard`) substituídos por `components/passport/*`. | Pedido da gestão: didático, sem faltar nem sobrar informação. |
| F16 | 10/10 | Interface em PT (padrão) e EN, com dicionários tipados em `src/lib/i18n` (o EN precisa ter as mesmas chaves). Em inglês, erros e eventos são traduzidos pelo código; a API segue em português. | Jurados internacionais (D18). |
| F17 | 10/10 | QR code do aceite gerado no navegador (`qrcode`), sem serviço externo. Gráfico de rendimento em SVG próprio (`YieldChart`), com área forte até a data de referência e hachurada depois, e controle deslizante da data. | Sem dependência de gráficos; projeção sempre rotulada como simulada. |
| F18 | 10/10 | v1.3: entrada escolhe a distribuidora (dst_a/b/c) e o perfil AgroFlux (`/admin`, abas por `?tab=`). Proposta do financiador por spread sobre o CDI, com prévia do backend (`POST /quote`). Tabela de propostas com taxa, líquido, CET e composição (ⓘ). Cartão de risco com fatores. Gráfico por dias úteis (cópia do calendário em `src/lib/calendar.ts`). | §15. |

## Decisões da gestão

| # | Data | Decisão |
|---|---|---|
| G1 | 09/10 | A confirmação do sacado (função A do v1.1) é **obrigatória** antes de selecionar uma oferta simulada. |
| G2 | 09/10 | O backend da demo vai ser hospedado no **Railway**. |
| G3 | 10/10 | Refinamento v1.2: registradora simulada no backend, modelo de propostas (financiadores propõem, distribuidora aceita), uma carteira por financiador demo, registradora + termo de coobrigação contra venda dupla, trava on-chain por documento e prova de recusa. Prazo não é critério de corte (equipe em tempo integral). |
| G4 | 10/10 | v1.3: cálculo de mercado (CDI + spread, dias úteis), painel de administração, risco (scorecard AA–H), taxa da AgroFlux de 0,5% do valor de face paga pela distribuidora e cobrada on-chain na liquidação, três distribuidoras demo e histórico do produtor simulado (rotulado). |

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
| B11 | 09/10 | Ancoragem de memo extraída para `chain/anchor.ts` e usada pelo registro e pela confirmação do sacado (chaves separadas no store: `<id>` e `dc:<id>`). | Uma só implementação testada de envio, reaproveitamento após TIMEOUT e retomada após reinício. |
| B12 | 09/10 | Tokens de confirmação guardados só como hash SHA-256, com estado `active`/`used`/`revoked`; um link novo revoga os anteriores. | O token nunca fica no passaporte nem no `db.json` (§10 do v1.1). |
| B13 | 09/10 | Migração ao carregar: dados gravados pela v1.0 ganham `debtorConfirmation` e `assignment` em `none`. | A produção no Railway já tem dados da v1.0. |
| B14 | 10/10 | Escrow Anchor 0.32.2 em `blockchain/` com uma instrução `settle`: confere os termos, transfere o token da cessão (Token-2022) e o tBRL-DEMO (SPL Token) na mesma instrução, e cria um PDA de registro por token (impede liquidar duas vezes). Sem conferência prévia de saldo no programa, para os testes provarem a reversão. | §6.4; 4 testes (`anchor test`), incluindo financiador sem saldo sem nenhuma perna executada. |
| B15 | 10/10 | Backend monta a instrução `settle` à mão (discriminador da IDL em `blockchain/idl/`), sem depender do cliente Anchor. Cria o token da cessão com metadados (`name`, `symbol` AGFX, `payloadHash`), revoga mint e autoridade de metadados. Assinaturas de cada etapa guardadas antes do envio (`as-mint:`, `as-settle:`) e conferidas numa nova tentativa. | Mesmo padrão do B6; nova tentativa reaproveita o token. |
| B16 | 10/10 | A função B só liga com `ASSIGNMENT_ENABLED=true` e as quatro variáveis (`DEMO_DISTRIBUTOR_SECRET`, `DEMO_FUNDER_SECRET`, `TBRL_MINT`, `ESCROW_PROGRAM_ID`); preenchidas por `npm run setup:assignment`. Gateway real testado contra validador local (`scripts/localnet-assignment.ts`). | Secrets só no `.env`/Railway; produção continua desligada até o deploy do escrow. |
| B17 | 10/10 | Registradora simulada no cadastro: `registryId` sequencial (`registrySeq` no `db.json`), recusa de hash de documento repetido (`409 DUPLICATE_DOCUMENT`) antes de salvar qualquer coisa. Migração completa `registry`, `listing` e os campos novos da cessão em dados antigos. | Unicidade por documento (D13). |
| B18 | 10/10 | `ListingService` reaproveita a ancoragem de memo (chave `ls:<id>`) para o termo de coobrigação; falha no memo não bloqueia as propostas. Propostas automáticas de B e C nascem no `publish`; A propõe/revisa por `POST /offers` (mesmo id). | §5.16–5.18 do contrato v1.2. |
| B19 | 10/10 | Escrow v1.2: `settle(amount, document_hash)` com PDA `["document", hash]` (`init`), 5/5 em `anchor test`. Gateway com uma carteira por financiador, `classifySettleError` distingue `DOCUMENT_ALREADY_ASSIGNED`, `inspect` lê mint/metadados/ATA/registros para a verificação, `readBalances` para a transparência. Prova de recusa enviada com `skipPreflight` e só vale se os logs apontarem a trava do documento. Integração real aprovada no validador local. | §6.5 e §6.7. |
| B20 | 10/10 | Precificação em `src/pricing/`: calendário de dias úteis com feriados móveis pela Páscoa, CDI da API do BCB (SGS 4389, cache 6 h, fallback manual), `PricingService` (preço, risco e `present()`), IOF por tipo de financiador como premissa configurável. O risco é calculado em cada leitura e nunca persistido. | §15.1 e §15.2; testes com caso calculado à mão. |
| B21 | 10/10 | Escrow v1.3: `settle(amount, fee, document_hash)` com terceira perna para a tesouraria fixa no programa (`TREASURY`); a chave da tesouraria fica só no WSL e o backend guarda o endereço. Campos novos do registro no fim da conta, para ler registros antigos. 7/7 no `anchor test`; gateway real ok no validador local. | §15.3. |
| B22 | 10/10 | Receita registrada na liquidação (`revenue` no `db.json`, um lançamento por recebível); configurações em `settings` sobrevivem ao reset. Painel `/admin/*` sem senha na demo. | §15.5. |

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
- [x] Conferir se o hash do navegador bate com o do backend para PDF e imagem. PDF, PNG e JPEG conferem (09/10).
- [x] Testar o caso de falha com a carteira da Devnet sem saldo (`INSUFFICIENT_FUNDS`). Tela de falha e botão de nova tentativa ok (09/10).
- [x] `/demo/reset` com seed (09/10): 1 recebível `registered` com tx real na Devnet (verificação 4/4) + 1 `created`, em ~2,5 s. Ligar com `DEMO_RESET_ENABLED=true`.
- [x] Backend no Railway: `https://agroflux-production.up.railway.app/api/v1` (09/10). Health com saldo, `/demo/reset` e fluxo completo pela API na Devnet real.
- [x] Dados persistem após redeploy no Railway (09/10). O volume não existia; foi criado em `/data`, e o log mostra `Diretório de dados: /data`. Os dados sobreviveram ao deploy do commit `ef285d9`. Lição: "Restart" não serve como teste de persistência.
- [x] Frontend na Vercel: `https://agroflux-ruby.vercel.app` (09/10), com CORS liberado no Railway. Fluxo completo da demo pelo navegador em produção, no desktop e no celular, na Devnet real.

### F19 — Landing refeita a partir do Claude Design (11/10)
- Estilo próprio da landing no escopo `.lp` (`globals.css`), com fontes Geist e Geist Mono (`next/font`); as outras telas não mudam.
- O terciário do design (#8A948E) passou para #69746D, para atingir contraste AA em texto pequeno.
- O passaporte animado é uma ilustração rotulada "dados fictícios". As abreviações de transação são exemplos e não são links (regra 6).
- A faixa "Tudo verificável" usa só assinaturas e endereços reais vindos do backend (recebíveis com etapas na rede e `/transparency`). Sem backend, mostra os endereços públicos dos programas, nunca assinaturas inventadas.
- Conteúdo do design ajustado à v1.3: proposta em "CDI + spread", e não "% a.m."; o passo "Oferta simulada" virou "Propostas"; a referência segue o padrão AGF-.
- A entrada "AgroFlux (operação)" e a escolha entre as três distribuidoras foram mantidas, embora o design não as tivesse previsto.

### F20 — Telas da distribuidora no estilo do Claude Design (11/10)
- Os tokens globais (`@theme`) passaram a usar a paleta da landing, e Geist virou a fonte de todo o app. O cabeçalho (nav sublinhada, "● Solana Devnet" pulsando, perfil e idioma em pílula) e os componentes básicos (`ui.tsx`) são compartilhados, então financiador e admin herdam o estilo, sem mudança de conteúdo.
- Modelo único de 5 portões em `lib/gates.ts` (cadastro, registro, confirmação, oferta, cessão), calculado a partir dos estados reais. A publicação faz parte do portão 04. Ele é usado na lista, no quadro, no passaporte (`GateStepper`, que substituiu o `FlowSteps`) e na prévia do cadastro.
- Recebíveis: KPIs com contagem, filtros (ação, aguardando, cedidos), trilha de portões, próximo passo em 3 estados e alternância Lista/Quadro, que fica gravada no navegador.
- Novo recebível: prévia viva do passaporte, contador "N de 9" e botão "Faltam N itens", que continua clicável e mostra a validação. O código da prévia (AGF-000N) é só uma estimativa; quem numera é o backend.
- Transparência: funil por portão, célula do escrow ("segundas vendas aceitas: 0", mais as tentativas recusadas) e endereços com "copiar".
- Cortes: "link enviado há X h" não aparece no próximo passo, porque o resumo da lista não traz `requestedAt` e incluir o campo mudaria o contrato. O terciário continua em #69746D, por causa do contraste AA.

### F21 — Carteira do financiador no estilo do Claude Design (11/10)
- Saíram o controle deslizante de data e o gráfico repetido em cada posição. Entraram um painel com os números do escopo e uma curva única (`PortfolioCurve`, SVG próprio) que muda de data com o mouse, o toque ou o teclado (←/→, Shift, Home/End). Os números do painel acompanham a data apontada.
- Escopo "Carteira toda" ou uma posição, por chip ou clicando na linha, refletido na URL (`?pos=AGF-0009`). Na carteira toda, os vencimentos intermediários aparecem marcados na curva.
- A curva usa dias corridos e é contínua: `pago × (face/pago)^(d/prazo)`, como pede o design. A versão em dias úteis subia em degraus. A precificação no backend continua em dias úteis (base 252). O gráfico de prévia na tela do recebível do financiador não mudou.
- No celular, a navegação do cabeçalho passou para uma segunda linha (em todos os perfis), para o item ativo não ficar cortado.

### F22 — Painel AgroFlux no estilo do Claude Design (11/10)
- O painel foi dividido em componentes (`components/admin/*`): visão geral, recebíveis, participantes, faturamento e risco, e configurações. Abas de texto com sublinhado, navegação por setas e URL em português (`?aba=risco`; `?tab=` continua aceito). A aba Recebíveis aceita filtros pela URL (`filtro=failed`, `etapa=registered`).
- Cores de rating por família (AA–B verde, C–D âmbar, E–H terracota), aplicadas ao `RatingBadge` em todo o app.
- "Repetir cessão" no admin chama o endpoint que já existia (`POST /receivables/:id/assignment`, que aceita `assignment_failed`).
- Backend: `GET /admin/receivables` ganhou `debtorConfirmation.status` (aditivo, registrado no contrato), para a trilha de portões e o próximo passo.
- Configurações: alterações não salvas marcadas em âmbar, barra fixa para salvar ou descartar, confirmação ao trocar de aba ou seguir um link interno e aviso ao fechar a página.
- Limite de "concentração alta" do maior sacado fixo em 50% (`HIGH_CONCENTRATION`), porque não há parâmetro equivalente nas configurações.

### B23 — Risco por modelo estatístico e clima real (11/10)
- O scorecard de pesos fixos virou uma **regressão logística** (`backend/src/risk-model`), treinada em uma **base sintética** de 5.000 operações, gerada com premissas ilustrativas do setor (`npm run risk:train`, determinístico pela semente; o modelo fica em `model.json`). Teste: AUC 0,79, KS 0,45 e inadimplência da base de 5,8%.
- A PD no prazo vem do modelo. O rating sai da PD anual, nas faixas da tabela configurável, e o score usa a escala de scorecard (+50 pontos dobram a chance de pagar). Cada fator mostra a contribuição em pontos em relação à operação média.
- **Clima real:** chuva de 12 meses contra a média dos 10 anos anteriores, num município agrícola de referência por UF (Open-Meteo, sem chave), com cache de 12 h e a tabela antiga como reserva. Nos testes fica desligado (`CLIMATE_SOURCE=off`).
- O painel admin ganhou o cartão "Modelo de risco" (AUC, KS, Brier, calibração por decil e coeficientes). O cartão de risco do recebível identifica o modelo e a base sintética.
- No pitch: o pipeline está pronto para dados reais (SCR do Banco Central, bureaus de crédito e satélite); hoje a base de treino é sintética.

### B24 — Analista de IA com o Claude (11/10)
- **Conferência do documento:** no cadastro, o Claude lê a nota (PDF ou imagem) e compara valor, emissão, vencimento, insumo e sacado com o que foi declarado, com saída estruturada por ferramenta. Roda em segundo plano, e uma falha não bloqueia o cadastro. Divergência vira o fator `document_ai`, como ajuste fora do modelo estatístico, identificado assim.
- **Parecer da IA:** sob demanda no cartão de risco (distribuidora e financiador), com pontos fortes e de atenção, guardado por idioma. Rotulado como apoio à análise, não recomendação.
- Chamada direta à Messages API por `fetch` (sem SDK), com a chave só no backend (`ANTHROPIC_API_KEY`). Sem chave, tudo fica desligado e oculto (`features.ai=false`).
- Notas de teste para a demo: `docs/demo/nf-teste-confere.pdf` e `docs/demo/nf-teste-diverge.pdf` (valor trocado: R$ 148.320 em vez de R$ 184.320). Dados para cadastrar: Produtor Demo 45, MT, Fertilizante NPK 20-05-20, R$ 184.320,00, emissão 10/10/2026, vencimento 15/03/2027.
- (11/10) Provedor da IA configurável: `OPENAI_API_KEY` (Chat Completions, PDF como parte `file`, saída por function calling; modelo em `OPENAI_MODEL`, padrão `gpt-4.1`) ou `ANTHROPIC_API_KEY`. O serviço de IA é o mesmo para os dois.

### F23 — Verificador público e seed com documentos únicos (11/10)
- `/verificar`: arraste um documento, e o navegador calcula o SHA-256 e consulta `GET /verify/:sha256`. Mostra o registro, as provas na Devnet (registro, aceite, termo e cessão) e a **trava on-chain do escrow, lida direto da rede só pelo hash**. É a dupla cessão vista de fora, por exemplo por um segundo financiador.
- Seed: cada `/demo/reset` gera documentos com um lote novo, para ter hashes novos. Antes, as travas on-chain permanentes de cessões anteriores faziam o AGF-0003 falhar (`DOCUMENT_ALREADY_ASSIGNED`) e fariam o próximo reset falhar no AGF-0004.

### B25 — Pagamento no vencimento: ciclo completo (11/10)
- O passaporte (depois da cessão) ganhou "Simular pagamento do sacado". Numa só transação, a face em tBRL-DEMO vai ao financiador, o token do recebível é queimado e um memo de quitação é gravado. Sem estado novo: `assignment.maturityPayment`, para não mexer no fluxo existente.
- Carteira do financiador: posições pagas saem da curva e mostram "Paga · recebido R$ X". O admin mostra "Paga no vencimento", e o verificador público mostra a prova do pagamento.
- O pagamento é simulado: na vida real, viria do sacado pelo domicílio de pagamento da registradora.

### F24 — Entrada com escolha do perfil demo e Painel AgroFlux no hero (12/10)
- Na landing, "Entrar como distribuidora" e "Entrar como financiador" abrem um seletor com os perfis cadastrados no backend (as três distribuidoras e os Financiadores A, B e C, com o tipo e o efeito no IOF). Logo abaixo fica o botão "Painel AgroFlux". O seletor fecha com Esc ou no X, e só um fica aberto por vez.
- O financiador escolhido fica em `agroflux.funder` (localStorage), como a distribuidora. A vitrine, a carteira, a proposta, a transparência e o cabeçalho usam esse perfil.
- Backend (contrato v1.3.1): qualquer financiador demo pode propor pela tela. A proposta de B ou C substitui a automática dele (mesmo `id`, `origin: "proposal"`).
- A prévia "Você aporta" passou a usar `funderCashOutCents` do backend. Antes, ignorava o IOF, o que só aparecia com o Financiador B (banco).
