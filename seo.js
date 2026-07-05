'use strict';

/**
 * Renderizacao server-side (SSR) das paginas de SEO:
 * - paginas por estado (/sintegra/:uf)
 * - paginas por CNPJ (/cnpj/:cnpj)
 * - guias (/guias, /guias/:slug)
 * - lista de consultas (/consultas)
 * - sitemap dinamico
 *
 * Modulo "puro": recebe dados e devolve HTML. Nao acessa rede.
 */

const SITE_URL = 'https://www.sintegrabrasil.com.br';
const SINTEGRA_OFICIAL = 'https://www.sintegra.gov.br/';

// Estados (sigla -> nome)
const UF_INFO = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
};
const UFS = Object.keys(UF_INFO);

// Guias (conteudo/blog)
const GUIDES = [
  {
    slug: 'o-que-e-inscricao-estadual',
    title: 'O que é Inscrição Estadual (IE) e quem precisa ter',
    description: 'Entenda o que é a Inscrição Estadual, para que serve e quais empresas são obrigadas a ter.',
    body: `
      <p>A <strong>Inscrição Estadual (IE)</strong> é o número de registro de uma empresa no cadastro
      de contribuintes da Secretaria da Fazenda (SEFAZ) do seu estado. É por meio dela que o estado
      identifica quem recolhe o <abbr title="Imposto sobre Circulação de Mercadorias e Serviços">ICMS</abbr>.</p>
      <h2>Quem precisa de Inscrição Estadual?</h2>
      <p>Em geral, é obrigatória para empresas que realizam atividades sujeitas ao ICMS, como:</p>
      <ul>
        <li>Comércio (lojas, atacado, varejo);</li>
        <li>Indústria e produção;</li>
        <li>Transporte intermunicipal e interestadual;</li>
        <li>Empresas que emitem nota fiscal de produtos (NF-e/NFC-e).</li>
      </ul>
      <h2>Quem normalmente não precisa?</h2>
      <p>Empresas exclusivamente prestadoras de serviços, que recolhem ISS (imposto municipal) em vez de
      ICMS, geralmente <strong>não possuem</strong> Inscrição Estadual.</p>
      <h2>Como descobrir a IE de uma empresa</h2>
      <p>Você pode <a href="/">consultar a Inscrição Estadual pelo CNPJ</a> gratuitamente aqui no
      SINTEGRA Brasil — o resultado mostra a IE, a situação cadastral e os dados públicos da empresa.</p>
    `,
  },
  {
    slug: 'como-consultar-sintegra',
    title: 'Como consultar o SINTEGRA por estado',
    description: 'Passo a passo para consultar o SINTEGRA e a Inscrição Estadual de empresas em qualquer estado do Brasil.',
    body: `
      <p>O <strong>SINTEGRA</strong> (Sistema Integrado de Informações sobre Operações Interestaduais)
      reúne dados cadastrais de contribuintes do ICMS de todos os estados. É usado para verificar se uma
      empresa possui Inscrição Estadual e qual a sua situação.</p>
      <h2>Consulta rápida pelo CNPJ</h2>
      <ol>
        <li>Acesse a <a href="/">página inicial</a> do SINTEGRA Brasil;</li>
        <li>Digite o <strong>CNPJ</strong> da empresa;</li>
        <li>Veja a <strong>Inscrição Estadual</strong>, a situação cadastral e os dados públicos.</li>
      </ol>
      <h2>Consulta por estado</h2>
      <p>Cada estado também tem seu próprio SINTEGRA/SEFAZ. Veja as páginas por UF para orientações
      específicas — por exemplo, <a href="/sintegra/es">SINTEGRA Espírito Santo</a>,
      <a href="/sintegra/sp">São Paulo</a> ou <a href="/sintegra/mg">Minas Gerais</a>.</p>
      <p>Para a consulta oficial, acesse o portal <a href="${SINTEGRA_OFICIAL}" target="_blank" rel="noopener">SINTEGRA Nacional</a>.</p>
    `,
  },
  {
    slug: 'ie-ativa-ou-baixada',
    title: 'IE ativa, baixada ou não habilitada: o que significa',
    description: 'Saiba o que significam as situações da Inscrição Estadual e por que verificar antes de emitir nota fiscal.',
    body: `
      <p>Ao consultar a Inscrição Estadual de uma empresa, a situação pode aparecer de formas diferentes.
      Entenda as principais:</p>
      <ul>
        <li><strong>Ativa / Habilitada:</strong> a empresa está regular como contribuinte do ICMS naquele estado;</li>
        <li><strong>Baixada:</strong> a inscrição foi encerrada;</li>
        <li><strong>Não habilitada / Bloqueada:</strong> há alguma restrição no cadastro estadual.</li>
      </ul>
      <h2>Por que isso importa</h2>
      <p>Antes de emitir uma nota fiscal para um cliente ou comprar de um fornecedor, vale
      <a href="/">verificar a Inscrição Estadual pelo CNPJ</a>. Uma IE irregular pode gerar problemas
      no aproveitamento de crédito de ICMS e na validação da nota.</p>
      <p><strong>Dica:</strong> para emitir suas notas com mais agilidade, considere um sistema de gestão
      que já valida esses dados automaticamente.</p>
    `,
  },
  {
    slug: 'como-consultar-inscricao-estadual-cnpj',
    title: 'Como consultar a Inscrição Estadual pelo CNPJ (passo a passo)',
    description: 'Passo a passo para descobrir a Inscrição Estadual (IE) de uma empresa a partir do CNPJ, de graça e na hora, em qualquer estado.',
    body: `
      <p>Para <strong>consultar a Inscrição Estadual (IE) pelo CNPJ</strong> no SINTEGRA Brasil, o processo é
      gratuito, não exige cadastro e funciona para <strong>todos os 27 estados</strong>.</p>
      <h2>Passo a passo</h2>
      <ol>
        <li>Acesse a <a href="/">página inicial</a> do SINTEGRA Brasil.</li>
        <li>Digite o <strong>CNPJ</strong> da empresa (14 dígitos; a formatação é automática).</li>
        <li>Clique em <strong>Consultar</strong>.</li>
        <li>Veja a <strong>Inscrição Estadual</strong>, a situação cadastral, o endereço, o CNAE e os demais dados públicos.</li>
      </ol>
      <h2>Dá para consultar a IE de qualquer estado?</h2>
      <p>Sim. O resultado traz as inscrições de todas as UFs em que a empresa está cadastrada. Você pode filtrar por
      um estado específico ou ver todas de uma vez.</p>
      <h2>A consulta é gratuita?</h2>
      <p>Sim, é totalmente gratuita e sem cadastro. Há um limite de 3 consultas por minuto por IP.</p>
      <p><a href="/">➜ Consultar Inscrição Estadual por CNPJ agora</a></p>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Como consultar a Inscrição Estadual pelo CNPJ?","acceptedAnswer":{"@type":"Answer","text":"Acesse o SINTEGRA Brasil, informe o CNPJ da empresa e clique em Consultar. O resultado mostra a Inscrição Estadual, a situação cadastral e os dados públicos, em todos os estados."}},{"@type":"Question","name":"É gratuito consultar a IE pelo CNPJ?","acceptedAnswer":{"@type":"Answer","text":"Sim, a consulta é gratuita e não exige cadastro."}}]}</script>
    `,
  },
  {
    slug: 'como-baixar-danfe-xml-nfe',
    title: 'Como baixar o DANFE e o XML da NF-e (grátis)',
    description: 'Como gerar o DANFE em PDF e baixar o XML da NF-e — pela chave de acesso com certificado digital A1 ou a partir do XML que você já tem.',
    body: `
      <p>Existem duas formas de <strong>baixar o DANFE (PDF) e o XML da NF-e</strong> no SINTEGRA Brasil, ambas gratuitas.</p>
      <h2>1. A partir do XML (no navegador)</h2>
      <p>Se você já tem o arquivo <strong>XML</strong> da nota, acesse <a href="/nfe">Gerar DANFE</a>, selecione o
      arquivo (ou cole o conteúdo) e clique em <strong>Gerar DANFE</strong>. O PDF é gerado <strong>no seu
      navegador</strong> — o XML não é enviado a nenhum servidor.</p>
      <h2>2. Pela chave de acesso (com certificado digital A1)</h2>
      <p>Para baixar a nota <strong>pela chave de acesso</strong>, use o <a href="/agente">Agente SINTEGRA Brasil</a>
      com o seu <strong>certificado A1</strong>. A nota é baixada direto da SEFAZ e a <strong>chave privada não sai
      da sua máquina</strong>.</p>
      <h2>De quem posso baixar a nota?</h2>
      <p>Somente de notas em que o <strong>CNPJ do seu certificado é parte</strong> (emitente ou destinatário),
      conforme as regras da SEFAZ.</p>
      <p><a href="/nfe">➜ Gerar DANFE / baixar NF-e</a></p>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Como baixar o DANFE em PDF?","acceptedAnswer":{"@type":"Answer","text":"Em sintegrabrasil.com.br/nfe você gera o DANFE em PDF a partir do XML, direto no navegador, ou baixa a nota pela chave de acesso usando certificado A1."}},{"@type":"Question","name":"Como baixar o XML da NF-e pela chave?","acceptedAnswer":{"@type":"Answer","text":"Use o Agente SINTEGRA Brasil com o certificado digital A1; a nota é baixada da SEFAZ e a chave privada não sai da sua máquina."}}]}</script>
    `,
  },
  {
    slug: 'mei-tem-inscricao-estadual',
    title: 'MEI tem Inscrição Estadual?',
    description: 'Entenda quando o MEI precisa de Inscrição Estadual (IE) e como verificar a IE de um MEI pelo CNPJ.',
    body: `
      <p>Depende da atividade. O <strong>MEI</strong> precisa de <strong>Inscrição Estadual</strong> quando exerce
      atividade sujeita ao <strong>ICMS</strong> — comércio, indústria ou transporte intermunicipal/interestadual.</p>
      <h2>Quando o MEI precisa de IE</h2>
      <ul>
        <li><strong>Precisa:</strong> comércio (venda de produtos), indústria, transporte de cargas.</li>
        <li><strong>Não precisa:</strong> MEI que presta <strong>apenas serviços</strong> (recolhe ISS, imposto municipal).</li>
      </ul>
      <h2>Como verificar a IE de um MEI</h2>
      <p>Basta <a href="/">consultar o CNPJ do MEI</a> aqui no SINTEGRA Brasil — se houver Inscrição Estadual, ela
      aparece com a situação cadastral.</p>
      <p><a href="/">➜ Verificar a Inscrição Estadual de um MEI</a></p>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"MEI tem Inscrição Estadual?","acceptedAnswer":{"@type":"Answer","text":"O MEI tem Inscrição Estadual quando exerce atividade sujeita ao ICMS (comércio, indústria ou transporte). MEI que presta apenas serviços, que recolhe ISS, geralmente não possui IE."}}]}</script>
    `,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function maskCnpj(cnpj) {
  const d = String(cnpj || '').replace(/\D/g, '');
  if (d.length !== 14) return cnpj || '';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function gaSnippet() {
  // Analytics só carrega após consentimento (ver public/consent.js) — LGPD.
  return '<script src="/consent.js?v=2" defer></script>';
}

// --- Helpers de dados estruturados (JSON-LD) para IA/busca ---
function jsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}
/** Marca uma página como ferramenta/utilitário (SoftwareApplication). */
function softwareAppLd(name, url, description) {
  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name, url, description,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: 'pt-BR',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' },
    publisher: { '@id': `${SITE_URL}/#org` },
  });
}
/** Marca uma listagem/base como conjunto de dados (Dataset). */
function datasetLd(name, url, description) {
  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name, url, description,
    inLanguage: 'pt-BR',
    isAccessibleForFree: true,
    // Licença canônica dos dados-fonte (Dados Abertos da Receita Federal / dados.gov.br)
    license: 'https://opendatacommons.org/licenses/odbl/1-0/',
    creditText: 'Receita Federal do Brasil — Dados Abertos do CNPJ',
    keywords: 'CNPJ, Inscrição Estadual, CNAE, empresas, Brasil, situação cadastral',
    creator: { '@type': 'Organization', name: 'SINTEGRA Brasil', url: SITE_URL },
  });
}

