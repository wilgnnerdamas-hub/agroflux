# AgroFlux

**Verifiable digital passports for agricultural receivables, settled atomically on Solana.**

Built for the Colosseum **Crypto World's Fair** hackathon, Solana track.

- **Live app:** https://agroflux-ruby.vercel.app
- **API:** https://agroflux-production.up.railway.app/api/v1/health
- **Network:** Solana **Devnet** (test network). Everything in the demo is fictitious; see [What is real and what is simulated](#what-is-real-and-what-is-simulated).

> Em português: a documentação de produto e o contrato da API estão em [`docs/`](docs/) (em PT-BR). A interface tem PT e EN.

## The problem

Brazilian farm-input distributors (fertilizer, seed, crop protection) sell on credit, with payment at harvest. They need cash now, and funders (credit funds, banks, cooperatives) are willing to advance it, but every funder asks the same three questions before buying a receivable:

1. **Does the receivable exist?** Is the sale real, and is the document unchanged?
2. **Does the buyer acknowledge the debt?**
3. **Was it already sold to someone else?** (double assignment)

## The solution

AgroFlux gives each sale a **passport**: the sale data, the document fingerprint, the current stage and a history of events, with each key step leaving verifiable proof on Solana. It moves through five gates:

| Gate | What happens | On-chain proof |
|---|---|---|
| 01 · Sign-up | Sale data and a test invoice. The browser computes the SHA-256; the (simulated) registry numbers the title and rejects a repeated document. An AI model reads the invoice and checks it against the declared data. | — |
| 02 · Registration | The passport is anchored. | SPL Memo with the document hash and a hash of the sale data (no personal data) |
| 03 · Debtor confirmation | The farmer confirms the purchase on their phone (QR code or link). | SPL Memo with the confirmation hash |
| 04 · Offer | The distributor accepts a joint-liability term and publishes. Funders propose **CDI + spread** based on the risk rating; net amount and effective cost side by side. | SPL Memo with the term hash |
| 05 · Assignment | The receivable becomes a **unique Token-2022 asset** (supply 1, mint authority revoked) and is swapped for tBRL-DEMO in **one atomic transaction** by our Anchor escrow program. | Escrow `settle`: token → funder, net → distributor, **AgroFlux fee → treasury**, plus a **per-document lock** |

After the assignment:

- **Double-sale proof:** a second assignment of the same document, even with a brand-new token, is **rejected by Solana** (the per-document lock PDA already exists). The demo runs this on purpose and links the failed transaction.
- **Payment at maturity (simulated):** one transaction credits the face value to the funder, **burns** the receivable token and writes a payoff memo.
- **Public verifier:** anyone can drop a document at `/verificar`. The browser hashes it, and the page shows whether it is registered, at which gate, who bought it, and whether the escrow lock exists, **read directly from Devnet using only the hash**.

## Why Solana

- **Atomic settlement with the fee built in:** asset, payment and platform fee move together or not at all, with no reconciliation.
- **Uniqueness enforced by the program,** not by our database: the document-lock PDA is derived from the document hash, so anyone can check it.
- **Cheap, fast proofs:** each gate is a sub-cent transaction that confirms in seconds, so every step of a small agri receivable can be anchored.
- **Invisible to the user:** the demo uses backend-held demo wallets and a fee payer, so distributors and farmers never see a wallet or pay gas. Self-custody for funders is on the roadmap.

## Market and positioning

- Input distributors billed **R$ 171 billion** in 2025 (Andav members), deliver 47% of the inputs that reach Brazilian farmers and already fund **about 20% of agricultural credit**, with their own cash.
- Stress is at a record: 1,990 agribusiness bankruptcy filings in 2025 (+56%, Serasa Experian) and farmer default up from 1.4% to 4.4% since 2021 (Central Bank).
- Capital is there: agricultural credit funds (Fiagros) at R$ 41–45 billion, with the receivables category up 93% in a year. The bottleneck is trustworthy, cheap-to-verify collateral.
- Brazil's new electronic duplicata (Res. BCB 540/2025) makes registries block a second assignment inside their systems. AgroFlux **sits on top of these rails**: public verification of the whole dossier, a marketplace where funders compete, and atomic settlement with the fee built in, which neither registries nor agri-lenders provide.

## Pricing and risk, as in the market

- **Rate:** daily **CDI from the Central Bank of Brazil** (SGS series 4389, with a manual fallback). Annual rate = (1 + CDI) × (1 + spread) − 1. Present value is computed on **business days, base 252**, with Brazilian holidays.
- **Costs:** fees, IOF tax when the funder is a bank (simplified rule), the AgroFlux fee (0.5% of face + R$ 25 registry fee) and the effective annual cost (CET).
- **Risk model:** a **logistic regression** trained on a **synthetic** dataset of 5,000 operations (test set: AUC 0.79, KS 0.45). It produces the probability of default, a score and an AA–H rating (Brazilian CMN Res. 2,682 scale), with a per-factor explanation. Features include debtor acceptance, joint liability, term, maturity vs. harvest window, amount, concentration, simulated farmer history and **real rainfall**: the last 12 months against the 10-year average for the state's reference farming town (Open-Meteo).
- **AI analyst:** an LLM (OpenAI or Anthropic, configurable) checks the invoice against the declared data. A mismatch becomes a risk factor, kept outside the statistical model and labeled as such. It also writes a short credit note on demand.
- **Operations dashboard:** portfolio, rating mix, revenue booked at settlement, expected loss, concentration and model validation, with editable assumptions.

## What is real and what is simulated

| Real | Simulated |
|---|---|
| Solana Devnet transactions, hashes and on-chain verification | Registry (title number, uniqueness, payment instructions) |
| Token-2022 asset, atomic escrow settlement, fee to treasury, document lock, double-sale rejection | Debtor identity (whoever opens the link answers for the debtor) |
| CDI from the Central Bank, business-day calendar, pricing formulas | Funders and their proposals; farmer payment history |
| Rainfall data (Open-Meteo); AI document check | Risk model training data (synthetic); IOF rule (simplified) |
| | Value of the token and of tBRL-DEMO (none); legal effect of the assignment |

Nothing personal goes on-chain: only hashes and technical identifiers. Farmers appear as pseudonyms.

## On-chain addresses (Devnet)

| What | Address |
|---|---|
| AgroFlux escrow program (Anchor) | [`B3PdnyjFAJua4FbzdfotdZLN3S6LfAXKwavbJNkLxRXa`](https://explorer.solana.com/address/B3PdnyjFAJua4FbzdfotdZLN3S6LfAXKwavbJNkLxRXa?cluster=devnet) |
| tBRL-DEMO (test currency, 2 decimals) | [`8ncLEzjpEpHnEXExg2pSk8ByMRxytCtpmMwDf2BGtovn`](https://explorer.solana.com/address/8ncLEzjpEpHnEXExg2pSk8ByMRxytCtpmMwDf2BGtovn?cluster=devnet) |
| AgroFlux treasury (fixed in the program) | [`8j5HxEYAX1hFToDWjBQsvvKYafAc67qr76xjq5K53XVq`](https://explorer.solana.com/address/8j5HxEYAX1hFToDWjBQsvvKYafAc67qr76xjq5K53XVq?cluster=devnet) |
| SPL Memo | `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` |
| Token-2022 | `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` |

The live list of programs, wallets and balances is on the app's **Transparency** page.

## Architecture

```
 Browser (Next.js, PT/EN)                 Backend (Node + TypeScript, Fastify)            Solana Devnet
 ───────────────────────                  ────────────────────────────────────            ─────────────
 SHA-256 in the browser   ──multipart──▶  registry (simulated), pricing, risk model  ──▶  SPL Memo (gates 02–04)
 passport, dashboards                     AI analyst (OpenAI/Anthropic)              ──▶  Token-2022 asset mint
 public verifier (/verificar)             demo wallets + fee payer (custodial demo)  ──▶  Anchor escrow: settle + lock
 never holds keys                         Central Bank CDI · Open-Meteo rainfall          (burn + memo at maturity)
```

```
agroflux/
├─ frontend/     Next.js 15, React 19, Tailwind 4 · e2e with Playwright (desktop + mobile)
├─ backend/      Fastify API, Solana web3.js / spl-token, risk model, AI analyst · Vitest
├─ blockchain/   Anchor program `agroflux-escrow` (settle with fee and document lock) · anchor test
└─ docs/         API contract, decisions log, demo script, test invoices (PT-BR)
```

## Run it locally

Requirements: Node.js 20+.

```bash
# Backend (http://localhost:4000/api/v1)
cd backend && npm install
npm run wallet:new && npm run wallet:airdrop   # Devnet fee payer, stored only in backend/.env
npm run dev

# Frontend (http://localhost:3000)
cd frontend && npm install
cp .env.example .env.local                      # NEXT_PUBLIC_API_MODE=http, NEXT_PUBLIC_API_URL=...
npm run dev
```

- Tokenized assignment needs the demo wallets and the escrow program (`npm run setup:assignment`, `ASSIGNMENT_ENABLED=true`). See [`docs/api-contract.md`](docs/api-contract.md).
- AI analyst: set `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY`) in `backend/.env`; without a key it stays off.
- Retrain the risk model: `npm run risk:train` (deterministic seed).
- The Anchor program builds and tests in WSL/Linux: `anchor build && anchor test`.

**Tests:** backend 100 (Vitest), escrow 7 (`anchor test`, local validator), frontend end-to-end 14 (Playwright, desktop and mobile, against a test double of the API).

## Roadmap

- **Self-custody for funders:** sign the purchase with Phantom/Solflare, with the receivable token landing in their own wallet.
- **Authorized registries** (CERC, B3, CRDC) and **electronic invoices (NF-e)** as the source of acceptance and uniqueness.
- **Real credit data** to train the model: Central Bank SCR, credit bureaus, satellite crop monitoring.
- **Secondary market** for the receivable token, with the registry creditor following the transfer.

## Team

- Wilgnner Guilherme Damas Garcia Salgado
- Marco Antonio Souza Cavalcante

## Hackathon disclosure

This repository was created and built during the Crypto World's Fair (first commit on 2026-10-09); no prior code was reused. The demo runs on Devnet with fictitious data; it is not an investment offer, a legal assignment or financing of any kind.

## License

[MIT](LICENSE)
