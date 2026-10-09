# AgroFlux

Passaporte digital de recebíveis agrícolas, com registro verificável na **Solana Devnet**.
MVP para o hackathon Crypto World's Fair (Colosseum), trilha Solana.

> Demonstração. Recebíveis fictícios, sem validação jurídica. Ofertas de financiamento simuladas, sem movimentação financeira.

## Estrutura

```
agroflux/
├─ frontend/   Next.js + TypeScript + Tailwind (interface B2B)
├─ backend/    API, armazenamento e integração com a Solana (equipe de backend/blockchain)
└─ docs/       Contrato da API, decisões técnicas e roteiro da demo
```

**Antes de implementar qualquer coisa, leia [`docs/api-contract.md`](docs/api-contract.md).** Ele é a fonte única de campos, estados e endpoints.

## Rodar o frontend

Pré-requisito: Node.js 20 ou mais novo.

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

- Sem backend: crie `frontend/.env.development.local` com a linha `NEXT_PUBLIC_API_MODE=mock` para ligar o **modo mock**.
- Com backend: copie `.env.example` para `.env.local`, defina `NEXT_PUBLIC_API_MODE=http` e `NEXT_PUBLIC_API_URL`, e apague `.env.development.local`.

Detalhes em [`frontend/README.md`](frontend/README.md).

## Regras do projeto

1. Nada de documentos ou dados pessoais na blockchain. Só hashes e identificadores.
2. Nenhuma chave privada no frontend ou em arquivos versionados (`.env` fica fora do git).
3. Não apresentar recebíveis como juridicamente validados, ofertas como reais nem financiamento como garantido.
4. Mudanças no contrato da API só com o OK da gestão do projeto (ver §13 do contrato).