/** Barra de links por estado (rodape) — linkagem interna p/ rastreamento. */
function statesNav() {
  const links = UFS.map(
    (uf) => `<a href="/sintegra/${uf.toLowerCase()}">${uf}</a>`
  ).join(' ');
  return `<nav class="states-nav"><span>Consulta por estado:</span> ${links}</nav>`;
}

/** Layout base de todas as paginas SSR. */
function layout({ title, description, canonical, bodyHtml, breadcrumb }) {
  const bc = breadcrumb
    ? `<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>`
    : '';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta name="theme-color" content="#0a3d62" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:site_name" content="SINTEGRA Brasil" />
  <meta property="og:image" content="${SITE_URL}/og-image.svg" />
  <link rel="stylesheet" href="/style.css?v=21" />
  ${bc}
  ${gaSnippet()}
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1697859368408278" crossorigin="anonymous"></script>
</head>
<body>
  <header class="topbar">
    <div class="container">
      <a href="/" class="brand-home">
        <span class="brand-name">Sintegra</span>
        <span class="badge">BR</span>
        <span class="brand-title">Consulta de Inscrição Estadual</span>
      </a>
      <p class="subtitle">SINTEGRA Brasil · empresas de todo o Brasil</p>
    </div>
  </header>
  <main class="container">
    ${bodyHtml}
  </main>
  <footer class="container footer">
    <p class="footer-links">
      <a href="/">Início</a> · <a href="/busca">Busca de empresas</a> ·
      <a href="/nfe">Gerar DANFE</a> · <a href="/agente">Agente NF-e</a> ·
      <a href="/validar-inscricao-estadual">Validar IE</a> ·
      <a href="/guias">Guias</a> · <a href="/atividades">Atividades</a> ·
      <a href="/incorporar">Incorporar</a> · <a href="/api">API</a><br />
      <a href="/sobre">Sobre</a> · <a href="/sobre-os-dados">Fonte dos dados</a> · <a href="/contato">Contato</a> ·
      <a href="/privacidade">Privacidade</a> · <a href="/cookies">Cookies</a> · <a href="/termos">Termos</a> · <a href="/lgpd">Exclusão de dados</a>
    </p>
    ${statesNav()}
    <p class="disclaimer">
      <strong>Aviso:</strong> o SINTEGRA Brasil é um serviço <strong>independente e privado</strong>,
      sem vínculo com a Receita Federal, com as SEFAZ estaduais ou com qualquer órgão público.
    </p>
    <p class="counter">🔎 <span id="contador-num">—</span> consultas realizadas</p>
    <small>Desenvolvido por <a href="https://www.spartanti.com.br" target="_blank" rel="noopener">Spartan TI</a></small>
  </footer>
  <script>
    if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}
    fetch('/api/contador').then(function(r){return r.json();}).then(function(d){var e=document.getElementById('contador-num');if(e&&typeof d.count==='number')e.textContent=d.count.toLocaleString('pt-BR');}).catch(function(){});
  </script>
</body>
</html>`;
}

/** Formulario simples que redireciona para /cnpj/:cnpj. */
function searchForm() {
  return `
  <form class="ssr-form" onsubmit="event.preventDefault();var c=this.cnpj.value.replace(/\\D/g,'');if(c.length===14){location.href='/cnpj/'+c;}else{this.cnpj.setCustomValidity('Digite os 14 dígitos do CNPJ');this.cnpj.reportValidity();}">
    <input name="cnpj" inputmode="numeric" maxlength="18" placeholder="Digite o CNPJ" oninput="this.setCustomValidity('')" required />
    <button type="submit">Consultar</button>
  </form>`;
}

// ---------------------------------------------------------------------------
// Paginas
// ---------------------------------------------------------------------------

function renderStatePage(ufRaw) {
  const uf = String(ufRaw || '').toUpperCase();
  const nome = UF_INFO[uf];
  if (!nome) return null;

  const canonical = `${SITE_URL}/sintegra/${uf.toLowerCase()}`;
  const title = `Consulta SINTEGRA ${nome} (${uf}) — Inscrição Estadual por CNPJ`;
  const description = `Consulte gratuitamente a Inscrição Estadual de empresas de ${nome} (${uf}) pelo CNPJ. Veja a situação cadastral e os dados públicos na hora.`;

  const bodyHtml = `
    <article class="card seo-content">
      <h1>Consulta de Inscrição Estadual em ${escapeHtml(nome)} (${uf})</h1>
      <p>Consulte a <strong>Inscrição Estadual (IE)</strong> de empresas de <strong>${escapeHtml(nome)}</strong>
      informando o CNPJ. A consulta é gratuita e mostra a situação cadastral e os dados públicos da empresa.</p>
      ${searchForm()}

      <h2>Como consultar o SINTEGRA em ${escapeHtml(nome)}</h2>
      <ol class="seo-steps">
        <li>Digite o <strong>CNPJ</strong> da empresa no campo acima;</li>
        <li>Clique em <strong>Consultar</strong>;</li>
        <li>Veja a Inscrição Estadual e a situação cadastral em ${escapeHtml(nome)}.</li>
      </ol>

      <h2>Sobre a Inscrição Estadual em ${escapeHtml(nome)}</h2>
      <p>A Inscrição Estadual é exigida pela SEFAZ-${uf} das empresas contribuintes do ICMS no estado de
      ${escapeHtml(nome)}, como comércio, indústria e transporte. Uma mesma empresa pode ter inscrição em
      mais de um estado.</p>
      <p>Para a consulta oficial, acesse o portal <a href="${SINTEGRA_OFICIAL}" target="_blank" rel="noopener">SINTEGRA Nacional</a>
      e selecione ${escapeHtml(nome)}.</p>

      <p class="muted">Veja também a consulta em outros estados no rodapé desta página.</p>
    </article>
    ${datasetLd(`Empresas de ${nome} (${uf}) — Inscrição Estadual por CNPJ`, canonical, `Base de empresas do estado de ${nome} (${uf}) consultáveis por CNPJ, com Inscrição Estadual, situação cadastral, CNAE e endereço.`)}`;

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: `SINTEGRA ${nome}`, item: canonical },
    ],
  };

  return layout({ title, description, canonical, bodyHtml, breadcrumb });
}

/** data = saida do buildResult(); cnpj = 14 digitos. QSA fica fora (privacidade). */
function renderCnpjPage(data, cnpj) {
  const masked = maskCnpj(cnpj);
  const razao = data.razao_social || 'Empresa';
  const canonical = `${SITE_URL}/cnpj/${cnpj}`;
  const title = `Inscrição Estadual e CNPJ de ${razao} (${data.uf || 'BR'})`;
  const ieResumo = (data.inscricoes_estaduais || [])
    .map((ie) => `${ie.inscricao_estadual} (${ie.uf})`)
    .join(', ') || 'não informada';
  const description = `Inscrição Estadual de ${razao}, CNPJ ${masked}. Situação: ${data.situacao_cadastral || '—'}. IE: ${ieResumo}.`;

  const ies = data.inscricoes_estaduais || [];
  const ieHtml = ies.length
    ? `<table class="ie-table"><thead><tr><th>Inscrição Estadual</th><th>UF</th><th>Situação</th></tr></thead><tbody>${ies
        .map(
          (ie) =>
            `<tr><td>${escapeHtml(ie.inscricao_estadual)}</td><td>${escapeHtml(ie.uf || '—')}</td><td><span class="tag ${ie.ativo ? 'on' : 'off'}">${ie.ativo ? 'Ativa' : 'Baixada/Inativa'}</span></td></tr>`
        )
        .join('')}</tbody></table>`
    : '<p class="ie-none">Nenhuma Inscrição Estadual encontrada para este CNPJ.</p>';

  const row = (dt, dd) => (dd ? `<tr><th>${dt}</th><td>${escapeHtml(dd)}</td></tr>` : '');
  const end = data.endereco || {};
  const enderecoStr = [end.logradouro, end.bairro, [end.municipio, end.uf].filter(Boolean).join(' / '), end.cep]
    .filter(Boolean)
    .join(', ');

  // Empresa como entidade legível por máquina (Organization) — AIO/Gemini
  const addr = { addressCountry: 'BR' };
  if (end.logradouro || end.bairro) addr.streetAddress = [end.logradouro, end.bairro].filter(Boolean).join(', ');
  if (end.municipio) addr.addressLocality = end.municipio;
  if (end.uf) addr.addressRegion = end.uf;
  if (end.cep) addr.postalCode = end.cep;
  const orgLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: razao,
    url: canonical,
    identifier: { '@type': 'PropertyValue', propertyID: 'CNPJ', value: masked },
    taxID: cnpj,
    address: { '@type': 'PostalAddress', ...addr },
  };
  if (data.nome_fantasia) orgLd.alternateName = data.nome_fantasia;
  if (ies.length) {
    orgLd.additionalProperty = ies.map((ie) => ({
      '@type': 'PropertyValue', name: 'Inscrição Estadual', value: ie.inscricao_estadual, valueReference: ie.uf || undefined,
    }));
  }

  const bodyHtml = `
    <article class="card">
      <h1>${escapeHtml(razao)}</h1>
      <p class="muted">CNPJ ${escapeHtml(masked)}${data.nome_fantasia ? ' · ' + escapeHtml(data.nome_fantasia) : ''}</p>

      <h2 class="sec-title">Inscrição Estadual</h2>
      ${ieHtml}

      <h2 class="sec-title">Dados da empresa</h2>
      <table class="details-table"><tbody>
        ${row('Situação cadastral', data.situacao_cadastral)}
        ${row('Natureza jurídica', data.natureza_juridica)}
        ${row('Porte', data.porte)}
        ${row('Início de atividade', data.data_inicio_atividade)}
        ${row('Endereço', enderecoStr)}
        ${data.atividade_principal ? row('Atividade principal', data.atividade_principal.codigo + ' - ' + data.atividade_principal.descricao) : ''}
      </tbody></table>

      <h2 class="sec-title">Consultar outro CNPJ</h2>
      ${searchForm()}
      <p class="source">Dados públicos com caráter informativo. Para fins oficiais, confirme no SINTEGRA da SEFAZ do estado.</p>
    </article>
    ${jsonLd(orgLd)}`;

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: razao, item: canonical },
    ],
  };

  return layout({ title, description, canonical, bodyHtml, breadcrumb });
}

function renderGuidesIndex() {
  const canonical = `${SITE_URL}/guias`;
  const items = GUIDES.map(
    (g) =>
      `<li><a href="/guias/${g.slug}"><strong>${escapeHtml(g.title)}</strong></a>
       <span class="muted">${escapeHtml(g.description)}</span></li>`
  ).join('');
  const bodyHtml = `
    <article class="card seo-content">
      <h1>Guias sobre Inscrição Estadual e SINTEGRA</h1>
      <p>Artigos para entender a Inscrição Estadual, o SINTEGRA e a consulta por CNPJ.</p>
      <ul class="guides-list">${items}</ul>
    </article>`;
  return layout({
    title: 'Guias sobre Inscrição Estadual e SINTEGRA — SINTEGRA Brasil',
    description: 'Artigos e guias sobre Inscrição Estadual, SINTEGRA e consulta de empresas por CNPJ.',
    canonical,
    bodyHtml,
  });
}

function renderGuide(slug) {
  const g = GUIDES.find((x) => x.slug === slug);
  if (!g) return null;
  const canonical = `${SITE_URL}/guias/${g.slug}`;
  const bodyHtml = `
    <article class="card seo-content">
      <h1>${escapeHtml(g.title)}</h1>
      ${g.body}
      <p><a href="/guias">← Ver todos os guias</a></p>
    </article>`;
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Guias', item: `${SITE_URL}/guias` },
      { '@type': 'ListItem', position: 3, name: g.title, item: canonical },
    ],
  };
  return layout({ title: `${g.title} — SINTEGRA Brasil`, description: g.description, canonical, bodyHtml, breadcrumb });
}

/** list = [{cnpj, razao, uf}] */
function renderConsultas(list) {
  const canonical = `${SITE_URL}/consultas`;
  const items = list.length
    ? list
        .map(
          (c) =>
            `<li><a href="/cnpj/${c.cnpj}">${escapeHtml(c.razao || maskCnpj(c.cnpj))}</a>
             <span class="muted">${escapeHtml(maskCnpj(c.cnpj))}${c.uf ? ' · ' + escapeHtml(c.uf) : ''}</span></li>`
        )
        .join('')
    : '<li class="muted">Ainda não há consultas recentes.</li>';
  const bodyHtml = `
    <article class="card seo-content">
      <h1>Consultas recentes de Inscrição Estadual</h1>
      <p>Empresas consultadas recentemente no SINTEGRA Brasil.</p>
      <ul class="guides-list">${items}</ul>
    </article>`;
  return layout({
    title: 'Consultas recentes de Inscrição Estadual — SINTEGRA Brasil',
    description: 'Lista de empresas consultadas recentemente: Inscrição Estadual e CNPJ.',
    canonical,
    bodyHtml,
  });
}

/** urls = [{loc, lastmod?, priority?}] */
function buildSitemapXml(urls) {
  const body = urls
    .map((u) => {
      const lastmod = u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : '';
      const priority = u.priority ? `\n    <priority>${u.priority}</priority>` : '';
      return `  <url>\n    <loc>${u.loc}</loc>${lastmod}${priority}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/** llms.txt — resumo estruturado do site para modelos de IA (llmstxt.org). */
