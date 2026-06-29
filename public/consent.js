/* Consentimento de cookies (LGPD): o Google Analytics só carrega após o
 * usuário ACEITAR. Permite recusar e gerenciar a preferência depois. */
(function () {
  'use strict';
  var GA = 'G-Z3HHB66R1Y';
  var KEY = 'sb_consent'; // 'accepted' | 'rejected'

  // ⚠️ MODO TESTE (temporário): quando true, o Analytics coleta de TODOS os
  // visitantes, sem pedir consentimento (reduz a conformidade LGPD).
  // Volte para false para reativar o consentimento (opt-in).
  var FORCE_ANALYTICS = true;

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function loadGA() {
    if (window.__gaLoaded) return;
    window.__gaLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    window.gtag('js', new Date());
    // anonimização de IP por padrão
    window.gtag('config', GA, { anonymize_ip: true });
  }

  function removeBanner() {
    var b = document.getElementById('cookie-banner');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  function showBanner() {
    if (document.getElementById('cookie-banner')) return;
    var d = document.createElement('div');
    d.id = 'cookie-banner';
    d.className = 'cookie-banner';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-label', 'Aviso de cookies');
    d.innerHTML =
      '<div class="cookie-text">Usamos cookies para medir a audiência do site (Google Analytics). ' +
      'Eles só são ativados com o seu consentimento. Veja a <a href="/privacidade">Política de Privacidade</a>.</div>' +
      '<div class="cookie-actions">' +
      '<button type="button" id="cookie-reject" class="cookie-btn alt">Recusar</button>' +
      '<button type="button" id="cookie-accept" class="cookie-btn">Aceitar</button>' +
      '</div>';
    document.body.appendChild(d);
    document.getElementById('cookie-accept').onclick = function () { set('accepted'); loadGA(); removeBanner(); };
    document.getElementById('cookie-reject').onclick = function () { set('rejected'); removeBanner(); };
  }

  // Permite reabrir as preferências (link em Privacidade/rodapé)
  window.gerenciarCookies = function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    removeBanner();
    showBanner();
  };

  if (FORCE_ANALYTICS) {
    // Modo teste: coleta sempre, sem banner.
    loadGA();
    return;
  }

  var c = get();
  if (c === 'accepted') {
    loadGA();
  } else if (c === 'rejected') {
    // não carrega analytics
  } else {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showBanner);
    else showBanner();
  }
})();
