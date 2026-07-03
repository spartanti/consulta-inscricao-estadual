'use strict';

/**
 * Armazenamento em PostgreSQL.
 *
 * Modelo de enriquecimento:
 *  - A base (dados abertos da Receita) popula todas as empresas com os campos
 *    de busca (uf, municipio, cnae, situacao) — sem Inscricao Estadual.
 *  - A cada CONSULTA, a linha e enriquecida via API (IE + situacao fresca):
 *    grava o payload completo em "data" e marca "enriquecido_em".
 *  - A busca por CNAE/UF/municipio roda sobre a base inteira.
 */

const { Pool } = require('pg');

let pool = null;
let hasUnaccent = false;

function makeSsl(connStr) {
  // Conexao interna da Railway nao usa SSL; conexao publica (proxy) usa.
  if (!connStr || connStr.includes('railway.internal')) return false;
  return { rejectUnauthorized: false };
}

async function init(connStr) {
  if (!connStr) throw new Error('DATABASE_URL nao definido.');
  pool = new Pool({ connectionString: connStr, ssl: makeSsl(connStr), max: 10 });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS empresas (
      cnpj               TEXT PRIMARY KEY,
      razao_social       TEXT,
      nome_fantasia      TEXT,
      uf                 TEXT,
      municipio          TEXT,
      cnae_codigo        TEXT,
      cnae_descricao     TEXT,
      situacao_cadastral TEXT,
      data               JSONB NOT NULL,
      enriquecido_em     TIMESTAMPTZ,
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // SKIP_INDEXES=1 (usado na carga em massa) pula a criação dos índices secundários,
  // que são derrubados durante o import e recriados no fim para acelerar a gravação.
  if (!process.env.SKIP_INDEXES) {
    await pool.query('CREATE INDEX IF NOT EXISTS idx_empresas_uf ON empresas(uf);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_empresas_municipio ON empresas(municipio);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_empresas_cnae ON empresas(cnae_codigo);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_empresas_updated ON empresas(updated_at DESC);');
  }
  // Métricas de uso (analytics de primeira mão, por origem)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS metrics (
      dia     DATE NOT NULL,
      metrica TEXT NOT NULL,
      n       BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (dia, metrica)
    );
  `);
  // Visitantes (pseudonimizado: IP -> hash salgado; guarda só cidade/UF, nunca o IP puro)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visitors (
      dia     DATE NOT NULL,
      ip_hash TEXT NOT NULL,
      uf      TEXT,
      cidade  TEXT,
      PRIMARY KEY (dia, ip_hash)
    );
  `);
  // unaccent permite busca de município sem depender de acentos.
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS unaccent');
    hasUnaccent = true;
  } catch (e) {
    hasUnaccent = false;
  }
  return pool;
}

/** Retorna { data, enriquecido_em } ou null. */
async function getRow(cnpj) {
  const r = await pool.query('SELECT data, enriquecido_em FROM empresas WHERE cnpj = $1', [cnpj]);
  return r.rows[0] || null;
}

async function getCnpj(cnpj) {
  const row = await getRow(cnpj);
  return row ? row.data : null;
}

function cols(data) {
  const cnae = data.atividade_principal || {};
  return [
    data.razao_social || null,
    data.nome_fantasia || null,
    data.uf || null,
    data.municipio || null,
    cnae.codigo || null,
    cnae.descricao || null,
    data.situacao_cadastral || null,
  ];
}

/** Consulta (enriquecimento): grava payload completo (com IE) e marca enriquecido. */
async function saveEnriched(cnpj, data) {
  await pool.query(
    `INSERT INTO empresas
       (cnpj, razao_social, nome_fantasia, uf, municipio, cnae_codigo, cnae_descricao, situacao_cadastral, data, enriquecido_em, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), now())
     ON CONFLICT (cnpj) DO UPDATE SET
       razao_social=EXCLUDED.razao_social,
       nome_fantasia=EXCLUDED.nome_fantasia,
       uf=EXCLUDED.uf,
       municipio=EXCLUDED.municipio,
       cnae_codigo=EXCLUDED.cnae_codigo,
       cnae_descricao=EXCLUDED.cnae_descricao,
       situacao_cadastral=EXCLUDED.situacao_cadastral,
       data=EXCLUDED.data,
       enriquecido_em=now(),
       updated_at=now()`,
    [cnpj, ...cols(data), JSON.stringify(data)]
  );
}

