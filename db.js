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
  // Solicitações LGPD (exclusão/confirmação/correção) com número de protocolo.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lgpd_solicitacoes (
      protocolo     TEXT PRIMARY KEY,
      tipo          TEXT NOT NULL,
      cnpj          TEXT,
      nome          TEXT NOT NULL,
      email         TEXT NOT NULL,
      relacao       TEXT,
      mensagem      TEXT,
      status        TEXT NOT NULL DEFAULT 'recebida',
      resposta      TEXT,
      criada_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizada_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query('ALTER TABLE lgpd_solicitacoes ADD COLUMN IF NOT EXISTS cpf TEXT;');
  await pool.query('ALTER TABLE lgpd_solicitacoes ADD COLUMN IF NOT EXISTS telefone TEXT;');
  // CNPJs bloqueados/excluídos a pedido do titular (LGPD) — fonte da verdade do bloqueio.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cnpj_removidos (
      cnpj      TEXT PRIMARY KEY,
      protocolo TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`INSERT INTO cnpj_removidos (cnpj) VALUES ('64048012000179') ON CONFLICT DO NOTHING`);
  // Radar de empresas novas: tabela pequena, recarregada a cada import mensal.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS radar_novas (
      cnpj           TEXT PRIMARY KEY,
      razao_social   TEXT,
      nome_fantasia  TEXT,
      uf             TEXT,
      municipio      TEXT,
      cnae_codigo    TEXT,
      cnae_descricao TEXT,
      porte          TEXT,
      data_inicio    DATE
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_radar_inicio ON radar_novas(data_inicio DESC);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_radar_uf ON radar_novas(uf);');
  // Rankings pré-computados (rankings-build.js) — páginas /rankings.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rankings (
      tipo TEXT NOT NULL, uf TEXT NOT NULL, pos INT NOT NULL,
      chave TEXT, rotulo TEXT, valor NUMERIC, valor2 NUMERIC, extra JSONB,
      PRIMARY KEY (tipo, uf, pos)
    );
  `);
  // Sócios (QSA) para "empresas relacionadas" — carregada após o import nacional.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS socios (
      cnpj_basico TEXT NOT NULL,
      nome        TEXT NOT NULL,
      qualificacao TEXT
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

// --- Solicitações LGPD ------------------------------------------------------

async function lgpdCreate(rec) {
  await pool.query(
    `INSERT INTO lgpd_solicitacoes (protocolo, tipo, cnpj, nome, email, relacao, mensagem, cpf, telefone)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [rec.protocolo, rec.tipo, rec.cnpj || null, rec.nome, rec.email, rec.relacao || null, rec.mensagem || null, rec.cpf || null, rec.telefone || null]
  );
  return rec.protocolo;
}

/** Consulta pública por protocolo: devolve apenas o essencial (sem dados pessoais). */
async function lgpdGet(protocolo) {
  const r = await pool.query(
    `SELECT protocolo, tipo, status, resposta, criada_em, atualizada_em
     FROM lgpd_solicitacoes WHERE protocolo = $1`, [protocolo]
  );
  return r.rows[0] || null;
}

/** Lista completa (uso administrativo, protegido por STATS_KEY). */
async function lgpdList(limit = 200) {
  const r = await pool.query(
    'SELECT * FROM lgpd_solicitacoes ORDER BY criada_em DESC LIMIT $1', [limit]
  );
  return r.rows;
}

async function lgpdSetStatus(protocolo, status, resposta) {
  const r = await pool.query(
    `UPDATE lgpd_solicitacoes SET status=$2, resposta=COALESCE($3, resposta), atualizada_em=now()
     WHERE protocolo=$1 RETURNING protocolo`,
    [protocolo, status, resposta || null]
  );
  return r.rowCount > 0;
}

// --- Bloqueio de CNPJs (LGPD) ------------------------------------------------

async function removedList() {
  const r = await pool.query('SELECT cnpj, protocolo, criado_em FROM cnpj_removidos ORDER BY criado_em DESC');
  return r.rows;
}

async function removedAdd(cnpj, protocolo) {
  await pool.query(
    'INSERT INTO cnpj_removidos (cnpj, protocolo) VALUES ($1,$2) ON CONFLICT (cnpj) DO NOTHING',
    [cnpj, protocolo || null]
  );
}

async function removedDel(cnpj) {
  const r = await pool.query('DELETE FROM cnpj_removidos WHERE cnpj=$1', [cnpj]);
  return r.rowCount > 0;
}

/** Apaga o registro da empresa da base (usado na exclusão LGPD). */
async function removeEmpresa(cnpj) {
  const r = await pool.query('DELETE FROM empresas WHERE cnpj=$1', [cnpj]);
  return r.rowCount;
}

