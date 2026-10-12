# Pitch — 2 a 3 minutos (estilo startup)

Em inglês, para os jurados. São cerca de 380 palavras, o que dá uns 2 min 40 s em ritmo calmo.
**Formato sugerido:** você na câmera nos trechos de problema e time; tela do produto nos trechos de solução (gravação curta, sem narrar cliques).
Ao lado, em itálico, o que mostrar na tela.

---

### 0:00 – 0:20 · Gancho
> In Brazil, farmers buy fertilizer today and pay at harvest, six months later. Someone has to carry that credit. Most people think it's the banks. It's not only the banks: **input distributors already fund about 20% of all agricultural credit in Brazil**, with their own cash.

*Você na câmera. Texto na tela: "Distributors fund ~20% of Brazilian ag credit".*

### 0:20 – 0:50 · Problema
> That cash is stuck in receivables. And 2025 was the worst year on record: almost 2,000 bankruptcy filings in agribusiness, and farmer default tripled since 2021.
> Funders have money: agricultural credit funds doubled in a year. But before buying a receivable, every funder asks the same three questions. Does this sale exist? Does the farmer acknowledge the debt? And was it already sold to someone else?
> Today the answers live in spreadsheets, PDFs and phone calls. So mid-sized distributors pay expensive bank rates, or get nothing.

*Três perguntas aparecendo uma a uma.*

### 0:50 – 1:35 · Solução
> AgroFlux gives every sale a **digital passport on Solana**.
> The distributor uploads the invoice; AI checks it against the declared data, and only its fingerprint goes on-chain.
> The farmer confirms the purchase by scanning a QR code at the counter. That confirmation goes on-chain too, and the risk rating improves.
> Funders bid in a marketplace, priced like the real market: the Central Bank's benchmark rate plus a spread by risk.
> When the distributor accepts, the receivable becomes a unique token, and our Solana program swaps it for the cash in **one atomic transaction**: the funder gets the token, the distributor gets paid, AgroFlux collects its fee, and the invoice is **locked forever**. Try to sell it again, and Solana itself rejects it.

*Tela: passaporte → QR no celular → tabela de propostas → Explorer com as 3 transferências → transação recusada.*

### 1:35 – 1:55 · Por que Solana
> This only works on Solana. Each step costs a fraction of a cent and settles in seconds, which makes anchoring a 30,000-dollar farm receivable worth it. And nobody sees a wallet: distributors and farmers just use a web page.

### 1:55 – 2:20 · Negócio e mercado
> We charge 0.5% of face value, collected on-chain, inside the settlement itself. Distributors in our target association move 30 billion dollars a year. A small share of that is a real business.
> And we don't compete with Brazil's official registries — we sit on top of them, as the verification, marketplace and settlement layer they don't provide.

### 2:20 – 2:40 · Status e time
> AgroFlux is live on Devnet today, with the full cycle: registration, farmer acceptance, atomic assignment, double-sale rejection and payment at maturity.
> **[PREENCHER: 1 frase sobre você/time e a ligação com o agro ou com crédito.]**

### 2:40 – 2:50 · Fechamento
> Next: a pilot with one distributor and one fund in the 2026/27 season. AgroFlux: **trust you can verify, cash you can settle.**

*Logo + URL do app.*

---

## Notas de gravação
- Conversão usada: R$ 171 bi ≈ US$ 30 bi (câmbio em torno de R$ 5,50–5,70). Se preferir, diga em reais: "171 billion reais".
- "30,000-dollar farm receivable" ≈ R$ 170 mil, o mesmo valor do nosso caso de teste.
- Não diga que a registradora ou os financiadores são reais, nem que o token tem valor. Se perguntarem: "demo on Devnet with a simulated registry".
- Se passar de 3 min, corte primeiro o bloco "Por que Solana" (ele reaparece na demo técnica).
