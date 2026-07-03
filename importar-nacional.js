'use strict';

/**
 * Importador NACIONAL (todas as UFs) com baixo uso de RAM.
 *
 * Fase 1: lê todos os Empresas*.zip presentes e monta um índice
 *         cnpj_basico -> razão social em SQLite LOCAL (disco, pouca RAM).
 * Fase 2: lê todos os Estabelecimentos*.zip presentes, busca a razão no índice
 *         e grava em lote no PostgreSQL (upsert que preserva o enriquecimento/IE).
 *
 * Tolera arquivos truncados/faltando (importa o que conseguir ler).
 *
 *   DATABASE_URL=<público> LOCAL_DIR=~/receita-dados/2026-06 node importar-nacional.js
 *   ... BATCH=2000 LIMIT=0 node importar-nacional.js
 */
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const db = require('./db');
const { parseCsvLine, buildEstabData, dateBR } = require('./importar-receita');

const LOCAL_DIR = process.env.LOCAL_DIR;
const BATCH = parseInt(process.env.BATCH || '2000', 10) || 2000;
const LIMIT = parseInt(process.env.LIMIT || '0', 10) || 0;

function exists(file) {
  try { require('fs').accessSync(path.join(LOCAL_DIR, file)); return true; } catch (e) { return false; }
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
      // Backpressure: se onLine devolve uma Promise (flush no Postgres), pausa a
      // leitura até concluir. Sem isso o readline lê o ZIP inteiro mais rápido do
      // que o banco grava e as promessas/lotes acumulam até estourar a memória.
      if (r && typeof r.then === 'function') {
        rl.pause();
        r.then((v) => { if (v === false) halt(); else if (!stop) rl.resume(); })
         .catch(() => { if (!stop) rl.resume(); });
      }
    });
    rl.on('close', fin); sh.on('error', fin); sh.on('close', fin);
  });
}

