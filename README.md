# SINTEGRA Brasil

**Site:** https://www.sintegrabrasil.com.br

Plataforma gratuita de dados de empresas brasileiras: consulta de **Inscrição Estadual (IE)**
por **CNPJ** em todos os 27 estados, geração de **DANFE** da NF-e, busca de empresas por
atividade e uma **API pública**.

## Recursos

- **Consulta de IE por CNPJ** — Inscrição Estadual, situação cadastral, endereço, CNAE e dados
  públicos, com filtro por UF.
- **DANFE / NF-e** ([/nfe](https://www.sintegrabrasil.com.br/nfe)) — gera o DANFE em PDF a partir
  do **XML** (100% no navegador) ou baixa a nota pela **chave de acesso** usando **certificado
  digital A1** através do [Agente](https://www.sintegrabrasil.com.br/agente) (a chave privada não
  sai da máquina do usuário).
- **Busca de empresas** ([/busca](https://www.sintegrabrasil.com.br/busca)) — por CNAE, estado e
  município, com **mapa de calor** geográfico.
- **Validador de IE** ([/validar-inscricao-estadual](https://www.sintegrabrasil.com.br/validar-inscricao-estadual)) — nos 27 estados.
- **API pública (JSON)** — ver abaixo.
- Páginas SEO por estado, cidade, atividade e CNPJ; PWA; conformidade com LGPD.

## Stack

- **Backend:** Node.js (`http`/`https` nativos), PostgreSQL (`pg`).
- **Frontend:** HTML + CSS + JS puro em `public/`.
- **Dados:** base cadastral dos Dados Abertos da Receita Federal, enriquecida a cada consulta pela
  API pública do [CNPJ.ws](https://publica.cnpj.ws). O DANFE via certificado usa o web service
  **NFeDistribuicaoDFe** da SEFAZ (Ambiente Nacional).

> Serviço **independente e privado** (Spartan TI), sem vínculo com a Receita Federal, com as SEFAZ
> estaduais ou com o portal oficial do SINTEGRA. Caráter informativo.

## API pública

```
GET /api/v1/cnpj/{cnpj}                       → dados cadastrais + Inscrição Estadual (JSON)
GET /api/v1/buscar?cnae=&uf=&municipio=&q=    → busca de empresas
```

Exemplo:

```bash
curl "https://www.sintegrabrasil.com.br/api/v1/cnpj/00000000000191"
```

Resposta (200):

```json
{
  "cnpj": "00000000000191",
  "razao_social": "...",
  "situacao_cadastral": "Ativa",
  "uf": "DF",
  "municipio": "Brasília",
  "inscricoes_estaduais": [
    { "inscricao_estadual": "...", "ativo": true, "uf": "DF", "atualizado_em": "10/10/2025" }
  ]
}
```

Erros retornam `{ "erro": "mensagem" }`. Limite de **3 consultas por minuto** por IP.
Documentação completa: https://www.sintegrabrasil.com.br/api

## Rodar (desenvolvimento)

```bash
npm install
DATABASE_URL="postgres://..." PORT=3100 node server.js
```

Abra `http://localhost:3100`. Para fins **oficiais**, confirme a IE no SINTEGRA da SEFAZ do estado.

## Licença

© SINTEGRA Brasil / Spartan TI. **Todos os direitos reservados.** O código-fonte é público para
transparência, mas **não é licenciado para reuso** sem autorização por escrito.
