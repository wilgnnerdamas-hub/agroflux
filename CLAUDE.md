# AgroFlux — contexto para o Claude Code

MVP para o hackathon **Crypto World's Fair (Colosseum), trilha Solana**.
Prazo de submissão: **12/10/2026 às 23:59 PT (13/10 às 03:59 em Brasília)**.

## Produto
Distribuidores de insumos agrícolas vendem a prazo e têm dificuldade para organizar recebíveis e documentos
para financiadores. A AgroFlux transforma cada recebível em um **passaporte digital**: dados da operação,
documento com hash, estado atual e histórico de eventos verificáveis na **Solana Devnet**.

## Fluxo obrigatório da demo
1. Criar um recebível fictício.
2. Calcular o hash de um documento de teste.
3. Registrar o recebível na Solana Devnet.
4. Exibir o passaporte com estado e assinatura verificável da transação.
5. Exibir ofertas de financiamento fictícias.
6. Selecionar uma oferta simulada e atualizar o histórico.

## Fonte de verdade
- **`docs/api-contract.md` (v1.1)**: campos, estados, endpoints, erros e formato on-chain. Não altere sem o OK da gestão do projeto.
- `docs/decisoes-e-dependencias.md`: decisões do frontend e do backend e checklist de integração.
- `docs/novas-funcoes-v1.1.md`: escopo aprovado das funções A e B (base do contrato v1.1, ainda não escrito).

## Equipe e frentes
- Gestão, produto e UX: wilgnner, que também responde por frontend e backend.
- Este agente apoia nas duas frentes (`frontend/` e `backend/`).

## Regras de execução
1. Inspecione o repositório antes de editar. Preserve a stack e as convenções existentes.
2. Nada fora do fluxo principal até ele funcionar de ponta a ponta.
3. Nada de documentos ou dados pessoais on-chain; só hashes e identificadores.
4. Nenhuma chave privada no frontend ou em arquivos versionados.
5. Nunca apresentar recebível como juridicamente validado, oferta como real ou financiamento como garantido.
6. O frontend nunca exibe uma assinatura Solana que não veio do backend. O modo mock nunca confirma registro.
7. Não criar API alternativa para contornar integração incompleta. Divergência com o backend → ajustar o contrato com a equipe.
8. Antes de mudanças extensas: diagnóstico breve, plano incremental e lista de arquivos a modificar.
9. Registre decisões técnicas em `docs/decisoes-e-dependencias.md`.

## Estado atual (09/10)
- Frontend pronto no modo mock: dashboard (`/`), cadastro (`/recebiveis/novo`), passaporte (`/recebiveis/[id]`), ofertas simuladas (`/recebiveis/[id]/ofertas`).
- Estados de carregamento, sucesso, erro e pendência em todas as telas; layout responsivo.
- Teste e2e do fluxo completo passando (desktop e celular) contra o dublê `frontend/tests/fake-backend.mjs`, que é só para testes.
- Backend implementado (passos 1–6): health, cadastro, lista, passaporte, registro on-chain, verificação e ofertas. 32 testes (`npm test` em `backend/`).
- Fluxo completo da demo funcionando de ponta a ponta com front + backend reais na Devnet real (09/10). Carteira com ~5 SOL.
- Repositório público: https://github.com/wilgnnerdamas-hub/agroflux
- Produção: front https://agroflux-ruby.vercel.app · backend https://agroflux-production.up.railway.app/api/v1. Fluxo completo testado pelo navegador na Devnet real (09/10).

## Próximos passos (fila em ordem)
Novas funções A (confirmação do sacado) e B (cessão tokenizada + liquidação): especificação, regras e cortes em
**`docs/novas-funcoes-v1.1.md`**. Contrato v1.1 aprovado em 09/10.

**09/10 (noite) e 10/10 de manhã: fechar o fluxo principal e criar uma rede de segurança**
1. Push dos commits de documentação pendentes.
2. ~~`/demo/reset` com seed~~ (feito em 09/10).
3. ~~Hash de imagem PNG/JPEG~~ (confere, 09/10).
4. ~~Backend no Railway (volume em `/data`) e front na Vercel~~ (feito em 09/10).
   Com isso, uma demo do fluxo principal fica no ar antes de mexer nas funções novas.

**10/10: contrato e preparação**
5. ~~Contrato v1.1 (A + B)~~ (aprovado em 09/10).
6. Em paralelo, sem depender do contrato: instalar Rust, Solana CLI e Anchor no WSL (Ubuntu) e criar as carteiras
   "distribuidor demo" e "financiador demo" (secrets só no `.env`).

**10/10 (tarde) até 11/10 às 12h: função A, confirmação do sacado**
7. ~~Backend da função A~~ (feito em 09/10; 51 testes; testado na Devnet real).
8. ~~Frontend da função A~~ (feito em 10/10; e2e 6/6 no dublê; fluxo real na Devnet ok). Falta o push para produção.

**11/10 até 18h: função B, cessão tokenizada + liquidação atômica**
9. Blockchain: mint `tBRL-DEMO`, mint Token-2022 por recebível, programa Anchor de escrow com testes
   (incluindo o caso de falha) e deploy na Devnet.
10. Backend: `POST /assignment` (202 + polling) e máquina de estados.
11. Frontend: botão, card "Cessão tokenizada" e faixa de aviso, atrás de `NEXT_PUBLIC_FEATURE_ASSIGNMENT`.
    **Corte às 18h:** se não estiver estável, a flag fica `false`, a gestão é avisada e o tema vira roadmap no pitch.

**11/10 à noite: demo**
12. Acabamento visual, roteiro da demo e novo deploy.

**12/10: só correções críticas e submissão.**

## Comandos do backend (dentro de `backend/`)
- `npm install`, `npm run dev` (http://localhost:4000/api/v1), `npm test`, `npm run typecheck`
- `npm run wallet:new` grava a secret só em `backend/.env`; `npm run wallet:airdrop` pede SOL de teste.
- `.env` (fora do git): `SOLANA_RPC_URL` (Helius, com api-key), `SOLANA_FEE_PAYER_SECRET`, `FRONTEND_ORIGIN`.

## Comandos (dentro de `frontend/`)
- `npm install`, `npm run dev` (http://localhost:3000), `npm run build`, `npm run lint`
- `npm run test:e2e` (na primeira vez: `npx playwright install chromium`)
- Modo mock: `frontend/.env.development.local` com `NEXT_PUBLIC_API_MODE=mock`.

## Código do frontend
- `src/lib/types.ts`: tipos do contrato. `src/lib/labels.ts`: rótulos em pt-BR.
- `src/lib/api/`: única porta para a API (`http.ts` real, `mock.ts` desenvolvimento).
- `src/components/`: `ui.tsx` (primitivos), `status.tsx`, `ChainCard.tsx`, `Timeline.tsx`, `FlowSteps.tsx`, `AppShell.tsx`.
- Cores e tokens em `src/app/globals.css` (`@theme`).
