# Submission form — Colosseum Crypto World's Fair (Solana track)

Respostas prontas em inglês para colar no formulário. Os campos marcados com **[PREENCHER]** dependem do time.
Limites de caracteres: ajustar se o formulário pedir menos (há uma versão curta em cada campo).

---

## Project name
AgroFlux

## One-liner (short tagline)
Verifiable passports for agricultural receivables, settled atomically on Solana.

## Short description (≤ 280 characters)
AgroFlux turns farm-input distributors' credit sales into verifiable on-chain passports: debtor acceptance, risk rating and a per-document lock against double sale, then swaps the receivable token for cash and fee in one atomic Solana transaction.

## Full description

**Problem.** In Brazil, farmers buy fertilizer, seed and crop protection on credit and pay at harvest. Input distributors carry that credit on their own balance sheet: they already fund roughly 20% of all agricultural credit in the country, while bankruptcy filings in agribusiness hit a record 1,990 in 2025 (+56%) and farmer default tripled since 2021. Funders (credit funds, Fiagros, banks) have capital (Fiagro AUM doubled in a year), but before buying a receivable they ask the same three questions: does it exist, does the farmer acknowledge it, and was it already sold to someone else? Answering them today means spreadsheets, PDFs, sample-based checks and manual reconciliation, so mid-sized distributors end up with expensive bank credit or nothing.

**Solution.** AgroFlux gives each sale a passport that moves through five gates:
1. **Sign-up:** sale data plus the invoice. The browser computes the SHA-256; an AI model reads the invoice and checks it against the declared data.
2. **Registration:** an SPL Memo anchors the document hash and a hash of the sale data (no personal data on-chain).
3. **Debtor acceptance:** the farmer confirms the purchase by scanning a QR code; the confirmation hash goes on-chain and the risk rating improves.
4. **Offer:** the distributor accepts a joint-liability term (hash on-chain) and publishes. Funders bid CDI + spread; net amount and effective cost are shown side by side.
5. **Assignment:** the receivable becomes a unique Token-2022 asset (supply 1, mint authority revoked) and our Anchor escrow swaps it for the payment in **one atomic transaction**: token to the funder, net to the distributor, platform fee to the treasury, and a **per-document lock PDA** that makes a second sale of the same invoice impossible.

At maturity, one transaction pays the funder and burns the token. A public verifier lets anyone drop a document and see, from the hash alone, whether it was registered, accepted, sold and paid, reading the lock straight from Solana.

**Why Solana.** Asset, payment and fee move together or not at all, with no reconciliation. Uniqueness is enforced by the program, not by our database. Each gate costs a fraction of a cent and confirms in seconds, which is what makes anchoring small agricultural receivables viable. Users never see a wallet or pay gas.

**Status.** Live on Devnet with the full cycle working end to end (registration → acceptance → offer → atomic assignment → double-sale rejection → payment and burn), real CDI from the Central Bank, real rainfall data in the risk model and an AI document check. Registry, funders and money are simulated and labeled as such.

## Category / track
Solana — DeFi / RWA (real-world assets) / payments. **[PREENCHER conforme as opções do formulário]**

## Tools and technologies used
- **Solana Devnet**, **Anchor 0.32** (custom escrow program `agroflux-escrow`: `settle` with fee leg and per-document lock PDA)
- **Token-2022** (unique receivable asset with metadata, mint authority revoked, burn at maturity)
- **SPL Memo** (registration, debtor acceptance, joint-liability term, payoff)
- `@solana/web3.js`, `@solana/spl-token`, Helius RPC
- Backend: Node.js, TypeScript, Fastify, Vitest (100 tests)
- Frontend: Next.js 15, React 19, Tailwind CSS 4, Playwright (14 end-to-end tests, desktop and mobile)
- Risk: logistic regression trained on a synthetic dataset (AUC 0.79), Open-Meteo rainfall, Central Bank of Brazil CDI (SGS API)
- AI: OpenAI (gpt-4.1) or Anthropic, for invoice checks and credit notes
- Hosting: Vercel (frontend), Railway (API)

## Links
- Live app: https://agroflux-ruby.vercel.app
- Repository: https://github.com/wilgnnerdamas-hub/agroflux
- API health: https://agroflux-production.up.railway.app/api/v1/health
- Escrow program (Devnet): https://explorer.solana.com/address/B3PdnyjFAJua4FbzdfotdZLN3S6LfAXKwavbJNkLxRXa?cluster=devnet
- Pitch video: **[PREENCHER]**
- Technical demo video: **[PREENCHER]**

## Team
Two engineering students at ITA (Instituto Tecnológico de Aeronáutica), in São José dos Campos, Brazil, both members of ITA Finance, the university's student finance group.

