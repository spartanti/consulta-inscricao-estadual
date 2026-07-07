'use strict';

/**
 * Importador NACIONAL via COPY (carga em massa eficiente, resiliente ao proxy).
 *
 * Em vez de milhares de INSERTs (uma ida ao proxy por lote), usa:
 *   COPY  -> tabela de staging UNLOGGED (stream, pouquíssimo overhead)
 *   INSERT ... SELECT ... ON CONFLICT  -> upsert em bloco (server-side)
 *
 * Reaproveita o índice SQLite (_emp_lookup.db) já construído: razão social (emp)
 * e sócios (soc). Requer os Estabelecimentos*.zip + os aux (Municipios/Cnaes/Qualificacoes).
 *
 *   SKIP_INDEXES=1 DATABASE_URL=<público> LOCAL_DIR=~/receita-dados/2026-06 node importar-copy.js
 *   ... CHUNK=20000 LIMIT=0 SOMENTE_ATIVAS=0 node importar-copy.js
 */
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const copyFrom = require('pg-copy-streams').from;
const { DatabaseSync } = require('node:sqlite');
const { parseCsvLine, buildEstabData } = require('./importar-receita');

const LOCAL_DIR = process.env.LOCAL_DIR;
// CNPJs removidos a pedido do titular (LGPD) — manter em sincronia com server.js
const CNPJ_REMOVIDOS = new Set(['64048012000179']);
const CHUNK = parseInt(process.env.CHUNK || '20000', 10) || 20000;
const LIMIT = parseInt(process.env.LIMIT || '0', 10) || 0;
const SOMENTE_ATIVAS = process.env.SOMENTE_ATIVAS === '1';

const COLS = 'cnpj,razao_social,nome_fantasia,uf,municipio,cnae_codigo,cnae_descricao,situacao_cadastral,data';
const STG = 'empresas_stg';
// Dois modos:
//  - carga inicial (padrão): DO NOTHING — linhas do MESMO dump já presentes são
//    puladas (rápido, sem write-amplification).
//  - ATUALIZA=1 (dump mensal novo): DO UPDATE apenas quando algo REALMENTE mudou
//    (WHERE ... IS DISTINCT FROM) — ~2-5% das linhas/mês. Linhas enriquecidas
//    preservam a IE (reinjetada no JSONB novo via jsonb_set).
const ATUALIZA = process.env.ATUALIZA === '1';
const UPSERT = ATUALIZA
  ? `INSERT INTO empresas (${COLS},updated_at)
     SELECT DISTINCT ON (cnpj) ${COLS}, now() FROM ${STG}
     ON CONFLICT (cnpj) DO UPDATE SET
       razao_social=EXCLUDED.razao_social, nome_fantasia=EXCLUDED.nome_fantasia,
       uf=EXCLUDED.uf, municipio=EXCLUDED.municipio,
       cnae_codigo=EXCLUDED.cnae_codigo, cnae_descricao=EXCLUDED.cnae_descricao,
       situacao_cadastral=EXCLUDED.situacao_cadastral,
       data = CASE WHEN empresas.enriquecido_em IS NULL THEN EXCLUDED.data
                   ELSE jsonb_set(EXCLUDED.data, '{inscricoes_estaduais}',
                          COALESCE(empresas.data->'inscricoes_estaduais', '[]'::jsonb)) END,
       updated_at = now()
     WHERE (empresas.razao_social, empresas.nome_fantasia, empresas.uf, empresas.municipio,
            empresas.cnae_codigo, empresas.cnae_descricao, empresas.situacao_cadastral)
           IS DISTINCT FROM
           (EXCLUDED.razao_social, EXCLUDED.nome_fantasia, EXCLUDED.uf, EXCLUDED.municipio,
            EXCLUDED.cnae_codigo, EXCLUDED.cnae_descricao, EXCLUDED.situacao_cadastral)
        OR (empresas.enriquecido_em IS NULL AND empresas.data IS DISTINCT FROM EXCLUDED.data)`
  : `INSERT INTO empresas (${COLS},updated_at)
     SELECT DISTINCT ON (cnpj) ${COLS}, now() FROM ${STG}
     ON CONFLICT (cnpj) DO NOTHING`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// nenhuma etapa pode pendurar pra sempre num socket morto do proxy