function buildLlmsTxt() {
  const g = (slug) => `${SITE_URL}/guias/${slug}`;
  const ufLinks = UFS
    .map((uf) => `- [Inscrição Estadual em ${UF_INFO[uf]} (${uf})](${SITE_URL}/sintegra/${uf.toLowerCase()})`)
    .join('\n');
  return `# SINTEGRA Brasil

> Serviço online gratuito para consultar a Inscrição Estadual (IE) e os dados cadastrais públicos de empresas brasileiras a partir do CNPJ, em todos os 27 estados. Também gera o DANFE da NF-e (pelo XML ou pela chave de acesso com certificado digital A1), oferece busca de empresas por CNAE/estado/município e uma API pública.

SINTEGRA Brasil é um serviço independente e privado (desenvolvido pela Spartan TI), sem vínculo com a Receita Federal, com as Secretarias da Fazenda (SEFAZ) estaduais ou com o portal oficial do SINTEGRA. Os dados cadastrais têm origem nos Dados Abertos da Receita Federal e são complementados, a cada consulta, pela API pública da CNPJ.ws (que agrega a Inscrição Estadual). O conteúdo tem caráter informativo; para fins oficiais, confirme no SINTEGRA/SEFAZ do respectivo estado.

## Principais recursos
- [Consulta de Inscrição Estadual por CNPJ](${SITE_URL}/): informe o CNPJ e veja a IE, a situação cadastral, o endereço, o CNAE e os dados públicos da empresa.
- [Gerar DANFE e baixar a NF-e](${SITE_URL}/nfe): gera o DANFE em PDF a partir do XML (100% no navegador) ou baixa a NF-e pela chave de acesso usando certificado digital A1.
- [Agente de certificado digital](${SITE_URL}/agente): programa local (Windows/Linux/macOS) que baixa a NF-e na SEFAZ com o certificado A1 sem enviar a chave privada a servidores.
- [Busca de empresas por CNAE, estado e município](${SITE_URL}/busca): com mapa de calor por região.
- [Validador de Inscrição Estadual](${SITE_URL}/validar-inscricao-estadual): valida a IE nos 27 estados.
- [API pública (JSON)](${SITE_URL}/api): consulta de IE e dados cadastrais por CNPJ.

## Guias (conteúdo educativo)
${GUIDES.map((gd) => `- [${gd.title}](${SITE_URL}/guias/${gd.slug})`).join('\n')}

## Consulta por estado
${ufLinks}

## Perguntas frequentes
- **Como consultar a Inscrição Estadual pelo CNPJ?** Acesse ${SITE_URL}, digite o CNPJ e clique em Consultar; o resultado mostra a IE, a situação cadastral e os dados públicos, em todos os estados.
- **Como descobrir a IE de uma empresa?** Basta o CNPJ — a consulta em ${SITE_URL} retorna a Inscrição Estadual de cada UF em que a empresa está cadastrada. Gratuito e sem cadastro.
- **Como baixar o DANFE de uma nota fiscal?** Em ${SITE_URL}/nfe você gera o DANFE em PDF a partir do XML (no navegador) ou baixa a nota pela chave de acesso com certificado A1.
- **Como baixar o XML da NF-e pela chave?** Use o Agente SINTEGRA Brasil (${SITE_URL}/agente) com seu certificado digital A1; a nota é baixada da SEFAZ e a chave privada não sai da sua máquina.
- **Toda empresa tem Inscrição Estadual?** Não. Empresas exclusivamente de serviços (que recolhem ISS) geralmente não possuem IE.
- **É gratuito?** Sim, todas as consultas e a geração de DANFE são gratuitas.

## Institucional
- [Sobre](${SITE_URL}/sobre)
- [Metodologia e fonte dos dados](${SITE_URL}/sobre-os-dados)
- [Contato](${SITE_URL}/contato)
- [Política de Privacidade](${SITE_URL}/privacidade)
- [Termos de Uso](${SITE_URL}/termos)

## Fatos
- Cobertura: todos os 27 estados (UFs) do Brasil.
- Gratuito e sem cadastro.
- Fonte dos dados cadastrais: Dados Abertos da Receita Federal; Inscrição Estadual via API pública CNPJ.ws.
- Limite de uso: 3 consultas por minuto por IP.
- Site: ${SITE_URL}
`;
}

