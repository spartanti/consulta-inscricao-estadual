'use strict';

/**
 * Popula a tabela radar_novas (empresas abertas nos últimos DIAS dias) a partir
 * dos ZIPs locais da Receita — sem varrer a tabela grande do Postgres.
 *
 *   DATABASE_URL=<público> LOCAL_DIR=~/receita-dados/2026-06 DIAS=90 node radar-build.js
 *
 * Rodar de novo a cada import mensal (TRUNCATE + recarga).
 */
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const copyFrom = require('pg-copy-streams').from;
const { DatabaseSync } = require('node:sqlite');
const { parseCsvLine } = require('./importar-receita');

const LOCAL_DIR = process.env.LOCAL_DIR;
const DIAS = parseInt(process.env.DIAS || '90', 10) || 90;
const CHUNK = 50000;

const COLS = 'cnpj,razao_social,nome_fantasia,uf,municipio,cnae_codigo,cnae_descricao,porte,data_inicio';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const csv = (v) => (v == null || v === '' ? '' : '"' + String(v).replace(/"/g, '""') + '"');
function exists(f) { try { fs.accessSync(path.join(LOCAL_DIR, f)); return true; } catch (e) { return false; } }

function streamZip(file, onLine) {
  return new Promise((resolve) => {
    const sh = spawn('bash', ['-c', `funzip "${LOCAL_DIR}/${file}"`], { stdio: ['ignore', 'pipe', 'ignore'] });
    sh.stdout.setEncoding('latin1');
    const rl = readline.createInterface({ input: sh.stdout, crlfDelay: Infinity });
    let done = false; const fin = () => { if (!done) { done = true; resolve(); } };
    rl.on('line', (line) => { if (line) onLine(parseCsvLine(line)); });
    rl.on('close', fin); sh.on('error', fin); sh.on('close', fin);
  });
}

(async () => {
  if (!process.env.DATABASE_URL || !LOCAL_DIR) throw new Error('Defina DATABASE_URL e LOCAL_DIR.');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2,
    keepAlive: true, connectionTimeoutMillis: 20000, statement_timeout: 120000, query_timeout: 120000,
  });
  pool.on('error', () => {});

  await pool.query(`CREATE TABLE IF NOT EXISTS radar_novas (
    cnpj TEXT PRIMARY KEY, razao_social TEXT, nome_fantasia TEXT, uf TEXT, municipio TEXT,
    cnae_codigo TEXT, cnae_descricao TEXT, porte TEXT, data_inicio DATE)`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_radar_inicio ON radar_novas(data_inicio DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_radar_uf ON radar_novas(uf)');
  await pool.query(`CREATE UNLOGGED TABLE IF NOT EXISTS radar_stg (
    cnpj TEXT, razao_social TEXT, nome_fantasia TEXT, uf TEXT, municipio TEXT,
    cnae_codigo TEXT, cnae_descricao TEXT, porte TEXT, data_inicio DATE)`);
  // NO_TRUNCATE=1 + START_FILE=N: retomar uma carga interrompida sem zerar
  if (process.env.NO_TRUNCATE !== '1') await pool.query('TRUNCATE radar_novas');

  const muniMap = {}; const cnaeMap = {};
  await streamZip('Municipios.zip', (f) => { muniMap[f[0]] = f[1]; });
  await streamZip('Cnaes.zip', (f) => { cnaeMap[String(f[0]).replace(/\D/g, '')] = f[1]; });

  const empdb = new DatabaseSync(path.join(LOCAL_DIR, '_emp_lookup.db'), { readOnly: true });
  const getEmp = empdb.prepare('SELECT razao, porte FROM emp WHERE b=?');

  const corte = new Date(Date.now() - DIAS * 86400000);
  const corteYmd = corte.toISOString().slice(0, 10).replace(/-/g, '');
  console.log(`Corte: aberturas >= ${corteYmd} (${DIAS} dias)`);

  let buf = []; let total = 0; let perdidos = 0;
  const flush = async () => {
    if (!buf.length) return;
    const rows = buf; buf = [];
    const data = rows.join('\n') + '\n';
    for (let a = 1; a <= 5; a++) {
      try {
        const c = await pool.connect();
        try {
          await c.query('TRUNCATE radar_stg');
          await new Promise((resolve, reject) => {
            const s = c.query(copyFrom(`COPY radar_stg (${COLS}) FROM STDIN WITH (FORMAT csv)`));
            s.on('error', reject); s.on('finish', resolve);
            s.write(data); s.end();
          });
          await c.query(`INSERT INTO radar_novas (${COLS})
            SELECT DISTINCT ON (cnpj) ${COLS} FROM radar_stg ON CONFLICT (cnpj) DO NOTHING`);
          total += rows.length;
          break;
        } finally { c.release(true); }
      } catch (e) {
        if (a === 5) { perdidos += rows.length; console.error('chunk perdido:', e.message); }
        else await sleep(2000 * a);
      }
    }
  };

  const START_FILE = parseInt(process.env.START_FILE || '0', 10) || 0;
  for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => n >= START_FILE)) {
    const f = `Estabelecimentos${k}.zip`;
    if (!exists(f)) continue;
    await streamZip(f, (c) => {
      if (c[5] !== '02') return;                    // só ativas
      const ini = c[10];                            // AAAAMMDD
      if (!ini || ini.length !== 8 || ini < corteYmd) return;
      const cnpj = (c[0] || '') + (c[1] || '') + (c[2] || '');
      if (!/^\d{14}$/.test(cnpj)) return;
      const e = getEmp.get(c[0]) || {};
      const cnae = String(c[11] || '').replace(/\D/g, '');
      buf.push([
        cnpj, e.razao || null, c[4] || null, c[19] || null, muniMap[c[20]] || null,
        cnae || null, cnaeMap[cnae] || null, e.porte || null,
        `${ini.slice(0, 4)}-${ini.slice(4, 6)}-${ini.slice(6, 8)}`,
      ].map(csv).join(','));
    });
    while (buf.length >= CHUNK) await flush();
    await flush();
    console.log(`${f} ok — ${total} no radar`);
  }
  await flush();

  await pool.query('DROP TABLE IF EXISTS radar_stg');
  await pool.query('ANALYZE radar_novas');
  console.log(`CONCLUÍDO: ${total} empresas novas no radar${perdidos ? ` | ${perdidos} perdidas` : ''}`);
  empdb.close();
  await pool.end();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
