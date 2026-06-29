'use strict';

/**
 * Importa um único estado (UF) de uma parte dos Dados Abertos, com BAIXO uso de
 * memória (dois passos). Útil em máquinas com pouca RAM.
 *
 *   DATABASE_URL=... LOCAL_DIR=~/receita-dados/2026-06 UF=ES PART=0 node importar-uf.js
 */
const { spawn } = require('child_process');
const readline = require('readline');
const db = require('./db');
const { parseCsvLine, buildEstabData } = require('./importar-receita');

const LOCAL_DIR = process.env.LOCAL_DIR;
const UF = (process.env.UF || 'ES').toUpperCase();
const PART = process.env.PART || '0';
const BATCH = parseInt(process.env.BATCH || '1000', 10) || 1000;

function streamZip(file, onLine) {
  return new Promise((resolve) => {
    const sh = spawn('bash', ['-c', `funzip "${LOCAL_DIR}/${file}"`], { stdio: ['ignore', 'pipe', 'ignore'] });
    sh.stdout.setEncoding('latin1');
    const rl = readline.createInterface({ input: sh.stdout, crlfDelay: Infinity });
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    rl.on('line', (line) => { if (line) onLine(parseCsvLine(line)); });
    rl.on('close', fin);
    sh.on('error', fin);
    sh.on('close', fin);
  });
}

(async () => {
  if (!process.env.DATABASE_URL || !LOCAL_DIR) throw new Error('Defina DATABASE_URL e LOCAL_DIR.');
  await db.init(process.env.DATABASE_URL);

  console.log(`Importando UF=${UF} (parte ${PART}) de ${LOCAL_DIR}`);
  const muniMap = {};
  const cnaeMap = {};
  await streamZip('Municipios.zip', (f) => { muniMap[f[0]] = f[1]; });
  await streamZip('Cnaes.zip', (f) => { cnaeMap[String(f[0]).replace(/\D/g, '')] = f[1]; });
  console.log(`Municípios: ${Object.keys(muniMap).length} | CNAEs: ${Object.keys(cnaeMap).length}`);

  // Passo 1: estabelecimentos do estado (sem razão), guardando o cnpj_basico.
  const rows = [];
  const basicos = new Set();
  let lidos = 0;
  await streamZip(`Estabelecimentos${PART}.zip`, (f) => {
    lidos++;
    if (f[19] !== UF) return;
    const d = buildEstabData(f, null, muniMap, cnaeMap);
    if (!/^\d{14}$/.test(d.cnpj)) return;
    d._basico = f[0];
    rows.push(d);
    basicos.add(f[0]);
  });
  console.log(`Estabelecimentos lidos: ${lidos} | do ${UF}: ${rows.length} | empresas distintas: ${basicos.size}`);

  // Passo 2: razão social só dos cnpj_basico do estado.
  const raz = new Map();
  await streamZip(`Empresas${PART}.zip`, (f) => {
    if (basicos.has(f[0])) raz.set(f[0], f[1] || null);
  });
  console.log(`Razões sociais encontradas: ${raz.size}`);

  // Upsert em lote.
  let total = 0;
  let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    const b = batch; batch = [];
    try { await db.upsertBaseBatch(b); total += b.length; } catch (e) { console.error('lote:', e.message); }
  };
  for (const d of rows) {
    d.razao_social = raz.get(d._basico) || null;
    delete d._basico;
    batch.push(d);
    if (batch.length >= BATCH) { await flush(); if (total % 20000 < BATCH) console.log(`  ... ${total} gravados`); }
  }
  await flush();
  console.log(`Concluído UF=${UF}: ${total} empresas gravadas. Total no banco: ${await db.count()}`);
  await db.close();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