/** Índice de sitemaps (aponta para vários arquivos de sitemap). */
function buildSitemapIndex(sitemaps) {
  const body = sitemaps
    .map((s) => `  <sitemap>\n    <loc>${s.loc}</loc>${s.lastmod ? `\n    <lastmod>${s.lastmod}</lastmod>` : ''}\n  </sitemap>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

// ---------------------------------------------------------------------------
// Capitais (paginas por cidade — versao informativa)
// ---------------------------------------------------------------------------

const CAPITAIS = [
  { slug: 'rio-branco-ac', cidade: 'Rio Branco', uf: 'AC' },
  { slug: 'maceio-al', cidade: 'Maceió', uf: 'AL' },
  { slug: 'macapa-ap', cidade: 'Macapá', uf: 'AP' },
  { slug: 'manaus-am', cidade: 'Manaus', uf: 'AM' },
  { slug: 'salvador-ba', cidade: 'Salvador', uf: 'BA' },
  { slug: 'fortaleza-ce', cidade: 'Fortaleza', uf: 'CE' },
  { slug: 'brasilia-df', cidade: 'Brasília', uf: 'DF' },
  { slug: 'vitoria-es', cidade: 'Vitória', uf: 'ES' },
  { slug: 'goiania-go', cidade: 'Goiânia', uf: 'GO' },
  { slug: 'sao-luis-ma', cidade: 'São Luís', uf: 'MA' },
  { slug: 'cuiaba-mt', cidade: 'Cuiabá', uf: 'MT' },
  { slug: 'campo-grande-ms', cidade: 'Campo Grande', uf: 'MS' },
  { slug: 'belo-horizonte-mg', cidade: 'Belo Horizonte', uf: 'MG' },
  { slug: 'belem-pa', cidade: 'Belém', uf: 'PA' },
  { slug: 'joao-pessoa-pb', cidade: 'João Pessoa', uf: 'PB' },
  { slug: 'curitiba-pr', cidade: 'Curitiba', uf: 'PR' },
  { slug: 'recife-pe', cidade: 'Recife', uf: 'PE' },
  { slug: 'teresina-pi', cidade: 'Teresina', uf: 'PI' },
  { slug: 'rio-de-janeiro-rj', cidade: 'Rio de Janeiro', uf: 'RJ' },
  { slug: 'natal-rn', cidade: 'Natal', uf: 'RN' },
  { slug: 'porto-alegre-rs', cidade: 'Porto Alegre', uf: 'RS' },
  { slug: 'porto-velho-ro', cidade: 'Porto Velho', uf: 'RO' },
  { slug: 'boa-vista-rr', cidade: 'Boa Vista', uf: 'RR' },
  { slug: 'florianopolis-sc', cidade: 'Florianópolis', uf: 'SC' },
  { slug: 'sao-paulo-sp', cidade: 'São Paulo', uf: 'SP' },
  { slug: 'aracaju-se', cidade: 'Aracaju', uf: 'SE' },
  { slug: 'palmas-to', cidade: 'Palmas', uf: 'TO' },
];

// ---------------------------------------------------------------------------
// Atividades (paginas por CNAE/segmento — versao informativa)
// ---------------------------------------------------------------------------

const ATIVIDADES = [
  { slug: 'comercio-varejista', nome: 'Comércio varejista', texto: 'lojas e varejo em geral, que vendem mercadorias diretamente ao consumidor' },
  { slug: 'comercio-atacadista', nome: 'Comércio atacadista', texto: 'distribuidoras e atacados que revendem mercadorias em grande volume' },
  { slug: 'industria', nome: 'Indústria e fabricação', texto: 'fábricas e indústrias que produzem ou transformam mercadorias' },
  { slug: 'restaurantes', nome: 'Restaurantes e lanchonetes', texto: 'bares, restaurantes e lanchonetes que comercializam alimentos e bebidas' },
  { slug: 'supermercados', nome: 'Supermercados e mercearias', texto: 'supermercados, mercearias e mercados de bairro' },
  { slug: 'farmacias', nome: 'Farmácias e drogarias', texto: 'farmácias e drogarias que vendem medicamentos e produtos de higiene' },
  { slug: 'autopecas', nome: 'Autopeças e oficinas', texto: 'lojas de autopeças e oficinas que comercializam peças' },
  { slug: 'vestuario', nome: 'Comércio de vestuário', texto: 'lojas de roupas, calçados e acessórios' },
  { slug: 'materiais-de-construcao', nome: 'Materiais de construção', texto: 'lojas de materiais de construção e ferragens' },
  { slug: 'comercio-de-veiculos', nome: 'Comércio de veículos', texto: 'concessionárias e revendas de veículos' },
  { slug: 'ecommerce', nome: 'E-commerce e venda online', texto: 'lojas virtuais e empresas de venda pela internet' },
  { slug: 'transporte-de-cargas', nome: 'Transporte de cargas', texto: 'transportadoras e empresas de transporte de mercadorias' },
];

// ---------------------------------------------------------------------------
// Render helpers genericos
// ---------------------------------------------------------------------------

function contentPage(slugPath, title, description, h1, innerHtml, breadcrumbName) {
  const canonical = `${SITE_URL}${slugPath}`;
  const bodyHtml = `<article class="card seo-content"><h1>${escapeHtml(h1)}</h1>${innerHtml}</article>`;
  const breadcrumb = breadcrumbName
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: breadcrumbName, item: canonical },
        ],
      }
    : undefined;
  return layout({ title, description, canonical, bodyHtml, breadcrumb });
}

// --- Cidade ---
function renderCidade(slug) {
  const c = CAPITAIS.find((x) => x.slug === slug);
  if (!c) return null;
  const nomeUF = UF_INFO[c.uf];
  const inner = `
    <p>Consulte a <strong>Inscrição Estadual (IE)</strong> de empresas de
    <strong>${escapeHtml(c.cidade)} (${c.uf})</strong> informando o CNPJ. A consulta é gratuita e mostra
    a situação cadastral e os dados públicos da empresa.</p>
    ${searchForm()}
    <h2>SINTEGRA e Inscrição Estadual em ${escapeHtml(c.cidade)}</h2>
    <p>Empresas contribuintes do ICMS em ${escapeHtml(c.cidade)}, capital de ${escapeHtml(nomeUF)}, possuem
    Inscrição Estadual junto à SEFAZ-${c.uf}. Veja também a
    <a href="/sintegra/${c.uf.toLowerCase()}">consulta para todo o estado de ${escapeHtml(nomeUF)}</a>.</p>`;
  return contentPage(
    `/cidade/${slug}`,
    `Consulta de Inscrição Estadual em ${c.cidade} (${c.uf}) por CNPJ`,
    `Consulte a Inscrição Estadual de empresas de ${c.cidade} (${c.uf}) pelo CNPJ. Gratuito e na hora.`,
    `Inscrição Estadual em ${c.cidade} (${c.uf})`,
    inner,
    `${c.cidade}/${c.uf}`
  );
}

// --- Atividade (CNAE) ---
function renderAtividadesIndex() {
  const items = ATIVIDADES.map(
    (a) => `<li><a href="/atividade/${a.slug}"><strong>${escapeHtml(a.nome)}</strong></a></li>`
  ).join('');
  return contentPage(
    '/atividades',
    'Inscrição Estadual por atividade (CNAE) — SINTEGRA Brasil',
    'Consulta de Inscrição Estadual por tipo de atividade econômica (CNAE): comércio, indústria, serviços e mais.',
    'Inscrição Estadual por atividade econômica',
    `<p>Veja orientações sobre Inscrição Estadual conforme a atividade da empresa:</p><ul class="guides-list">${items}</ul>${datasetLd('Empresas do Brasil por atividade econômica (CNAE)', `${SITE_URL}/atividades`, 'Listagem de empresas brasileiras por atividade econômica (CNAE), consultáveis por CNPJ com Inscrição Estadual, situação cadastral e endereço.')}`
  );
}

function renderAtividade(slug) {
  const a = ATIVIDADES.find((x) => x.slug === slug);
  if (!a) return null;
  const inner = `
    <p>Empresas de <strong>${escapeHtml(a.nome.toLowerCase())}</strong> — ${escapeHtml(a.texto)} —
    normalmente são contribuintes do ICMS e precisam de <strong>Inscrição Estadual</strong>.</p>
    ${searchForm()}
    <h2>Por que ${escapeHtml(a.nome.toLowerCase())} precisa de Inscrição Estadual</h2>
    <p>Atividades de circulação de mercadorias exigem registro na SEFAZ do estado para emitir nota fiscal
    e recolher o ICMS. Você pode <a href="/">verificar a IE de qualquer empresa pelo CNPJ</a>.</p>
    <p>Veja também a <a href="/atividades">lista de atividades</a> e os
    <a href="/guias">guias sobre Inscrição Estadual</a>.</p>
    ${datasetLd(`Empresas de ${a.nome} (CNAE) no Brasil`, `${SITE_URL}/atividade/${a.slug}`, `Empresas do ramo de ${a.nome.toLowerCase()} consultáveis por CNPJ, com Inscrição Estadual, situação cadastral e CNAE.`)}`;
  return contentPage(
    `/atividade/${a.slug}`,
    `Inscrição Estadual para ${a.nome} (CNAE) — SINTEGRA Brasil`,
    `Inscrição Estadual e SINTEGRA para empresas de ${a.nome.toLowerCase()}. Consulte pelo CNPJ.`,
    `Inscrição Estadual para ${a.nome}`,
    inner,
    a.nome
  );
}

// --- Institucionais ---
function renderSobre() {
  const inner = `
    <p>O <strong>SINTEGRA Brasil</strong> é uma ferramenta gratuita para consultar a
    <strong>Inscrição Estadual (IE)</strong> de empresas de todo o Brasil a partir do CNPJ.</p>
    <p>Nosso objetivo é facilitar a verificação de dados cadastrais públicos de empresas, de forma rápida
    e sem cadastro, para contadores, empreendedores e profissionais que precisam validar fornecedores e clientes.</p>
    <h2>Quem somos</h2>
    <p>O serviço é desenvolvido e mantido pela <strong>Spartan TI</strong>
    (<a href="https://www.spartanti.com.br" target="_blank" rel="noopener">spartanti.com.br</a>).</p>
    <h2>Fontes dos dados</h2>
    <p>Os dados são obtidos de bases públicas (Receita Federal e SEFAZ, via API CNPJ.ws) e têm caráter
    informativo. Para fins oficiais, confirme sempre no SINTEGRA da SEFAZ do estado.</p>
    <p><strong>Importante:</strong> não temos vínculo com a Receita Federal, com as Secretarias de Fazenda
    estaduais ou com qualquer órgão público. Não somos um site oficial do governo.</p>`;
  return contentPage('/sobre', 'Sobre o SINTEGRA Brasil', 'Conheça o SINTEGRA Brasil, ferramenta gratuita de consulta de Inscrição Estadual por CNPJ, mantida pela Spartan TI.', 'Sobre o SINTEGRA Brasil', inner, 'Sobre');
}

function renderContato() {
  const inner = `
    <p>Fale com a equipe do SINTEGRA Brasil:</p>
    <ul>
      <li><strong>Responsável:</strong> Spartan TI</li>
      <li><strong>E-mail / Encarregado (DPO):</strong> <a href="mailto:admin@spartanti.com.br">admin@spartanti.com.br</a></li>
      <li><strong>Site:</strong> <a href="https://www.spartanti.com.br" target="_blank" rel="noopener">www.spartanti.com.br</a></li>
    </ul>
    <p>Para solicitar a remoção ou correção de dados, exercer seus direitos da LGPD ou tirar dúvidas sobre
    privacidade, escreva para <a href="mailto:admin@spartanti.com.br">admin@spartanti.com.br</a>.
    Veja também nossa <a href="/privacidade">Política de Privacidade</a>.</p>`;
  return contentPage('/contato', 'Contato — SINTEGRA Brasil', 'Entre em contato com o SINTEGRA Brasil (Spartan TI).', 'Contato', inner, 'Contato');
}

function renderPrivacidade() {
  const inner = `
    <p class="muted">Última atualização: 29/06/2026 · Em conformidade com a Lei nº 13.709/2018 (LGPD).</p>
    <p>Esta Política de Privacidade explica como o <strong>SINTEGRA Brasil</strong> coleta, usa, compartilha e
    protege informações, e quais são os seus direitos como titular de dados.</p>

    <h2>1. Controlador dos dados</h2>
    <p>O controlador é a <strong>Spartan TI</strong>
    (<a href="https://www.spartanti.com.br" target="_blank" rel="noopener">spartanti.com.br</a>).
    Encarregado pelo Tratamento de Dados (DPO) / contato de privacidade:
    <a href="mailto:admin@spartanti.com.br">admin@spartanti.com.br</a>.</p>

    <h2>2. Dados que tratamos</h2>
    <ul>
      <li><strong>Dados públicos de empresas:</strong> CNPJ, razão social, nome fantasia, situação cadastral,
      endereço, atividade (CNAE) e Inscrição Estadual — obtidos de <strong>fontes públicas</strong>
      (Receita Federal / SEFAZ e APIs que as disponibilizam). Não publicamos dados pessoais de sócios
      (QSA) em páginas indexáveis.</li>
      <li><strong>Dados de navegação:</strong> de forma agregada e anonimizada, via Google Analytics
      (somente com o seu consentimento), para medir audiência.</li>
      <li><strong>CNPJ digitado:</strong> usado para realizar a consulta. Não exigimos cadastro nem coletamos
      seu nome, e-mail ou CPF.</li>
    </ul>
    <p>Não tratamos dados pessoais sensíveis e não realizamos decisões automatizadas que afetem titulares.</p>

    <h2>3. Bases legais (art. 7º da LGPD)</h2>
    <ul>
      <li><strong>Dados manifestamente públicos</strong> de empresas e cumprimento de finalidade legítima
      (art. 7º, §3º e art. 7º, IX).</li>
      <li><strong>Consentimento</strong> (art. 7º, I) para cookies de análise (Google Analytics).</li>
    </ul>

    <h2>4. Finalidades</h2>
    <p>Permitir a consulta de Inscrição Estadual e dados cadastrais; melhorar e manter o serviço; e medir a
    audiência de forma agregada.</p>

    <h2>5. Cookies</h2>
    <p>Cookies estritamente necessários ao funcionamento podem ser usados. Cookies de <strong>análise</strong>
    (Google Analytics) só são ativados após o seu <strong>consentimento</strong> no aviso exibido na primeira
    visita. Você pode
    <a href="#" onclick="if(window.gerenciarCookies){gerenciarCookies();}return false;">alterar suas preferências de cookies</a>
    a qualquer momento. Veja a lista completa na <a href="/cookies">Política de Cookies</a>.</p>

    <h2>6. Compartilhamento e operadores</h2>
    <p>Podemos compartilhar dados com prestadores que viabilizam o serviço: <strong>Google</strong> (Analytics),
    provedor de <strong>hospedagem</strong> (Railway) e <strong>APIs de dados públicos</strong> (ex.: CNPJ.ws).
    Não vendemos dados pessoais.</p>

    <h2>7. Transferência internacional</h2>
    <p>Alguns provedores (ex.: Google, hospedagem) podem processar dados em servidores fora do Brasil. Nesses
    casos, buscamos garantias adequadas conforme a LGPD.</p>

    <h2>8. Retenção</h2>
    <p>Dados públicos de empresas são mantidos enquanto úteis ao serviço. Métricas de uso são tratadas de forma
    agregada pelo Google Analytics conforme as políticas dele.</p>

    <h2>9. Seus direitos (art. 18 da LGPD)</h2>
    <p>Você pode solicitar: confirmação e acesso aos dados; correção; anonimização, bloqueio ou eliminação;
    portabilidade; informação sobre compartilhamentos; e revogação do consentimento. Para exercer, use o
    <a href="/lgpd"><strong>formulário de Exclusão de Dados (LGPD)</strong></a> — que emite número de
    protocolo e permite acompanhar o andamento — ou escreva para
    <a href="mailto:admin@spartanti.com.br">admin@spartanti.com.br</a>.</p>

    <h2>10. Remoção de dados de empresa/sócio</h2>
    <p>Pedidos de eliminação, confirmação de exclusão ou correção de informações exibidas devem ser feitos pelo
    <a href="/lgpd">formulário de Exclusão de Dados (LGPD)</a>. Cada pedido gera um <strong>protocolo</strong> e é
    respondido em até <strong>15 dias</strong> (art. 19, II, da LGPD), conforme a lei e as orientações da ANPD.
    Dados excluídos deixam de ser exibidos e as páginas passam a indicar
    <em>“Dados excluídos em conformidade com a LGPD”</em>.</p>

    <h2>11. Segurança</h2>
    <p>Adotamos medidas técnicas e organizacionais razoáveis para proteger as informações tratadas.</p>

    <h2>12. Alterações</h2>
    <p>Esta política pode ser atualizada. A data no topo indica a última revisão.</p>

    <p class="muted">Este serviço é independente e não possui vínculo com a Receita Federal, SEFAZ ou órgãos públicos.</p>`;
  return contentPage('/privacidade', 'Política de Privacidade (LGPD) — SINTEGRA Brasil', 'Política de Privacidade do SINTEGRA Brasil em conformidade com a LGPD: dados tratados, bases legais, cookies, compartilhamento e direitos do titular.', 'Política de Privacidade', inner, 'Privacidade');
}

// --- Exclusão de dados (LGPD): formulário com protocolo + consulta de andamento ---
function renderLgpd() {
  const inner = `
    <p class="muted">Conforme a <strong>Lei nº 13.709/2018 (LGPD)</strong> e as orientações da
    <strong>ANPD</strong> (Autoridade Nacional de Proteção de Dados).</p>

    <p>Esta página é o canal oficial do <strong>SINTEGRA Brasil</strong> para o titular de dados exercer os
    direitos previstos no <strong>art. 18 da LGPD</strong>: solicitar a <strong>eliminação</strong> de dados
    pessoais exibidos no site (ex.: nome de sócio no QSA), obter a <strong>confirmação</strong> de uma
    exclusão já realizada ou pedir a <strong>correção</strong> de dados incompletos ou desatualizados.</p>

    <h2>Como funciona</h2>
    <ol>
      <li>Preencha o formulário abaixo. Você recebe na hora um <strong>número de protocolo</strong>.</li>
      <li>Analisamos o pedido conforme a LGPD e respondemos pelo e-mail informado em até
      <strong>15 dias</strong> (art. 19, II, da LGPD).</li>
      <li>Confirmada a exclusão, as páginas do CNPJ passam a exibir
      <em>“❗ Dados excluídos em conformidade com a LGPD”</em> e os dados deixam de ser servidos
      pelo site e pela API.</li>
      <li>Acompanhe o andamento a qualquer momento pelo protocolo, no campo ao final desta página.</li>
    </ol>
    <p class="muted">Importante: dados cadastrais de empresas (CNPJ, razão social, endereço, CNAE) são
    <strong>dados públicos</strong> divulgados pela Receita Federal. A LGPD protege <strong>pessoas
    naturais</strong>; por isso os pedidos são avaliados individualmente, conforme a lei e as orientações da
    ANPD (<a href="https://www.gov.br/anpd" target="_blank" rel="noopener">gov.br/anpd</a>).</p>

    <h2>Formulário de solicitação</h2>
    <form id="lgpd-form" class="card" style="padding:20px;display:grid;gap:12px;max-width:640px">
      <label>Tipo de solicitação*<br>
        <select name="tipo" required style="width:100%;padding:10px;border-radius:8px;border:1px solid #ccc">
          <option value="">Selecione…</option>
          <option value="exclusao">Exclusão de dados pessoais</option>
          <option value="confirmacao">Confirmação de exclusão já solicitada</option>
          <option value="correcao">Correção de dados</option>
        </select></label>
      <label>CNPJ relacionado (se houver)<br>
        <input name="cnpj" type="text" inputmode="numeric" maxlength="18" placeholder="00.000.000/0000-00"
          style="width:100%;padding:10px;border-radius:8px;border:1px solid #ccc"></label>
      <label>Seu nome completo*<br>
        <input name="nome" type="text" required maxlength="120"
          style="width:100%;padding:10px;border-radius:8px;border:1px solid #ccc"></label>
      <label>E-mail para retorno*<br>
        <input name="email" type="email" required maxlength="160"
          style="width:100%;padding:10px;border-radius:8px;border:1px solid #ccc"></label>
      <label>Sua relação com os dados*<br>
        <select name="relacao" required style="width:100%;padding:10px;border-radius:8px;border:1px solid #ccc">
          <option value="">Selecione…</option>
          <option value="titular">Titular dos dados (pessoa física citada)</option>
          <option value="representante">Representante legal da empresa</option>
          <option value="procurador">Procurador do titular</option>
        </select></label>
      <label>Descreva a solicitação*<br>
        <textarea name="mensagem" required maxlength="2000" rows="4"
          placeholder="Ex.: solicito a exclusão do meu nome do quadro societário exibido na página do CNPJ acima."
          style="width:100%;padding:10px;border-radius:8px;border:1px solid #ccc"></textarea></label>
      <input name="site" type="text" tabindex="-1" autocomplete="off" style="display:none" aria-hidden="true">
      <button type="submit" style="padding:12px 18px;border:none;border-radius:8px;background:var(--azul,#0b4f9e);color:#fff;font-weight:600;cursor:pointer">Enviar solicitação</button>
      <p id="lgpd-msg" class="muted" role="status"></p>
    </form>

    <h2>Consultar andamento</h2>
    <form id="lgpd-check" class="card" style="padding:20px;display:grid;gap:12px;max-width:640px">
      <label>Número do protocolo<br>
        <input name="protocolo" type="text" required placeholder="LGPD-AAAAMMDD-XXXXXXXX"
          style="width:100%;padding:10px;border-radius:8px;border:1px solid #ccc;text-transform:uppercase"></label>
      <button type="submit" style="padding:12px 18px;border:none;border-radius:8px;background:var(--azul,#0b4f9e);color:#fff;font-weight:600;cursor:pointer">Consultar protocolo</button>
      <p id="lgpd-check-msg" class="muted" role="status"></p>
    </form>

    <h2>Base legal e referências oficiais</h2>
    <ul>
      <li><a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm" target="_blank" rel="noopener">Lei nº 13.709/2018 — LGPD</a> (arts. 5º, 18 e 19).</li>
      <li><a href="https://www.gov.br/anpd" target="_blank" rel="noopener">ANPD — Autoridade Nacional de Proteção de Dados</a> (orientações e guias).</li>
      <li>Encarregado (DPO): <a href="mailto:admin@spartanti.com.br">admin@spartanti.com.br</a> — canal alternativo para qualquer pedido desta página.</li>
    </ul>

    <script>
    (function () {
      var f = document.getElementById('lgpd-form');
      var msg = document.getElementById('lgpd-msg');
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var d = Object.fromEntries(new FormData(f).entries());
        msg.textContent = 'Enviando…';
        fetch('/api/lgpd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (x) {
            if (!x.ok) { msg.textContent = '❗ ' + (x.j.erro || 'Não foi possível enviar.'); return; }
            f.reset();
            msg.innerHTML = '✅ Solicitação registrada. Guarde o seu protocolo: <strong>' + x.j.protocolo +
              '</strong><br>' + (x.j.prazo || '');
          })
          .catch(function () { msg.textContent = '❗ Erro de conexão. Tente novamente.'; });
      });
      var c = document.getElementById('lgpd-check');
      var cm = document.getElementById('lgpd-check-msg');
      var ST = { recebida: 'Recebida — em análise', em_analise: 'Em análise', concluida: 'Concluída', negada: 'Não atendida (veja a resposta)' };
      c.addEventListener('submit', function (e) {
        e.preventDefault();
        var p = new FormData(c).get('protocolo').trim().toUpperCase();
        cm.textContent = 'Consultando…';
        fetch('/api/lgpd?protocolo=' + encodeURIComponent(p))
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (x) {
            if (!x.ok) { cm.textContent = '❗ ' + (x.j.erro || 'Protocolo não encontrado.'); return; }
            var dt = new Date(x.j.criada_em).toLocaleDateString('pt-BR');
            cm.innerHTML = '<strong>' + x.j.protocolo + '</strong> — aberta em ' + dt +
              '<br>Situação: <strong>' + (ST[x.j.status] || x.j.status) + '</strong>' +
              (x.j.resposta ? '<br>Resposta: ' + x.j.resposta : '');
          })
          .catch(function () { cm.textContent = '❗ Erro de conexão. Tente novamente.'; });
      });
    })();
    </script>`;
  return contentPage(
    '/lgpd',
    'Exclusão de Dados (LGPD) — SINTEGRA Brasil',
    'Formulário oficial do SINTEGRA Brasil para titulares de dados solicitarem exclusão, confirmação de exclusão ou correção de dados pessoais, conforme a LGPD e as orientações da ANPD. Emissão de protocolo e acompanhamento.',
    'Exclusão de Dados (LGPD)',
    inner,
    'Exclusão de Dados'
  );
}

function renderTermos() {
  const inner = `
    <p class="muted">Última atualização: 29/06/2026.</p>
    <p>Ao acessar e utilizar o <strong>SINTEGRA Brasil</strong>, você concorda com estes Termos de Uso. Se não
    concordar, não utilize o site.</p>

    <h2>1. Objeto</h2>
    <p>O SINTEGRA Brasil é uma ferramenta gratuita para consulta de Inscrição Estadual e dados cadastrais
    públicos de empresas a partir do CNPJ, além de busca por atividade (CNAE), estado e município.</p>

    <h2>2. Natureza informativa dos dados</h2>
    <p>As informações vêm de <strong>fontes públicas</strong> (Receita Federal / SEFAZ e APIs) e têm caráter
    <strong>meramente informativo</strong>. Podem conter imprecisões ou estar desatualizadas. Para qualquer
    finalidade oficial, fiscal ou jurídica, confirme nas fontes oficiais (SINTEGRA da SEFAZ do estado).</p>

    <h2>3. Uso permitido</h2>
    <p>O uso é pessoal e legítimo. É <strong>proibido</strong>: coleta automatizada em massa (scraping) que
    sobrecarregue o serviço, uso para fins ilícitos, discriminatórios ou que violem a LGPD e demais leis, e
    qualquer tentativa de comprometer a segurança do site.</p>

    <h2>4. Disponibilidade</h2>
    <p>O serviço é fornecido "no estado em que se encontra" e "conforme disponível", sem garantia de
    funcionamento ininterrupto, exatidão ou adequação a um fim específico.</p>

    <h2>5. Limitação de responsabilidade</h2>
    <p>Não nos responsabilizamos por decisões tomadas com base nas informações exibidas, nem por danos diretos
    ou indiretos decorrentes do uso. Recomendamos sempre a conferência nas fontes oficiais.</p>

    <h2>6. Publicidade e links de terceiros</h2>
    <p>O site pode exibir publicidade e links para terceiros (ex.: parceiros). Não nos responsabilizamos por
    conteúdos, produtos ou políticas de sites externos.</p>

    <h2>7. Propriedade intelectual</h2>
    <p>A marca, o layout e o software do SINTEGRA Brasil pertencem à Spartan TI. Os dados públicos pertencem às
    respectivas fontes oficiais.</p>

    <h2>8. Privacidade e direitos do titular (LGPD)</h2>
    <p>O tratamento de dados segue a nossa <a href="/privacidade">Política de Privacidade</a>, em conformidade
    com a Lei nº 13.709/2018 (LGPD). Titulares de dados podem solicitar <strong>exclusão, confirmação de
    exclusão ou correção</strong> de dados pessoais pelo <a href="/lgpd">formulário de Exclusão de Dados
    (LGPD)</a>, com emissão de protocolo e resposta em até 15 dias. Dados excluídos deixam de ser exibidos no
    site e na API, e as páginas correspondentes passam a indicar
    <em>“Dados excluídos em conformidade com a LGPD”</em>.</p>

    <h2>9. Independência</h2>
    <p>O SINTEGRA Brasil é um serviço <strong>independente e privado</strong>, sem vínculo com a Receita Federal,
    SEFAZ ou qualquer órgão público.</p>

    <h2>10. Lei aplicável e foro</h2>
    <p>Estes Termos são regidos pelas leis do Brasil. Fica eleito o foro do domicílio do usuário para dirimir
    eventuais controvérsias, salvo disposição legal em contrário.</p>

    <h2>11. Contato</h2>
    <p>Dúvidas sobre estes Termos: <a href="/contato">página de Contato</a>.</p>`;
  return contentPage('/termos', 'Termos de Uso — SINTEGRA Brasil', 'Termos de Uso do SINTEGRA Brasil: natureza informativa dos dados, uso permitido, limitação de responsabilidade e legislação aplicável.', 'Termos de Uso', inner, 'Termos');
}

// --- Política de Cookies ---
function renderCookies() {
  const inner = `
    <p class="muted">Última atualização: 29/06/2026.</p>
    <p>Esta página detalha os cookies e tecnologias semelhantes utilizados pelo <strong>SINTEGRA Brasil</strong>,
    em complemento à <a href="/privacidade">Política de Privacidade</a>.</p>

    <h2>O que são cookies</h2>
    <p>São pequenos arquivos/identificadores armazenados no seu navegador para lembrar preferências e medir o
    uso do site. Cookies de <strong>análise</strong> só são ativados com o seu <strong>consentimento</strong>.</p>

    <h2>Cookies e armazenamentos utilizados</h2>
    <div class="table-wrap">
      <table class="busca-table">
        <thead><tr><th>Nome</th><th>Tipo</th><th>Finalidade</th><th>Duração</th></tr></thead>
        <tbody>
          <tr><td>sb_consent</td><td>Necessário (localStorage)</td><td>Guarda sua escolha de aceitar/recusar cookies de análise</td><td>Até você limpar</td></tr>
          <tr><td>sb_fav</td><td>Necessário (localStorage)</td><td>Guarda seus favoritos de consulta (fica só no seu navegador)</td><td>Até você limpar</td></tr>
          <tr><td>_ga</td><td>Análise — Google Analytics</td><td>Distingue usuários (estatística de audiência)</td><td>2 anos</td></tr>
          <tr><td>_ga_&lt;ID&gt;</td><td>Análise — Google Analytics</td><td>Mantém o estado da sessão (GA4)</td><td>2 anos</td></tr>
          <tr><td>_gid</td><td>Análise — Google Analytics</td><td>Distingue usuários (quando aplicável)</td><td>24 horas</td></tr>
        </tbody>
      </table>
    </div>
    <p class="muted">Os cookies <code>_ga*</code> só são gravados se você <strong>aceitar</strong> os cookies de análise.
    Usamos anonimização de IP no Google Analytics.</p>

    <h2>Gerenciar preferências</h2>
    <p>Você pode rever sua escolha a qualquer momento:
    <a href="#" onclick="if(window.gerenciarCookies){gerenciarCookies();}return false;">abrir o aviso de cookies</a>.
    Também é possível bloquear ou apagar cookies nas configurações do seu navegador.</p>

    <h2>Terceiros</h2>
    <p>O Google Analytics é operado pelo Google. Consulte as políticas do Google para mais detalhes sobre o
    tratamento desses dados.</p>`;
  return contentPage('/cookies', 'Política de Cookies — SINTEGRA Brasil', 'Lista de cookies usados pelo SINTEGRA Brasil (incluindo Google Analytics), finalidade, duração e como gerenciar.', 'Política de Cookies', inner, 'Cookies');
}

// --- Validador de IE ---
function renderValidador() {
  const options = UFS.map((uf) => `<option value="${uf}">${uf} — ${escapeHtml(UF_INFO[uf])}</option>`).join('');
  const inner = `
    <p>Verifique se uma <strong>Inscrição Estadual</strong> é válida (dígito verificador e formato) conforme
    as regras de cada estado. Ferramenta gratuita e informativa.</p>
    <div class="validator">
      <div class="validator-row">
        <select id="v-uf">${options}</select>
        <input id="v-ie" inputmode="numeric" placeholder="Digite a Inscrição Estadual" />
        <button id="v-btn" type="button">Validar</button>
      </div>
      <div id="v-result" class="v-result" hidden></div>
    </div>
    <p class="source">Validação conforme regras padrão de cada UF. Para fins oficiais, confirme no SINTEGRA da SEFAZ.</p>
    <h2>Como funciona</h2>
    <p>Cada estado tem um algoritmo próprio de dígito verificador para a Inscrição Estadual. Esta ferramenta
    aplica essas regras localmente, no seu navegador. Para consultar a IE real de uma empresa,
    <a href="/">use a busca por CNPJ</a>.</p>
    <script src="/ie-validator.js"></script>
    <script>
      (function(){
        var btn=document.getElementById('v-btn'),uf=document.getElementById('v-uf'),
            ie=document.getElementById('v-ie'),out=document.getElementById('v-result');
        function run(){var r=window.validarIE(uf.value,ie.value);out.hidden=false;
          out.className='v-result '+(r.valido?'ok':'bad');out.textContent=r.motivo;}
        btn.addEventListener('click',run);
        ie.addEventListener('keydown',function(e){if(e.key==='Enter')run();});
      })();
    </script>
    ${softwareAppLd('Validador de Inscrição Estadual — SINTEGRA Brasil', `${SITE_URL}/validar-inscricao-estadual`, 'Ferramenta gratuita para validar o dígito verificador da Inscrição Estadual (IE) de qualquer estado do Brasil.')}`;
  return contentPage(
    '/validar-inscricao-estadual',
    'Validar Inscrição Estadual (IE) por estado — SINTEGRA Brasil',
    'Valide gratuitamente o dígito verificador da Inscrição Estadual de qualquer estado do Brasil.',
    'Validador de Inscrição Estadual',
    inner,
    'Validar IE'
  );
}

// --- Widget embedável ---
function renderWidget() {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<title>Consulta de Inscrição Estadual</title>
<style>
  body{margin:0;font-family:system-ui,Arial,sans-serif;background:#fff;color:#1f2937;padding:16px}
  .wt{font-size:13px;font-weight:700;color:#0a3d62;margin:0 0 8px}
  form{display:flex;gap:8px}
  input{flex:1;padding:11px 12px;font-size:15px;border:1px solid #e4e8ee;border-radius:10px}
  button{background:#0a3d62;color:#fff;border:0;border-radius:10px;padding:0 18px;font-weight:700;cursor:pointer}
  .pw{font-size:11px;color:#6b7280;margin:10px 0 0;text-align:right}
  .pw a{color:#1e6091;text-decoration:none;font-weight:600}
</style></head>
<body>
  <p class="wt">Consulta de Inscrição Estadual por CNPJ</p>
  <form onsubmit="event.preventDefault();var c=this.cnpj.value.replace(/\\D/g,'');if(c.length===14){window.open('${SITE_URL}/cnpj/'+c,'_blank');}else{alert('Digite os 14 dígitos do CNPJ');}">
    <input name="cnpj" inputmode="numeric" maxlength="18" placeholder="Digite o CNPJ" />
    <button type="submit">Consultar</button>
  </form>
  <p class="pw">por <a href="${SITE_URL}" target="_blank">SINTEGRA Brasil</a></p>
</body></html>`;
}

