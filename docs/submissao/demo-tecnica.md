# Demo técnica — até 3 minutos (foco no uso da Solana)

Em inglês. Gravação de tela com narração. O foco é **o que acontece on-chain**, não a interface.
Para caber em 3 min, use os dados do seed (o AGF-0003 já está publicado) e deixe abas preparadas.

## Preparação (antes de gravar)
1. `POST /api/v1/demo/reset` e esperar cerca de 20 s. Conferir `GET /health` (assignment e doubleSpendProof em `true`).
2. Abas abertas, nesta ordem:
   - **A:** passaporte de um recebível já registrado e com aceite (pode ser um criado antes da gravação, ou o AGF-0001 após registrar e aceitar).
   - **B:** financiador → AGF-0003 (já publicado).
   - **C:** distribuidora **Sul Sementes** → AGF-0003.
   - **D:** VS Code com `blockchain/programs/agroflux-escrow/src/lib.rs` aberto na função `settle` (linha 32) e nas seeds (linha ~182–192).
   - **E:** `/verificar`, com o PDF do recebível cedido à mão.
3. Zoom do navegador em 110–125% para ler no vídeo.

## Roteiro

| Tempo | Tela | Narração (resumo) |
|---|---|---|
| 0:00–0:15 | Passaporte (A), lista de registros on-chain | "AgroFlux anchors every gate of a farm receivable on Solana Devnet. Here's what's on-chain." |
| 0:15–0:45 | Abrir a tx de registro no Explorer, aba do memo | "Gate 2 is an SPL Memo with the SHA-256 of the invoice and a hash of the sale data — no personal data. Gate 3, the farmer's acceptance, is another memo whose hash is bound to the registration. Our verifier re-reads these from the chain and checks them against our database." Clicar **Verificar na rede** e mostrar as checagens. |
| 0:45–1:00 | Financiador (B): enviar proposta | "A funder bids CDI plus spread. The bid is off-chain — it's not a commitment yet." |
| 1:00–1:45 | Distribuidora (C): aceitar e **Formalizar cessão**; abrir a liquidação no Explorer | "On assignment, the backend mints a Token-2022 asset with supply 1 and revokes the mint authority, so the receivable is unique. Then our Anchor program's `settle` runs in a single transaction: the token goes to the funder, the net amount in a test stablecoin goes to the distributor, and the platform fee goes to a treasury hard-coded in the program. All or nothing." Mostrar as 3 transferências no Explorer. |
| 1:45–2:05 | VS Code (D): `settle` e as seeds | "The same instruction initializes a PDA derived from the document hash — seeds `document` plus the hash. It can only be created once." |
| 2:05–2:25 | Passaporte: **Tentar vender de novo (prova)**; abrir a tx falha | "So if anyone tries to sell the same invoice again — even with a brand-new token — the program fails because the lock account already exists. This is a real rejected transaction on Devnet." |
| 2:25–2:40 | **Simular pagamento do sacado**; abrir a tx | "At maturity, one transaction credits the face value to the funder, burns the token and writes a payoff memo." |
| 2:40–2:55 | Verificador (E): arrastar o PDF | "Anyone can verify a document: the browser hashes it, and we derive the lock PDA and read it straight from Solana — no need to trust our database." |
| 2:55–3:00 | Página de Transparência | "All programs and wallets are public. Thanks." |

## Frases técnicas de apoio (se sobrar tempo ou para o texto do vídeo)
- Escrow `B3PdnyjFAJua4FbzdfotdZLN3S6LfAXKwavbJNkLxRXa`, tBRL-DEMO `8ncLEzjpEpHnEXExg2pSk8ByMRxytCtpmMwDf2BGtovn`, tesouraria `8j5HxEYAX1hFToDWjBQsvvKYafAc67qr76xjq5K53XVq`.
- Retries are idempotent: a new attempt reuses what was already sent on-chain instead of starting over.
- Users never hold keys: demo wallets and a fee payer live in the backend; self-custody for funders is on the roadmap.
- Tests: escrow 7 (`anchor test`), backend 100, end-to-end 14.

## Se algo falhar ao vivo
Use o AGF-0004 do seed, que já está cedido, para mostrar as transações prontas, e grave de novo só o trecho que falhou.
