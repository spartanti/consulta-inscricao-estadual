/* Widget embedável do SINTEGRA Brasil.
 * Uso: <script src="https://www.sintegrabrasil.com.br/widget.js" async></script>
 * Insere um iframe com a caixa de consulta de Inscrição Estadual.
 */
(function () {
  var current = document.currentScript;
  var iframe = document.createElement('iframe');
  iframe.src = 'https://www.sintegrabrasil.com.br/widget';
  iframe.title = 'Consulta de Inscrição Estadual por CNPJ — SINTEGRA Brasil';
  iframe.loading = 'lazy';
  iframe.setAttribute('frameborder', '0');
  iframe.style.cssText =
    'width:100%;max-width:440px;height:210px;border:0;border-radius:14px;box-shadow:0 4px 18px rgba(0,0,0,.12);';
  if (current && current.parentNode) {
    current.parentNode.insertBefore(iframe, current);
  } else {
    document.body.appendChild(iframe);
  }
})();
