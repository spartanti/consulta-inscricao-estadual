'use strict';

/**
 * Importador dos Dados Abertos do CNPJ (Receita Federal) para o PostgreSQL.
 *
 * Estratégia memory-bounded: processa parte a parte (0..9). Para cada parte k,
 * carrega o mapa cnpj_basico->razão de Empresas{k}.zip e percorre
 * Estabelecimentos{k}.zip, montando o payload base e fazendo upsert (sem
 * sobrescrever o enriquecimento/IE já gravado por consultas).
 *
 * Requisitos: curl + funzip no sistema; DATABASE_URL apontando p/ o Postgres.
 *
 * Uso:
 *   DATABASE_URL=... MES=2025-12 node importar-receita.js            # Brasil
 *   DATABASE_URL=... MES=2025-12 UF=ES node importar-receita.js      # só um estado
 *   DATABASE_URL=... MES=2025-12 PARTS=0 LIMIT=2000 node importar-receita.js  # amostra
 *
 * Variáveis:
 *   BASE   (default https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj)
 *   MES    (ex.: 2025-12)        UF (filtro opcional)
 *   PARTS  (ex.: "0" ou "0,1,2"; default 0..9)
 *   LIMIT  (máx. de estabelecimentos por execução; 0 = sem limite)
 */

const { spawn } = require('child_process');
const readline = require('readline');
const db = require('./db');

const BASE = process.env.BASE || 'https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj';
const MES = process.env.MES || '';
const LOCAL_DIR = process.env.LOCAL_DIR || ''; // se definido, lê os .zip locais (sem baixar)
const UF = (process.env.UF || '').toUpperCase();
const LIMIT = parseInt(process.env.LIMIT || '0', 10) || 0;
const PARTS = (process.env.PARTS || '0,1,2,3,4,5,6,7,8,9').split(',').map((s) => s.trim()).filter(Boolean);

const SITUACAO = { '01': 'Nula', '02': 'Ativa', '03': 'Suspensa', '04': 'Inapta', '08': 'Baixada' };
const PORTE = { '01': 'Micro Empresa', '03': 'Empresa de Pequeno Porte', '05': 'Demais' };

// --- parsing -------------------------------------------------------------

