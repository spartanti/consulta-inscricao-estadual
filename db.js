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
  await pool.query('CREATE INDEX IF NOT EXISTS idx_empresas_uf ON empresas(uf);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_empresas_municipio ON empresas(municipio);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_empresas_cnae ON empresas(cnae_codigo);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_empresas_updated ON empresas(updated_at DESC);');
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

/** Busca filtrada (consulta por CNAE/UF/municipio). */
async function search(f = {}) {
  const where = [];
  const params = [];
  let i = 1;
  if (f.uf) { where.push(`uf = $${i++}`); params.push(String(f.uf).toUpperCase()); }
  if (f.municipio) { where.push(`LOWER(municipio) = LOWER($${i++})`); params.push(f.municipio); }
  if (f.cnae) { where.push(`cnae_codigo LIKE $${i++}`); params.push(String(f.cnae) + '%'); }
  if (f.q) { where.push(`(razao_social ILIKE $${i} OR nome_fantasia ILIKE $${i})`); params.push('%' + f.q + '%'); i++; }
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

async function close() {
  if (pool) await pool.end();
}

module.exports = { init, getRow, getCnpj, saveEnriched, upsertBase, upsertBaseBatch, listRecent, count, search, close };
