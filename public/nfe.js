/* Gerador de DANFE a partir do XML da NF-e — 100% no navegador.
 * O XML é lido e o PDF é gerado na máquina do cliente; nada é enviado ao
 * servidor (privacidade do dado fiscal). "Baixar PDF" usa a impressão (Salvar
 * como PDF) com layout A4 dedicado. */
(function () {
  'use strict';

  // ---- Tabela de padrões Code 128 (larguras de barra/espaço) ----
  var PAT = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
  ];

  // Code 128-C (numérico, em pares) — usado na chave de acesso (44 dígitos).
  function barcode128c(digits) {
    if (!digits || digits.length % 2 !== 0) return '';
    var idx = [105];
    var sum = 105;
    var pos = 1;
    for (var i = 0; i < digits.length; i += 2) {
      var v = parseInt(digits.substr(i, 2), 10);
      idx.push(v);
      sum += v * pos;
      pos++;
    }
    idx.push(sum % 103);
    idx.push(106);
    var widths = '';
    for (var k = 0; k < idx.length; k++) widths += PAT[idx[k]];
    var x = 0, rects = '', bar = true;
    for (var w = 0; w < widths.length; w++) {
      var ww = parseInt(widths[w], 10);
      if (bar) rects += '<rect x="' + x + '" y="0" width="' + ww + '" height="100%"/>';
      x += ww;
      bar = !bar;
    }
    return '<svg class="dn-barcode" viewBox="0 0 ' + x + ' 60" preserveAspectRatio="none">' + rects + '</svg>';
  }

  // ---- Helpers ----
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function t(node, tag) {
    if (!node) return '';
    var e = node.getElementsByTagName(tag)[0];
    return e ? (e.textContent || '').trim() : '';
  }
  function el(node, tag) { return node ? node.getElementsByTagName(tag)[0] : null; }
  function money(v) {
    if (v === '' || v == null) return '';
    var n = Number(v);
    return isNaN(n) ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function qty(v) {
    if (v === '' || v == null) return '';
    var n = Number(v);
    return isNaN(n) ? v : n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  }
  function dataBR(s) {
    if (!s) return '';
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!m) return s;
    return m[3] + '/' + m[2] + '/' + m[1] + (m[4] ? ' ' + m[4] + ':' + m[5] : '');
  }
  function cpfCnpj(d) {
    d = String(d || '').replace(/\D/g, '');
    if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return d;
  }
  function cep(d) {
    d = String(d || '').replace(/\D/g, '');
    return d.length === 8 ? d.replace(/^(\d{5})(\d{3})$/, '$1-$2') : d;
  }
  function ender(node) {
    if (!node) return '';
    var p = [t(node, 'xLgr'), t(node, 'nro'), t(node, 'xCpl')].filter(Boolean).join(', ');
    var l2 = [t(node, 'xBairro'), t(node, 'xMun') + (t(node, 'UF') ? '/' + t(node, 'UF') : ''), cep(t(node, 'CEP'))].filter(Boolean).join(' - ');
    return [p, l2].filter(Boolean).join('<br>');
  }

  function parseAndRender(xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Arquivo XML inválido ou corrompido.');
    var infNFe = doc.getElementsByTagName('infNFe')[0];
    if (!infNFe) throw new Error('Este XML não parece ser uma NF-e (não encontrei "infNFe").');

    var chave = (infNFe.getAttribute('Id') || '').replace(/\D/g, '');
    var ide = el(infNFe, 'ide');
    var emit = el(infNFe, 'emit');
    var dest = el(infNFe, 'dest');
    var totalIcms = el(infNFe, 'ICMSTot');
    var transp = el(infNFe, 'transp');
    var infProt = doc.getElementsByTagName('infProt')[0];

    var nNF = t(ide, 'nNF'), serie = t(ide, 'serie'), tpNF = t(ide, 'tpNF');
    var natOp = t(ide, 'natOp');
    var dhEmi = t(ide, 'dhEmi') || t(ide, 'dEmi');
    var dhSaida = t(ide, 'dhSaiEnt') || t(ide, 'dSaiEnt');

    var prot = infProt ? (t(infProt, 'nProt') + ' - ' + dataBR(t(infProt, 'dhRecbto'))) : '';

    // Itens (com impostos por item)
    var dets = infNFe.getElementsByTagName('det');
    var linhas = '';
    for (var i = 0; i < dets.length; i++) {
      var prod = el(dets[i], 'prod');
      if (!prod) continue;
      var imp = el(dets[i], 'imposto');
      linhas +=
        '<tr>' +
        '<td>' + esc(t(prod, 'cProd')) + '</td>' +
        '<td class="l">' + esc(t(prod, 'xProd')) + '</td>' +
        '<td>' + esc(t(prod, 'NCM')) + '</td>' +
        '<td>' + esc(t(prod, 'CFOP')) + '</td>' +
        '<td>' + esc(t(prod, 'uCom')) + '</td>' +
        '<td class="r">' + qty(t(prod, 'qCom')) + '</td>' +
        '<td class="r">' + money(t(prod, 'vUnCom')) + '</td>' +
        '<td class="r">' + money(t(prod, 'vProd')) + '</td>' +
        '<td class="r">' + money(t(imp, 'vBC')) + '</td>' +
        '<td class="r">' + money(t(imp, 'vICMS')) + '</td>' +
        '<td class="r">' + (t(imp, 'pICMS') ? t(imp, 'pICMS') + '%' : '') + '</td>' +
        '</tr>';
    }

    var tpLabel = tpNF === '0' ? '0 - ENTRADA' : '1 - SAÍDA';
    var infCpl = t(el(infNFe, 'infAdic'), 'infCpl');

    var chaveFmt = chave.replace(/(\d{4})(?=\d)/g, '$1 ');
    var fone = t(el(emit, 'enderEmit'), 'fone');
    var html =
      '<div class="dn-doc" id="danfe-doc">' +
        '<div class="dn-head">' +
          '<div class="dn-emit">' +
            '<div class="dn-emit-nome">' + esc(t(emit, 'xNome')) + '</div>' +
            (t(emit, 'xFant') ? '<div class="dn-emit-sub">' + esc(t(emit, 'xFant')) + '</div>' : '') +
            '<div class="dn-emit-end">' + ender(el(emit, 'enderEmit')) + '</div>' +
            '<div class="dn-emit-end">CNPJ ' + esc(cpfCnpj(t(emit, 'CNPJ'))) + (fone ? ' &nbsp;·&nbsp; Fone ' + esc(fone) : '') + '</div>' +
          '</div>' +
          '<div class="dn-center">' +
            '<div class="dn-title">DANFE</div>' +
            '<div class="dn-subtitle">Documento Auxiliar da Nota Fiscal Eletrônica</div>' +
            '<div class="dn-tipo">' +
              '<div class="dn-tipo-box"><span>0 - ENTRADA</span><span>1 - SAÍDA</span><span class="dn-tipo-num">' + esc(tpNF || '') + '</span></div>' +
              '<div class="dn-nf-info">Nº <b>' + esc(nNF) + '</b><br>SÉRIE <b>' + esc(serie) + '</b><br>FOLHA 1/1</div>' +
            '</div>' +
          '</div>' +
          '<div class="dn-chave">' +
            '<span class="dn-mini">CONTROLE DO FISCO</span>' +
            barcode128c(chave) +
            '<span class="dn-mini">CHAVE DE ACESSO</span>' +
            '<div class="dn-chave-num">' + esc(chaveFmt) + '</div>' +
            '<div class="dn-consulta">Consulta de autenticidade no portal nacional da NF-e, no site da Sefaz autorizadora, ou informando a chave de acesso.</div>' +
          '</div>' +
        '</div>' +

        '<div class="dn-bar"><span>NATUREZA DA OPERAÇÃO</span>' + esc(natOp) + '</div>' +
        '<div class="dn-bar"><span>PROTOCOLO DE AUTORIZAÇÃO DE USO</span>' + esc(prot || '—') + '</div>' +

        '<div class="dn-sec">DESTINATÁRIO / REMETENTE</div>' +
        '<div class="dn-row">' +
          '<div class="dn-grow"><span>Nome / Razão social</span>' + esc(t(dest, 'xNome')) + '</div>' +
          '<div><span>CNPJ / CPF</span>' + esc(cpfCnpj(t(dest, 'CNPJ') || t(dest, 'CPF'))) + '</div>' +
          '<div><span>Inscrição Estadual</span>' + esc(t(dest, 'IE')) + '</div>' +
        '</div>' +
        '<div class="dn-row">' +
          '<div class="dn-grow"><span>Endereço</span>' + ender(el(dest, 'enderDest')) + '</div>' +
          '<div><span>Emissão</span>' + esc(dataBR(dhEmi)) + '</div>' +
          (dhSaida ? '<div><span>Saída/Entrada</span>' + esc(dataBR(dhSaida)) + '</div>' : '') +
        '</div>' +

        '<div class="dn-sec">CÁLCULO DO IMPOSTO</div>' +
        '<div class="dn-row dn-tot">' +
          '<div><span>Base de cálculo ICMS</span>' + money(t(totalIcms, 'vBC')) + '</div>' +
          '<div><span>Valor do ICMS</span>' + money(t(totalIcms, 'vICMS')) + '</div>' +
          '<div><span>Base ICMS ST</span>' + money(t(totalIcms, 'vBCST')) + '</div>' +
          '<div><span>Valor ICMS ST</span>' + money(t(totalIcms, 'vST')) + '</div>' +
          '<div><span>Valor total produtos</span>' + money(t(totalIcms, 'vProd')) + '</div>' +
        '</div>' +
        '<div class="dn-row dn-tot">' +
          '<div><span>Frete</span>' + money(t(totalIcms, 'vFrete')) + '</div>' +
          '<div><span>Seguro</span>' + money(t(totalIcms, 'vSeg')) + '</div>' +
          '<div><span>Desconto</span>' + money(t(totalIcms, 'vDesc')) + '</div>' +
          '<div><span>Outras despesas</span>' + money(t(totalIcms, 'vOutro')) + '</div>' +
          '<div><span>Valor do IPI</span>' + money(t(totalIcms, 'vIPI')) + '</div>' +
          '<div class="dn-nf-tot"><span>VALOR TOTAL DA NOTA</span>' + money(t(totalIcms, 'vNF')) + '</div>' +
        '</div>' +

        '<div class="dn-sec">TRANSPORTADOR / VOLUMES</div>' +
        '<div class="dn-row">' +
          '<div class="dn-grow"><span>Nome / Razão social</span>' + esc(t(el(transp, 'transporta'), 'xNome')) + '</div>' +
          '<div><span>Frete por conta</span>' + (t(transp, 'modFrete') === '0' ? 'Emitente' : t(transp, 'modFrete') === '1' ? 'Destinatário' : esc(t(transp, 'modFrete'))) + '</div>' +
        '</div>' +

        '<div class="dn-sec">DADOS DOS PRODUTOS / SERVIÇOS</div>' +
        '<table class="dn-itens">' +
          '<thead><tr><th>Cód.</th><th class="l">Descrição</th><th>NCM</th><th>CFOP</th><th>Un</th><th>Qtd</th><th>V. Unit.</th><th>V. Total</th><th>BC ICMS</th><th>V. ICMS</th><th>Alíq.</th></tr></thead>' +
          '<tbody>' + (linhas || '<tr><td colspan="11">Sem itens.</td></tr>') + '</tbody>' +
        '</table>' +

        '<div class="dn-sec">DADOS ADICIONAIS</div>' +
        '<div class="dn-cpl">' + (infCpl ? esc(infCpl) : '&nbsp;') + '</div>' +

        '<div class="dn-foot">DANFE gerado por SINTEGRA Brasil a partir do XML. Documento auxiliar da NF-e, sem valor fiscal próprio.</div>' +
      '</div>';

    return { html: html, nNF: nNF, chave: chave };
  }

  // ---- Wiring ----
  var fileInput = document.getElementById('nfe-file');
  var textArea = document.getElementById('nfe-xml');
  var btnGerar = document.getElementById('nfe-gerar');
  var btnPdf = document.getElementById('nfe-pdf');
  var out = document.getElementById('nfe-out');
  var status = document.getElementById('nfe-status');
  var current = null;

  function show(msg, type) {
    status.textContent = msg || '';
    status.className = 'nfe-status' + (type ? ' ' + type : '');
  }

  function gerar(xmlText) {
    if (!xmlText || !xmlText.trim()) { show('Cole o XML ou selecione um arquivo .xml.', 'err'); return; }
    try {
      var r = parseAndRender(xmlText);
      out.innerHTML = r.html;
      out.hidden = false;
      btnPdf.hidden = false;
      current = r;
      show('DANFE gerado da nota nº ' + (r.nNF || '—') + '. Clique em “Baixar PDF”.', 'ok');
      if (window.gtag) gtag('event', 'gerar_danfe_xml');
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      out.hidden = true; btnPdf.hidden = true; current = null;
      show(e.message || 'Não foi possível ler o XML.', 'err');
    }
  }

  if (fileInput) {
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { if (textArea) textArea.value = reader.result; gerar(reader.result); };
      reader.onerror = function () { show('Falha ao ler o arquivo.', 'err'); };
      reader.readAsText(f, 'UTF-8');
    });
  }
  if (btnGerar) btnGerar.addEventListener('click', function () { gerar(textArea ? textArea.value : ''); });
  if (btnPdf) btnPdf.addEventListener('click', function () {
    if (!current) return;
    // Abre só o DANFE numa nova aba e chama a impressão (Salvar como PDF).
    var w = window.open('', '_blank');
    if (!w) { show('Permita pop-ups para baixar o PDF, ou use Ctrl+P.', 'err'); return; }
    var doc =
      '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">' +
      '<title>DANFE ' + (current.nNF || '') + '</title>' +
      '<link rel="stylesheet" href="/style.css">' +
      '<style>body{margin:0;padding:8px;background:#fff}@page{size:A4;margin:8mm}</style>' +
      '</head><body>' + current.html + '</body></html>';
    w.document.open();
    w.document.write(doc);
    w.document.close();
    var doPrint = function () { try { w.focus(); w.print(); } catch (e) {} };
    // espera o CSS carregar antes de imprimir
    if (w.document.readyState === 'complete') setTimeout(doPrint, 400);
    else w.addEventListener('load', function () { setTimeout(doPrint, 200); });
    if (window.gtag) gtag('event', 'baixar_danfe_pdf');
  });

  // ---------------------------------------------------------------------------
  // Método 2: baixar da SEFAZ com certificado A1 via Agente local
  // ---------------------------------------------------------------------------
  var AGENTE = 'http://127.0.0.1:54345';
  var agStatus = document.getElementById('agente-status');
  var certForm = document.getElementById('cert-form');
  var certStatus = document.getElementById('cert-status');
  var btnBaixar = document.getElementById('cert-baixar');

  function semAgente() {
    if (!agStatus) return;
    agStatus.innerHTML = 'Agente não detectado. Para baixar com certificado, ' +
      '<a href="/agente">baixe e abra o Agente SINTEGRA Brasil</a> e recarregue esta página.';
    agStatus.className = 'agente-badge err';
    if (certForm) certForm.hidden = true;
  }
  function detectarAgente() {
    if (!agStatus) return;
    fetch(AGENTE + '/ping', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok) {
          agStatus.textContent = '✓ Agente detectado (v' + (d.version || '?') + ').';
          agStatus.className = 'agente-badge ok';
          if (certForm) certForm.hidden = false;
        } else { semAgente(); }
      })
      .catch(semAgente);
  }

  function fileToB64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var bytes = new Uint8Array(r.result), bin = '';
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        resolve(btoa(bin));
      };
      r.onerror = reject;
      r.readAsArrayBuffer(file);
    });
  }

  function certShow(msg, type) { if (certStatus) { certStatus.textContent = msg || ''; certStatus.className = 'nfe-status' + (type ? ' ' + type : ''); } }

  if (btnBaixar) btnBaixar.addEventListener('click', function () {
    var chave = (document.getElementById('nfe-chave').value || '').replace(/\D/g, '');
    var pfxFile = document.getElementById('cert-pfx').files[0];
    var senha = document.getElementById('cert-senha').value || '';
    var amb = document.getElementById('cert-amb').value || '1';
    if (chave.length !== 44) { certShow('Informe a chave de acesso com 44 dígitos.', 'err'); return; }
    if (!pfxFile) { certShow('Selecione o arquivo do certificado (.pfx).', 'err'); return; }
    certShow('Consultando a SEFAZ com o seu certificado…');
    btnBaixar.disabled = true;
    fileToB64(pfxFile).then(function (b64) {
      return fetch(AGENTE + '/baixar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chave: chave, pfx: b64, senha: senha, tpAmb: amb })
      });
    }).then(function (r) { return r.json(); }).then(function (d) {
      btnBaixar.disabled = false;
      if (d.erro) { certShow(d.erro, 'err'); return; }
      if (!d.ok) { certShow((d.motivo || 'Não foi possível baixar a nota.') + (d.cStat ? ' (cStat ' + d.cStat + ')' : ''), 'err'); return; }
      certShow('Nota baixada! Gerando DANFE…', 'ok');
      gerar(d.xml);
      if (window.gtag) gtag('event', 'baixar_nfe_certificado');
    }).catch(function () {
      btnBaixar.disabled = false;
      certShow('Falha ao falar com o agente local. Ele está aberto?', 'err');
    });
  });

  detectarAgente();
})();
