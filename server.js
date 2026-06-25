'use strict';

/**
 * Consulta de Inscricao Estadual (IE) a partir do CNPJ
 * para empresas do Espirito Santo (ES).
 *
 * Backend em Node.js puro (sem dependencias externas).
 * Fonte dos dados: API publica do CNPJ.ws (https://publica.cnpj.ws),
 * que retorna o array "inscricoes_estaduais" do estabelecimento.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------------------------------------------------------------------------
// Utilitarios de CNPJ
// ---------------------------------------------------------------------------

/** Remove tudo que nao for digito. */
function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

/** Valida um CNPJ (14 digitos) pelos digitos verificadores. */
function isValidCnpj(cnpj) {
  cnpj = onlyDigits(cnpj);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false; // todos iguais

  const calc = (base) => {
    let sum = 0;
    let pos = base.length - 7;
    for (let i = 0; i < base.length; i++) {
      sum += parseInt(base[i], 10) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };

  const d1 = calc(cnpj.slice(0, 12));
  if (d1 !== parseInt(cnpj[12], 10)) return false;
  const d2 = calc(cnpj.slice(0, 13));
  if (d2 !== parseInt(cnpj[13], 10)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Consulta externa (CNPJ.ws)
// ---------------------------------------------------------------------------

function fetchCnpj(cnpj) {
  return new Promise((resolve, reject) => {
    const url = `https://publica.cnpj.ws/cnpj/${cnpj}`;
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'consulta-ie-es/1.0', Accept: 'application/json' } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode === 429) {
            return reject({ status: 429, message: 'Limite de consultas atingido. Aguarde alguns segundos e tente novamente.' });
          }
          if (res.statusCode === 404) {
            return reject({ status: 404, message: 'CNPJ nao encontrado na base da Receita.' });
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject({ status: 502, message: `Falha ao consultar a fonte de dados (HTTP ${res.statusCode}).` });
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject({ status: 502, message: 'Resposta invalida da fonte de dados.' });
          }
        });
      }
    );
    req.on('error', () => reject({ status: 502, message: 'Nao foi possivel contactar a fonte de dados.' }));
    req.setTimeout(15000, () => {
      req.destroy();
      reject({ status: 504, message: 'Tempo de consulta excedido. Tente novamente.' });
    });
  });
}

// ---------------------------------------------------------------------------
// Formatadores
// ---------------------------------------------------------------------------

