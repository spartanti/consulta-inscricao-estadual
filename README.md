# Consulta de Inscrição Estadual — Brasil

Site para consultar a **Inscrição Estadual (IE)** de empresas de **todos os estados do Brasil**
a partir do **CNPJ**. Um seletor permite filtrar a IE por UF (ou ver todas de uma vez),
sem nova consulta à API.

## Como funciona

- **Backend**: Node.js puro (módulos nativos `http`/`https`), sem dependências externas.
- **Frontend**: HTML + CSS + JS puro em `public/`.
- **Fonte de dados**: API pública do [CNPJ.ws](https://publica.cnpj.ws) (`https://publica.cnpj.ws/cnpj/{cnpj}`),
  que retorna o array `inscricoes_estaduais` do estabelecimento (de todas as UFs).
  O filtro por estado é feito no navegador, reaproveitando o mesmo resultado.

O CNPJ é validado (14 dígitos + dígitos verificadores) antes de qualquer consulta externa.

## Rodar

```bash
cd consulta-ie-es
npm start          # ou: node server.js
```

Por padrão sobe em `http://localhost:3000`. Para usar outra porta:

```bash
PORT=3100 node server.js
```

Abra `http://localhost:3100` no navegador.

## API

`GET /api/consulta?cnpj=00000000000191`

Resposta (200):

```json
{
  "cnpj": "...",
  "razao_social": "...",
  "nome_fantasia": "...",
  "situacao_cadastral": "Ativa",
  "uf": "ES",
  "municipio": "Vitória",
  "inscricoes_estaduais": [
    { "inscricao_estadual": "...", "ativo": true, "uf": "ES", "atualizado_em": "10/10/2025" }
  ]
}
```

Erros retornam `{ "erro": "mensagem" }` com status 400/404/429/502/504.

## Observações

- A API pública do CNPJ.ws tem **limite de ~3 consultas por minuto** por IP.
  Em produção, considere a versão autenticada (com chave) ou cache.
- Para fins **oficiais**, confirme a IE no SINTEGRA da SEFAZ do estado correspondente.
- O seletor de estado permite ver a IE de qualquer UF; "Todos os estados" lista todas
  as inscrições do CNPJ de uma vez, cada uma com sua UF.
