'use strict';

/**
 * Armazenamento das consultas em SQLite (módulo nativo node:sqlite).
 * Guarda o JSON completo de cada empresa + colunas indexadas (uf, municipio,
 * cnae) para permitir, no futuro, busca por CNAE filtrando por estado/município.
 *
 * Sem dependências externas.
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

let db = null;

function init(dbPath) {
  db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS empresas (
      cnpj TEXT PRIMARY KEY,
      razao_social TEXT,
      nome_fantasia TEXT,
      uf TEXT,
      municipio TEXT,
      situacao_cadastral TEXT,
      cnae_codigo TEXT,
      cnae_descricao TEXT,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_empresas_uf ON empresas(uf);
    CREATE INDEX IF NOT EXISTS idx_empresas_municipio ON empresas(municipio);
    CREATE INDEX IF NOT EXISTS idx_empresas_cnae ON empresas(cnae_codigo);
    CREATE INDEX IF NOT EXISTS idx_empresas_updated ON empresas(updated_at);
  `);
  return db;
}

function getCnpj(cnpj) {
  const row = db.prepare('SELECT data FROM empresas WHERE cnpj = ?').get(cnpj);
  if (!row) return null;
  try {
    return JSON.parse(row.data);
  } catch (e) {
    return null;
  }
}

function saveCnpj(cnpj, data) {
  const cnae = data.atividade_principal || {};
  db.prepare(
    `INSERT INTO empresas
       (cnpj, razao_social, nome_fantasia, uf, municipio, situacao_cadastral, cnae_codigo, cnae_descricao, data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cnpj) DO UPDATE SET
       razao_social=excluded.razao_social,
       nome_fantasia=excluded.nome_fantasia,
       uf=excluded.uf,
       municipio=excluded.municipio,
       situacao_cadastral=excluded.situacao_cadastral,
       cnae_codigo=excluded.cnae_codigo,
       cnae_descricao=excluded.cnae_descricao,
       data=excluded.data,
       updated_at=excluded.updated_at`
  ).run(
    cnpj,
    data.razao_social || null,
    data.nome_fantasia || null,
    data.uf || null,
    data.municipio || null,
    data.situacao_cadastral || null,
    cnae.codigo || null,
    cnae.descricao || null,
    JSON.stringify(data),
    new Date().toISOString()
  );
}

function listRecent(limit = 50) {
  return db
    .prepare('SELECT cnpj, razao_social AS razao, uf FROM empresas ORDER BY updated_at DESC LIMIT ?')
    .all(limit);
}

function count() {
  return db.prepare('SELECT COUNT(*) AS c FROM empresas').get().c;
}

/**
 * Busca filtrada (pronta para a futura oferta de consulta por CNAE/UF/município).
 * filtros: { cnae, uf, municipio, q, limit, offset }
 */
function search(f = {}) {
  const where = [];
  const params = [];
  if (f.uf) { where.push('uf = ?'); params.push(String(f.uf).toUpperCase()); }
  if (f.municipio) { where.push('LOWER(municipio) = LOWER(?)'); params.push(f.municipio); }
  if (f.cnae) { where.push('cnae_codigo LIKE ?'); params.push(String(f.cnae) + '%'); }
  if (f.q) { where.push('(razao_social LIKE ? OR nome_fantasia LIKE ?)'); params.push('%' + f.q + '%', '%' + f.q + '%'); }
  const sql =
    'SELECT cnpj, razao_social, nome_fantasia, uf, municipio, cnae_codigo, cnae_descricao FROM empresas' +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
  params.push(Math.min(f.limit || 50, 200), f.offset || 0);
  return db.prepare(sql).all(...params);
}

/** Importa, uma única vez, os arquivos JSON antigos (data/cnpj/*.json). */
function migrateFromFiles(dir) {
  let files;
  try {
    files = fs.readdirSync(dir).filter((x) => x.endsWith('.json'));
  } catch (e) {
    return 0;
  }
  let migrated = 0;
  for (const f of files) {
    const cnpj = f.replace(/\.json$/, '');
    const exists = db.prepare('SELECT 1 FROM empresas WHERE cnpj = ?').get(cnpj);
    if (exists) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const data = raw.data || raw;
      if (data && data.cnpj) {
        saveCnpj(cnpj, data);
        migrated++;
      }
    } catch (e) {
      /* ignora arquivo corrompido */
    }
  }
  return migrated;
}

module.exports = { init, getCnpj, saveCnpj, listRecent, count, search, migrateFromFiles };
