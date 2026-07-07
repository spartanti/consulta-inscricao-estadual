'use strict';

/**
 * Constrói o índice SQLite local (_emp_lookup.db) de um mês dos Dados Abertos:
 *   emp  — razão social/natureza/porte/capital (Empresas*.zip)
 *   soc  — sócios/QSA (Socios*.zip)
 * (a tabela mei é construída pelo rankings-build.js a partir do Simples.zip)
 *
 *   LOCAL_DIR=~/receita-dados/2026-07 node indexar-local.js
 *   FORCE_REINDEX=1 ...   # reconstrói mesmo se já existir
 */
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { parseCsvLine, dateBR } = require('./importar-receita');

const LOCAL_DIR = process.env.LOCAL_DIR;
if (!LOCAL_DIR) throw new Error('Defina LOCAL_DIR.');

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
  const qualMap = {};
  if (exists('Qualificacoes.zip')) await streamZip('Qualificacoes.zip', (f) => { qualMap[f[0]] = f[1]; });
  const FAIXA = { '0': null, '1': '0 a 12 anos', '2': '13 a 20 anos', '3': '21 a 30 anos', '4': '31 a 40 anos', '5': '41 a 50 anos', '6': '51 a 60 anos', '7': '61 a 70 anos', '8': '71 a 80 anos', '9': 'Mais de 80 anos' };
  const PORTE = { '01': 'Micro Empresa', '03': 'Empresa de Pequeno Porte', '05': 'Demais' };

  const empdb = new DatabaseSync(path.join(LOCAL_DIR, '_emp_lookup.db'));
  empdb.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS emp(b TEXT PRIMARY KEY, razao TEXT, natureza TEXT, porte TEXT, capital TEXT)');
  const insEmp = empdb.prepare('INSERT OR REPLACE INTO emp(b,razao,natureza,porte,capital) VALUES(?,?,?,?,?)');

  let jaEmp = 0;
  try { jaEmp = empdb.prepare('SELECT COUNT(*) c FROM emp').get().c; } catch (e) {}
  if (jaEmp > 1000000 && !process.env.FORCE_REINDEX) {
    console.log(`[emp] índice já existe (${jaEmp}) — pulando (FORCE_REINDEX=1 p/ refazer).`);
  } else {
    let n = 0;
    for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const f = `Empresas${k}.zip`;
      if (!exists(f)) continue;
      console.log(`[emp] ${f}...`);
      empdb.exec('BEGIN');
      let m = 0;
      await streamZip(f, (c) => {
        insEmp.run(c[0], c[1] || null, c[2] || null, PORTE[c[5]] || null,
          c[4] ? Number(String(c[4]).replace(',', '.')).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null);
        n++; m++;
        if (m % 200000 === 0) { empdb.exec('COMMIT'); empdb.exec('BEGIN'); }
      });
      empdb.exec('COMMIT');
    }
    console.log(`[emp] ${n} registros.`);
  }

  empdb.exec('CREATE TABLE IF NOT EXISTS soc(b TEXT, nome TEXT, qual TEXT, faixa TEXT, dt TEXT)');
  const insSoc = empdb.prepare('INSERT INTO soc(b,nome,qual,faixa,dt) VALUES(?,?,?,?,?)');
  let jaSoc = 0;
  try { jaSoc = empdb.prepare('SELECT COUNT(*) c FROM soc').get().c; } catch (e) {}
  if (jaSoc > 500000 && !process.env.FORCE_REINDEX) {
    console.log(`[soc] índice já existe (${jaSoc}) — pulando.`);
  } else {
    if (jaSoc) empdb.exec('DELETE FROM soc');
    let n = 0;
    for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const f = `Socios${k}.zip`;
      if (!exists(f)) continue;
      console.log(`[soc] ${f}...`);
      empdb.exec('BEGIN');
      let m = 0;
      await streamZip(f, (c) => {
        insSoc.run(c[0], c[2] || null, qualMap[c[4]] || null, FAIXA[c[10]] || null, c[5] ? dateBR(c[5]) : null);
        n++; m++;
        if (m % 200000 === 0) { empdb.exec('COMMIT'); empdb.exec('BEGIN'); }
      });
      empdb.exec('COMMIT');
    }
    empdb.exec('CREATE INDEX IF NOT EXISTS idx_soc_b ON soc(b)');
    console.log(`[soc] ${n} registros.`);
  }
  empdb.close();
  console.log('CONCLUÍDO.');
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