/** Divide uma linha CSV da Receita (campos "..." separados por ;). */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ';' && !inQ) {
      out.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function dateBR(yyyymmdd) {
  const d = String(yyyymmdd || '').trim();
  if (!/^\d{8}$/.test(d) || d === '00000000') return null;
  return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
}

function fmtCnae(code) {
  const d = String(code || '').replace(/\D/g, '').padStart(7, '0');
  if (d === '0000000') return null;
  return `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5, 7)}`;
}

/** Monta o payload base (mesma forma do buildResult, sem IE). */
function buildEstabData(f, emp, muniMap, cnaeMap) {
  const cnpj = (f[0] || '') + (f[1] || '') + (f[2] || '');
  const cnaeCod = f[11]; // cnae_fiscal_principal (f[12] é o secundário)
  const cnaeFmt = fmtCnae(cnaeCod);
  const endereco = [
    [f[13], f[14]].filter(Boolean).join(' '),
    f[15] && f[15] !== 'SN' ? `nº ${f[15]}` : '',
    f[16],
  ].filter(Boolean).join(', ');
  return {
    cnpj,
    razao_social: emp ? emp.razao : null,
    nome_fantasia: f[4] || null,
    natureza_juridica: emp ? emp.natureza : null,
    porte: emp ? emp.porte : null,
    capital_social: emp ? emp.capital : null,
    situacao_cadastral: SITUACAO[f[5]] || null,
    data_inicio_atividade: dateBR(f[10]),
    uf: f[19] || null,
    municipio: muniMap[f[20]] || null,
    inscricoes_estaduais: [],
    endereco: {
      logradouro: endereco || null,
      bairro: f[17] || null,
      municipio: muniMap[f[20]] || null,
      uf: f[19] || null,
      cep: f[18] ? String(f[18]).replace(/(\d{5})(\d{3})/, '$1-$2') : null,
    },
    atividade_principal: cnaeFmt ? { codigo: cnaeFmt, descricao: cnaeMap[String(cnaeCod).replace(/\D/g, '')] || '' } : null,
    atividades_secundarias: [],
    fonte: 'receita',
  };
}

// --- download/stream -----------------------------------------------------

/** Comando de origem: arquivo local (funzip) ou download (curl|funzip). */
function srcCmd(file) {
  if (LOCAL_DIR) return `funzip "${LOCAL_DIR.replace(/"/g, '')}/${file}"`;
  return `curl -fsSL --retry 3 "${BASE}/${MES}/${file}" | funzip`;
}

/** Roda o comando shell (que emite o CSV) e chama onLine(fields) por linha. */
function streamZipCsv(cmd, onLine) {
  return new Promise((resolve, reject) => {
    const sh = spawn('bash', ['-c', cmd], { stdio: ['ignore', 'pipe', 'ignore'] });
    sh.stdout.setEncoding('latin1');
    const rl = readline.createInterface({ input: sh.stdout, crlfDelay: Infinity });
    let stopped = false;
    rl.on('line', (line) => {
      if (stopped || !line) return;
      const r = onLine(parseCsvLine(line));
      if (r === false) { stopped = true; rl.close(); sh.kill('SIGKILL'); }
    });
    rl.on('close', resolve);
    sh.on('error', reject);
    sh.on('close', (code) => { if (code && code !== 0 && !stopped) reject(new Error('curl/funzip saiu com ' + code)); });
  });
}

async function loadMap(file, onLine) {
  await streamZipCsv(srcCmd(file), onLine);
}

// --- main ----------------------------------------------------------------

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL.');
  if (!LOCAL_DIR && !MES) throw new Error('Defina MES (ex.: MES=2025-12) ou LOCAL_DIR (pasta com os .zip).');
  await db.init(process.env.DATABASE_URL);

  const origem = LOCAL_DIR ? `LOCAL_DIR=${LOCAL_DIR}` : `${BASE}/${MES}`;
  console.log(`Origem: ${origem}  | UF=${UF || 'TODAS'} | PARTS=${PARTS.join(',')} | LIMIT=${LIMIT || '∞'}`);

  // Tabelas de apoio
  const muniMap = {};
  const cnaeMap = {};
  console.log('Carregando Municipios e Cnaes...');
  await loadMap('Municipios.zip', (f) => { muniMap[f[0]] = f[1]; });
  await loadMap('Cnaes.zip', (f) => { cnaeMap[String(f[0]).replace(/\D/g, '')] = f[1]; });
  console.log(`Municípios: ${Object.keys(muniMap).length} | CNAEs: ${Object.keys(cnaeMap).length}`);

  let totalUpsert = 0;
  for (const k of PARTS) {
    if (LIMIT && totalUpsert >= LIMIT) break;
    // 1) mapa cnpj_basico -> empresa (razão etc.) da parte k
    const emp = new Map();
    console.log(`[parte ${k}] carregando Empresas${k}.zip...`);
    await loadMap(`Empresas${k}.zip`, (f) => {
      emp.set(f[0], {
        razao: f[1] || null,
        natureza: f[2] || null,
        porte: PORTE[f[5]] || null,
        capital: f[4] ? Number(String(f[4]).replace(',', '.')).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null,
      });
    });

    // 2) estabelecimentos da parte k -> upsert
    console.log(`[parte ${k}] processando Estabelecimentos${k}.zip...`);
    let batch = [];
    const flush = async () => {
      for (const d of batch) { try { await db.upsertBase(d.cnpj, d); } catch (e) {} }
      totalUpsert += batch.length;
      batch = [];
    };
    let stop = false;
    await streamZipCsv(srcCmd(`Estabelecimentos${k}.zip`), (f) => {
      if (stop) return false;
      if (UF && f[19] !== UF) return;
      const d = buildEstabData(f, emp.get(f[0]), muniMap, cnaeMap);
      if (!/^\d{14}$/.test(d.cnpj)) return;
      batch.push(d);
      // Obs.: coleta-e-grava ao final do stream. Para Brasil inteiro sem filtro,
      // rode por UF (UF=..) ou em máquina com RAM adequada.
      if (LIMIT && totalUpsert + batch.length >= LIMIT) { stop = true; return false; }
      return true;
    });
    await flush();
    console.log(`[parte ${k}] total upserts acumulado: ${totalUpsert}`);
  }
  console.log(`Concluído. Empresas no banco: ${await db.count()}`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
}

module.exports = { parseCsvLine, dateBR, fmtCnae, buildEstabData, SITUACAO };