function formatDateBR(iso) {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function formatCurrencyBR(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCep(cep) {
  const d = onlyDigits(cep);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep || null;
}

function formatPhone(ddd, num) {
  const d = onlyDigits(ddd);
  const n = onlyDigits(num);
  if (!n) return null;
  const numFmt = n.length >= 8 ? `${n.slice(0, n.length - 4)}-${n.slice(-4)}` : n;
  return d ? `(${d}) ${numFmt}` : numFmt;
}

/** Monta a descricao de um CNAE no formato "0000-0/00 - Descricao". */
function formatCnae(c) {
  if (!c) return null;
  const codigo = c.subclasse || c.classe || c.id || '';
  return { codigo, descricao: c.descricao || '' };
}

// ---------------------------------------------------------------------------
// Normalizacao da resposta (todas as informacoes publicas)
// ---------------------------------------------------------------------------

/** Normaliza a resposta da API: IE do ES em destaque + demais dados publicos. */
function buildResult(data) {
  const est = data.estabelecimento || {};
  const ies = Array.isArray(est.inscricoes_estaduais) ? est.inscricoes_estaduais : [];
  const ufEstabelecimento = (est.estado && est.estado.sigla) || null;

  // Endereco completo.
  const enderecoPartes = [
    [est.tipo_logradouro, est.logradouro].filter(Boolean).join(' '),
    est.numero && est.numero !== 'SN' ? `nº ${est.numero}` : est.numero === 'SN' ? 's/n' : '',
    est.complemento,
  ].filter(Boolean);

  const simples = data.simples || {};

  return {
    // --- Identificacao ---
    cnpj: est.cnpj || null,
    cnpj_raiz: data.cnpj_raiz || est.cnpj_raiz || null,
    tipo: est.tipo || null, // Matriz / Filial
    razao_social: data.razao_social || null,
    nome_fantasia: est.nome_fantasia || null,
    natureza_juridica: data.natureza_juridica ? data.natureza_juridica.descricao : null,
    porte: data.porte ? data.porte.descricao : null,
    capital_social: formatCurrencyBR(data.capital_social),
    data_inicio_atividade: formatDateBR(est.data_inicio_atividade),

    // --- Situacao cadastral ---
    situacao_cadastral: est.situacao_cadastral || null,
    data_situacao_cadastral: formatDateBR(est.data_situacao_cadastral),
    motivo_situacao_cadastral: est.motivo_situacao_cadastral
      ? est.motivo_situacao_cadastral.descricao
      : null,
    situacao_especial: est.situacao_especial || null,
    data_situacao_especial: formatDateBR(est.data_situacao_especial),

    // --- Inscricoes Estaduais (todas as UFs) ---
    uf: ufEstabelecimento,
    municipio: (est.cidade && est.cidade.nome) || null,
    inscricoes_estaduais: ies.map((ie) => ({
      inscricao_estadual: ie.inscricao_estadual,
      ativo: ie.ativo,
      uf: (ie.estado && ie.estado.sigla) || null,
      atualizado_em: formatDateBR(ie.atualizado_em),
    })),

    // --- Endereco ---
    endereco: {
      logradouro: enderecoPartes.join(', ') || null,
      bairro: est.bairro || null,
      municipio: (est.cidade && est.cidade.nome) || null,
      uf: ufEstabelecimento,
      cep: formatCep(est.cep),
    },

    // --- Contato ---
    contato: {
      telefone1: formatPhone(est.ddd1, est.telefone1),
      telefone2: formatPhone(est.ddd2, est.telefone2),
      fax: formatPhone(est.ddd_fax, est.fax),
      email: est.email || null,
    },

    // --- Atividades economicas (CNAE) ---
    atividade_principal: formatCnae(est.atividade_principal),
    atividades_secundarias: Array.isArray(est.atividades_secundarias)
      ? est.atividades_secundarias.map(formatCnae).filter(Boolean)
      : [],

    // --- Simples Nacional / MEI ---
    simples: {
      optante_simples: simples.simples || null,
      data_opcao_simples: formatDateBR(simples.data_opcao_simples),
      data_exclusao_simples: formatDateBR(simples.data_exclusao_simples),
      optante_mei: simples.mei || null,
      data_opcao_mei: formatDateBR(simples.data_opcao_mei),
      data_exclusao_mei: formatDateBR(simples.data_exclusao_mei),
    },

    // --- Quadro de socios e administradores (QSA) ---
    socios: Array.isArray(data.socios)
      ? data.socios.map((s) => ({
          nome: s.nome || null,
          qualificacao: s.qualificacao_socio ? s.qualificacao_socio.descricao.trim() : null,
          tipo: s.tipo || null,
          data_entrada: formatDateBR(s.data_entrada),
          faixa_etaria: s.faixa_etaria || null,
          documento: s.cpf_cnpj_socio || null,
          nome_representante: s.nome_representante || null,
          pais: s.pais ? s.pais.nome : null,
        }))
      : [],

    atualizado_em: formatDateBR(data.atualizado_em),
  };
}

// ---------------------------------------------------------------------------
// Servidor HTTP
// ---------------------------------------------------------------------------

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  // Impede path traversal para fora de public/
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Arquivo nao encontrado');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  // API: GET /api/consulta?cnpj=...
  if (req.method === 'GET' && req.url.startsWith('/api/consulta')) {
    const u = new URL(req.url, `http://${req.headers.host}`);
    const cnpj = onlyDigits(u.searchParams.get('cnpj'));

    if (!cnpj) {
      return sendJson(res, 400, { erro: 'Informe o CNPJ.' });
    }
    if (!isValidCnpj(cnpj)) {
      return sendJson(res, 400, { erro: 'CNPJ invalido. Verifique os digitos.' });
    }

    try {
      const data = await fetchCnpj(cnpj);
      return sendJson(res, 200, buildResult(data));
    } catch (e) {
      return sendJson(res, e.status || 500, { erro: e.message || 'Erro interno.' });
    }
  }

  // Arquivos estaticos
  if (req.method === 'GET') {
    return serveStatic(req, res);
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Metodo nao permitido');
});

server.listen(PORT, () => {
  console.log(`Consulta IE-ES rodando em http://localhost:${PORT}`);
});
