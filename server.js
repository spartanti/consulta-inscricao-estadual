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
const crypto = require('crypto');
const geoip = require('geoip-lite');
const seo = require('./seo');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const CACHE_DIR = path.join(DATA_DIR, 'cnpj');

// Garante o diretorio de dados (no volume persistente, usado pelo contador).
fs.mkdirSync(CACHE_DIR, { recursive: true });

// Coordenadas de municipios (UF|NOME_NORMALIZADO -> [lat, lng]) para o mapa de calor.
let MUNI_COORDS = {};
try {
  MUNI_COORDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'municipios-coords.json'), 'utf8'));
} catch (e) {
  console.error('municipios-coords.json nao carregado:', e.message);
}
function normMuni(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

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

/**
 * Consulta com enriquecimento:
 *  - se a linha ja foi enriquecida (tem IE), devolve do banco (cache);
 *  - senao busca na API, monta o payload completo (com IE) e enriquece;
 *  - se a API falhar mas existir base (Receita), devolve a base.
 */
// Cooldown global da CNPJ.ws: ao bater no limite (429), descansa alguns segundos
// em vez de martelar a API — assim o orçamento de 3/min se recupera.
let cnpjwsCooldownUntil = 0;

// CNPJs removidos a pedido do titular (LGPD): nunca consultar (nem na CNPJ.ws) nem exibir.
// Cache em memória da tabela cnpj_removidos (seed hardcoded caso o banco esteja fora).
const CNPJ_REMOVIDOS = new Set([
  '64048012000179',
]);
async function reloadRemovidos() {
  try {
    const rows = await db.removedList();
    CNPJ_REMOVIDOS.clear();
    CNPJ_REMOVIDOS.add('64048012000179');
    for (const r of rows) CNPJ_REMOVIDOS.add(r.cnpj);
  } catch (e) { /* mantém cache atual */ }
}

async function getCnpjData(cnpj) {
  if (CNPJ_REMOVIDOS.has(cnpj)) {
    throw { status: 410, message: 'Dados excluídos em conformidade com a LGPD' };
  }
  let row = null;
  try { row = await db.getRow(cnpj); } catch (e) { /* banco indisponivel */ }
  // Já temos IE (enriquecido) → cache, sem tocar a CNPJ.ws.
  if (row && row.enriquecido_em) return row.data;

  // CNPJ.ws em cooldown (limite recente): não insiste — serve a base se tiver.
  if (Date.now() < cnpjwsCooldownUntil) {
    if (row && row.data) return row.data; // dados cadastrais da Receita (sem IE fresca)
    throw { status: 429, message: 'Muitas consultas neste instante. Tente novamente em alguns segundos.' };
  }

  try {
    const raw = await fetchCnpj(cnpj);
    const data = buildResult(raw);
    try { await db.saveEnriched(cnpj, data); } catch (e) { /* best-effort */ }
    return data;
  } catch (e) {
    if (e && e.status === 429) cnpjwsCooldownUntil = Date.now() + 20000; // descansa 20s
    if (row && row.data) return row.data; // fallback: base cadastral (sem IE)
    throw e;
  }
}

/** Lista as consultas recentes (enriquecidas) do banco. */
async function listRecent(limit = 50) {
  try { return await db.listRecent(limit); } catch (e) { return []; }
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
// API pública: CORS, rate limit por IP, IP do cliente
// ---------------------------------------------------------------------------

function clientIp(req) {
  // Atrás do proxy da Railway, o IP real é o ÚLTIMO valor do X-Forwarded-For
  // (acrescentado pelo proxy confiável). Usar o primeiro permitiria que o
  // cliente forjasse o header e furasse o rate-limit.
  const parts = String(req.headers['x-forwarded-for'] || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : (req.socket && req.socket.remoteAddress) || 'unknown';
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Rotas feitas para serem incorporadas em outros sites (iframe).
const EMBED_PATHS = new Set(['/widget', '/widget/', '/incorporar', '/incorporar/']);

/** Cabeçalhos de segurança aplicados a todas as respostas. */
function setSecurityHeaders(res, pathname) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // O widget precisa ser embutido em qualquer site; o resto, não (anti-clickjacking).
  const embed = EMBED_PATHS.has(pathname);
  const frameAncestors = embed ? '*' : "'self'";
  if (!embed) res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://unpkg.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://adservice.google.com https://*.googleadservices.com https://*.adtrafficquality.google",
      "style-src 'self' 'unsafe-inline' https://unpkg.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com http://127.0.0.1:54345 http://localhost:54345 https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.adtrafficquality.google",
      "frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com https://*.googlesyndication.com https://*.doubleclick.net",
      "font-src 'self' data:",
      'frame-ancestors ' + frameAncestors,
    ].join('; ')
  );
}

const rlHits = new Map(); // ip -> [timestamps]
const RL_LIMIT = 30; // req por janela
const RL_WINDOW = 60000; // 60s

// Cache em memória do mapa de calor (contagens mudam pouco).
const mapaCache = new Map(); // cnae -> { t, data }
const heatCache = new Map(); // cnae -> { t, data } (pontos por município)
const MAPA_TTL = 6 * 3600 * 1000; // 6 horas

// Sitemap
const SM_CHUNK = 50000; // URLs por arquivo de sitemap (limite do protocolo)
let sitemapIndexCache = null; // { t, xml }

// Métricas de uso (buffer em memória; flush periódico no Postgres p/ evitar 1 write por request)
const metricBuf = new Map();
function bump(m, n) { metricBuf.set(m, (metricBuf.get(m) || 0) + (n || 1)); }
async function flushMetrics() {
  if (!metricBuf.size) return;
  const entries = Array.from(metricBuf.entries());
  metricBuf.clear();
  for (const [m, n] of entries) { try { await db.bumpMetric(m, n); } catch (e) {} }
}
setInterval(flushMetrics, 30000).unref();

// Visitantes: IP -> hash salgado (pseudonimização LGPD) + cidade/UF via geoip offline.
// NÃO armazena o IP puro; guarda só a localização aproximada e um hash não-reversível.
const GEO_SALT = process.env.GEO_SALT || process.env.STATS_KEY || 'sintegrabrasil-geo-v1';
const visitorBuf = new Map(); // dia|hash -> { dia, ip_hash, uf, cidade }
function trackVisitor(req) {
  try {
    const ip = clientIp(req);
    if (!ip || ip === 'unknown') return;
    const dia = new Date().toISOString().slice(0, 10);
    const ipHash = crypto.createHash('sha256').update(GEO_SALT + '|' + ip).digest('hex').slice(0, 24);
    const key = dia + '|' + ipHash;
    if (visitorBuf.has(key)) return;
    const g = geoip.lookup(ip) || {};
    visitorBuf.set(key, { dia, ip_hash: ipHash, uf: g.region || null, cidade: g.city || null });
    if (visitorBuf.size > 3000) flushVisitors();
  } catch (e) { /* best-effort */ }
}
async function flushVisitors() {
  if (!visitorBuf.size) return;
  const rows = Array.from(visitorBuf.values());
  visitorBuf.clear();
  try { await db.saveVisitorsBatch(rows); } catch (e) {}
}
setInterval(flushVisitors, 30000).unref();

function rateLimitOk(ip) {
  const now = Date.now();
  const arr = (rlHits.get(ip) || []).filter((t) => now - t < RL_WINDOW);
  if (arr.length >= RL_LIMIT) {
    rlHits.set(ip, arr);
    return false;
  }
  arr.push(now);
  rlHits.set(ip, arr);
  if (rlHits.size > 5000) rlHits.clear(); // limpeza simples
  return true;
}

/** Remove dados pessoais (QSA) da resposta pública da API. */
function publicView(data) {
  const out = Object.assign({}, data);
  delete out.socios;
  return out;
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
  // APIs são dinâmicas: sem cache (410/404 são cacheáveis por padrão na spec HTTP).
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
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

// Confiabilidade: loga erros não tratados sem derrubar o processo.
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', (err && err.message) || err);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', (err && err.message) || err);
});

