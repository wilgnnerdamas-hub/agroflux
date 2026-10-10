# Roteiro da demo — AgroFlux v1.2 (Crypto World's Fair, trilha Solana)

Duração alvo: **4 a 5 minutos** de tela. Tudo ao vivo na **Solana Devnet** (rede de testes).

## Antes de gravar ou apresentar (5 min)

1. `POST https://agroflux-production.up.railway.app/api/v1/demo/reset`. A lista volta com três exemplos:
   - AGF-0001, só registrado;
   - AGF-0002, só cadastrado;
   - AGF-0003, já publicado e com as propostas automáticas de B e C.
2. Conferir `GET /api/v1/health`:
   - versão `1.2.0`;
   - `features.assignment` e `features.doubleSpendProof` em `true`;
   - `feePayerBalanceLamports` acima de 0,5 SOL.
3. Abrir três janelas:
   - **Notebook A:** https://agroflux-ruby.vercel.app → "Entrar como distribuidora".
   - **Notebook B (ou outra aba):** a mesma URL → "Entrar como financiador".
   - **Celular:** para escanear o QR code do aceite.
4. Ter um PDF de teste **novo** à mão. A registradora recusa um documento repetido; se quiser mostrar isso, reenvie o mesmo PDF de propósito.
5. Para gravar em inglês, use o seletor **EN** no topo de qualquer tela.

## Roteiro

| # | Tela | O que fazer | O que dizer (resumo) |
|---|---|---|---|
| 1 | Página inicial | Mostrar o problema (as três perguntas) e as seis etapas. | "Antes de antecipar um recebível, o financiador pergunta: ele existe, o comprador reconhece e já foi vendido? A AgroFlux responde as três com um passaporte verificável na Solana." |
| 2 | Novo recebível | Entrar como distribuidora, cadastrar a venda e anexar o PDF. O hash aparece no navegador. | "O título ganha um número na registradora, que aqui é simulada. Só hashes vão para a blockchain." |
| 3 | Passaporte | **Registrar na Solana Devnet**. Em segundos o cartão muda para a próxima ação. | "O passaporte mostra sempre o próximo passo. O registro é um memo com os hashes." |
| 4 | Aceite do sacado | **Gerar QR code** e escanear com o celular. No celular, **Aceitar título**. | "No balcão, o produtor aceita o título pelo celular. O aceite vai para a Solana. Num produto real, ele seria feito na registradora ou na nota fiscal." |
| 5 | Publicação | Ler o termo, marcar o aceite e **Publicar para financiadores**. Chegam as propostas de B e C. | "A distribuidora assume a coobrigação, e o hash do termo também fica on-chain." |
| 6 | Financiador | Na outra janela, abrir o recebível, clicar **Verificar na rede**, ajustar a taxa e ver a prévia e o gráfico. **Enviar proposta**. | "O financiador confere tudo direto na rede antes de propor." |
| 7 | Propostas | De volta à distribuidora, a terceira proposta aparece sozinha. **Aceitar proposta** do Financiador A. | "A distribuidora escolhe a melhor proposta, como num marketplace de recebíveis." |
| 8 | Cessão | **Formalizar cessão**. Mostrar o domicílio de pagamento e abrir a liquidação no Explorer. | "Token único (Token-2022) trocado por tBRL-DEMO numa só transação: ou as duas pernas acontecem, ou nenhuma. O produtor passa a pagar ao financiador." |
| 9 | Prova de recusa | **Tentar vender de novo (prova)**. Abrir a transação recusada no Explorer. | "Mesmo com um token novo, a trava do documento faz a Solana recusar a segunda venda." |
| 10 | Carteira e transparência | No financiador: **Minha carteira**, o gráfico e o controle da data. Depois, **Transparência**. | "O rendimento projetado ao longo do tempo. E tudo o que a demo usa na rede está aberto para conferir." |

**Fechamento (15 s):** "Hoje é uma demo em rede de testes, com a registradora simulada. O próximo passo é integrar com
registradoras autorizadas e com a nota fiscal eletrônica, para que o aceite e a unicidade venham da fonte oficial, com a
Solana garantindo a liquidação atômica e a verificação pública."

## Atalho (demo curta, 2 min)

Use o AGF-0003, que já está publicado:
1. Entrar como financiador e enviar uma proposta.
2. Na distribuidora, aceitar a proposta.
3. Formalizar a cessão e rodar a prova de recusa.
4. Mostrar a carteira com o gráfico.

## Se algo der errado

- **Etapa demorando:** a tela mostra "pendente" e se atualiza sozinha. As tentativas novas reaproveitam o que já foi enviado. Enquanto isso, mostre o AGF-0003.
- **Devnet fora do ar:** usar a gravação de reserva.
- **Cessão instável:** desligar `NEXT_PUBLIC_FEATURE_ASSIGNMENT` na Vercel e `ASSIGNMENT_ENABLED` no Railway. O fluxo até a proposta aceita continua igual.

## O que nunca dizer

- Que a registradora é real, que o recebível está juridicamente validado ou que a coobrigação tem valor.
- Que a proposta é real, que o financiamento está garantido ou que token e tBRL-DEMO têm valor.
- Que a identidade do sacado foi verificada.

## Reserva

Gravar uma passada completa (notebook + celular) antes da apresentação e guardar o link do Explorer de cada transação.
Depois de gravar, rodar o `/demo/reset` de novo.
