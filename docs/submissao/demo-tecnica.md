# Demo técnica — até 3 minutos (foco no uso da Solana)

Em inglês. Gravação de tela com narração. O foco é **o que acontece on-chain**, não a interface.
Para caber em 3 min, as etapas lentas (cadastro, registro, aceite e publicação) são feitas **antes** de gravar. Durante a gravação, só a parte on-chain mais interessante.

## Preparação (uns 15 min, antes de gravar)
1. **Reset:** `POST /api/v1/demo/reset` e esperar uns 20 s. Conferir `GET /health` (assignment, doubleSpendProof e ai em `true`).
2. **Preparar o recebível da gravação** (não gravar):
   - Landing → "Entrar como distribuidora" → **Distribuidora Demo** → Novo recebível.
   - Dados: Produtor Demo 45, MT, Fertilizante NPK 20-05-20, R$ 184.320,00, emissão 10/10/2026, vencimento 15/03/2027, anexo `docs/demo/nf-gravacao-1.pdf`.
   - No passaporte: **Registrar na Solana Devnet** → **Gerar QR code** → aceitar pelo celular → marcar o termo e **Publicar para financiadores**.
   - Ele vira o AGF-0006 (o seed vai até o AGF-0005), já publicado e com as propostas automáticas de B e C.
3. **Abas, nesta ordem:**
   - **A:** passaporte do AGF-0006 (distribuidora), rolado até "Registros on-chain".
   - **B:** outra aba → landing → "Entrar como financiador" → **Financiador Demo A** → AGF-0006. Os perfis de distribuidora e de financiador ficam guardados separados no navegador, então as abas A e B convivem.
   - **C:** VS Code com `blockchain/programs/agroflux-escrow/src/lib.rs` aberto na função `settle` (linha 32); as seeds da trava ficam perto da linha 192.
   - **D:** `/verificar`, com o `nf-gravacao-1.pdf` à mão para arrastar.
4. Zoom do navegador em 110–125%. Fechar notificações. Testar o microfone.

## Roteiro

| Tempo | Tela | Narração (resumo) |
|---|---|---|
| 0:00–0:15 | Passaporte (A), lista de registros on-chain | "AgroFlux anchors every gate of a farm receivable on Solana Devnet. Here's what's on-chain." |
| 0:15–0:45 | Abrir a tx de registro no Explorer, aba do memo | "Gate 2 is an SPL Memo with the SHA-256 of the invoice and a hash of the sale data — no personal data. Gate 3, the farmer's acceptance, is another memo whose hash is bound to the registration. Our verifier re-reads these from the chain and checks them against our database." Clicar **Verificar na rede** e mostrar as checagens. |
| 0:45–1:00 | Financiador (aba B): ajustar o spread e **Enviar proposta** | "A funder bids CDI plus spread. The bid is off-chain — it's not a commitment yet." |
| 1:00–1:45 | Distribuidora (aba A): **Aceitar proposta** do Financiador A e **Formalizar cessão**; abrir a liquidação no Explorer | "On assignment, the backend mints a Token-2022 asset with supply 1 and revokes the mint authority, so the receivable is unique. Then our Anchor program's `settle` runs in a single transaction: the token goes to the funder, the net amount in a test stablecoin goes to the distributor, and the platform fee goes to a treasury hard-coded in the program. All or nothing." Mostrar as 3 transferências no Explorer. |
| 1:45–2:05 | VS Code (aba C): `settle` e as seeds | "The same instruction initializes a PDA derived from the document hash — seeds `document` plus the hash. It can only be created once." |
| 2:05–2:25 | Passaporte (aba A): **Tentar vender de novo (prova)**; abrir a tx falha | "So if anyone tries to sell the same invoice again — even with a brand-new token — the program fails because the lock account already exists. This is a real rejected transaction on Devnet." |
| 2:25–2:40 | **Simular pagamento do sacado**; abrir a tx | "At maturity, one transaction credits the face value to the funder, burns the token and writes a payoff memo." |
| 2:40–2:55 | Verificador (aba D): arrastar o `nf-gravacao-1.pdf` | "Anyone can verify a document: the browser hashes it, and we derive the lock PDA and read it straight from Solana — no need to trust our database." |
| 2:55–3:00 | Página de Transparência | "All programs and wallets are public. Thanks." |

## Frases técnicas de apoio (se sobrar tempo ou para o texto do vídeo)
- Escrow `B3PdnyjFAJua4FbzdfotdZLN3S6LfAXKwavbJNkLxRXa`, tBRL-DEMO `8ncLEzjpEpHnEXExg2pSk8ByMRxytCtpmMwDf2BGtovn`, tesouraria `8j5HxEYAX1hFToDWjBQsvvKYafAc67qr76xjq5K53XVq`.
- Retries are idempotent: a new attempt reuses what was already sent on-chain instead of starting over.
- Users never hold keys: demo wallets and a fee payer live in the backend; self-custody for funders is on the roadmap.
- Tests: escrow 7 (`anchor test`), backend 101, end-to-end 16.

## Se algo falhar ou precisar regravar
- Grave em trechos. Dá para cortar e juntar depois: ninguém espera um plano-sequência.
- **Se a cessão já aconteceu**, a nota `nf-gravacao-1` ficou travada para sempre. Para regravar do zero: reset, e preparar de novo com a `nf-gravacao-2` (depois a `-3`).
- Se uma etapa demorar, use o AGF-0004 do seed, que já está cedido, para mostrar as transações prontas.