- **Wilgnner Guilherme Damas Garcia Salgado** — built the technical infrastructure (Solana program, backend, frontend) and led the market analysis. Undergraduate in Civil-Aeronautical Engineering. Grew up in a family of dairy and grain farmers, so he has seen the input-credit cycle from the inside, and has studied financial markets for several years. ITA Finance is what connects the farm side and the finance side of AgroFlux.
- **Marco Antonio Souza Cavalcante** — market analysis and product validation, talking to agribusiness customers. Undergraduate in Aerospace Engineering, member of ITA Finance, with experience in client relationships and sales.

**Why us:** a founder raised inside the problem (farm credit paid at harvest), finance training from ITA Finance, and the engineering background to ship the full stack on Solana in three days.

## Location
São José dos Campos, São Paulo, Brazil.

## Go-to-market
We start where the pain is sharpest and the sale is shortest: **mid-sized input distributors** (R$ 50–500 million in annual revenue) in Mato Grosso, Goiás and Paraná. They are too small to run their own receivables fund or issue agribusiness certificates (CRAs), and depend on one or two banks.

1. **Funders first.** Sign 2–3 Fiagro-FIDC managers or agri-fintech funds as anchor buyers. They already have capital that must be deployed and pay heavily for due diligence; AgroFlux gives them a standardized, verifiable dossier and settlement without reconciliation.
2. **Distributors through associations and suppliers.** Reach distributors through Andav (the national distributors' association, 3,800+ members), regional events and input manufacturers, which have an interest in their distributors' liquidity.
3. **Pilot.** One distributor, one fund, one crop season: measure time to cash, net amount versus the current bank line, and operational cost for the fund.
4. **Rails, not rivals.** Integrate with authorized registries (B3, CERC) and electronic invoices, so AgroFlux sits on top of the new mandatory electronic duplicata as the verification, marketplace and settlement layer.

**Business model:** 0.5% of face value plus a fixed R$ 25 registry fee per assignment, charged on-chain inside the settlement transaction. Later: subscriptions for funders (risk data, portfolio monitoring) and paid verification.

## Market / impact
- Distributors associated with Andav billed R$ 171 billion in 2025 (R$ 105 billion in inputs) and deliver 47% of the inputs that reach Brazilian farmers.
- Distributors already provide about 20% of agricultural credit in Brazil.
- On the capital side: Fiagros at R$ 41–45 billion in AUM (Fiagro-FIDC up 93% in 12 months), agribusiness certificates (CRA) at R$ 156–160 billion, registered rural product notes (CPR) at R$ 418 billion.
- Illustrative sizing: if half of input sales are on credit (~R$ 52 billion a year) and 3–5% flows through AgroFlux, that is R$ 1.6–2.6 billion assigned per year and R$ 8–13 million in fee revenue. Assumptions to be validated in the pilot.

## Demand validation
**[PREENCHER com o que for real]** Opções, da mais forte para a mais fraca:
- Conversas com distribuidoras, gestoras de FIDC/Fiagro, produtores ou profissionais de crédito agro (quantas, com quem, o que disseram).
- Cartas de interesse ou pedidos de piloto.
- Se ainda não houver conversas, ser honesto e usar a pesquisa de mesa:

> We have not run a pilot yet. Our validation so far is desk research: distributors fund ~20% of Brazilian agricultural credit (Andav, 2026), agribusiness bankruptcy filings reached a record 1,990 in 2025 (Serasa Experian), and Fiagro-FIDC assets grew 93% in a year (Anbima). The Central Bank's new electronic duplicata rules (Res. BCB 540/2025) confirm that double assignment is a recognized problem. Next step: 10–15 interviews with distributors and fund managers, using the script in our market study, and one pilot in the 2026/27 season.

## Distribution / traction
- Live product on Devnet with the full cycle, public repository under the MIT license.
- Each receivable produces up to 7 verifiable Devnet transactions; all addresses on the Transparency page.
- **[PREENCHER: qualquer tração real — usuários testando, conversas, seguidores, lista de espera]**

## Competition and differentiation
Agri-fintechs such as TerraMagna, Traive and Agrolend lend their own or their funds' capital. Registries (B3, CERC) record ownership and block a second assignment inside their systems. AgroFlux is neutral infrastructure between them: a public, permissionless verification of the whole dossier (acceptance, terms, assignment, payment), a marketplace where multiple funders compete, and atomic settlement with the fee built in — something neither registries nor lenders offer.

## What is simulated (disclosure)
Registry, funders and their proposals, farmer payment history, the risk model's training data and the value of the test currency (tBRL-DEMO). Solana transactions, the escrow program, Token-2022 assets, document locks, CDI and rainfall data and the AI check are real. Nothing personal goes on-chain.

## Was any code written before the hackathon?
No. The repository was created on 2026-10-09, during the hackathon; no prior code was reused.