const START_TS = Date.now();

const server = http.createServer(async (req, res) => {
  const isHead = req.method === 'HEAD';
  const isGet = req.method === 'GET' || isHead;
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(urlObj.pathname);

  setSecurityHeaders(res, pathname);

  // Healthcheck (monitoramento/uptime)
  if (pathname === '/health' || pathname === '/healthz') {
    return sendJson(res, 200, { status: 'ok', uptime_s: Math.round((Date.now() - START_TS) / 1000) });
  }

  // Rastreio de visitante (só páginas humanas: sem /api, sem assets, sem /health|/stats)
  if (isGet && !pathname.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(pathname) &&
      pathname !== '/health' && pathname !== '/healthz' && pathname !== '/stats' && pathname !== '/stats/') {
    trackVisitor(req);
  }

  // Preflight CORS para a API pública
  if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    setCors(res);
    res.writeHead(204);
    return res.end();
  }

  // API PÚBLICA versionada: GET /api/v1/cnpj/:cnpj  (CORS + rate limit)
  let apiM = pathname.match(/^\/api\/v1\/cnpj\/([0-9.\-/]+)\/?$/);
  if (req.method === 'GET' && apiM) {
    setCors(res);
    const cnpj = onlyDigits(apiM[1]);
    if (!isValidCnpj(cnpj)) return sendJson(res, 400, { erro: 'CNPJ inválido. Informe 14 dígitos válidos.' });
    if (!rateLimitOk(clientIp(req))) {
      res.setHeader('Retry-After', '60');
      return sendJson(res, 429, { erro: 'Limite de requisições excedido. Tente novamente em instantes.' });
    }
    try {
      const data = await getCnpjData(cnpj);
      counterInc();
      const org = req.headers.origin || req.headers.referer || '';
      const externo = org && !/sintegrabrasil\.com\.br|localhost|127\.0\.0\.1/.test(org);
      bump(externo ? 'consulta_widget' : 'consulta_api');
      return sendJson(res, 200, publicView(data));
    } catch (e) {
      return sendJson(res, e.status || 500, { erro: e.message || 'Erro interno.' });
    }
  }

  // API PÚBLICA: radar de empresas novas
  if (req.method === 'GET' && pathname === '/api/v1/radar') {
    setCors(res);
    if (!rateLimitOk(clientIp(req))) {
      res.setHeader('Retry-After', '60');
      return sendJson(res, 429, { erro: 'Limite de requisições excedido. Tente novamente em instantes.' });
    }
    const f = {
      uf: (urlObj.searchParams.get('uf') || '').trim().toUpperCase().slice(0, 2),
      municipio: (urlObj.searchParams.get('municipio') || '').trim().slice(0, 60),
      cnae: (urlObj.searchParams.get('cnae') || '').trim().slice(0, 60),
      dias: Math.min(parseInt(urlObj.searchParams.get('dias') || '30', 10) || 30, 90),
      limit: Math.min(parseInt(urlObj.searchParams.get('limit') || '50', 10) || 50, 100),
      offset: Math.max(parseInt(urlObj.searchParams.get('offset') || '0', 10) || 0, 0),
    };
    try {
      const [rows, info] = await Promise.all([db.radarList(f), db.radarInfo()]);
      bump('api_radar');
      return sendJson(res, 200, { atualizado_ate: info.ultima, resultados: rows });
    } catch (e) {
      return sendJson(res, 500, { erro: 'Radar indisponível no momento.' });
    }
  }

  // API PÚBLICA: busca filtrada por CNAE/UF/município/nome
  if (req.method === 'GET' && pathname === '/api/v1/buscar') {
    setCors(res);
    const f = {
      cnae: (urlObj.searchParams.get('cnae') || '').trim(),
      uf: (urlObj.searchParams.get('uf') || '').trim(),
      municipio: (urlObj.searchParams.get('municipio') || '').trim(),
      q: (urlObj.searchParams.get('q') || '').trim(),
    };
    if (!f.cnae && !f.uf && !f.municipio && !f.q) {
      return sendJson(res, 400, { erro: 'Informe ao menos um filtro (cnae, uf, municipio ou q).' });
    }
    if (!rateLimitOk(clientIp(req))) {
      res.setHeader('Retry-After', '60');
      return sendJson(res, 429, { erro: 'Limite de requisições excedido. Tente novamente em instantes.' });
    }
    const limit = Math.min(parseInt(urlObj.searchParams.get('limit') || '50', 10) || 50, 100);
    const offset = Math.max(parseInt(urlObj.searchParams.get('offset') || '0', 10) || 0, 0);
    try {
      const rows = await db.search({ ...f, limit: limit + 1, offset });
      const hasMore = rows.length > limit;
      bump('busca_api');
      return sendJson(res, 200, { resultados: rows.slice(0, limit), hasMore, limit, offset });
    } catch (e) {
      return sendJson(res, 500, { erro: 'Erro na busca.' });
    }
  }

  // API PÚBLICA: mapa de calor por UF (contagem de empresas, opcional por CNAE)
  if (req.method === 'GET' && pathname === '/api/v1/mapa') {
    setCors(res);
    const cnae = (urlObj.searchParams.get('cnae') || '').trim();
    const key = cnae.toLowerCase();
    const now = Date.now();
    bump('mapa');
    const hit = mapaCache.get(key);
    if (hit && now - hit.t < MAPA_TTL) return sendJson(res, 200, hit.data);
    if (!rateLimitOk(clientIp(req))) {
      res.setHeader('Retry-After', '60');
      return sendJson(res, 429, { erro: 'Limite de requisições excedido. Tente novamente em instantes.' });
    }
    try {
      const ufs = await db.statsByUf({ cnae });
      let total = 0;
      let max = 0;
      for (const k in ufs) { total += ufs[k]; if (ufs[k] > max) max = ufs[k]; }
      const data = { cnae, ufs, total, max };
      mapaCache.set(key, { t: now, data });
      if (mapaCache.size > 500) mapaCache.clear();
      return sendJson(res, 200, data);
    } catch (e) {
      return sendJson(res, 500, { erro: 'Erro ao gerar mapa.' });
    }
  }

  // API PÚBLICA: mapa de calor REAL por município (pontos lat/lng + contagem)
  if (req.method === 'GET' && pathname === '/api/v1/heatmap') {
    setCors(res);
    const cnae = (urlObj.searchParams.get('cnae') || '').trim();
    const key = cnae.toLowerCase();
    const now = Date.now();
    bump('mapa');
    const hit = heatCache.get(key);
    if (hit && now - hit.t < MAPA_TTL) return sendJson(res, 200, hit.data);
    // cache miss = query pesada: protege contra DoS por CNAE aleatório
    if (!rateLimitOk(clientIp(req))) {
      res.setHeader('Retry-After', '60');
      return sendJson(res, 429, { erro: 'Limite de requisições excedido. Tente novamente em instantes.' });
    }
    try {
      const rows = await db.statsByMunicipio({ cnae });
      const points = [];
      let max = 0;
      let total = 0;
      for (const row of rows) {
        const c = MUNI_COORDS[row.uf + '|' + normMuni(row.municipio)];
        total += row.c;
        if (!c) continue;
        if (row.c > max) max = row.c;
        // [lat, lng, contagem] — arredonda p/ payload menor
        points.push([c[0], c[1], row.c]);
      }
      const data = { cnae, points, max, total, municipios: points.length };
      heatCache.set(key, { t: now, data });
      if (heatCache.size > 300) heatCache.clear();
      return sendJson(res, 200, data);
    } catch (e) {
      return sendJson(res, 500, { erro: 'Erro ao gerar mapa.' });
    }
  }

  // API: GET /api/consulta?cnpj=...
  if (req.method === 'GET' && pathname === '/api/consulta') {
    const cnpj = onlyDigits(urlObj.searchParams.get('cnpj'));
    if (!cnpj) return sendJson(res, 400, { erro: 'Informe o CNPJ.' });
    if (!isValidCnpj(cnpj)) return sendJson(res, 400, { erro: 'CNPJ invalido. Verifique os digitos.' });
    try {
      const data = await getCnpjData(cnpj);
      counterInc();
      bump('consulta_web');
      return sendJson(res, 200, data);
    } catch (e) {
      return sendJson(res, e.status || 500, { erro: e.message || 'Erro interno.' });
    }
  }

  // Contador de consultas (leitura)
  if (req.method === 'GET' && pathname === '/api/contador') {
    return sendJson(res, 200, { count: counterGet() });
  }

  // LGPD: abrir solicitação (exclusão / confirmação / correção) -> protocolo
  if (req.method === 'POST' && pathname === '/api/lgpd') {
    if (!rateLimitOk(clientIp(req))) {
      res.setHeader('Retry-After', '60');
      return sendJson(res, 429, { erro: 'Muitas solicitações. Tente novamente em instantes.' });
    }
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 10240) req.destroy(); });
    req.on('end', async () => {
      try {
        const b = JSON.parse(body || '{}');
        if (b.site) return sendJson(res, 400, { erro: 'Solicitação inválida.' }); // honeypot anti-spam
        const TIPOS = ['exclusao', 'confirmacao', 'correcao'];
        const tipo = String(b.tipo || '').trim();
        const nome = String(b.nome || '').trim().slice(0, 120);
        const email = String(b.email || '').trim().slice(0, 160);
        const relacao = String(b.relacao || '').trim().slice(0, 60);
        const mensagem = String(b.mensagem || '').trim().slice(0, 2000);
        const cnpjSol = onlyDigits(String(b.cnpj || ''));
        if (!TIPOS.includes(tipo)) return sendJson(res, 400, { erro: 'Informe o tipo da solicitação.' });
        if (nome.length < 3) return sendJson(res, 400, { erro: 'Informe seu nome completo.' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { erro: 'Informe um e-mail válido para retorno.' });
        if (cnpjSol && cnpjSol.length !== 14) return sendJson(res, 400, { erro: 'CNPJ informado é inválido (14 dígitos).' });
        const dt = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const protocolo = `LGPD-${dt}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        await db.lgpdCreate({ protocolo, tipo, cnpj: cnpjSol || null, nome, email, relacao, mensagem });
        bump('lgpd_solicitacao');
        // Exclusão com CNPJ vinculado: aplica na hora (bloqueio + remoção da base),
        // sem intervenção manual. Reversível pelo painel /lgpd-admin.
        if (tipo === 'exclusao' && cnpjSol) {
          try {
            await db.removedAdd(cnpjSol, protocolo);
            CNPJ_REMOVIDOS.add(cnpjSol);
            await db.removeEmpresa(cnpjSol);
            const hoje = new Date().toLocaleDateString('pt-BR');
            await db.lgpdSetStatus(protocolo, 'concluida', `Exclusão aplicada automaticamente em ${hoje}. Os dados deixaram de ser exibidos no site e na API.`);
            return sendJson(res, 201, { protocolo, aplicada: true, prazo: 'Exclusão aplicada imediatamente. As páginas do CNPJ passam a exibir "Dados excluídos em conformidade com a LGPD".' });
          } catch (e) { /* fica como 'recebida' para tratamento manual */ }
        }
        return sendJson(res, 201, { protocolo, prazo: 'Retornaremos pelo e-mail informado em até 15 dias (art. 19 da LGPD).' });
      } catch (e) {
        return sendJson(res, 500, { erro: 'Não foi possível registrar a solicitação. Tente novamente ou escreva para admin@spartanti.com.br.' });
      }
    });
    return;
  }

  // LGPD admin: ações do painel (concluir/negar/excluir/reativar) — exige senha
  if (req.method === 'POST' && pathname === '/api/lgpd-admin') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 10240) req.destroy(); });
    req.on('end', async () => {
      try {
        const b = JSON.parse(body || '{}');
        if (!process.env.STATS_KEY || b.k !== process.env.STATS_KEY) {
          return sendJson(res, 401, { erro: 'Senha inválida.' });
        }
        const acao = String(b.acao || '');
        const protocolo = String(b.protocolo || '').trim().toUpperCase();
        const cnpj = onlyDigits(String(b.cnpj || ''));
        const resposta = String(b.resposta || '').trim().slice(0, 1000) || null;
        const hoje = new Date().toLocaleDateString('pt-BR');
        if (acao === 'concluir' || acao === 'negar') {
          if (!protocolo) return sendJson(res, 400, { erro: 'Informe o protocolo.' });
          const ok = await db.lgpdSetStatus(protocolo, acao === 'concluir' ? 'concluida' : 'negada', resposta);
          return sendJson(res, ok ? 200 : 404, ok ? { ok: true } : { erro: 'Protocolo não encontrado.' });
        }
        if (acao === 'excluir') {
          if (cnpj.length !== 14) return sendJson(res, 400, { erro: 'CNPJ inválido.' });
          await db.removedAdd(cnpj, protocolo || null);
          CNPJ_REMOVIDOS.add(cnpj);
          const n = await db.removeEmpresa(cnpj);
          if (protocolo) await db.lgpdSetStatus(protocolo, 'concluida', `Exclusão aplicada em ${hoje}.`);
          return sendJson(res, 200, { ok: true, removidos_da_base: n });
        }
        if (acao === 'reativar') {
          if (cnpj.length !== 14) return sendJson(res, 400, { erro: 'CNPJ inválido.' });
          await db.removedDel(cnpj);
          CNPJ_REMOVIDOS.delete(cnpj);
          return sendJson(res, 200, { ok: true, aviso: 'O CNPJ volta a ser consultável; os dados cadastrais retornam na próxima consulta ou import.' });
        }
        return sendJson(res, 400, { erro: 'Ação desconhecida.' });
      } catch (e) {
        return sendJson(res, 500, { erro: 'Erro ao executar a ação.' });
      }
    });
    return;
  }

  // LGPD: consultar andamento por protocolo (não expõe dados pessoais)
  if (req.method === 'GET' && pathname === '/api/lgpd') {
    const key = urlObj.searchParams.get('key');
    if (key && process.env.STATS_KEY && key === process.env.STATS_KEY) {
      try { return sendJson(res, 200, { solicitacoes: await db.lgpdList(200) }); }
      catch (e) { return sendJson(res, 500, { erro: 'Erro ao listar.' }); }
    }
    const protocolo = String(urlObj.searchParams.get('protocolo') || '').trim().toUpperCase();
    if (!/^LGPD-\d{8}-[0-9A-F]{8}$/.test(protocolo)) {
      return sendJson(res, 400, { erro: 'Protocolo inválido. Formato: LGPD-AAAAMMDD-XXXXXXXX.' });
    }
    try {
      const s = await db.lgpdGet(protocolo);
      if (!s) return sendJson(res, 404, { erro: 'Protocolo não encontrado.' });
      return sendJson(res, 200, s);
    } catch (e) {
      return sendJson(res, 500, { erro: 'Erro ao consultar o protocolo.' });
    }
  }

  if (isGet) {
    // Sitemap: ÍNDICE apontando p/ páginas SEO + blocos de CNPJ (toda a base)
    if (pathname === '/sitemap.xml') {
      const now = Date.now();
      if (!sitemapIndexCache || now - sitemapIndexCache.t >= MAPA_TTL) {
        let total = 0;
        try { total = await db.count(); } catch (e) {}
        const nChunks = Math.max(1, Math.ceil(total / SM_CHUNK));
        const today = new Date().toISOString().slice(0, 10);
        const sitemaps = [{ loc: `${seo.SITE_URL}/sitemap-paginas.xml`, lastmod: today }];
        for (let k = 1; k <= nChunks; k++) {
          sitemaps.push({ loc: `${seo.SITE_URL}/sitemap-cnpj-${k}.xml`, lastmod: today });
        }
        sitemapIndexCache = { t: now, xml: seo.buildSitemapIndex(sitemaps) };
      }
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
      return res.end(isHead ? undefined : sitemapIndexCache.xml);
    }

    // llms.txt — resumo do site para modelos de IA (ChatGPT/Perplexity/Gemini)
    if (pathname === '/llms.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
      return res.end(isHead ? undefined : seo.buildLlmsTxt());
    }

    // Sitemap de páginas institucionais / SEO
    if (pathname === '/sitemap-paginas.xml') {
      const urls = [
        { loc: `${seo.SITE_URL}/`, priority: '1.0', lastmod: new Date().toISOString().slice(0, 10) },
        { loc: `${seo.SITE_URL}/nfe`, priority: '0.8' },
        { loc: `${seo.SITE_URL}/agente`, priority: '0.7' },
        { loc: `${seo.SITE_URL}/busca`, priority: '0.8' },
        { loc: `${seo.SITE_URL}/validar-inscricao-estadual`, priority: '0.7' },
        { loc: `${seo.SITE_URL}/api`, priority: '0.6' },
        { loc: `${seo.SITE_URL}/atividades`, priority: '0.6' },
        { loc: `${seo.SITE_URL}/guias`, priority: '0.6' },
        { loc: `${seo.SITE_URL}/incorporar`, priority: '0.5' },
        { loc: `${seo.SITE_URL}/consultas`, priority: '0.4' },
        { loc: `${seo.SITE_URL}/sobre`, priority: '0.4' },
        { loc: `${seo.SITE_URL}/sobre-os-dados`, priority: '0.5' },
        { loc: `${seo.SITE_URL}/contato`, priority: '0.3' },
        { loc: `${seo.SITE_URL}/radar`, priority: '0.8' },
        { loc: `${seo.SITE_URL}/privacidade`, priority: '0.3' },
        { loc: `${seo.SITE_URL}/termos`, priority: '0.3' },
        { loc: `${seo.SITE_URL}/lgpd`, priority: '0.3' },
        { loc: `${seo.SITE_URL}/cookies`, priority: '0.3' },
        ...seo.UFS.map((uf) => ({ loc: `${seo.SITE_URL}/sintegra/${uf.toLowerCase()}`, priority: '0.8' })),
        ...seo.CAPITAIS.map((c) => ({ loc: `${seo.SITE_URL}/cidade/${c.slug}`, priority: '0.6' })),
        ...seo.ATIVIDADES.map((a) => ({ loc: `${seo.SITE_URL}/atividade/${a.slug}`, priority: '0.6' })),
        ...seo.GUIDES.map((g) => ({ loc: `${seo.SITE_URL}/guias/${g.slug}`, priority: '0.6' })),
      ];
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
      return res.end(isHead ? undefined : seo.buildSitemapXml(urls));
    }

    // Sitemap de CNPJs em bloco: /sitemap-cnpj-<n>.xml
    let smM = pathname.match(/^\/sitemap-cnpj-(\d+)\.xml$/);
    if (smM) {
      const k = parseInt(smM[1], 10) || 1;
      let cnpjs = [];
      try { cnpjs = await db.listCnpjsChunk((k - 1) * SM_CHUNK, SM_CHUNK); } catch (e) {}
      if (!cnpjs.length) { res.writeHead(404, { 'Content-Type': 'application/xml; charset=utf-8' }); return res.end(isHead ? undefined : '<?xml version="1.0"?><urlset/>'); }
      const urls = cnpjs.map((c) => ({ loc: `${seo.SITE_URL}/cnpj/${c}`, priority: '0.5' }));
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
      return res.end(isHead ? undefined : seo.buildSitemapXml(urls));
    }

    // Paginas por estado: /sintegra/:uf
    let m = pathname.match(/^\/sintegra\/([a-zA-Z]{2})\/?$/);
    if (m) {
      const html = seo.renderStatePage(m[1]);
      return html ? sendHtml(res, 200, html, isHead) : sendHtml(res, 404, '<h1>Estado não encontrado</h1>', isHead);
    }

    // Ficha cadastral para impressão: /cnpj/:cnpj/ficha
    m = pathname.match(/^\/cnpj\/(\d{14})\/ficha\/?$/);
    if (m) {
      const cnpj = m[1];
      if (!isValidCnpj(cnpj)) return sendHtml(res, 404, '<h1>CNPJ inválido</h1>', isHead);
      bump('ficha_cnpj');
      try {
        const data = await getCnpjData(cnpj);
        const QRCode = require('qrcode-svg');
        const qr = new QRCode({ content: `${seo.SITE_URL}/cnpj/${cnpj}`, width: 110, height: 110, padding: 0, join: true }).svg();
        return sendHtml(res, 200, seo.renderFicha(data, cnpj, qr), isHead);
      } catch (e) {
        const st = e.status === 404 || e.status === 410 || e.status === 429 ? e.status : 502;
        return sendHtml(res, st, `<h1>${e.message || 'Erro na consulta'}</h1>`, isHead);
      }
    }

    // Radar de empresas novas
    if (pathname === '/radar' || pathname === '/radar/') {
      bump('radar');
      const p = Math.max(parseInt(urlObj.searchParams.get('p') || '1', 10) || 1, 1);
      const f = {
        uf: (urlObj.searchParams.get('uf') || '').trim().toUpperCase().slice(0, 2),
        municipio: (urlObj.searchParams.get('municipio') || '').trim().slice(0, 60),
        cnae: (urlObj.searchParams.get('cnae') || '').trim().slice(0, 60),
        dias: Math.min(parseInt(urlObj.searchParams.get('dias') || '30', 10) || 30, 90),
        limit: 50,
        offset: (p - 1) * 50,
      };
      try {
        const [rows, info] = await Promise.all([db.radarList(f), db.radarInfo()]);
        return sendHtml(res, 200, seo.renderRadar(rows, f, info, p), isHead);
      } catch (e) {
        return sendHtml(res, 200, seo.renderRadar([], f, { total: 0 }, 1), isHead);
      }
    }

    // Paginas por CNPJ: /cnpj/:cnpj
    m = pathname.match(/^\/cnpj\/(\d{14})\/?$/);
    if (m) {
      const cnpj = m[1];
      if (!isValidCnpj(cnpj)) return sendHtml(res, 404, '<h1>CNPJ inválido</h1>', isHead);
      bump('pagina_cnpj');
      try {
        const data = await getCnpjData(cnpj);
        // Extras da página (melhor esforço): matriz/filiais e empresas relacionadas
        let extra = null;
        try {
          const basico = cnpj.slice(0, 8);
          const [filiais, totalFiliais] = await Promise.all([db.listFiliais(basico, 200), db.countFiliais(basico)]);
          let relacionadas = [];
          const nomes = (data.socios || []).map((s) => s.nome).filter(Boolean).slice(0, 10);
          if (nomes.length) {
            try { relacionadas = await db.relacionadasPorSocios(nomes, basico, 12); } catch (e) {}
          }
          extra = { filiais, totalFiliais, relacionadas };
        } catch (e) { /* banco ocupado: página sai sem os extras */ }
        return sendHtml(res, 200, seo.renderCnpjPage(data, cnpj, extra), isHead);
      } catch (e) {
        const st = e.status === 404 || e.status === 410 || e.status === 429 ? e.status : 502;
        if (st === 410) {
          res.setHeader('Cache-Control', 'no-store');
          return sendHtml(res, 410, `<h1>❗ ${e.message}</h1>
            <p>Estes dados foram removidos a pedido do titular, conforme a Lei nº 13.709/2018 (LGPD).</p>
            <p><a href="/lgpd">Solicitar exclusão ou confirmação de exclusão de dados</a></p>`, isHead);
        }
        return sendHtml(res, st, `<h1>${e.message || 'Erro na consulta'}</h1>`, isHead);
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
      return sendHtml(res, 200, seo.renderConsultas(await listRecent(100)), isHead);
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

    // Busca por CNAE/UF/município
    if (pathname === '/busca' || pathname === '/busca/') {
      bump('pagina_busca');
      return sendHtml(res, 200, seo.renderBusca(), isHead);
    }

    // DANFE: gerar PDF da NF-e a partir do XML
    if (pathname === '/nfe' || pathname === '/nfe/' || pathname === '/danfe' || pathname === '/danfe/') {
      bump('pagina_nfe');
      return sendHtml(res, 200, seo.renderNfe(), isHead);
    }

    // Download + tutorial do Agente (certificado digital)
    if (pathname === '/agente' || pathname === '/agente/') {
      bump('pagina_agente');
      return sendHtml(res, 200, seo.renderAgente(), isHead);
    }

    // Metodologia / fonte dos dados
    if (pathname === '/sobre-os-dados' || pathname === '/sobre-os-dados/') {
      return sendHtml(res, 200, seo.renderMetodologia(), isHead);
    }

    // Documentação da API pública
    if (pathname === '/api' || pathname === '/api/' || pathname === '/api/docs') {
      return sendHtml(res, 200, seo.renderApiDocs(), isHead);
    }

    // Widget e incorporação
    if (pathname === '/widget' || pathname === '/widget/') {
      bump('widget_load');
      return sendHtml(res, 200, seo.renderWidget(), isHead);
    }

    // Painel LGPD: solicitações + CNPJs excluídos (protegido por senha)
    if (pathname === '/lgpd-admin' || pathname === '/lgpd-admin/') {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      const k = urlObj.searchParams.get('k') || '';
      if (!process.env.STATS_KEY || k !== process.env.STATS_KEY) {
        return sendHtml(res, k ? 401 : 200, seo.renderLgpdAdminLogin(Boolean(k)), isHead);
      }
      try {
        const [sols, removidos] = await Promise.all([db.lgpdList(500), db.removedList()]);
        return sendHtml(res, 200, seo.renderLgpdAdmin(sols, removidos, k), isHead);
      } catch (e) {
        return sendHtml(res, 500, '<h1>Erro ao carregar o painel LGPD</h1>', isHead);
      }
    }

    // Painel de métricas (analytics de primeira mão)
    if (pathname === '/stats' || pathname === '/stats/') {
      if (process.env.STATS_KEY && urlObj.searchParams.get('k') !== process.env.STATS_KEY) {
        return sendHtml(res, 401, '<h1>Acesso restrito</h1><p>Informe ?k=CHAVE.</p>', isHead);
      }
      try {
        await flushMetrics();
        await flushVisitors();
        const [rows, daily, geo] = await Promise.all([db.getMetrics(), db.getMetricsDaily(14), db.getGeoStats()]);
        return sendHtml(res, 200, seo.renderStats(rows, daily, counterGet(), geo), isHead);
      } catch (e) {
        return sendHtml(res, 500, '<h1>Erro ao carregar métricas</h1>', isHead);
      }
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
      '/cookies': seo.renderCookies,
      '/lgpd': seo.renderLgpd,
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

(async () => {
  try {
    await db.init(process.env.DATABASE_URL);
    console.log('Storage: PostgreSQL conectado.');
    await reloadRemovidos();
    setInterval(reloadRemovidos, 5 * 60 * 1000).unref();
  } catch (e) {
    // App continua no ar: consultas ainda funcionam via API (sem persistir).
    console.error('PostgreSQL indisponível (seguindo sem persistência):', e.message);
  }
  server.listen(PORT, () => {
    console.log(`Consulta IE rodando em http://localhost:${PORT}`);
  });
})();
