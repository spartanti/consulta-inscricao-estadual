# Agente NF-e — SINTEGRA Brasil

Programa local que baixa a **NF-e** na SEFAZ (web service **Distribuição DF-e**)
usando o **certificado A1** do próprio usuário. A chave privada **nunca sai da
máquina**: o site `sintegrabrasil.com.br/nfe` conversa com este agente apenas
via `http://127.0.0.1:54345` (tráfego local).

## Como funciona
1. O agente sobe um servidor em `127.0.0.1:54345`.
2. A página `/nfe` detecta o agente (`GET /ping`) e libera o formulário de certificado.
3. O usuário informa a **chave (44 dígitos)**, o **.pfx (A1)** e a **senha**.
4. O agente faz **mTLS** com a SEFAZ, baixa o XML e devolve para o navegador gerar o DANFE.

> Só retorna o XML completo de notas em que o **CNPJ do certificado é parte**
> (normalmente destinatário). Caso contrário a SEFAZ devolve só o resumo.

## Rodar em desenvolvimento
```bash
cd agente-nfe
npm install
npm start           # sobe em http://127.0.0.1:54345
```
Depois abra `http://localhost:3100/nfe` (ou o site em produção) — o agente será detectado.

## Empacotar como executável (sem exigir Node instalado)
```bash
npm install
npm run build:win     # gera dist/agente-nfe.exe  (Windows)
npm run build:mac     # gera dist/agente-nfe-mac
npm run build:linux   # gera dist/agente-nfe-linux
```
(Usa o [`pkg`](https://github.com/vercel/pkg). O `node-forge` é JS puro e é
embutido no binário.)

## Assinatura de código (IMPORTANTE p/ Windows)
Sem assinatura Authenticode, o SmartScreen do Windows alerta o usuário. Assine o
`.exe` com um certificado de **assinatura de código** (EV de preferência):
```bash
signtool sign /fd SHA256 /a /tr http://timestamp.digicert.com /td SHA256 dist\agente-nfe.exe
```
Depois hospede o instalador/`.exe` e aponte o link "Instalar agente" na página `/nfe`.

## Distribuição / auto-início (sugestão)
- Empacotar num instalador (Inno Setup / MSIX) que registra o agente para
  iniciar com o Windows (bandeja do sistema).
- Opcional: virar um serviço, ou app de bandeja com Electron/Tauri para UX melhor.

## Segurança
- A chave privada e o `.pfx` **não são enviados a servidores externos**.
- O agente só aceita requisições das origens em `ALLOWED` (agente.js).
- Não persiste o certificado: processa em memória e descarta ao fim da requisição.

## Ambiente
- `AGENTE_PORT` — porta (padrão `54345`).
- Produção SEFAZ: `tpAmb=1`; homologação: `tpAmb=2` (enviado pelo site).

## Pendências para produção
- [ ] Assinar o executável (Authenticode).
- [ ] Instalador + ícone de bandeja + auto-update.
- [ ] Testar com um certificado A1 real e uma chave que o CNPJ tenha direito de baixar.
- [ ] (Opcional) suportar distribuição por NSU (baixar todas as notas recebidas).