// --- Matriz e filiais --------------------------------------------------------
// Os 8 primeiros dígitos (CNPJ básico) identificam a empresa; usa a faixa do PK
// (nenhum índice extra necessário).

async function listFiliais(basico, limit = 200) {
  const r = await pool.query(
    `SELECT cnpj, razao_social, nome_fantasia, uf, municipio, situacao_cadastral,
            data->>'data_inicio_atividade' AS inicio
     FROM empresas WHERE cnpj >= $1 AND cnpj <= $2 ORDER BY cnpj LIMIT $3`,
    [basico + '000000', basico + '999999', limit]
  );
  return r.rows;
}

async function countFiliais(basico) {
  const r = await pool.query(
    'SELECT COUNT(*)::int AS c FROM empresas WHERE cnpj >= $1 AND cnpj <= $2',
    [basico + '000000', basico + '999999']
  );
  return r.rows[0].c;
}

// --- Radar de empresas novas -------------------------------------------------

async function radarList(f = {}) {
  const where = []; const params = [];
  if (f.uf) { params.push(f.uf.toUpperCase()); where.push(`uf = $${params.length}`); }
  if (f.municipio) { params.push(`%${f.municipio}%`); where.push(`municipio ILIKE $${params.length}`); }
  if (f.cnae) {
    params.push(`${String(f.cnae).replace(/\D/g, '')}%`); const pCod = params.length;
    params.push(`%${f.cnae}%`); const pDesc = params.length;
    where.push(`(cnae_codigo LIKE $${pCod} OR cnae_descricao ILIKE $${pDesc})`);
  }
  if (f.dias) { params.push(f.dias); where.push(`data_inicio >= (SELECT MAX(data_inicio) FROM radar_novas) - ($${params.length} || ' days')::interval`); }
  const limit = Math.min(f.limit || 50, 100);
  const offset = Math.max(f.offset || 0, 0);
  params.push(limit, offset);
  const r = await pool.query(
    `SELECT cnpj, razao_social, nome_fantasia, uf, municipio, cnae_codigo, cnae_descricao, porte,
            to_char(data_inicio, 'DD/MM/YYYY') AS inicio
     FROM radar_novas ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY data_inicio DESC, cnpj LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return r.rows;
}

async function radarInfo() {
  const r = await pool.query(
    "SELECT COUNT(*)::int AS total, to_char(MAX(data_inicio),'DD/MM/YYYY') AS ultima FROM radar_novas"
  );
  return r.rows[0];
}

// --- Rankings pré-computados ---------------------------------------------------

async function rankingGet(tipo, uf, limit = 100) {
  const r = await pool.query(
    'SELECT pos, chave, rotulo, valor::float8 AS valor, valor2::float8 AS valor2, extra FROM rankings WHERE tipo=$1 AND uf=$2 ORDER BY pos LIMIT $3',
    [tipo, uf, limit]
  );
  return r.rows;
}

// --- Empresas relacionadas (sócios em comum) ----------------------------------
// Requer a tabela socios carregada (pós-import). Devolve a matriz de cada básico.

async function relacionadasPorSocios(nomes, basicoAtual, limit = 12) {
  if (!nomes || !nomes.length) return [];
  const r = await pool.query(
    `SELECT DISTINCT s.cnpj_basico, s.nome AS socio
     FROM socios s WHERE s.nome = ANY($1) AND s.cnpj_basico <> $2 LIMIT $3`,
    [nomes, basicoAtual, limit]
  );
  const out = [];
  for (const rel of r.rows) {
    const m = await pool.query(
      `SELECT cnpj, razao_social, uf, municipio, situacao_cadastral
       FROM empresas WHERE cnpj >= $1 AND cnpj <= $2 ORDER BY cnpj LIMIT 1`,
      [rel.cnpj_basico + '000100', rel.cnpj_basico + '000199']
    );
    if (m.rows[0]) out.push({ ...m.rows[0], socio: rel.socio });
  }
  return out;
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

module.exports = { init, getRow, getCnpj, saveEnriched, upsertBase, upsertBaseBatch, listRecent, count, listCnpjsChunk, search, statsByUf, statsByMunicipio, bumpMetric, getMetrics, getMetricsDaily, saveVisitorsBatch, getGeoStats, lgpdCreate, lgpdGet, lgpdList, lgpdSetStatus, removedList, removedAdd, removedDel, removeEmpresa, listFiliais, countFiliais, radarList, radarInfo, relacionadasPorSocios, rankingGet, close };
