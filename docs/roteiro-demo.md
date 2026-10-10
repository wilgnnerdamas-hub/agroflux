# Roteiro da demo — AgroFlux (Crypto World's Fair, trilha Solana)

Duração alvo: **3 a 4 minutos** de tela. Tudo ao vivo na **Solana Devnet** (rede de testes).

## Antes de gravar ou apresentar (5 min)

1. `POST https://agroflux-production.up.railway.app/api/v1/demo/reset` (ou pedir ao agente). A lista volta a ter
   AGF-0001 (já registrado) e AGF-0002 (só cadastrado).
2. Conferir `GET /api/v1/health`: `features.debtorConfirmation` e `features.assignment` em `true`,
   `feePayerBalanceLamports` acima de 0,5 SOL.
3. Abrir duas janelas:
   - **Notebook:** https://agroflux-ruby.vercel.app (papel da distribuidora).
   - **Celular** (ou janela estreita): para abrir o link do sacado.
4. Ter o PDF de teste à mão (`frontend/tests/fixtures/nf-teste.pdf`).
5. Deixar uma aba do Solana Explorer (Devnet) aberta para mostrar as transações.

## Roteiro

| # | Tela | O que fazer | O que dizer (resumo) |
|---|---|---|---|
| 1 | Dashboard | Mostrar indicadores e a lista. | "Distribuidores de insumos vendem a prazo e têm dificuldade de mostrar recebíveis organizados e verificáveis a financiadores. A AgroFlux transforma cada recebível num passaporte digital." |
| 2 | Novo recebível | Preencher sacado (pseudônimo), insumo, valor, datas e anexar o PDF. Mostrar o hash calculado no navegador. | "Nenhum documento ou dado pessoal vai para a blockchain. Só o hash do documento e identificadores." |
| 3 | Passaporte | Clicar **Registrar na Solana Devnet**. Em poucos segundos aparece a assinatura. Abrir no Explorer e mostrar o memo. | "O registro é um memo na Solana com o hash dos dados e do documento. Qualquer pessoa confere." |
| 4 | Passaporte | **Verificar na rede**: o backend busca a transação e recalcula os hashes. | "Se alguém alterar o arquivo ou os dados, a verificação acusa." |
| 5 | Confirmação do sacado | **Gerar link de confirmação** e abrir no celular. Mostrar o aviso de simulação e tocar **Confirmar compra**. O passaporte se atualiza sozinho. | "O comprador confirma que a compra existe. Isso também fica registrado on-chain. Nesta demo não há verificação de identidade." |
| 6 | Ofertas simuladas | Mostrar as 3 ofertas (fictícias) e selecionar uma. | "Sem a confirmação do sacado, a seleção fica bloqueada. As ofertas são simuladas, não há financiador real." |
| 7 | Cessão tokenizada | Mostrar a faixa de aviso, clicar **Formalizar cessão (simulação na Devnet)**. Abrir a liquidação no Explorer: o token sai do distribuidor e o tBRL-DEMO sai do financiador **na mesma transação**. | "O recebível vira um token único (Token-2022). Um programa de escrow em Anchor troca o token pelo valor líquido numa transação atômica: ou as duas pernas acontecem, ou nenhuma. Token e moeda de teste, sem valor." |
| 8 | Histórico | Rolar o histórico: cada evento on-chain tem link. | "Tudo que aconteceu com o recebível está num só lugar, verificável." |

**Fechamento (15 s):** "Hoje é uma demo em rede de testes. Num produto real, a cessão exigiria adequação às regras
da CVM e registro do título em registradora. O próximo passo é integrar com registradoras e financiadores parceiros."

## Se algo der errado

- **Registro ou cessão demorando:** a tela mostra "pendente" e se atualiza sozinha. Se passar de 1 minuto, aparece
  o botão de nova tentativa, que reaproveita o que já foi enviado. Enquanto isso, mostrar o AGF-0001, que já está registrado.
- **Devnet fora do ar:** o dashboard mostra o erro de conexão. Usar a gravação de reserva.
- **Função B instável:** desligar `NEXT_PUBLIC_FEATURE_ASSIGNMENT` na Vercel (redeploy) e `ASSIGNMENT_ENABLED` no
  Railway. O fluxo principal (passos 1–6) segue igual; a cessão vira roadmap no pitch.

## O que nunca dizer

- Que o recebível está juridicamente validado, que a oferta é real ou que o financiamento está garantido.
- Que o token ou o tBRL-DEMO têm valor, ou que a cessão é jurídica.
- Que a identidade do sacado foi verificada.

## Reserva

Gravar uma passada completa (tela do notebook + celular) antes da apresentação e guardar o link do Explorer de cada
transação. Depois de gravar, rodar o `/demo/reset` de novo.
