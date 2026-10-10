# AgroFlux — escrow da cessão tokenizada (Anchor)

**Simulação na Solana Devnet. Token e moeda sem valor. Não é oferta de investimento nem cessão jurídica.**

Programa `agroflux_escrow` (contrato v1.1, §6.4). Instrução única `settle(amount)`: confere os termos,
transfere o token da cessão (Token-2022, supply 1) do distribuidor demo para o financiador demo e
`amount` de tBRL-DEMO no sentido inverso, na mesma transação, e grava um registro por token (PDA `["settlement", mint]`).

- `anchor build` · `anchor test` (4 testes: caminho feliz, financiador sem saldo sem nenhuma perna executada,
  mint não revogado e valor zero).
- IDL em `idl/agroflux_escrow.json` (o backend monta a instrução a partir dela).
- Compilado no WSL (Ubuntu). O keypair do programa (`target/deploy/`) nunca entra no git.
