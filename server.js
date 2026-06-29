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
const seo = require('./seo');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const CACHE_DIR = path.join(__dirname, 'data', 'cnpj');

// Garante o diretorio de cache das paginas por CNPJ.
fs.mkdirSync(CACHE_DIR, { recursive: true });

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
// Cache em disco das consultas (alimenta as paginas /cnpj e o sitemap)
// ---------------------------------------------------------------------------

function cachePath(cnpj) {
  return path.join(CACHE_DIR, `${cnpj}.json`);
}

function cacheGet(cnpj) {
  try {
    const raw = fs.readFileSync(cachePath(cnpj), 'utf8');
    return JSON.parse(raw).data;
  } catch (e) {
    return null;
  }
}

function cacheSet(cnpj, data) {
  try {
    fs.writeFileSync(
      cachePath(cnpj),
      JSON.stringify({ savedAt: new Date().toISOString(), data }),
      'utf8'
    );
  } catch (e) {
    /* cache best-effort */
  }
}

/** Consulta unificada: usa cache; senao busca na API, monta e salva. */
async function getCnpjData(cnpj) {
  const cached = cacheGet(cnpj);
  if (cached) return cached;
  const raw = await fetchCnpj(cnpj);
  const data = buildResult(raw);
  cacheSet(cnpj, data);
  return data;
}

/** Lista as consultas mais recentes (por data de modificacao do arquivo). */
function listRecent(limit = 50) {
  let files;
  try {
    files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
  } catch (e) {
    return [];
  }
  const items = files
    .map((f) => ({ f, mtime: fs.statSync(path.join(CACHE_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map(({ f }) => {
      const cnpj = f.replace(/\.json$/, '');
      const data = cacheGet(cnpj) || {};
      return { cnpj, razao: data.razao_social || null, uf: data.uf || null };
    });
  return items;
}

// ---------------------------------------------------------------------------
// Contador de consultas (persistente no volume)
// ---------------------------------------------------------------------------

const COUNTER_FILE = path.join(__dirname, 'data', 'counter.json');
const COUNTER_BASE = parseInt(process.env.COUNTER_BASE || '0', 10) || 0;

function counterRaw() {
  try {
    return JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8')).n || 0;
  } catch (e) {
    return 0;
  }
}

function counterGet() {
  return COUNTER_BASE + counterRaw();
}

function counterInc() {
  try {
    fs.writeFileSync(COUNTER_FILE, JSON.stringify({ n: counterRaw() + 1 }), 'utf8');
  } catch (e) {
    /* best-effort */
  }
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
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function sendHtml(res, status, html, isHead) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(isHead ? undefined : html);
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

  const isHead = req.method === 'HEAD';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(isHead ? undefined : 'Arquivo nao encontrado');
    }
    const ext = path.extname(filePath).toLowerCase();
    // HTML sem cache agressivo; assets (css/js/svg/img) cacheados por 1 dia.
    const cacheControl = ext === '.html' ? 'no-cache' : 'public, max-age=86400';
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
      'Content-Length': content.length,
      'Cache-Control': cacheControl,
    });
    // HEAD: envia apenas os cabecalhos, sem corpo.
    res.end(isHead ? undefined : content);
  });
}