function renderEmbed() {
  const code = `<script src="${SITE_URL}/widget.js" async></script>`;
  const iframeCode = `<iframe src="${SITE_URL}/widget" width="440" height="210" style="border:0;border-radius:14px" title="Consulta de Inscrição Estadual"></iframe>`;
  const inner = `
    <p>Adicione a caixa de consulta de Inscrição Estadual no seu site gratuitamente. Basta copiar um dos códigos abaixo.</p>
    <h2>Opção 1 — Script (recomendado)</h2>
    <pre class="codeblock">${escapeHtml(code)}</pre>
    <h2>Opção 2 — iframe</h2>
    <pre class="codeblock">${escapeHtml(iframeCode)}</pre>
    <h2>Pré-visualização</h2>
    <iframe src="/widget" width="100%" height="210" style="border:1px solid #e4e8ee;border-radius:14px;max-width:440px" title="Pré-visualização do widget"></iframe>
    <p class="source">Ao incorporar, você concorda com nossos <a href="/termos">Termos de Uso</a>.</p>`;
  return contentPage('/incorporar', 'Incorporar consulta de Inscrição Estadual no seu site — SINTEGRA Brasil', 'Adicione gratuitamente a caixa de consulta de Inscrição Estadual por CNPJ no seu site.', 'Incorporar o widget no seu site', inner, 'Incorporar');
}

