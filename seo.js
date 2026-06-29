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
  const id = process.env.GA_MEASUREMENT_ID;
  if (!id) return '';
  return `
  <script async src="https://www.googletagmanager.com/gtag/js?id=${escapeHtml(id)}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${escapeHtml(id)}');
  </script>`;
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
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonical)}" />
  <meta property="og:site_name" content="SINTEGRA Brasil" />
  <meta property="og:image" content="${SITE_URL}/og-image.svg" />
  <link rel="stylesheet" href="/style.css" />
  ${bc}
  ${gaSnippet()}
</head>
<body>
  <header class="topbar">
    <div class="container">
      <a href="/" class="brand-link"><span class="badge">BR</span> <strong>SINTEGRA Brasil</strong></a>
    </div>
  </header>
  <main class="container">
    ${bodyHtml}
  </main>
  <footer class="container footer">
    <p class="footer-links">
      <a href="/">Início</a> · <a href="/guias">Guias</a> · <a href="/consultas">Consultas recentes</a>
    </p>
    ${statesNav()}
    <p class="disclaimer">
      <strong>Aviso:</strong> o SINTEGRA Brasil é um serviço <strong>independente e privado</strong>,
      sem vínculo com a Receita Federal, com as SEFAZ estaduais ou com qualquer órgão público.
    </p>
    <small>Desenvolvido por <a href="https://www.spartanti.com.br" target="_blank" rel="noopener">Spartan TI</a></small>
  </footer>
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

module.exports = {
  SITE_URL,
  UFS,
  UF_INFO,
  GUIDES,
  maskCnpj,
  renderStatePage,
  renderCnpjPage,
  renderGuidesIndex,
  renderGuide,
  renderConsultas,
  buildSitemapXml,
};
