'use strict';

(function () {
  const form = document.getElementById('busca-form');
  const elCnae = document.getElementById('b-cnae');
  const elUf = document.getElementById('b-uf');
  const elMun = document.getElementById('b-municipio');
  const elQ = document.getElementById('b-q');
  const statusEl = document.getElementById('busca-status');
  const table = document.getElementById('busca-table');
  const body = document.getElementById('busca-body');
  const actions = document.getElementById('busca-actions');
  const pager = document.getElementById('busca-pager');
  const pageInfo = document.getElementById('b-page');
  const btnPrev = document.getElementById('b-prev');
  const btnNext = document.getElementById('b-next');

  const LIMIT = 50;
  let offset = 0;
  let hasMore = false;
  let current = []; // resultados da página atual

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function maskCnpj(d) {
    d = String(d || '').replace(/\D/g, '');
    if (d.length !== 14) return d;
    return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12);
  }
  function filtros() {
    const p = new URLSearchParams();
    if (elCnae.value.trim()) p.set('cnae', elCnae.value.trim());
    if (elUf.value) p.set('uf', elUf.value);
    if (elMun.value.trim()) p.set('municipio', elMun.value.trim());
    if (elQ.value.trim()) p.set('q', elQ.value.trim());
    return p;
  }

  async function buscar() {
    const p = filtros();
    if (![...p.keys()].length) { statusEl.textContent = 'Informe ao menos um filtro.'; return; }
    p.set('limit', LIMIT);
    p.set('offset', offset);
    statusEl.textContent = 'Buscando...';
    table.hidden = true; actions.hidden = true; pager.hidden = true;
    try {
      const r = await fetch('/api/v1/buscar?' + p.toString());
      const d = await r.json();
      if (!r.ok) { statusEl.textContent = d.erro || 'Erro na busca.'; return; }
      current = d.resultados || [];
      hasMore = !!d.hasMore;
      render();
    } catch (e) {
      statusEl.textContent = 'Erro de conexão.';
    }
  }

  function render() {
    body.innerHTML = '';
    if (!current.length) {
      statusEl.textContent = offset > 0 ? 'Não há mais resultados.' : 'Nenhuma empresa encontrada para os filtros.';
      return;
    }
    statusEl.textContent = '';
    current.forEach((e) => {
      const tr = document.createElement('tr');
      const cnae = e.cnae_codigo ? esc(e.cnae_codigo) + (e.cnae_descricao ? ' – ' + esc(e.cnae_descricao) : '') : '—';
      const local = [e.municipio, e.uf].filter(Boolean).map(esc).join(' / ') || '—';
      tr.innerHTML =
        '<td>' + esc(e.razao_social || '—') + '</td>' +
        '<td>' + esc(e.nome_fantasia || '—') + '</td>' +
        '<td>' + cnae + '</td>' +
        '<td>' + local + '</td>' +
        '<td><a href="/cnpj/' + esc(e.cnpj) + '">ver IE</a></td>';
      body.appendChild(tr);
    });
    table.hidden = false;
    actions.hidden = false;
    pager.hidden = false;
    const ini = offset + 1;
    const fim = offset + current.length;
    pageInfo.textContent = ini + '–' + fim + (hasMore ? '' : ' (fim)');
    btnPrev.disabled = offset === 0;
    btnNext.disabled = !hasMore;
  }

  function exportCsv() {
    if (!current.length) return;
    const head = ['CNPJ', 'Razão social', 'Nome fantasia', 'CNAE', 'Descrição CNAE', 'Município', 'UF'];
    const rows = current.map((e) => [maskCnpj(e.cnpj), e.razao_social, e.nome_fantasia, e.cnae_codigo, e.cnae_descricao, e.municipio, e.uf]);
    const csv = [head].concat(rows)
      .map((r) => r.map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';'))
      .join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'empresas-busca.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  form.addEventListener('submit', (ev) => { ev.preventDefault(); offset = 0; buscar(); });
  btnPrev.addEventListener('click', () => { if (offset > 0) { offset -= LIMIT; buscar(); } });
  btnNext.addEventListener('click', () => { if (hasMore) { offset += LIMIT; buscar(); } });
  document.getElementById('b-csv').addEventListener('click', exportCsv);
  document.getElementById('b-pdf').addEventListener('click', () => window.print());
})();