// --- Busca por CNAE / UF / município ---
function renderBusca() {
  const ufOpts = ['<option value="">UF (todas)</option>']
    .concat(UFS.map((uf) => `<option value="${uf}">${uf}</option>`))
    .join('');
  const inner = `
    <p>Encontre empresas por <strong>atividade (CNAE)</strong> e filtre por <strong>estado</strong> e
    <strong>município</strong>. Exporte os resultados em <strong>CSV</strong> ou <strong>PDF</strong>.</p>

    <form id="busca-form" class="busca-form no-print" autocomplete="off">
      <input id="b-cnae" placeholder="CNAE: código (ex.: 5611) ou descrição (ex.: restaurante)" />
      <div class="busca-row">
        <select id="b-uf">${ufOpts}</select>
        <input id="b-municipio" placeholder="Município (ex.: Vitória)" />
      </div>
      <input id="b-q" placeholder="Nome / razão social (opcional)" />
      <button type="submit">Buscar</button>
    </form>

    <div id="mapa-card" class="mapa-card no-print">
      <div class="mapa-head">
        <strong>🗺️ Mapa de calor por região</strong>
        <span id="mapa-info" class="muted"></span>
      </div>
      <div id="mapa-leaflet" class="mapa-leaflet" role="img" aria-label="Mapa de calor de empresas por região"></div>
      <div class="mapa-legend">
        <span>menos</span>
        <i class="lg-bar"></i>
        <span>mais</span>
        <span class="mapa-zoomhint">· arraste para navegar, use + / − ou a roda do mouse para ampliar</span>
      </div>
      <p class="mapa-hint muted">Atualiza conforme o CNAE digitado acima. Sem CNAE, mostra toda a base.</p>
    </div>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
      integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
    <script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>

    <div id="busca-status" class="busca-status" aria-live="polite"></div>

    <div id="busca-actions" class="result-actions no-print" hidden>
      <button type="button" id="b-csv" class="act-btn">⬇ Baixar CSV</button>
      <button type="button" id="b-pdf" class="act-btn">⬇ Baixar PDF</button>
    </div>

    <div class="table-wrap">
      <table id="busca-table" class="busca-table" hidden>
        <thead>
          <tr><th>Razão social</th><th>Nome fantasia</th><th>CNAE</th><th>Município/UF</th><th></th></tr>
        </thead>
        <tbody id="busca-body"></tbody>
      </table>
    </div>

    <div id="busca-pager" class="busca-pager no-print" hidden>
      <button type="button" id="b-prev" class="act-btn">← Anterior</button>
      <span id="b-page" class="muted"></span>
      <button type="button" id="b-next" class="act-btn">Próxima →</button>
    </div>

    <p class="source">Resultados sobre a base já carregada. A Inscrição Estadual aparece ao abrir cada empresa
    (preenchida na consulta). Dados públicos, caráter informativo.</p>
    ${softwareAppLd('Busca de empresas por CNAE — SINTEGRA Brasil', `${SITE_URL}/busca`, 'Ferramenta gratuita para pesquisar empresas por atividade econômica (CNAE), estado e município, com mapa de calor por região.')}
    <script src="/heatmap.js?v=3"></script>
    <script src="/busca.js?v=1"></script>`;
  return contentPage(
    '/busca',
    'Busca de empresas por CNAE, estado e município — SINTEGRA Brasil',
    'Encontre empresas por atividade econômica (CNAE) filtrando por estado (UF) e município. Exporte em CSV ou PDF.',
    'Busca de empresas por CNAE, estado e município',
    inner,
    'Busca'
  );
}

