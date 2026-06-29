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
  return '<script src="/consent.js?v=1" defer></script>';
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
  <link rel="stylesheet" href="/style.css?v=4" />
  ${bc}
  ${gaSnippet()}
</head>
<body>
  <header class="topbar">
    <div class="container">
      <a href="/" class="brand-home">
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
      <a href="/validar-inscricao-estadual">Validar IE</a> ·
      <a href="/guias">Guias</a> · <a href="/atividades">Atividades</a> ·
      <a href="/incorporar">Incorporar</a> · <a href="/api">API</a><br />
      <a href="/sobre">Sobre</a> · <a href="/contato">Contato</a> ·
      <a href="/privacidade">Privacidade</a> · <a href="/termos">Termos</a>
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
    </article>`;

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
    ? `<ul class="ie-ssr">${ies
        .map(
          (ie) =>
            `<li><span class="ie-num">${escapeHtml(ie.inscricao_estadual)}</span>
             <span class="ie-uf-badge">${escapeHtml(ie.uf || '—')}</span>
             <span class="tag ${ie.ativo ? 'on' : 'off'}">${ie.ativo ? 'Ativa' : 'Baixada/Inativa'}</span></li>`
        )
        .join('')}</ul>`
    : '<p class="ie-none">Nenhuma Inscrição Estadual encontrada para este CNPJ.</p>';

  const row = (dt, dd) => (dd ? `<div><dt>${dt}</dt><dd>${escapeHtml(dd)}</dd></div>` : '');
  const end = data.endereco || {};
  const enderecoStr = [end.logradouro, end.bairro, [end.municipio, end.uf].filter(Boolean).join(' / '), end.cep]
    .filter(Boolean)
    .join(', ');

  const bodyHtml = `
    <article class="card">
      <h1>${escapeHtml(razao)}</h1>
      <p class="muted">CNPJ ${escapeHtml(masked)}${data.nome_fantasia ? ' · ' + escapeHtml(data.nome_fantasia) : ''}</p>

      <h2 class="sec-title">Inscrição Estadual</h2>
      ${ieHtml}

      <h2 class="sec-title">Dados da empresa</h2>
      <dl class="details">
        ${row('Situação cadastral', data.situacao_cadastral)}
        ${row('Natureza jurídica', data.natureza_juridica)}
        ${row('Porte', data.porte)}
        ${row('Início de atividade', data.data_inicio_atividade)}
        ${row('Endereço', enderecoStr)}
        ${data.atividade_principal ? row('Atividade principal', data.atividade_principal.codigo + ' - ' + data.atividade_principal.descricao) : ''}
      </dl>

      <h2 class="sec-title">Consultar outro CNPJ</h2>
      ${searchForm()}
      <p class="source">Dados públicos com caráter informativo. Para fins oficiais, confirme no SINTEGRA da SEFAZ do estado.</p>
    </article>`;

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
    `<p>Veja orientações sobre Inscrição Estadual conforme a atividade da empresa:</p><ul class="guides-list">${items}</ul>`
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
    <a href="/guias">guias sobre Inscrição Estadual</a>.</p>`;
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
      <li><strong>Site:</strong> <a href="https://www.spartanti.com.br" target="_blank" rel="noopener">www.spartanti.com.br</a></li>
    </ul>
    <p>Para solicitar a remoção ou correção de dados, ou tirar dúvidas sobre privacidade, utilize os canais
    da Spartan TI. Veja também nossa <a href="/privacidade">Política de Privacidade</a>.</p>`;
  return contentPage('/contato', 'Contato — SINTEGRA Brasil', 'Entre em contato com o SINTEGRA Brasil (Spartan TI).', 'Contato', inner, 'Contato');
}

function renderPrivacidade() {
  const inner = `
    <p class="muted">Última atualização: 29/06/2026 · Em conformidade com a Lei nº 13.709/2018 (LGPD).</p>
    <p>Esta Política de Privacidade explica como o <strong>SINTEGRA Brasil</strong> coleta, usa, compartilha e
    protege informações, e quais são os seus direitos como titular de dados.</p>

    <h2>1. Controlador dos dados</h2>
    <p>O controlador é a <strong>Spartan TI</strong>
    (<a href="https://www.spartanti.com.br" target="_blank" rel="noopener">spartanti.com.br</a>). Para assuntos
    de privacidade e para falar com o Encarregado (DPO), use a <a href="/contato">página de Contato</a>.</p>

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
    a qualquer momento.</p>

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
    portabilidade; informação sobre compartilhamentos; e revogação do consentimento. Para exercer, use a
    <a href="/contato">página de Contato</a>.</p>

    <h2>10. Remoção de dados de empresa/sócio</h2>
    <p>Pedidos de remoção ou correção de informações exibidas podem ser feitos pela
    <a href="/contato">página de Contato</a> e serão avaliados conforme a legislação.</p>

    <h2>11. Segurança</h2>
    <p>Adotamos medidas técnicas e organizacionais razoáveis para proteger as informações tratadas.</p>

    <h2>12. Alterações</h2>
    <p>Esta política pode ser atualizada. A data no topo indica a última revisão.</p>

    <p class="muted">Este serviço é independente e não possui vínculo com a Receita Federal, SEFAZ ou órgãos públicos.</p>`;
  return contentPage('/privacidade', 'Política de Privacidade (LGPD) — SINTEGRA Brasil', 'Política de Privacidade do SINTEGRA Brasil em conformidade com a LGPD: dados tratados, bases legais, cookies, compartilhamento e direitos do titular.', 'Política de Privacidade', inner, 'Privacidade');
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

    <h2>8. Privacidade</h2>
    <p>O tratamento de dados segue a nossa <a href="/privacidade">Política de Privacidade</a>, em conformidade
    com a LGPD.</p>

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
    </script>`;
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
  renderValidador,
  renderWidget,
  renderEmbed,
  buildSitemapXml,
};