function withTimeout(p, ms, label) {
  let t;
  const to = new Promise((_, reject) => { t = setTimeout(() => reject(new Error(`timeout ${label} ${ms}ms`)), ms); });
  return Promise.race([Promise.resolve(p), to]).finally(() => clearTimeout(t));
}
function exists(f) { try { fs.accessSync(path.join(LOCAL_DIR, f)); return true; } catch (e) { return false; } }
function csv(v) { return v == null ? '' : '"' + String(v).replace(/"/g, '""') + '"'; }
function rowCsv(d) {
  const cnae = d.atividade_principal || {};
  return [d.cnpj, d.razao_social, d.nome_fantasia, d.uf, d.municipio,
    cnae.codigo || null, cnae.descricao || null, d.situacao_cadastral, JSON.stringify(d)]
    .map(csv).join(',');
}

function streamZip(file, onLine) {
  return new Promise((resolve) => {
    const sh = spawn('bash', ['-c', `funzip "${LOCAL_DIR}/${file}"`], { stdio: ['ignore', 'pipe', 'ignore'] });
    sh.stdout.setEncoding('latin1');
    const rl = readline.createInterface({ input: sh.stdout, crlfDelay: Infinity });
    let done = false; const fin = () => { if (!done) { done = true; resolve(); } };
    let stop = false;
    const halt = () => { stop = true; rl.close(); try { sh.kill('SIGKILL'); } catch (e) {} };
    rl.on('line', (line) => {
      if (stop || !line) return;
      const r = onLine(parseCsvLine(line));
      if (r === false) { halt(); return; }
      if (r && typeof r.then === 'function') {
        rl.pause();
        r.then((v) => { if (v === false) halt(); else if (!stop) rl.resume(); }).catch(() => { if (!stop) rl.resume(); });
      }
    });
    rl.on('close', fin); sh.on('error', fin); sh.on('close', fin);
  });
}

(async () => {
  if (!process.env.DATABASE_URL || !LOCAL_DIR) throw new Error('Defina DATABASE_URL e LOCAL_DIR.');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3,
    keepAlive: true, keepAliveInitialDelayMillis: 10000,
    connectionTimeoutMillis: 20000, idleTimeoutMillis: 30000,
    statement_timeout: 120000, query_timeout: 120000,
  });
  pool.on('error', () => {}); // ignora erros de conexões ociosas derrubadas pelo proxy

  // staging UNLOGGED (rápida, sem índice)
  await pool.query(`CREATE UNLOGGED TABLE IF NOT EXISTS ${STG} (cnpj text, razao_social text, nome_fantasia text, uf text, municipio text, cnae_codigo text, cnae_descricao text, situacao_cadastral text, data jsonb)`);

  // Bloqueios LGPD dinâmicos (tabela cnpj_removidos) somados aos hardcoded
  try {
    const rem = await pool.query('SELECT cnpj FROM cnpj_removidos');
    for (const r of rem.rows) CNPJ_REMOVIDOS.add(r.cnpj);
    console.log(`Removidos (LGPD): ${CNPJ_REMOVIDOS.size}`);
  } catch (e) { /* tabela pode não existir ainda */ }

  // mapas de apoio
  const muniMap = {}; const cnaeMap = {}; const qualMap = {};
  await streamZip('Municipios.zip', (f) => { muniMap[f[0]] = f[1]; });
  await streamZip('Cnaes.zip', (f) => { cnaeMap[String(f[0]).replace(/\D/g, '')] = f[1]; });
  if (exists('Qualificacoes.zip')) await streamZip('Qualificacoes.zip', (f) => { qualMap[f[0]] = f[1]; });
  console.log(`Municípios: ${Object.keys(muniMap).length} | CNAEs: ${Object.keys(cnaeMap).length} | Qualif: ${Object.keys(qualMap).length}`);
  const FAIXA = { '0': null, '1': '0 a 12 anos', '2': '13 a 20 anos', '3': '21 a 30 anos', '4': '31 a 40 anos', '5': '41 a 50 anos', '6': '51 a 60 anos', '7': '61 a 70 anos', '8': '71 a 80 anos', '9': 'Mais de 80 anos' };

  // índice SQLite já construído (razão + sócios)
  const empdb = new DatabaseSync(path.join(LOCAL_DIR, '_emp_lookup.db'));
  const getEmp = empdb.prepare('SELECT razao,natureza,porte,capital FROM emp WHERE b=?');
  const getSoc = empdb.prepare('SELECT nome,qual,faixa,dt FROM soc WHERE b=?');
  console.log(`emp: ${empdb.prepare('SELECT COUNT(*) c FROM emp').get().c} | soc: ${empdb.prepare('SELECT COUNT(*) c FROM soc').get().c}`);

  // client persistente + reconexão (proxy instável)
  let client = null;
  const getClient = async () => {
    if (!client) { client = await pool.connect(); client.on('error', () => {}); }
    return client;
  };
  const resetClient = async () => { try { if (client) client.release(true); } catch (e) {} client = null; };

  let total = 0; let perdidos = 0; let buf = [];
  const flush = async () => {
    if (!buf.length) return;
    const rows = buf; buf = [];
    const data = rows.join('\n') + '\n';
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        const c = await withTimeout(getClient(), 25000, 'connect');
        await withTimeout(c.query(`TRUNCATE ${STG}`), 30000, 'truncate');
        await withTimeout(new Promise((resolve, reject) => {
          const s = c.query(copyFrom(`COPY ${STG} (${COLS}) FROM STDIN WITH (FORMAT csv)`));
          s.on('error', reject); s.on('finish', resolve);
          s.write(data); s.end();
        }), 90000, 'copy');
        await withTimeout(c.query(UPSERT), 90000, 'upsert');
        total += rows.length;
        break;
      } catch (e) {
        await resetClient();
        if (attempt === 6) { perdidos += rows.length; console.error(`  chunk perdido (${rows.length}):`, e.message); break; }
        await sleep(1500 * attempt);
      }
    }
    if (total % 500000 < CHUNK) console.log(`  ... ${total} gravadas${perdidos ? ` | ${perdidos} perdidas` : ''}`);
  };

  let lidos = 0;
  const START_FILE = parseInt(process.env.START_FILE || '0', 10) || 0; // retomar de Estabelecimentos<N>
  for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => n >= START_FILE)) {
    const f = `Estabelecimentos${k}.zip`;
    if (!exists(f)) continue;
    console.log(`[Estab] ${f}...`);
    await streamZip(f, (c) => {
      lidos++;
      if (SOMENTE_ATIVAS && c[5] !== '02') return;
      const e = getEmp.get(c[0]) || null;
      const emp = e ? { razao: e.razao, natureza: e.natureza, porte: e.porte, capital: e.capital } : null;
      const d = buildEstabData(c, emp, muniMap, cnaeMap);
      if (!/^\d{14}$/.test(d.cnpj)) return;
      if (CNPJ_REMOVIDOS.has(d.cnpj)) return; // removido a pedido do titular (LGPD)
      const socios = getSoc.all(c[0]);
      if (socios.length) d.socios = socios.map((s) => ({ nome: s.nome, qualificacao: s.qual, faixa_etaria: s.faixa, data_entrada: s.dt }));
      buf.push(rowCsv(d));
      if (buf.length >= CHUNK) {
        if (LIMIT && total + buf.length >= LIMIT) return flush().then(() => false);
        return flush();
      }
    });
    await flush();
    console.log(`[Estab] ${f} ok. Lidos ${lidos} | gravados ${total}`);
    if (LIMIT && total >= LIMIT) break;
  }

  await resetClient();
  empdb.close();
  try { await withTimeout(pool.query(`DROP TABLE IF EXISTS ${STG}`), 20000, 'drop'); } catch (e) {}
  let cntTxt = '(contagem pulada)';
  try { const cnt = await withTimeout(pool.query('SELECT reltuples::bigint c FROM pg_class WHERE relname=$1', ['empresas']), 15000, 'count'); cntTxt = `~${cnt.rows[0].c} (estimado)`; } catch (e) {}
  console.log(`CONCLUÍDO. Processadas ${total} | Total no banco: ${cntTxt}${perdidos ? ` | ${perdidos} perdidas` : ''}`);
  await pool.end();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