// --- DANFE: gerar PDF da NF-e a partir do XML ---
function renderNfe() {
  const inner = `
    <p class="nfe-intro">Baixe a <strong>NF-e pela chave de acesso</strong> com seu <strong>certificado A1</strong>
    e gere o <strong>DANFE em PDF</strong> — ou, se já tem o <strong>XML</strong>, gere o DANFE na hora.</p>

    <div class="nfe-methods">
      <section class="nfe-method no-print">
        <div class="nfe-method-head">
          <span class="nfe-num">1</span>
          <div><h2>Baixar pela chave de acesso</h2>
            <p class="muted">Com certificado <strong>A1</strong>, direto da SEFAZ. O certificado não sai do seu computador.</p></div>
        </div>
        <div id="agente-status" class="agente-badge">Verificando o agente…</div>
        <div id="cert-form" hidden>
          <input id="nfe-chave" class="nfe-chave-input" placeholder="Chave de acesso da NF-e (44 dígitos)" inputmode="numeric" maxlength="54" />
          <div class="cert-row">
            <label class="nfe-file-label"><input type="file" id="cert-pfx" accept=".pfx,.p12" /><span>🔑 Certificado (.pfx)</span></label>
            <input id="cert-senha" type="password" placeholder="Senha do certificado" autocomplete="off" />
            <select id="cert-amb"><option value="1">Produção</option><option value="2">Homologação</option></select>
          </div>
          <button type="button" id="cert-baixar" class="nfe-btn-primary">⬇ Baixar da SEFAZ</button>
          <div id="cert-status" class="nfe-status" aria-live="polite"></div>
        </div>
      </section>

      <section class="nfe-method no-print">
        <div class="nfe-method-head">
          <span class="nfe-num nfe-num-alt">2</span>
          <div><h2>Já tem o XML? Gere o DANFE</h2>
            <p class="muted">100% no seu navegador — o XML não é enviado ao servidor.</p></div>
        </div>
        <label class="nfe-file-label"><input type="file" id="nfe-file" accept=".xml,text/xml,application/xml" /><span>📄 Selecionar arquivo XML</span></label>
        <p class="muted" style="margin:10px 0 6px">ou cole o conteúdo do XML:</p>
        <textarea id="nfe-xml" rows="4" placeholder="<nfeProc ...> ... </nfeProc>" spellcheck="false"></textarea>
        <div class="nfe-actions">
          <button type="button" id="nfe-gerar">Gerar DANFE</button>
          <button type="button" id="nfe-pdf" class="act-btn" hidden>⬇ Baixar PDF</button>
        </div>
        <div id="nfe-status" class="nfe-status" aria-live="polite"></div>
      </section>
    </div>

    <div id="nfe-out" class="nfe-out" hidden></div>

    <p class="source no-print">O DANFE é um documento auxiliar e não substitui a NF-e. Só é possível baixar notas
    em que o CNPJ do certificado é parte (emitente/destinatário). Para validar a autenticidade, use a chave no
    <a href="https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx" target="_blank" rel="noopener">portal nacional da NF-e</a>.</p>
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'Como gerar o DANFE da NF-e em PDF',
      description: 'Gere o DANFE em PDF pela chave de acesso (com certificado A1) ou a partir do XML.',
      step: [
        { '@type': 'HowToStep', name: 'Pela chave de acesso', text: 'Baixe a nota pela chave usando o certificado A1 no Agente SINTEGRA Brasil.' },
        { '@type': 'HowToStep', name: 'Ou pelo XML', text: 'Se já tem o XML, selecione o arquivo ou cole o conteúdo.' },
        { '@type': 'HowToStep', name: 'Gerar e baixar', text: 'Clique em Gerar DANFE e depois em Baixar PDF.' },
      ],
    })}</script>
    ${softwareAppLd('Gerar DANFE e baixar NF-e — SINTEGRA Brasil', `${SITE_URL}/nfe`, 'Ferramenta gratuita para gerar o DANFE da NF-e em PDF a partir do XML, ou baixar a nota pela chave de acesso com certificado digital A1.')}
    <script src="/nfe.js?v=6"></script>`;
  return contentPage(
    '/nfe',
    'Baixar NF-e e DANFE pela chave de acesso — SINTEGRA Brasil',
    'Baixe a NF-e pela chave de acesso com seu certificado digital A1 e gere o DANFE em PDF. Ou gere o DANFE a partir do XML, direto no navegador. Gratuito.',
    'Baixar NF-e e gerar DANFE (PDF)',
    inner,
    'DANFE / NF-e'
  );
}

// --- Página de download + tutorial do Agente ---
const AGENTE_BASE = 'https://github.com/spartanti/consulta-inscricao-estadual/releases/download/agente-v0.1.0/';
const AGENTE_DOWNLOAD = AGENTE_BASE + 'agente-nfe.exe';

function renderAgente() {
  const faqs = [
    ['Preciso de certificado digital?', 'Sim. É necessário um certificado <strong>A1</strong> (arquivo <code>.pfx</code>/<code>.p12</code>) e a senha. Suporte a <strong>A3 (token/cartão)</strong> está no roteiro.'],
    ['Meu certificado fica seguro?', 'Fica. O agente roda <strong>só no seu computador</strong> — o certificado e a senha <strong>não são enviados para a internet</strong>. O site conversa com o agente apenas em <code>localhost</code>.'],
    ['De quem posso baixar notas?', 'Das notas em que o <strong>CNPJ do seu certificado é parte</strong> — normalmente como <strong>destinatário</strong> (ou emitente). Terceiros e transportadoras só com autorização via <code>autXML</code> na nota.'],
    ['Consigo baixar a nota de um fornecedor?', 'Sim, desde que a sua empresa seja a <strong>destinatária</strong> daquela NF-e. Caso contrário, a SEFAZ devolve apenas o resumo.'],
    ['É gratuito?', 'Sim, o agente e a geração do DANFE são <strong>gratuitos</strong>.'],
    ['Preciso instalar alguma coisa?', 'Não. É um <strong>executável portátil</strong> — basta baixar e abrir. Não precisa de Node nem de instalador.'],
    ['Funciona no Mac/Linux?', 'Por enquanto <strong>Windows 64-bit</strong>. Versões para Mac e Linux podem ser disponibilizadas depois.'],
    ['O antivírus acusou o arquivo. É vírus?', 'Não. É um <strong>falso-positivo</strong> comum em programas novos ainda <strong>não assinados</strong>. O código é aberto e pode ser conferido.'],
  ];
  const faqHtml = faqs.map((f) => `<details class="faq-item"><summary>${f[0]}</summary><div>${f[1]}</div></details>`).join('');
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f[0],
      acceptedAnswer: { '@type': 'Answer', text: f[1].replace(/<[^>]+>/g, '') },
    })),
  };

  const inner = `
    <div class="ag-hero">
      <p class="ag-lead">Baixe o <strong>XML e o DANFE em PDF</strong> da NF-e pela <strong>chave de acesso</strong>
      usando o seu <strong>certificado digital A1</strong> — direto da SEFAZ, com segurança. O certificado
      <strong>nunca sai da sua máquina</strong>.</p>
      <div class="agente-dl no-print">
        <a class="agente-btn" href="${AGENTE_DOWNLOAD}" rel="nofollow">⬇ Baixar o Agente — Windows</a>
        <span class="ag-os muted">Outros sistemas:
          <a href="${AGENTE_BASE}agente-nfe-linux" rel="nofollow">Linux</a> ·
          <a href="${AGENTE_BASE}agente-nfe-mac" rel="nofollow">macOS</a></span>
      </div>
      <p class="muted" style="margin:6px 0 0">Grátis · 64-bit · sem instalação. No Linux/macOS, rode:
        <code>chmod +x agente-nfe-linux &amp;&amp; ./agente-nfe-linux</code></p>
    </div>

    <div class="feature-cards">
      <div class="feature-card"><span class="fc-ico">🧾</span><strong>DANFE em PDF</strong>
        <span>Visualize, salve e imprima o DANFE da nota em segundos.</span></div>
      <div class="feature-card"><span class="fc-ico">🔐</span><strong>XML com certificado</strong>
        <span>Baixe o XML autorizado direto da SEFAZ com o seu A1 — a chave privada fica no seu PC.</span></div>
      <div class="feature-card"><span class="fc-ico">⚡</span><strong>Rápido e gratuito</strong>
        <span>Sem cadastro, sem mensalidade. Informe a chave e pronto.</span></div>
    </div>

    <h2 class="sec-title">Como funciona — passo a passo</h2>
    <ol class="agente-passos">
      <li><strong>Baixe</strong> o agente no botão acima e <strong>abra</strong> o <code>agente-nfe.exe</code>.</li>
      <li>Se o Windows mostrar <em>"O Windows protegeu o seu PC"</em>, clique em <strong>"Mais informações"</strong>
        › <strong>"Executar assim mesmo"</strong> (normal em programa novo).</li>
      <li>Abre uma <strong>janela</strong> escrito <em>"Agente rodando…"</em>. <strong>Deixe aberta</strong> enquanto usar.</li>
      <li>Vá em <a href="/nfe">Gerar DANFE</a> › aparece <strong>"✓ Agente detectado"</strong>.</li>
      <li>Informe a <strong>chave (44 dígitos)</strong>, selecione o <strong>.pfx (A1)</strong>, a <strong>senha</strong>
        e clique em <strong>Baixar da SEFAZ</strong>.</li>
      <li>O DANFE aparece › clique em <strong>Baixar PDF</strong>. 🎉</li>
    </ol>

    <h2 class="sec-title">Certificado digital aceito</h2>
    <p>É preciso o certificado de <strong>uma das partes da nota</strong> (emitente, destinatário ou terceiro autorizado):</p>
    <ul>
      <li>✅ <strong>A1</strong> — arquivo <code>.pfx</code>/<code>.p12</code> (com senha). <em>Disponível.</em></li>
      <li>🔜 <strong>A3</strong> — token USB ou cartão. <em>Em breve.</em></li>
    </ul>

    <h2 class="sec-title">Comunicado aos emitentes</h2>
    <p>Para que a sua <strong>transportadora ou contador</strong> baixe a NF-e com o certificado deles, inclua o CNPJ
    autorizado na tag <code>autXML</code> ao emitir a nota. Sem isso, apenas emitente e destinatário obtêm o XML
    completo — os demais recebem só o resumo.</p>

    <h2 class="sec-title">Dúvidas frequentes</h2>
    <div class="faq-list">${faqHtml}</div>
    <script type="application/ld+json">${JSON.stringify(faqSchema)}</script>
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'Como baixar a NF-e com certificado digital A1',
      step: [
        { '@type': 'HowToStep', name: 'Baixar o agente', text: 'Baixe o Agente SINTEGRA Brasil e abra o programa.' },
        { '@type': 'HowToStep', name: 'Executar', text: 'Permita a execução no Windows e deixe a janela aberta.' },
        { '@type': 'HowToStep', name: 'Informar os dados', text: 'Na página de NF-e, informe a chave de acesso, o certificado A1 e a senha.' },
        { '@type': 'HowToStep', name: 'Baixar', text: 'Clique em Baixar da SEFAZ e gere o DANFE em PDF.' },
      ],
    })}</script>
    ${softwareAppLd('Agente NF-e (certificado digital A1) — SINTEGRA Brasil', `${SITE_URL}/agente`, 'Programa gratuito que baixa a NF-e na SEFAZ pela chave de acesso usando o certificado digital A1 do usuário, sem enviar a chave privada a servidores.')}

    <p class="source">Alternativa sem certificado: <a href="/nfe">gerar o DANFE a partir do XML</a> que você já tem.
    Agente em <strong>beta</strong>, ainda não assinado digitalmente. Só baixa notas em que o CNPJ do certificado é
    parte, conforme regras da SEFAZ.</p>`;
  return contentPage(
    '/agente',
    'Baixar NF-e e DANFE com certificado digital — Agente SINTEGRA Brasil',
    'Baixe o XML e o DANFE da NF-e pela chave de acesso usando seu certificado A1, direto da SEFAZ. Grátis, seguro (o certificado não sai da sua máquina) e com tutorial passo a passo.',
    'Baixar NF-e e DANFE com certificado digital',
    inner,
    'Agente'
  );
}

