'use strict';

const form = document.getElementById('form');
const input = document.getElementById('cnpj');
const submit = document.getElementById('submit');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const ufFilter = document.getElementById('uf-filter');

// Rastreia clique no banner do TagPlus (conversão de afiliado no GA4).
const adbanner = document.querySelector('.adbanner');
if (adbanner) {
  adbanner.addEventListener('click', () => {
    if (window.gtag) {
      gtag('event', 'click_banner_tagplus', { event_category: 'afiliado', event_label: 'tagplus_checkout' });
    }
  });
}

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

// Popula o seletor de estados: "Todos" + as 27 UFs.
(function buildUfOptions() {
  const todos = new Option('Todos os estados', '');
  ufFilter.add(todos);
  UFS.forEach((uf) => ufFilter.add(new Option(uf, uf)));
})();

// Guarda o ultimo resultado para refiltrar por UF sem nova consulta.
let lastData = null;

ufFilter.addEventListener('change', () => {
  if (lastData) renderIe(lastData);
});

// --- Mascara de CNPJ (00.000.000/0000-00) -------------------------------
function maskCnpj(value) {
  const d = value.replace(/\D/g, '').slice(0, 14);
  let out = d;
  if (d.length > 12) out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  else if (d.length > 8) out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  else if (d.length > 5) out = `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  else if (d.length > 2) out = `${d.slice(0, 2)}.${d.slice(2)}`;
  return out;
}

input.addEventListener('input', () => {
  const pos = input.selectionStart;
  const before = input.value;
  input.value = maskCnpj(input.value);
  // ajuste simples de cursor quando digitando ao final
  if (pos === before.length) input.selectionStart = input.selectionEnd = input.value.length;
});

// --- Helpers de UI -------------------------------------------------------
function showStatus(type, message) {
  statusEl.hidden = false;
  statusEl.className = `status ${type}`;
  statusEl.textContent = message;
}
function clearStatus() {
  statusEl.hidden = true;
  statusEl.textContent = '';
}
function setText(id, value) {
  document.getElementById(id).textContent = value || '—';
}

function renderIe(data) {
  const box = document.getElementById('ie-list');
  const label = document.getElementById('ie-label');
  box.innerHTML = '';

  const ufSel = ufFilter.value; // '' = todos
  const todas = data.inscricoes_estaduais || [];
  const lista = ufSel ? todas.filter((ie) => ie.uf === ufSel) : todas;

  label.textContent = ufSel ? `Inscrição Estadual (${ufSel})` : 'Inscrição Estadual — todos os estados';

  if (lista.length === 0) {
    const p = document.createElement('p');
    p.className = 'ie-none';
    if (ufSel) {
      p.textContent = `Esta empresa não possui Inscrição Estadual em ${ufSel}.`;
    } else {
      p.textContent = 'Nenhuma Inscrição Estadual foi encontrada para este CNPJ.';
    }
    box.appendChild(p);
    return;
  }

  lista.forEach((ie) => {
    const div = document.createElement('div');
    div.className = 'ie-value';
    const tag = ie.ativo
      ? '<span class="tag on">Ativa</span>'
      : '<span class="tag off">Baixada/Inativa</span>';
    // Quando exibindo todos os estados, mostra a UF de cada inscrição.
    const ufBadge = !ufSel && ie.uf ? `<span class="ie-uf">${esc(ie.uf)}</span>` : '';
    div.innerHTML = `${ufBadge}<span>${esc(ie.inscricao_estadual)}</span>${tag}`;
    box.appendChild(div);
  });
}

function renderResult(data) {
  // Cabeçalho
  setText('r-razao', data.razao_social);
  setText('r-fantasia', data.nome_fantasia);

  // situacao chip (cabeçalho)
  const sit = (data.situacao_cadastral || '').toLowerCase();
  const sitClass = 'chip' + (sit.includes('ativ') ? ' ativa' : sit ? ' inativa' : '');
  const chip = document.getElementById('r-situacao');
  chip.textContent = data.situacao_cadastral || '—';
  chip.className = sitClass;

  // situação do CNPJ no bloco de destaque
  const chipIe = document.getElementById('ie-cnpj-status');
  chipIe.textContent = data.situacao_cadastral || '—';
  chipIe.className = sitClass;
  setText('ie-cnpj-status-data', data.data_situacao_cadastral ? `desde ${data.data_situacao_cadastral}` : '');

  // IE (destaque) — guarda o resultado e define a UF inicial.
  lastData = data;
  const ufs = (data.inscricoes_estaduais || []).map((ie) => ie.uf);
  // Se a empresa tem IE na UF da sede, começa por ela; senão mostra todos.
  ufFilter.value = ufs.includes(data.uf) ? data.uf : '';
  renderIe(data);

  // Identificação
  setText('r-cnpj', maskCnpj(data.cnpj || ''));
  setText('r-tipo', data.tipo);
  setText('r-natureza', data.natureza_juridica);
  setText('r-porte', data.porte);
  setText('r-capital', data.capital_social);
  setText('r-abertura', data.data_inicio_atividade);

  // Situação cadastral
  setText('r-sit', data.situacao_cadastral);
  setText('r-sit-data', data.data_situacao_cadastral);
  setText('r-sit-motivo', data.motivo_situacao_cadastral);
  const rowEsp = document.getElementById('row-especial');
  if (data.situacao_especial) {
    rowEsp.hidden = false;
    setText('r-sit-especial', `${data.situacao_especial} (${data.data_situacao_especial || '—'})`);
  } else {
    rowEsp.hidden = true;
  }

  // Endereço
  const end = data.endereco || {};
  setText('r-end-log', end.logradouro);
  setText('r-end-bairro', end.bairro);
  setText('r-end-municipio', [end.municipio, end.uf].filter(Boolean).join(' / '));
  setText('r-end-cep', end.cep);

  // Contato
  const ct = data.contato || {};
  setText('r-tel1', ct.telefone1);
  const rowTel2 = document.getElementById('row-tel2');
  if (ct.telefone2) {
    rowTel2.hidden = false;
    setText('r-tel2', ct.telefone2);
  } else {
    rowTel2.hidden = true;
  }
  setText('r-email', ct.email);

  // CNAE principal
  const cnaeP = document.getElementById('r-cnae-principal');
  if (data.atividade_principal) {
    cnaeP.innerHTML = `<span class="cnae-cod">${esc(data.atividade_principal.codigo)}</span> ${esc(data.atividade_principal.descricao)}`;
  } else {
    cnaeP.textContent = '—';
  }

  // CNAE secundárias
  const sec = data.atividades_secundarias || [];
  const secWrap = document.getElementById('cnae-sec-wrap');
  const secList = document.getElementById('r-cnae-sec');
  secList.innerHTML = '';
  if (sec.length) {
    secWrap.hidden = false;
    document.getElementById('cnae-sec-count').textContent = sec.length;
    sec.forEach((c) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="cnae-cod">${esc(c.codigo)}</span> ${esc(c.descricao)}`;
      secList.appendChild(li);
    });
  } else {
    secWrap.hidden = true;
  }

  // Simples / MEI
  setText('r-simples', formatSimples(data.simples.optante_simples, data.simples.data_opcao_simples, data.simples.data_exclusao_simples));
  setText('r-mei', formatSimples(data.simples.optante_mei, data.simples.data_opcao_mei, data.simples.data_exclusao_mei));

  // Sócios (QSA)
  renderSocios(data.socios || []);

  setText('r-atualizado', data.atualizado_em);

  resultEl.hidden = false;
}

