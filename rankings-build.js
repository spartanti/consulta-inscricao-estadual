'use strict';

/**
 * Pré-computa os rankings/estatísticas (páginas /rankings) a partir dos ZIPs
 * locais da Receita — nada de agregação na tabela grande do Postgres.
 *
 * Tipos gerados (por UF + BR):
 *   capital  — empresas com maior capital social (top 50, matriz ativa)
 *   cidades  — cidades com mais empresas ativas (top 100)
 *   mei      — cidades com mais MEIs ativos (top 100; Simples.zip)
 *   cnaes    — atividades com mais aberturas nos últimos 90 dias vs 90 anteriores (top 100)
 *
 *   DATABASE_URL=<público> LOCAL_DIR=~/receita-dados/2026-06 node rankings-build.js
 *
 * Rodar a cada import mensal. Constrói a tabela `mei` no SQLite na 1ª execução.
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
const TOPN = { capital: 50, cidades: 100, mei: 100, cnaes: 100 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const csv = (v) => (v == null || v === '' ? '' : '"' + String(v).replace(/"/g, '""') + '"');
function exists(f) { try { fs.accessSync(path.join(LOCAL_DIR, f)); return true; } catch (e) { return false; } }
function parseCapital(s) {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/[R$\s.]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

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

  const muniMap = {}; const cnaeMap = {};
  await streamZip('Municipios.zip', (f) => { muniMap[f[0]] = f[1]; });
  await streamZip('Cnaes.zip', (f) => { cnaeMap[String(f[0]).replace(/\D/g, '')] = f[1]; });

  // SQLite: emp (razão/porte/capital) + mei (construída aqui na 1ª vez)
  const empdb = new DatabaseSync(path.join(LOCAL_DIR, '_emp_lookup.db'));
  const getEmp = empdb.prepare('SELECT razao, porte, capital FROM emp WHERE b=?');
  const temMei = empdb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mei'").get();
  const jaMei = temMei ? empdb.prepare('SELECT COUNT(*) c FROM mei').get().c : 0;
  if (!temMei || jaMei < 1000000) {
    console.log('[MEI] construindo índice do Simples.zip...');
    empdb.exec('DROP TABLE IF EXISTS mei; CREATE TABLE mei (b TEXT PRIMARY KEY);');
    empdb.exec('BEGIN');
    const ins = empdb.prepare('INSERT OR IGNORE INTO mei (b) VALUES (?)');
    let n = 0;
    await streamZip('Simples.zip', (f) => {
      // f: [basico, opcao_simples, dt, dt, opcao_mei, dt_opcao_mei, dt_exclusao_mei]
      if (f[4] === 'S' && (!f[6] || f[6] === '00000000')) { ins.run(f[0]); n++; }
    });
    empdb.exec('COMMIT');
    console.log(`[MEI] ${n} MEIs ativos indexados.`);
  } else {
    console.log(`[MEI] índice existente: ${jaMei} MEIs.`);
  }
  const isMei = empdb.prepare('SELECT 1 x FROM mei WHERE b=?');

  // Janelas p/ "CNAEs que mais crescem" (90d atuais vs 90d anteriores)
  const d = (dias) => new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
  const corte90 = d(90); const corte180 = d(180);

  // Acumuladores: chave 'UF' e 'BR'
  const cidades = {}; const meis = {}; const cnaeNow = {}; const cnaePrev = {}; const topCap = {};
  const bump2 = (obj, uf, k, inc = 1) => {
    if (!k) return;
    for (const g of [uf || '??', 'BR']) {
      (obj[g] = obj[g] || {})[k] = (obj[g][k] || 0) + inc;
    }
  };
  const pushCap = (uf, item) => {
    for (const g of [uf || '??', 'BR']) {
      const arr = (topCap[g] = topCap[g] || []);
      if (arr.length < TOPN.capital) { arr.push(item); if (arr.length === TOPN.capital) arr.sort((a, b) => b.v - a.v); }
      else if (item.v > arr[arr.length - 1].v) {
        arr[arr.length - 1] = item;
        arr.sort((a, b) => b.v - a.v);
      }
    }
  };

  let lidos = 0;
  for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const f = `Estabelecimentos${k}.zip`;
    if (!exists(f)) continue;
    await streamZip(f, (c) => {
      lidos++;
      if (c[5] !== '02') return; // só ativas
      const uf = c[19]; const muni = muniMap[c[20]]; const matriz = c[1] === '0001';
      const cnae = String(c[11] || '').replace(/\D/g, '');
      bump2(cidades, uf, muni);
      const ini = c[10];
      if (ini && ini.length === 8) {
        if (ini >= corte90) bump2(cnaeNow, uf, cnae);
        else if (ini >= corte180) bump2(cnaePrev, uf, cnae);
      }
      if (matriz) {
        if (isMei.get(c[0])) bump2(meis, uf, muni);
        const e = getEmp.get(c[0]);
        if (e && e.capital) {
          const v = parseCapital(e.capital);
          // Filtros de plausibilidade: a fonte tem capitais digitados errado
          // (cafeterias com R$ 500 bi). Teto absoluto acima da Petrobras (~205 bi)
          // e micro/pequenas com capital bilionário são descartados do ranking.
          const suspeito = v > 250e9 || (/Micro|Pequeno/i.test(e.porte || '') && v > 50e6);
          if (v >= 1000000 && !suspeito) {
            pushCap(uf, { v, cnpj: (c[0] || '') + (c[1] || '') + (c[2] || ''), r: e.razao, p: e.porte, m: muni, u: uf });
          }
        }
      }
    });
    console.log(`${f} ok (${lidos} lidos)`);
  }
  empdb.close();

  // Monta linhas do ranking
  const rows = [];
  const add = (tipo, uf, pos, chave, rotulo, valor, valor2, extra) =>
    rows.push([tipo, uf, pos, chave, rotulo, valor, valor2, extra ? JSON.stringify(extra) : null].map(csv).join(','));

  const topOf = (obj, n) => Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, n);
  const grupos = Object.keys(cidades).filter((g) => g.length === 2 && g !== '??').concat('BR');
  for (const g of new Set(grupos)) {
    topOf(cidades[g], TOPN.cidades).forEach(([muni, n], i) => add('cidades', g, i + 1, muni, muni, n, null, null));
    topOf(meis[g], TOPN.mei).forEach(([muni, n], i) => add('mei', g, i + 1, muni, muni, n, null, null));
    // CNAEs em crescimento: ordena por aberturas recentes; valor2 = período anterior
    topOf(cnaeNow[g], TOPN.cnaes).forEach(([cnae, n], i) =>
      add('cnaes', g, i + 1, cnae, cnaeMap[cnae] || cnae, n, (cnaePrev[g] || {})[cnae] || 0, null));
    (topCap[g] || []).sort((a, b) => b.v - a.v).slice(0, TOPN.capital).forEach((it, i) =>
      add('capital', g, i + 1, it.cnpj, it.r, it.v, null, { porte: it.p, municipio: it.m, uf: it.u }));
  }
  console.log(`Linhas de ranking: ${rows.length}`);

  // Envia ao Postgres (tabela pequena; recarga atômica via staging)
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2,
    keepAlive: true, connectionTimeoutMillis: 20000, statement_timeout: 120000, query_timeout: 120000,
  });
  pool.on('error', () => {});
  const DDL = `(tipo TEXT NOT NULL, uf TEXT NOT NULL, pos INT NOT NULL, chave TEXT, rotulo TEXT,
    valor NUMERIC, valor2 NUMERIC, extra JSONB, PRIMARY KEY (tipo, uf, pos))`;
  await pool.query(`CREATE TABLE IF NOT EXISTS rankings ${DDL}`);
  await pool.query(`CREATE TABLE IF NOT EXISTS rankings_stg ${DDL}`);
  for (let a = 1; a <= 6; a++) {
    try {
      const c = await pool.connect();
      try {
        await c.query('TRUNCATE rankings_stg');
        await new Promise((resolve, reject) => {
          const s = c.query(copyFrom('COPY rankings_stg (tipo,uf,pos,chave,rotulo,valor,valor2,extra) FROM STDIN WITH (FORMAT csv)'));
          s.on('error', reject); s.on('finish', resolve);
          s.write(rows.join('\n') + '\n'); s.end();
        });
        await c.query('BEGIN');
        await c.query('TRUNCATE rankings');
        await c.query('INSERT INTO rankings SELECT * FROM rankings_stg');
        await c.query('COMMIT');
        break;
      } finally { c.release(true); }
    } catch (e) {
      if (a === 6) throw e;
      console.error(`tentativa ${a} falhou: ${e.message}`);
      await sleep(2500 * a);
    }
  }
  await pool.query('DROP TABLE IF EXISTS rankings_stg');
  const r = await pool.query('SELECT tipo, COUNT(*) c FROM rankings GROUP BY tipo ORDER BY tipo');
  console.log('CONCLUÍDO:', r.rows.map((x) => `${x.tipo}=${x.c}`).join(' | '));
  await pool.end();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
