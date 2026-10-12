# Checklist da submissão — prazo: 12/10/2026 às 23:59 PT (13/10 às 03:59 em Brasília)

## Depende de você (wilgnner)
- [ ] **Time:** papel, formação e experiência de cada integrante (nomes já no formulário e no README) (+ ligação com o agro ou com crédito) → `formulario.md`, seção Team, e uma frase em `pitch.md`, bloco 2:20.
- [ ] **Localização:** cidade e estado.
- [ ] **Validação:** 3 a 5 conversas hoje com o kit em `validacao.md`. Mande as anotações para eu atualizar o formulário e o pitch. Se não der, usamos o texto honesto que já está no formulário.
- [ ] **Tração:** qualquer número real (pessoas que testaram, lista de espera, seguidores).
- [x] Confirmado: código escrito desde 09/10; autores na licença: Wilgnner Guilherme Damas Garcia Salgado e Marco Antonio Souza Cavalcante.
- [ ] **Gravar o pitch** (2–3 min) → `pitch.md`.
- [ ] **Gravar a demo técnica** (até 3 min) → `demo-tecnica.md`.
- [ ] Subir os vídeos (YouTube não listado ou Loom) e colar os links no formulário.
- [ ] Preencher e enviar o formulário no site do Colosseum.

## Antes de gravar
- [ ] `POST https://agroflux-production.up.railway.app/api/v1/demo/reset` (≈ 20 s). Apaga o AGF-0016 e os testes e corrige o AGF-0003.
- [ ] `GET /api/v1/health`: versão, `features.assignment`, `features.doubleSpendProof`, `features.ai` em `true` e saldo do pagador acima de 0,5 SOL.
- [ ] Usar as notas **novas** `docs/demo/nf-gravacao-1.pdf`, `-2` e `-3` (mesmos dados do Produtor Demo 45, só muda o número da nota). Cada tomada que chega à cessão "gasta" uma nota, porque a trava on-chain é permanente. A `nf-teste-confere.pdf` **já foi cedida** (AGF-0016) e não serve mais para a cessão. A `nf-teste-diverge.pdf` continua livre para mostrar a IA pegando o erro.
- [ ] Depois de gravar, rodar o reset de novo, para os jurados encontrarem a demo limpa.

## Pronto (feito pelo agente)
- [x] Produto em produção com o ciclo completo na Devnet.
- [x] README em inglês, licença MIT, roteiro da demo.
- [x] Textos do formulário em inglês → `formulario.md`.
- [x] Roteiro do pitch → `pitch.md`.
- [x] Roteiro da demo técnica → `demo-tecnica.md`.
- [x] Logo: `logo.svg`, `logo-512.png`, `logo-1024.png`, `logo-wordmark.png`.
- [x] Estudo de mercado (`docs/estudo-mercado-agroflux.pdf`) e aula (`docs/aula-agroflux.pdf`).
