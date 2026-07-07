'use strict';

/**
 * Carrega a tabela socios do Postgres (usada em "empresas relacionadas" e na
 * futura busca por sócio) a partir do índice SQLite local (soc).
 * Recarga total: TRUNCATE + COPY em chunks + índices + ANALYZE.
 *
 *   DATABASE_URL=<público> LOCAL_DIR=~/receita-dados/2026-07 node carregar-socios.js
 */
const path = require('path');
const { Pool } = require('pg');
const copyFrom = require('pg-copy-streams').from;
const { DatabaseSync } = require('node:sqlite');

const LOCAL_DIR = process.env.LOCAL_DIR;
const CHUNK = 100000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const csv = (v) => (v == null || v === '' ? '' : '"' + String(v).replace(/"/g, '""') + '"');

(async () => {
  if (!process.env.DATABASE_URL || !LOCAL_DIR) throw new Error('Defina DATABASE_URL e LOCAL_DIR.');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2,
    keepAlive: true, connectionTimeoutMillis: 20000, statement_timeout: 300000, query_timeout: 300000,
  });
  pool.on('error', () => {});

  const empdb = new DatabaseSync(path.join(LOCAL_DIR, '_emp_lookup.db'), { readOnly: true });
  const total = empdb.prepare('SELECT COUNT(*) c FROM soc').get().c;
  console.log(`Sócios no índice local: ${total}`);

  await pool.query(`CREATE TABLE IF NOT EXISTS socios (
    cnpj_basico TEXT NOT NULL, nome TEXT NOT NULL, qualificacao TEXT)`);
  // Recarga em tabela nova + swap atômico (site continua servindo a antiga enquanto isso)
  await pool.query('DROP TABLE IF EXISTS socios_new');
  await pool.query('CREATE TABLE socios_new (cnpj_basico TEXT NOT NULL, nome TEXT NOT NULL, qualificacao TEXT)');

  const it = empdb.prepare('SELECT b, nome, qual FROM soc').iterate();
  let buf = []; let enviados = 0;
  const flush = async () => {
    if (!buf.length) return;
    const data = buf.join('\n') + '\n'; const n = buf.length; buf = [];
    for (let a = 1; a <= 6; a++) {
      try {
        const c = await pool.connect();
        try {
          await new Promise((resolve, reject) => {
            const s = c.query(copyFrom('COPY socios_new (cnpj_basico,nome,qualificacao) FROM STDIN WITH (FORMAT csv)'));
            s.on('error', reject); s.on('finish', resolve);
            s.write(data); s.end();
          });
          enviados += n;
          if (enviados % 2000000 < CHUNK) console.log(`  ... ${enviados}/${total}`);
          return;
        } finally { c.release(true); }
      } catch (e) {
        if (a === 6) throw e;
        await sleep(2000 * a);
      }
    }
  };

  for (const r of it) {
    if (!r.nome) continue;
    buf.push([r.b, r.nome, r.qual].map(csv).join(','));
    if (buf.length >= CHUNK) await flush();
  }
  await flush();
  empdb.close();

  console.log('Criando índices...');
  await pool.query('CREATE INDEX idx_socios_new_nome ON socios_new(nome)');
  await pool.query('CREATE INDEX idx_socios_new_basico ON socios_new(cnpj_basico)');
  await pool.query('ANALYZE socios_new');
  console.log('Swap atômico...');
  await pool.query('BEGIN');
  await pool.query('DROP TABLE IF EXISTS socios');
  await pool.query('ALTER TABLE socios_new RENAME TO socios');
  await pool.query('ALTER INDEX idx_socios_new_nome RENAME TO idx_socios_nome');
  await pool.query('ALTER INDEX idx_socios_new_basico RENAME TO idx_socios_basico');
  await pool.query('COMMIT');
  const cnt = await pool.query('SELECT reltuples::bigint n FROM pg_class WHERE relname=$1', ['socios']);
  console.log(`CONCLUÍDO: ~${cnt.rows[0].n} sócios no Postgres.`);
  await pool.end();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