function formatSimples(optante, opcao, exclusao) {
  if (!optante) return '—';
  if (/sim/i.test(optante)) return `Sim${opcao ? ` (desde ${opcao})` : ''}`;
  return `Não${exclusao ? ` (excluído em ${exclusao})` : ''}`;
}

function renderSocios(socios) {
  const ul = document.getElementById('r-socios');
  const title = document.getElementById('socios-title');
  ul.innerHTML = '';
  if (!socios.length) {
    title.textContent = 'Quadro de sócios e administradores';
    const li = document.createElement('li');
    li.className = 'socio-empty';
    li.textContent = 'Nenhum sócio informado na base pública.';
    ul.appendChild(li);
    return;
  }
  title.textContent = `Quadro de sócios e administradores (${socios.length})`;
  socios.forEach((s) => {
    const li = document.createElement('li');
    li.className = 'socio';
    const meta = [s.qualificacao, s.faixa_etaria, s.data_entrada ? `desde ${s.data_entrada}` : null]
      .filter(Boolean)
      .join(' · ');
    li.innerHTML = `<strong>${esc(s.nome || '—')}</strong><span class="socio-meta">${esc(meta)}</span>`;
    ul.appendChild(li);
  });
}

// --- Submit --------------------------------------------------------------
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const cnpj = input.value.replace(/\D/g, '');
  resultEl.hidden = true;

  if (cnpj.length !== 14) {
    showStatus('error', 'Digite os 14 dígitos do CNPJ.');
    return;
  }

  submit.disabled = true;
  showStatus('loading', 'Consultando...');

  try {
    const resp = await fetch(`/api/consulta?cnpj=${cnpj}`);
    const data = await resp.json();
    if (!resp.ok) {
      showStatus('error', data.erro || 'Não foi possível consultar.');
      return;
    }
    clearStatus();
    renderResult(data);
    afterResult(data);
    // Leva o usuário direto ao quadro do resultado.
    requestAnimationFrame(() => resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    if (window.gtag) {
      gtag('event', 'consulta_cnpj', { event_category: 'consulta', tem_ie: (data.inscricoes_estaduais || []).length > 0 });
    }
  } catch (err) {
    showStatus('error', 'Erro de conexão. Tente novamente.');
  } finally {
    submit.disabled = false;
  }
});