/**
 * Importacao da base (Receita): grava dados base SEM sobrescrever o
 * enriquecimento de linhas ja consultadas (preserva IE).
 */
async function upsertBase(cnpj, data) {
  await pool.query(
    `INSERT INTO empresas
       (cnpj, razao_social, nome_fantasia, uf, municipio, cnae_codigo, cnae_descricao, situacao_cadastral, data, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
     ON CONFLICT (cnpj) DO UPDATE SET
       razao_social=EXCLUDED.razao_social,
       nome_fantasia=EXCLUDED.nome_fantasia,
       uf=EXCLUDED.uf,
       municipio=EXCLUDED.municipio,
       cnae_codigo=EXCLUDED.cnae_codigo,
       cnae_descricao=EXCLUDED.cnae_descricao,
       situacao_cadastral=EXCLUDED.situacao_cadastral,
       data=CASE WHEN empresas.enriquecido_em IS NULL THEN EXCLUDED.data ELSE empresas.data END,
       updated_at=now()`,
    [cnpj, ...cols(data), JSON.stringify(data)]
  );
}

/** Upsert em lote (importação): grava vários registros base de uma vez. */
async function upsertBaseBatch(rows) {
  if (!rows.length) return;
  // dedupe por cnpj dentro do lote (ON CONFLICT nao pode afetar a linha 2x)
  const seen = new Set();
  const uniq = [];
  for (const d of rows) {
    if (/^\d{14}$/.test(d.cnpj) && !seen.has(d.cnpj)) { seen.add(d.cnpj); uniq.push(d); }
  }
  if (!uniq.length) return;
  const tuples = [];
  const params = [];
  uniq.forEach((d, i) => {
    const b = i * 9;
    tuples.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},now())`);
    params.push(d.cnpj, ...cols(d), JSON.stringify(d));
  });
  await pool.query(
    `INSERT INTO empresas
       (cnpj, razao_social, nome_fantasia, uf, municipio, cnae_codigo, cnae_descricao, situacao_cadastral, data, updated_at)
     VALUES ${tuples.join(',')}
     ON CONFLICT (cnpj) DO UPDATE SET
       razao_social=EXCLUDED.razao_social,
       nome_fantasia=EXCLUDED.nome_fantasia,
       uf=EXCLUDED.uf,
       municipio=EXCLUDED.municipio,
       cnae_codigo=EXCLUDED.cnae_codigo,
       cnae_descricao=EXCLUDED.cnae_descricao,
       situacao_cadastral=EXCLUDED.situacao_cadastral,
       data=CASE WHEN empresas.enriquecido_em IS NULL THEN EXCLUDED.data ELSE empresas.data END,
       updated_at=now()`,
    params
  );
}

async function listRecent(limit = 50) {
  const r = await pool.query(
    'SELECT cnpj, razao_social AS razao, uf FROM empresas WHERE enriquecido_em IS NOT NULL ORDER BY updated_at DESC LIMIT $1',
    [Math.min(limit, 5000)]
  );
  return r.rows;
}

async function count() {
  const r = await pool.query('SELECT COUNT(*)::int AS c FROM empresas');
  return r.rows[0].c;
}

/** CNPJs em bloco (para o sitemap), ordenados de forma estável pela PK. */
async function listCnpjsChunk(offset, limit) {
  const r = await pool.query(
    'SELECT cnpj FROM empresas ORDER BY cnpj OFFSET $1 LIMIT $2',
    [Math.max(offset, 0), Math.min(limit, 50000)]
  );
  return r.rows.map((x) => x.cnpj);
}

/** Busca filtrada (consulta por CNAE/UF/municipio). */
async function search(f = {}) {
  const where = [];
  const params = [];
  let i = 1;
  const ila = (col) => (hasUnaccent ? `unaccent(${col}) ILIKE unaccent($${i})` : `${col} ILIKE $${i}`);
  if (f.uf) { where.push(`uf = $${i++}`); params.push(String(f.uf).toUpperCase()); }
  if (f.municipio) { where.push(ila('municipio')); params.push('%' + f.municipio + '%'); i++; }
  if (f.cnae) {
    // por código (prefixo) OU por descrição (contém)
    where.push(`(cnae_codigo LIKE $${i} OR ${hasUnaccent ? `unaccent(cnae_descricao) ILIKE unaccent($${i + 1})` : `cnae_descricao ILIKE $${i + 1}`})`);
    params.push(String(f.cnae) + '%', '%' + f.cnae + '%'); i += 2;
  }
  if (f.q) {
    where.push(`(${hasUnaccent ? `unaccent(razao_social) ILIKE unaccent($${i})` : `razao_social ILIKE $${i}`} OR ${hasUnaccent ? `unaccent(nome_fantasia) ILIKE unaccent($${i})` : `nome_fantasia ILIKE $${i}`})`);
    params.push('%' + f.q + '%'); i++;
  }
  const limit = Math.min(f.limit || 50, 200);
  const offset = f.offset || 0;
  const sql =
    'SELECT cnpj, razao_social, nome_fantasia, uf, municipio, cnae_codigo, cnae_descricao FROM empresas' +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ` ORDER BY razao_social LIMIT $${i++} OFFSET $${i++}`;
  params.push(limit, offset);
  const r = await pool.query(sql, params);
  return r.rows;
}

/**
 * Mapa de calor: contagem de empresas por UF (opcionalmente filtrado por CNAE).
 * Query leve (27 linhas) que usa o índice de cnae_codigo quando o filtro é código.
 */
async function statsByUf(f = {}) {
  const where = [];
  const params = [];
  let i = 1;
  const cnae = (f.cnae || '').trim();
  if (cnae) {
    if (/^[\d.\-/\s]+$/.test(cnae)) {
      // parece código: prefixo sobre cnae_codigo, como está (ex.: "5611" ou "5611-2/03")
      where.push(`cnae_codigo LIKE $${i++}`);
      params.push(cnae + '%');
    } else {
      where.push(hasUnaccent ? `unaccent(cnae_descricao) ILIKE unaccent($${i++})` : `cnae_descricao ILIKE $${i++}`);
      params.push('%' + cnae + '%');
    }
  }
  const sql =
    'SELECT uf, COUNT(*)::int AS c FROM empresas' +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' GROUP BY uf';
  const r = await pool.query(sql, params);
  const ufs = {};
  for (const row of r.rows) if (row.uf) ufs[row.uf] = row.c;
  return ufs;
}

/**
 * Mapa de calor real: contagem de empresas por MUNICÍPIO (uf + municipio),
 * opcionalmente filtrado por CNAE. Cada linha vira um ponto de calor no mapa.
 */
async function statsByMunicipio(f = {}) {
  const where = ['municipio IS NOT NULL'];
  const params = [];
  let i = 1;
  const cnae = (f.cnae || '').trim();
  if (cnae) {
    if (/^[\d.\-/\s]+$/.test(cnae)) {
      where.push(`cnae_codigo LIKE $${i++}`);
      params.push(cnae + '%');
    } else {
      where.push(hasUnaccent ? `unaccent(cnae_descricao) ILIKE unaccent($${i++})` : `cnae_descricao ILIKE $${i++}`);
      params.push('%' + cnae + '%');
    }
  }
  const sql =
    'SELECT uf, municipio, COUNT(*)::int AS c FROM empresas WHERE ' +
    where.join(' AND ') +
    ' GROUP BY uf, municipio';
  const r = await pool.query(sql, params);
  return r.rows;
}

/** Incrementa uma métrica de uso do dia (analytics de primeira mão). */
async function bumpMetric(metrica, n) {
  await pool.query(
    `INSERT INTO metrics (dia, metrica, n) VALUES (CURRENT_DATE, $1, $2)
     ON CONFLICT (dia, metrica) DO UPDATE SET n = metrics.n + EXCLUDED.n`,
    [String(metrica).slice(0, 60), n || 1]
  );
}

/** Agregado por métrica: hoje, 7d, 30d, total. */
async function getMetrics() {
  const r = await pool.query(`
    SELECT metrica,
      COALESCE(SUM(n) FILTER (WHERE dia = CURRENT_DATE), 0)::int AS hoje,
      COALESCE(SUM(n) FILTER (WHERE dia > CURRENT_DATE - 7), 0)::int AS d7,
      COALESCE(SUM(n) FILTER (WHERE dia > CURRENT_DATE - 30), 0)::int AS d30,
      COALESCE(SUM(n), 0)::int AS total
    FROM metrics GROUP BY metrica ORDER BY total DESC`);
  return r.rows;
}

/** Série diária (todas as métricas somadas) dos últimos N dias. */
async function getMetricsDaily(days = 14) {
  const r = await pool.query(
    `SELECT to_char(dia, 'YYYY-MM-DD') AS dia, SUM(n)::int AS total
     FROM metrics WHERE dia > CURRENT_DATE - ($1::int) GROUP BY dia ORDER BY dia DESC`,
    [days]
  );
  return r.rows;
}

/** Grava visitantes do dia em lote (dedupe por dia+ip_hash). */
async function saveVisitorsBatch(rows) {
  if (!rows || !rows.length) return;
  const tuples = [];
  const params = [];
  rows.forEach((r, i) => {
    const b = i * 4;
    tuples.push(`($${b + 1}::date,$${b + 2},$${b + 3},$${b + 4})`);
    params.push(r.dia, r.ip_hash, r.uf || null, r.cidade || null);
  });
  await pool.query(
    `INSERT INTO visitors (dia, ip_hash, uf, cidade) VALUES ${tuples.join(',')}
     ON CONFLICT (dia, ip_hash) DO NOTHING`,
    params
  );
}

/** Estatísticas geográficas: usuários únicos + top cidades + por UF. */
async function getGeoStats() {
  const u = await pool.query(`
    SELECT
      COUNT(DISTINCT ip_hash) FILTER (WHERE dia = CURRENT_DATE)::int AS hoje,
      COUNT(DISTINCT ip_hash) FILTER (WHERE dia > CURRENT_DATE - 7)::int AS d7,
      COUNT(DISTINCT ip_hash) FILTER (WHERE dia > CURRENT_DATE - 30)::int AS d30,
      COUNT(DISTINCT ip_hash)::int AS total
    FROM visitors`);
  const cid = await pool.query(`
    SELECT COALESCE(cidade,'—') AS cidade, COALESCE(uf,'—') AS uf, COUNT(DISTINCT ip_hash)::int AS n
    FROM visitors WHERE dia > CURRENT_DATE - 30 GROUP BY cidade, uf ORDER BY n DESC LIMIT 15`);
  const ufs = await pool.query(`
    SELECT COALESCE(uf,'—') AS uf, COUNT(DISTINCT ip_hash)::int AS n
    FROM visitors WHERE dia > CURRENT_DATE - 30 GROUP BY uf ORDER BY n DESC LIMIT 27`);
  return { uniq: u.rows[0], cidades: cid.rows, ufs: ufs.rows };
}

async function close() {
  if (pool) await pool.end();
}

module.exports = { init, getRow, getCnpj, saveEnriched, upsertBase, upsertBaseBatch, listRecent, count, listCnpjsChunk, search, statsByUf, statsByMunicipio, bumpMetric, getMetrics, getMetricsDaily, saveVisitorsBatch, getGeoStats, close };
