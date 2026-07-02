/* Mapa de calor geográfico REAL (Leaflet + leaflet.heat).
 * O calor cobre as áreas conforme os endereços das empresas: um ponto por
 * MUNICÍPIO, ponderado pela quantidade de empresas (filtrável por CNAE).
 * Dados de /api/v1/heatmap?cnae=... (pontos lat/lng + contagem, com cache). */
(function () {
  'use strict';

  var el = document.getElementById('mapa-leaflet');
  if (!el || typeof L === 'undefined') {
    if (el) el.innerHTML = '<p class="muted" style="padding:16px">Não foi possível carregar o mapa.</p>';
    return;
  }
  var info = document.getElementById('mapa-info');

  var map = L.map(el, { scrollWheelZoom: true }).setView([-15.0, -54.0], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, minZoom: 3, attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  var heat = null;

  function fmt(n) { return (n || 0).toLocaleString('pt-BR'); }

  function paint(data) {
    var raw = data.points || [];
    var max = data.max || 1;
    var lnMax = Math.log(max + 1);
    // [lat, lng, intensidade 0..1] — escala log para metrópoles não saturarem tudo
    var pts = raw.map(function (p) {
      return [p[0], p[1], Math.max(0.06, Math.log(p[2] + 1) / lnMax)];
    });

    if (heat) { map.removeLayer(heat); heat = null; }
    heat = L.heatLayer(pts, {
      radius: 17, blur: 14, max: 1.0, minOpacity: 0.25, maxZoom: 12,
      gradient: { 0.0: '#2b39ff', 0.25: '#13c4d6', 0.45: '#23d943', 0.65: '#e6e23a', 0.82: '#f7941d', 1.0: '#ff1d1d' }
    }).addTo(map);

    if (info) {
      info.textContent = (data.cnae ? 'CNAE “' + data.cnae + '” · ' : 'Toda a base · ') +
        fmt(data.total || 0) + ' empresas em ' + fmt(data.municipios || 0) + ' municípios';
    }
  }

  var lastKey = null, timer = null;
  function load(cnae) {
    var key = (cnae || '').trim().toLowerCase();
    if (key === lastKey) return;
    lastKey = key;
    if (info) info.textContent = 'carregando…';
    fetch('/api/v1/heatmap?cnae=' + encodeURIComponent(cnae || ''))
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.erro) paint(d); else if (info) info.textContent = ''; })
      .catch(function () { if (info) info.textContent = ''; });
  }

  var cnaeInput = document.getElementById('b-cnae');
  var form = document.getElementById('busca-form');
  if (form) form.addEventListener('submit', function () { setTimeout(function () { load(cnaeInput ? cnaeInput.value : ''); }, 0); });
  if (cnaeInput) cnaeInput.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { load(cnaeInput.value); }, 600); });

  setTimeout(function () { map.invalidateSize(); }, 200);
  load('');
})();