const server = http.createServer(async (req, res) => {
  const isHead = req.method === 'HEAD';
  const isGet = req.method === 'GET' || isHead;
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(urlObj.pathname);

  // API: GET /api/consulta?cnpj=...
  if (req.method === 'GET' && pathname === '/api/consulta') {
    const cnpj = onlyDigits(urlObj.searchParams.get('cnpj'));
    if (!cnpj) return sendJson(res, 400, { erro: 'Informe o CNPJ.' });
    if (!isValidCnpj(cnpj)) return sendJson(res, 400, { erro: 'CNPJ invalido. Verifique os digitos.' });
    try {
      const data = await getCnpjData(cnpj);
      counterInc();
      return sendJson(res, 200, data);
    } catch (e) {
      return sendJson(res, e.status || 500, { erro: e.message || 'Erro interno.' });
    }
  }

  // Contador de consultas (leitura)
  if (req.method === 'GET' && pathname === '/api/contador') {
    return sendJson(res, 200, { count: counterGet() });
  }

  if (isGet) {
    // Sitemap dinamico (home + estados + guias + consultas + CNPJs cacheados)
    if (pathname === '/sitemap.xml') {
      const urls = [
        { loc: `${seo.SITE_URL}/`, priority: '1.0', lastmod: new Date().toISOString().slice(0, 10) },
        { loc: `${seo.SITE_URL}/validar-inscricao-estadual`, priority: '0.7' },
        { loc: `${seo.SITE_URL}/atividades`, priority: '0.6' },
        { loc: `${seo.SITE_URL}/guias`, priority: '0.6' },
        { loc: `${seo.SITE_URL}/incorporar`, priority: '0.5' },
        { loc: `${seo.SITE_URL}/consultas`, priority: '0.4' },
        { loc: `${seo.SITE_URL}/sobre`, priority: '0.4' },
        { loc: `${seo.SITE_URL}/contato`, priority: '0.3' },
        { loc: `${seo.SITE_URL}/privacidade`, priority: '0.3' },
        { loc: `${seo.SITE_URL}/termos`, priority: '0.3' },
        ...seo.UFS.map((uf) => ({ loc: `${seo.SITE_URL}/sintegra/${uf.toLowerCase()}`, priority: '0.8' })),
        ...seo.CAPITAIS.map((c) => ({ loc: `${seo.SITE_URL}/cidade/${c.slug}`, priority: '0.6' })),
        ...seo.ATIVIDADES.map((a) => ({ loc: `${seo.SITE_URL}/atividade/${a.slug}`, priority: '0.6' })),
        ...seo.GUIDES.map((g) => ({ loc: `${seo.SITE_URL}/guias/${g.slug}`, priority: '0.6' })),
        ...listRecent(5000).map((c) => ({ loc: `${seo.SITE_URL}/cnpj/${c.cnpj}`, priority: '0.5' })),
      ];
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
      return res.end(isHead ? undefined : seo.buildSitemapXml(urls));
    }

    // Paginas por estado: /sintegra/:uf
    let m = pathname.match(/^\/sintegra\/([a-zA-Z]{2})\/?$/);
    if (m) {
      const html = seo.renderStatePage(m[1]);
      return html ? sendHtml(res, 200, html, isHead) : sendHtml(res, 404, '<h1>Estado não encontrado</h1>', isHead);
    }

    // Paginas por CNPJ: /cnpj/:cnpj
    m = pathname.match(/^\/cnpj\/(\d{14})\/?$/);
    if (m) {
      const cnpj = m[1];
      if (!isValidCnpj(cnpj)) return sendHtml(res, 404, '<h1>CNPJ inválido</h1>', isHead);
      try {
        const data = await getCnpjData(cnpj);
        return sendHtml(res, 200, seo.renderCnpjPage(data, cnpj), isHead);
      } catch (e) {
        return sendHtml(res, e.status === 404 ? 404 : 502, `<h1>${e.message || 'Erro na consulta'}</h1>`, isHead);
      }
    }

    // Guias
    if (pathname === '/guias' || pathname === '/guias/') {
      return sendHtml(res, 200, seo.renderGuidesIndex(), isHead);
    }
    m = pathname.match(/^\/guias\/([a-z0-9-]+)\/?$/);
    if (m) {
      const html = seo.renderGuide(m[1]);
      return html ? sendHtml(res, 200, html, isHead) : sendHtml(res, 404, '<h1>Guia não encontrado</h1>', isHead);
    }

    // Consultas recentes
    if (pathname === '/consultas' || pathname === '/consultas/') {
      return sendHtml(res, 200, seo.renderConsultas(listRecent(100)), isHead);
    }

    // Cidades (capitais)
    m = pathname.match(/^\/cidade\/([a-z0-9-]+)\/?$/);
    if (m) {
      const html = seo.renderCidade(m[1]);
      return html ? sendHtml(res, 200, html, isHead) : sendHtml(res, 404, '<h1>Cidade não encontrada</h1>', isHead);
    }

    // Atividades (CNAE)
    if (pathname === '/atividades' || pathname === '/atividades/') {
      return sendHtml(res, 200, seo.renderAtividadesIndex(), isHead);
    }
    m = pathname.match(/^\/atividade\/([a-z0-9-]+)\/?$/);
    if (m) {
      const html = seo.renderAtividade(m[1]);
      return html ? sendHtml(res, 200, html, isHead) : sendHtml(res, 404, '<h1>Atividade não encontrada</h1>', isHead);
    }

    // Validador de IE
    if (pathname === '/validar-inscricao-estadual' || pathname === '/validar-inscricao-estadual/') {
      return sendHtml(res, 200, seo.renderValidador(), isHead);
    }

    // Widget e incorporação
    if (pathname === '/widget' || pathname === '/widget/') {
      return sendHtml(res, 200, seo.renderWidget(), isHead);
    }
    if (pathname === '/incorporar' || pathname === '/incorporar/') {
      return sendHtml(res, 200, seo.renderEmbed(), isHead);
    }

    // Páginas institucionais
    const inst = {
      '/sobre': seo.renderSobre,
      '/contato': seo.renderContato,
      '/privacidade': seo.renderPrivacidade,
      '/termos': seo.renderTermos,
    };
    const instKey = pathname.replace(/\/$/, '');
    if (inst[instKey]) {
      return sendHtml(res, 200, inst[instKey](), isHead);
    }

    // Arquivos estaticos
    return serveStatic(req, res);
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Metodo nao permitido');
});

server.listen(PORT, () => {
  console.log(`Consulta IE-ES rodando em http://localhost:${PORT}`);
});