(async () => {
  if (!process.env.DATABASE_URL || !LOCAL_DIR) throw new Error('Defina DATABASE_URL e LOCAL_DIR.');
  await db.init(process.env.DATABASE_URL);

  // mapas de apoio
  const muniMap = {}; const cnaeMap = {}; const qualMap = {};
  await streamZip('Municipios.zip', (f) => { muniMap[f[0]] = f[1]; });
  await streamZip('Cnaes.zip', (f) => { cnaeMap[String(f[0]).replace(/\D/g, '')] = f[1]; });
  if (exists('Qualificacoes.zip')) await streamZip('Qualificacoes.zip', (f) => { qualMap[f[0]] = f[1]; });
  const FAIXA = { '0': null, '1': '0 a 12 anos', '2': '13 a 20 anos', '3': '21 a 30 anos', '4': '31 a 40 anos', '5': '41 a 50 anos', '6': '51 a 60 anos', '7': '61 a 70 anos', '8': '71 a 80 anos', '9': 'Mais de 80 anos' };
  console.log(`Municípios: ${Object.keys(muniMap).length} | CNAEs: ${Object.keys(cnaeMap).length} | Qualificações: ${Object.keys(qualMap).length}`);

  // ---- Fase 1: índice de razão social em SQLite local ----
  const empdb = new DatabaseSync(path.join(LOCAL_DIR, '_emp_lookup.db'));
  empdb.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS emp(b TEXT PRIMARY KEY, razao TEXT, natureza TEXT, porte TEXT, capital TEXT)');
  const insEmp = empdb.prepare('INSERT OR REPLACE INTO emp(b,razao,natureza,porte,capital) VALUES(?,?,?,?,?)');
  const getEmp = empdb.prepare('SELECT razao,natureza,porte,capital FROM emp WHERE b=?');
  const PORTE = { '01': 'Micro Empresa', '03': 'Empresa de Pequeno Porte', '05': 'Demais' };

  let jaIndexado = 0;
  try { jaIndexado = empdb.prepare('SELECT COUNT(*) AS c FROM emp').get().c; } catch (e) {}
  if (jaIndexado > 1000000 && !process.env.FORCE_REINDEX) {
    console.log(`Índice de empresas já existe (${jaIndexado} registros) — pulando Fase 1. Use FORCE_REINDEX=1 para reconstruir.`);
  } else {
    let empCount = 0;
    for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const f = `Empresas${k}.zip`;
      if (!exists(f)) continue;
      console.log(`[Empresas] lendo ${f}...`);
      empdb.exec('BEGIN');
      let n = 0;
      await streamZip(f, (c) => {
        insEmp.run(
          c[0],
          c[1] || null,
          c[2] || null,
          PORTE[c[5]] || null,
          c[4] ? Number(String(c[4]).replace(',', '.')).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null
        );
        empCount++; n++;
        if (n % 200000 === 0) { empdb.exec('COMMIT'); empdb.exec('BEGIN'); }
      });
      empdb.exec('COMMIT');
    }
    console.log(`Índice de empresas (razão social): ${empCount} registros.`);
  }

  // ---- Fase 1b: índice de sócios (QSA) em SQLite local ----
  empdb.exec('CREATE TABLE IF NOT EXISTS soc(b TEXT, nome TEXT, qual TEXT, faixa TEXT, dt TEXT)');
  const insSoc = empdb.prepare('INSERT INTO soc(b,nome,qual,faixa,dt) VALUES(?,?,?,?,?)');
  const getSoc = empdb.prepare('SELECT nome,qual,faixa,dt FROM soc WHERE b=?');
  let jaSoc = 0;
  try { jaSoc = empdb.prepare('SELECT COUNT(*) AS c FROM soc').get().c; } catch (e) {}
  if (jaSoc > 500000 && !process.env.FORCE_REINDEX) {
    console.log(`Índice de sócios já existe (${jaSoc} registros) — pulando.`);
  } else {
    if (jaSoc) empdb.exec('DELETE FROM soc');
    let socCount = 0;
    for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const f = `Socios${k}.zip`;
      if (!exists(f)) continue;
      console.log(`[Sócios] lendo ${f}...`);
      empdb.exec('BEGIN');
      let n = 0;
      await streamZip(f, (c) => {
        insSoc.run(c[0], c[2] || null, qualMap[c[4]] || null, FAIXA[c[10]] || null, c[5] ? dateBR(c[5]) : null);
        socCount++; n++;
        if (n % 200000 === 0) { empdb.exec('COMMIT'); empdb.exec('BEGIN'); }
      });
      empdb.exec('COMMIT');
    }
    empdb.exec('CREATE INDEX IF NOT EXISTS idx_soc_b ON soc(b)');
    console.log(`Índice de sócios: ${socCount} registros.`);
  }

  // ---- Fase 2: estabelecimentos -> PostgreSQL ----
  let total = 0; let lidos = 0; let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    const b = batch; batch = [];
    try { await db.upsertBaseBatch(b); total += b.length; } catch (e) { console.error('  lote:', e.message); }
    if (total % 100000 < BATCH) console.log(`  ... ${total} empresas gravadas no Postgres`);
  };

  for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const f = `Estabelecimentos${k}.zip`;
    if (!exists(f)) continue;
    console.log(`[Estabelecimentos] processando ${f}...`);
    await streamZip(f, (c) => {
      lidos++;
      const e = getEmp.get(c[0]) || null;
      const emp = e ? { razao: e.razao, natureza: e.natureza, porte: e.porte, capital: e.capital } : null;
      const d = buildEstabData(c, emp, muniMap, cnaeMap);
      if (!/^\d{14}$/.test(d.cnpj)) return;
      const socios = getSoc.all(c[0]);
      if (socios.length) d.socios = socios.map((s) => ({ nome: s.nome, qualificacao: s.qual, faixa_etaria: s.faixa, data_entrada: s.dt }));
      batch.push(d);
      if (batch.length >= BATCH) {
        if (LIMIT && total + batch.length >= LIMIT) return flush().then(() => false);
        return flush();
      }
    });
    await flush();
    console.log(`[Estabelecimentos] ${f} concluído. Lidos: ${lidos} | gravados: ${total}`);
    if (LIMIT && total >= LIMIT) break;
  }

  empdb.close();
  console.log(`CONCLUÍDO. Total no banco: ${await db.count()}`);
  await db.close();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
