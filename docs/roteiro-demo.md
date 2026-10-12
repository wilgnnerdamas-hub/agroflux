# Roteiro da demo — AgroFlux v1.3 (Crypto World's Fair, trilha Solana)

Duração alvo: **6 a 7 minutos** de tela (para o vídeo de 3 minutos, use o atalho). Tudo ao vivo na **Solana Devnet** (rede de testes).

## Antes de gravar ou apresentar (5 min)

1. `POST https://agroflux-production.up.railway.app/api/v1/demo/reset`. A lista volta com cinco exemplos, em três distribuidoras:
   - AGF-0001 (Distribuidora Demo): só registrado;
   - AGF-0002 (Cerrado Insumos): só cadastrado;
   - AGF-0003 (Sul Sementes): já publicado, com as propostas automáticas de B e C;
   - AGF-0004 (Cerrado Insumos): **cedido de verdade na Devnet**, com a taxa já na tesouraria (alimenta o painel admin);
   - AGF-0005 (Distribuidora Demo): só cadastrado.
   O reset leva uns 20 s, porque o AGF-0004 é cedido on-chain.
2. Conferir `GET /api/v1/health`:
   - versão `1.3.0`;
   - `features.assignment` e `features.doubleSpendProof` em `true`;
   - `feePayerBalanceLamports` acima de 0,5 SOL.
3. Abrir quatro janelas:
   - **Notebook A:** https://agroflux-ruby.vercel.app → "Entrar como distribuidora" (Distribuidora Demo).
   - **Notebook B (outra aba):** a mesma URL → "Entrar como financiador".
   - **Notebook C (outra aba):** a mesma URL → "Entrar como AgroFlux" (painel de operação).
   - **Celular:** para escanear o QR code do aceite.
4. Ter um PDF de teste **novo** à mão. A registradora recusa um documento repetido; se quiser mostrar isso, reenvie o mesmo PDF de propósito.
5. Para gravar em inglês, use o seletor **EN** no topo de qualquer tela.

## Roteiro

| # | Tela | O que fazer | O que dizer (resumo) |
|---|---|---|---|
| 1 | Página inicial | Deixar o passaporte animado rodar. Mostrar as três perguntas e os cinco portões. | "Antes de antecipar um recebível, o financiador pergunta: ele existe, o comprador reconhece e já foi vendido? A AgroFlux responde as três com um passaporte verificável na Solana." |
| 2 | Novo recebível | Entrar como distribuidora e cadastrar com os dados da nota de teste (Produtor Demo 45, MT, Fertilizante NPK 20-05-20, R$ 184.320,00, emissão 10/10/2026, vencimento 15/03/2027). Anexar `docs/demo/nf-teste-confere.pdf`. O hash aparece no navegador. | "O título ganha um número na registradora, que aqui é simulada. Só hashes vão para a blockchain." |
| 3 | Passaporte | Mostrar a **Conferência do documento por IA** (todos os campos conferem). **Registrar na Solana Devnet**. Mostrar o cartão de risco e clicar em **Gerar parecer da IA**. | "Uma IA lê a nota e confere com o que foi digitado. O risco vem de um modelo estatístico (regressão logística) com chuva real da região; o histórico do produtor e a base de treino são simulados." |
| 4 | Aceite do sacado | **Gerar QR code** e escanear com o celular. No celular, **Aceitar título**. O rating melhora. | "No balcão, o produtor aceita o título pelo celular. O aceite vai para a Solana e reduz o risco. Num produto real, ele seria feito na registradora ou na nota fiscal." |
| 5 | Publicação | Ler o termo, marcar o aceite e **Publicar para financiadores**. Chegam as propostas de B e C. | "A distribuidora assume a coobrigação, e o hash do termo também fica on-chain." |
| 6 | Propostas | Mostrar a tabela: taxa em **CDI + spread**, líquido e CET. Abrir o ⓘ de uma proposta. | "Precificação como no mercado: CDI do dia, do Banco Central, mais um spread pelo rating, juros compostos em dias úteis. A composição mostra deságio, tarifas, IOF quando o financiador é banco, a taxa da AgroFlux e o CET." |
| 7 | Financiador | Na outra janela, abrir o recebível, clicar **Verificar na rede**, ajustar o **spread sobre o CDI** e ver a prévia e o gráfico. **Enviar proposta**. | "O financiador confere tudo direto na rede e vê o líquido e o rendimento antes de propor." |
| 8 | Aceite da proposta | De volta à distribuidora, a terceira proposta aparece sozinha. **Aceitar proposta** do Financiador A. | "A distribuidora escolhe a melhor proposta, como num marketplace de recebíveis." |
| 9 | Cessão | **Formalizar cessão**. Abrir a liquidação no Explorer e mostrar as três transferências. | "Token único (Token-2022) trocado por tBRL-DEMO numa só transação: o financiador paga, a distribuidora recebe o líquido e a taxa de 0,5% vai para a tesouraria da AgroFlux. Ou tudo acontece, ou nada." |
| 10 | Prova de recusa e pagamento | **Tentar vender de novo (prova)** e abrir a transação recusada. Depois, **Simular pagamento do sacado**: a face vai ao financiador e o token é queimado. | "Mesmo com um token novo, a trava do documento faz a Solana recusar a segunda venda. No vencimento, o título é quitado e o token sai de circulação, numa só transação." |
| 11 | Painel AgroFlux | Na janela do admin: **Visão geral**, **Faturamento** (a receita da cessão que acabou de acontecer), **Risco** e **Configurações**. | "Do lado da operação: carteira, volume cedido, receita lançada na liquidação, mix de rating e perda esperada. CDI, taxa, tarifa e premissas de risco são configuráveis." |
| 12 | Carteira e transparência | No financiador: **Minha carteira** e o gráfico. Depois, **Transparência**, com a tesouraria. | "O rendimento projetado ao longo do tempo. E tudo o que a demo usa na rede, inclusive a tesouraria que recebe as taxas, está aberto para conferir." |
| 13 | Verificador público | Em **Verificar documento**, arrastar a mesma nota. Aparece "Já cedido", com as provas e a trava on-chain. Arrastar `nf-teste-diverge.pdf` (nunca cadastrada): "Não registrado". | "Qualquer financiador confere, só pelo hash, se uma nota já foi vendida, direto na Solana e sem depender do nosso banco." |