// --- Metodologia / fonte dos dados ---
function renderMetodologia() {
  const inner = `
    <p>Transparência sobre <strong>de onde vêm os dados</strong> do SINTEGRA Brasil, como são atualizados e quais
    são os limites de uso.</p>

    <h2>Fontes dos dados</h2>
    <ul>
      <li><strong>Base cadastral:</strong> <a href="https://dados.gov.br" target="_blank" rel="noopener">Dados Abertos
        da Receita Federal</a> (CNPJ) — razão social, nome fantasia, situação cadastral, endereço, CNAE, natureza jurídica e porte.</li>
      <li><strong>Inscrição Estadual (IE):</strong> obtida via <a href="https://www.cnpj.ws" target="_blank" rel="noopener">API
        pública CNPJ.ws</a>, que agrega as inscrições estaduais das SEFAZ.</li>
      <li><strong>NF-e (DANFE por certificado):</strong> web service <strong>NFeDistribuicaoDFe</strong> da SEFAZ
        (Ambiente Nacional), acessado localmente com o certificado A1 do próprio usuário.</li>
    </ul>

    <h2>Como os dados são atualizados</h2>
    <p>A base cadastral (Receita Federal) é carregada periodicamente. A cada <strong>consulta</strong>, os dados da
    empresa são <strong>enriquecidos e atualizados</strong> pela API CNPJ.ws — incluindo a Inscrição Estadual e a
    situação mais recente. Ou seja: a base dá a cobertura, e a consulta traz o dado fresco.</p>

    <h2>Cobertura</h2>
    <p>Todos os <strong>27 estados</strong> (26 UFs + Distrito Federal). A base nacional de empresas está em
    expansão contínua.</p>

    <h2>Limites e avisos</h2>
    <ul>
      <li>Conteúdo com <strong>caráter informativo</strong>. Para fins oficiais, confirme no SINTEGRA/SEFAZ do estado.</li>
      <li>A situação detalhada da IE (habilitada, bloqueada, etc.) é definida por cada SEFAZ; aqui indicamos se está ativa.</li>
      <li>Limite de <strong>3 consultas por minuto por IP</strong> na API pública.</li>
    </ul>

    <h2>Independência</h2>
    <p>O SINTEGRA Brasil é um serviço <strong>independente e privado</strong> (Spartan TI), <strong>sem vínculo</strong>
    com a Receita Federal, com as SEFAZ estaduais ou com o portal oficial do SINTEGRA.</p>

    <p class="source">Dúvidas sobre os dados? <a href="/contato">Fale com a gente</a>. Veja também a
    <a href="/privacidade">Política de Privacidade</a>.</p>`;
  return contentPage(
    '/sobre-os-dados',
    'Metodologia e fonte dos dados — SINTEGRA Brasil',
    'De onde vêm os dados do SINTEGRA Brasil: base cadastral da Receita Federal (Dados Abertos) e Inscrição Estadual via CNPJ.ws. Como são atualizados, cobertura e limites.',
    'Metodologia e fonte dos dados',
    inner,
    'Metodologia'
  );
}

// --- Painel de métricas (analytics de primeira mão) ---
function renderStats(rows, daily, total, geo) {
  const LBL = {
    consulta_web: 'Consultas no site (home)',
    consulta_api: 'Consultas via API',
    consulta_widget: 'Consultas via widget/incorporado',
    busca_api: 'Buscas de empresas',
    mapa: 'Mapa de calor',
    pagina_cnpj: 'Páginas de empresa (/cnpj)',
    pagina_nfe: 'Página NF-e / DANFE',
    pagina_agente: 'Página do agente',
    pagina_busca: 'Página de busca',
    widget_load: 'Widget carregado',
  };
  const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
  const tr = (rows || []).map((r) =>
    `<tr><td>${escapeHtml(LBL[r.metrica] || r.metrica)}</td><td class="r">${fmt(r.hoje)}</td><td class="r">${fmt(r.d7)}</td><td class="r">${fmt(r.d30)}</td><td class="r"><strong>${fmt(r.total)}</strong></td></tr>`
  ).join('');
  const dtr = (daily || []).map((d) => `<tr><td>${escapeHtml(d.dia)}</td><td class="r">${fmt(d.total)}</td></tr>`).join('');
  const g = geo || { uniq: {}, cidades: [], ufs: [] };
  const cidTr = (g.cidades || []).map((c) => `<tr><td>${escapeHtml(c.cidade)}</td><td>${escapeHtml(c.uf)}</td><td class="r">${fmt(c.n)}</td></tr>`).join('');
  const ufTr = (g.ufs || []).map((u) => `<tr><td>${escapeHtml(u.uf)}</td><td class="r">${fmt(u.n)}</td></tr>`).join('');
  const geoHtml = `
<h2>Usuários únicos (localização aproximada por IP)</h2>
<p class="muted">IP pseudonimizado por hash — o IP puro não é armazenado. Hoje: <strong>${fmt(g.uniq.hoje)}</strong> · 7 dias: <strong>${fmt(g.uniq.d7)}</strong> · 30 dias: <strong>${fmt(g.uniq.d30)}</strong> · total: <strong>${fmt(g.uniq.total)}</strong>.</p>
<div style="display:flex;gap:24px;flex-wrap:wrap">
  <div style="flex:2;min-width:280px">
    <h3>Top cidades (30 dias)</h3>
    <table class="st-table"><thead><tr><th>Cidade</th><th>UF</th><th class="r">Usuários</th></tr></thead>
    <tbody>${cidTr || '<tr><td colspan="3">Ainda sem dados.</td></tr>'}</tbody></table>
  </div>
  <div style="flex:1;min-width:200px">
    <h3>Por estado (30 dias)</h3>
    <table class="st-table"><thead><tr><th>UF</th><th class="r">Usuários</th></tr></thead>
    <tbody>${ufTr || '<tr><td colspan="2">—</td></tr>'}</tbody></table>
  </div>
</div>`;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Métricas de uso — SINTEGRA Brasil</title><link rel="stylesheet" href="/style.css">
<style>.st-table{width:100%;border-collapse:collapse;margin:10px 0 24px}.st-table th,.st-table td{border:1px solid #e4e8ee;padding:8px 10px;font-size:14px;text-align:left}.st-table th{background:#eef2f7;color:#0a3d62}.st-table .r{text-align:right}</style>
</head><body><main class="container" style="padding:24px 16px">
<h1>📊 Métricas de uso</h1>
<p class="muted">Analytics de primeira mão (independente do Google Analytics). Total acumulado de consultas: <strong>${fmt(total)}</strong>.</p>
<h2>Por origem</h2>
<table class="st-table"><thead><tr><th>Métrica</th><th class="r">Hoje</th><th class="r">7 dias</th><th class="r">30 dias</th><th class="r">Total</th></tr></thead>
<tbody>${tr || '<tr><td colspan="5">Ainda sem dados coletados.</td></tr>'}</tbody></table>
${geoHtml}
<h2>Últimos 14 dias (todos os eventos)</h2>
<table class="st-table"><thead><tr><th>Dia</th><th class="r">Eventos</th></tr></thead>
<tbody>${dtr || '<tr><td colspan="2">—</td></tr>'}</tbody></table>
<p class="muted">Para proteger esta página, defina a variável de ambiente <code>STATS_KEY</code> e acesse <code>/stats?k=SUA_CHAVE</code>.</p>
</main></body></html>`;
}

// --- Documentação da API pública ---
function renderApiDocs() {
  const ex = `${SITE_URL}/api/v1/cnpj/00000000000191`;
  const respExemplo = `{
  "cnpj": "00000000000191",
  "razao_social": "BANCO DO BRASIL SA",
  "nome_fantasia": "DIRECAO GERAL",
  "situacao_cadastral": "Ativa",
  "uf": "DF",
  "municipio": "Brasília",
  "inscricoes_estaduais": [
    { "inscricao_estadual": "0809427800174", "ativo": true, "uf": "DF", "atualizado_em": "10/10/2025" }
  ],
  "endereco": { "logradouro": "...", "bairro": "...", "municipio": "Brasília", "uf": "DF", "cep": "70040-912" },
  "atividade_principal": { "codigo": "6422-1/00", "descricao": "Bancos múltiplos, com carteira comercial" }
}`;
  const curl = `curl "${ex}"`;
  const js = `fetch("${ex}")
  .then(r => r.json())
  .then(data => console.log(data.inscricoes_estaduais));`;
  const inner = `
    <p>API pública e gratuita para consultar a <strong>Inscrição Estadual (IE)</strong> e dados cadastrais
    públicos de empresas a partir do <strong>CNPJ</strong>.</p>

    <h2>Endpoint</h2>
    <pre class="codeblock">GET ${SITE_URL}/api/v1/cnpj/{cnpj}</pre>
    <p>O <code>{cnpj}</code> pode ter 14 dígitos (com ou sem pontuação). Resposta em <strong>JSON</strong>.</p>

    <h2>Exemplo (cURL)</h2>
    <pre class="codeblock">${escapeHtml(curl)}</pre>
    <h2>Exemplo (JavaScript)</h2>
    <pre class="codeblock">${escapeHtml(js)}</pre>

    <h2>Resposta (exemplo)</h2>
    <pre class="codeblock">${escapeHtml(respExemplo)}</pre>

    <h2>Características</h2>
    <ul>
      <li><strong>Autenticação:</strong> não é necessária (uso gratuito).</li>
      <li><strong>CORS:</strong> habilitado (<code>Access-Control-Allow-Origin: *</code>) — pode chamar do navegador.</li>
      <li><strong>Limite de uso:</strong> até 30 requisições por minuto por IP. Consultas já feitas são servidas de cache (mais rápido); CNPJs novos dependem da fonte de dados.</li>
      <li><strong>Privacidade:</strong> a API pública <strong>não</strong> retorna o quadro de sócios (QSA).</li>
    </ul>

    <h2>Códigos de resposta</h2>
    <ul>
      <li><code>200</code> — sucesso (JSON com os dados)</li>
      <li><code>400</code> — CNPJ inválido</li>
      <li><code>404</code> — CNPJ não encontrado</li>
      <li><code>429</code> — limite de requisições excedido</li>
    </ul>

    <p class="source">Dados públicos com caráter informativo. Ao usar a API, você concorda com os
    <a href="/termos">Termos de Uso</a>. Pedimos, quando possível, atribuição com link para
    <a href="${SITE_URL}">sintegrabrasil.com.br</a>.</p>`;
  return contentPage(
    '/api',
    'API de consulta de Inscrição Estadual por CNPJ — SINTEGRA Brasil',
    'API pública e gratuita para consultar a Inscrição Estadual (IE) e dados de empresas por CNPJ. JSON, CORS habilitado.',
    'API pública de consulta por CNPJ',
    inner,
    'API'
  );
}

module.exports = {
  SITE_URL,
  UFS,
  UF_INFO,
  GUIDES,
  CAPITAIS,
  ATIVIDADES,
  renderBusca,
  renderNfe,
  renderAgente,
  renderMetodologia,
  renderStats,
  renderCookies,
  renderApiDocs,
  maskCnpj,
  renderStatePage,
  renderCnpjPage,
  renderGuidesIndex,
  renderGuide,
  renderConsultas,
  renderCidade,
  renderAtividadesIndex,
  renderAtividade,
  renderSobre,
  renderContato,
  renderPrivacidade,
  renderTermos,
  renderLgpd,
  renderValidador,
  renderWidget,
  renderEmbed,
  buildSitemapXml,
  buildSitemapIndex,
  buildLlmsTxt,
};
