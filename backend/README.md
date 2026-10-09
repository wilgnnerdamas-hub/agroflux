# AgroFlux — Backend

API do AgroFlux conforme [`../docs/api-contract.md`](../docs/api-contract.md) (v1.0): cadastro de recebíveis,
hash dos documentos, registro na **Solana Devnet** via SPL Memo, verificação on-chain e ofertas **simuladas**.

## Rodar

Pré-requisito: Node.js 20 ou mais novo.

```bash
cd backend
npm install
cp .env.example .env      # ajuste SOLANA_RPC_URL e FRONTEND_ORIGIN
npm run wallet:new        # cria a carteira da Devnet e grava a secret só no .env
npm run wallet:airdrop    # pede SOL de teste (o faucet público costuma limitar)
npm run dev               # http://localhost:4000/api/v1
```

- `npm test`: testes com vitest (a Solana é substituída por um dublê).
- `npm run typecheck`: checagem de tipos.

## Organização

- `src/routes.ts`: endpoints do §5. `src/app.ts`: servidor, CORS, multipart e erros (§9).
- `src/receivables.ts`: cadastro e eventos. `src/registration.ts`: máquina de estados do registro on-chain.
- `src/verification.ts`: conferência da transação na Devnet. `src/offers.ts`: ofertas simuladas.
- `src/chain/`: payload canônico e memo (§6.2) e a porta para a Solana (`solana.ts`).
- `src/store.ts`: persistência em `data/db.json` e uploads privados em `data/uploads/` (fora do git).

## Segurança

- A secret da carteira fica só em `SOLANA_FEE_PAYER_SECRET`, no `.env`, que não é versionado.
- On-chain vão só hashes e ids. Nenhum nome, UF, valor ou documento.