**Fechamento (15 s):** "Hoje é uma demo em rede de testes, com a registradora simulada. O próximo passo é integrar com
registradoras autorizadas, com a nota fiscal eletrônica e com bureaus de crédito, para que o aceite, a unicidade e o
risco venham de fontes oficiais, com a Solana garantindo a liquidação atômica, a cobrança da taxa e a verificação pública."

## Atalho (demo curta, 2 a 3 min)

Use o AGF-0003 (Sul Sementes), que já está publicado:
1. Entrar como financiador e enviar uma proposta (spread sobre o CDI).
2. Entrar como distribuidora → **Sul Sementes**, abrir o AGF-0003 e aceitar a proposta.
3. Formalizar a cessão e rodar a prova de recusa.
4. Abrir o painel AgroFlux → **Faturamento**: a receita nova aparece.

## Mostrar a IA pegando um erro (opcional, 30 s)

Cadastre de novo com os **mesmos dados**, mas anexe `docs/demo/nf-teste-diverge.pdf`. A conferência aponta "Divergências": valor declarado de R$ 184.320,00 contra R$ 148.320,00 no documento. O risco piora com o fator "Conferência do documento por IA".

## Se algo der errado

- **Etapa demorando:** a tela mostra "pendente" e se atualiza sozinha. As tentativas novas reaproveitam o que já foi enviado. Enquanto isso, mostre o AGF-0004, que já está cedido.
- **IA fora do ar:** a conferência fica "não concluída" (dá para repetir), e o resto do fluxo segue normalmente.
- **Banco Central fora do ar:** o CDI cai para o valor manual (13,65% a.a.); dá para ajustar em **Configurações**.
- **Devnet fora do ar:** usar a gravação de reserva.
- **Cessão instável:** desligar `NEXT_PUBLIC_FEATURE_ASSIGNMENT` na Vercel e `ASSIGNMENT_ENABLED` no Railway. O fluxo até a proposta aceita continua igual.

## O que nunca dizer

- Que a registradora é real, que o recebível está juridicamente validado ou que a coobrigação tem valor.
- Que a proposta é real, que o financiamento está garantido ou que token e tBRL-DEMO têm valor.
- Que a identidade do sacado foi verificada.
- Que o rating é uma análise de crédito real: o scorecard e o histórico do produtor são ilustrativos, e o IOF segue uma regra simplificada.

## Reserva

Gravar uma passada completa (notebook + celular) antes da apresentação e guardar o link do Explorer de cada transação.
Depois de gravar, rodar o `/demo/reset` de novo.