// ===========================================================================
// Histórico (localStorage) e exportação (CSV / PDF)
// ===========================================================================
const LS_HIST = 'sb_hist';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)) || []; } catch (e) { return []; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function entryFrom(data) {
  return { cnpj: (data.cnpj || '').replace(/\D/g, ''), razao: data.razao_social || '', uf: data.uf || '' };
}

function pushHistory(data) {
  const e = entryFrom(data);
  if (e.cnpj.length !== 14) return;
  let h = lsGet(LS_HIST).filter((x) => x.cnpj !== e.cnpj);
  h.unshift(e);
  lsSet(LS_HIST, h.slice(0, 10));
}
function afterResult(data) {
  const cnpj = (data.cnpj || '').replace(/\D/g, '');
  const link = document.getElementById('btn-link');
  if (link && cnpj.length === 14) link.href = '/cnpj/' + cnpj;
  pushHistory(data);
  fetchContador();
}

function fetchContador() {
  fetch('/api/contador')
    .then((r) => r.json())
    .then((d) => {
      const e = document.getElementById('contador-num');
      if (e && typeof d.count === 'number') e.textContent = d.count.toLocaleString('pt-BR');
    })
    .catch(() => {});
}

function exportCsv(data) {
  const rows = [['Campo', 'Valor']];
  rows.push(['CNPJ', maskCnpj(data.cnpj || '')]);
  rows.push(['Razão social', data.razao_social || '']);
  rows.push(['Nome fantasia', data.nome_fantasia || '']);
  rows.push(['Situação cadastral', data.situacao_cadastral || '']);
  rows.push(['UF', data.uf || '']);
  rows.push(['Município', data.municipio || '']);
  (data.inscricoes_estaduais || []).forEach((ie, i) =>
    rows.push(['Inscrição Estadual ' + (i + 1), `${ie.inscricao_estadual} (${ie.uf}) - ${ie.ativo ? 'Ativa' : 'Baixada'}`])
  );
  const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cnpj-' + (data.cnpj || '').replace(/\D/g, '') + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Wiring dos botões (uma vez)
(function wireActions() {
  const pdf = document.getElementById('btn-pdf');
  const csv = document.getElementById('btn-csv');
  if (pdf) pdf.addEventListener('click', () => window.print());
  if (csv) csv.addEventListener('click', () => { if (lastData) exportCsv(lastData); });
  fetchContador();
})();
