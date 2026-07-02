'use strict';

/**
 * Agente local do SINTEGRA Brasil.
 *
 * Roda um servidor HTTP em 127.0.0.1 (localhost) com o qual o site
 * https://www.sintegrabrasil.com.br conversa via fetch(). O agente usa o
 * certificado A1 do cliente para baixar a NF-e na SEFAZ (Distribuição DF-e).
 *
 * A chave privada e o certificado NUNCA são enviados a servidores externos —
 * tudo acontece nesta máquina. O tráfego navegador→agente é local (localhost).
 */

const http = require('http');
const sefaz = require('./sefaz');

const PORT = parseInt(process.env.AGENTE_PORT || '54345', 10);
const VERSION = require('./package.json').version;

// Origens autorizadas a falar com o agente.
const ALLOWED = [
  'https://www.sintegrabrasil.com.br',
  'https://sintegrabrasil.com.br',
  'http://localhost:3100',
  'http://localhost:3000',
];

function cors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Chrome Private Network Access: site público -> rede local
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function lerBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let tam = 0;
    req.on('data', (c) => {
      tam += c.length;
      if (tam > 12 * 1024 * 1024) { reject(new Error('Requisição muito grande.')); req.destroy(); return; }
      data += c;
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error('JSON inválido.')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  // Descoberta: o site chama /ping para saber se o agente está instalado.
  if (req.method === 'GET' && url.pathname === '/ping') {
    return json(res, 200, { ok: true, app: 'agente-nfe-sintegrabrasil', version: VERSION });
  }

  // Baixar NF-e por chave usando o certificado A1.
  if (req.method === 'POST' && url.pathname === '/baixar') {
    try {
      const b = await lerBody(req);
      if (!b.pfx || !b.chave) return json(res, 400, { erro: 'Informe o certificado (pfx) e a chave.' });
      const pfxBuffer = Buffer.from(b.pfx, 'base64');
      const r = await sefaz.baixarPorChave({
        pfxBuffer,
        senha: b.senha || '',
        chave: b.chave,
        tpAmb: b.tpAmb || '1',
        cUFAutor: b.cUFAutor,
      });
      if (!r.ok) {
        return json(res, 200, {
          ok: false,
          cStat: r.cStat,
          motivo: r.motivo || (r.resumoApenas
            ? 'A SEFAZ retornou apenas o resumo desta nota — o XML completo só é liberado para o destinatário/emitente.'
            : 'Documento não disponível para este certificado.'),
        });
      }
      return json(res, 200, { ok: true, cStat: r.cStat, motivo: r.motivo, xml: r.procNFe });
    } catch (e) {
      return json(res, 500, { erro: e.message || 'Falha no agente.' });
    }
  }

  json(res, 404, { erro: 'Rota não encontrada.' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Agente NF-e SINTEGRA Brasil v' + VERSION);
  console.log('Rodando em http://127.0.0.1:' + PORT + '  (mantenha esta janela aberta)');
  console.log('A chave do seu certificado permanece nesta máquina. Não feche enquanto usar o site.');
});
