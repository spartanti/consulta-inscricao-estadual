'use strict';

/**
 * Cliente do web service NFeDistribuicaoDFe (Ambiente Nacional).
 *
 * Autenticação: TLS mútuo (mTLS) com o certificado A1 do próprio cliente.
 * A consulta por chave (consChNFe) NÃO exige assinatura XML — a autenticação
 * é o certificado no canal TLS. A chave privada nunca sai da máquina.
 *
 * Só retorna o XML COMPLETO (procNFe) de notas em que o CNPJ do certificado
 * é parte interessada (normalmente o destinatário). Caso contrário, a SEFAZ
 * devolve apenas o resumo (resNFe).
 */

const https = require('https');
const zlib = require('zlib');
const forge = require('node-forge');

// Ambiente Nacional (AN) — Distribuição DF-e
const ENDPOINTS = {
  '1': 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx', // produção
  '2': 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx', // homologação
};
const SOAP_ACTION = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse';

/** Extrai o CNPJ (14 dígitos) do titular a partir do certificado A1 (.pfx). */
function lerCnpjDoPfx(pfxBuffer, senha) {
  const der = forge.util.createBuffer(pfxBuffer.toString('binary'));
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  let cnpj = null;
  p12.safeContents.forEach((sc) => {
    sc.safeBags.forEach((bag) => {
      if (!bag.cert) return;
      // e-CNPJ: CN costuma vir "EMPRESA LTDA:12345678000199"
      const cn = bag.cert.subject.getField('CN');
      if (cn && /:(\d{14})/.test(cn.value)) cnpj = cn.value.match(/:(\d{14})/)[1];
      // fallback: procura em subjectAltName / serialNumber
      if (!cnpj) {
        const sn = bag.cert.subject.getField('serialNumber');
        if (sn && /(\d{14})/.test(sn.value)) cnpj = sn.value.match(/(\d{14})/)[1];
      }
    });
  });
  return cnpj;
}

function montarSoap(tpAmb, cUFAutor, cnpj, chNFe) {
  const dist =
    `<distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<cUFAutor>${cUFAutor}</cUFAutor>` +
    `<CNPJ>${cnpj}</CNPJ>` +
    `<consChNFe><chNFe>${chNFe}</chNFe></consChNFe>` +
    `</distDFeInt>`;
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body>` +
    `<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">` +
    `<nfeDadosMsg>${dist}</nfeDadosMsg>` +
    `</nfeDistDFeInteresse>` +
    `</soap12:Body></soap12:Envelope>`
  );
}

function httpsPost(endpoint, body, pfxBuffer, senha) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const req = https.request(
      {
        host: url.host,
        path: url.pathname,
        method: 'POST',
        pfx: pfxBuffer,
        passphrase: senha,
        minVersion: 'TLSv1.2',
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8',
          'SOAPAction': SOAP_ACTION,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Tempo esgotado ao contatar a SEFAZ.')); });
    req.write(body);
    req.end();
  });
}

/** Extrai um valor de tag simples do XML (primeira ocorrência). */
function tag(xml, name) {
  const m = xml.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>'));
  return m ? m[1].trim() : '';
}

/** Descompacta cada <docZip> (base64 + gzip) para o XML original. */
function extrairDocs(xml) {
  const docs = [];
  const re = /<docZip[^>]*NSU="([^"]*)"[^>]*schema="([^"]*)"[^>]*>([\s\S]*?)<\/docZip>/g;
  let m;
  while ((m = re.exec(xml))) {
    try {
      const buf = Buffer.from(m[3].trim(), 'base64');
      const conteudo = zlib.gunzipSync(buf).toString('utf8');
      docs.push({ nsu: m[1], schema: m[2], xml: conteudo });
    } catch (e) { /* ignora doc corrompido */ }
  }
  return docs;
}

/**
 * Baixa a NF-e pela chave usando o certificado A1.
 * @returns {Promise<{ok, cStat, motivo, cnpj, procNFe|null, resumoApenas}>}
 */
async function baixarPorChave({ pfxBuffer, senha, chave, tpAmb, cUFAutor }) {
  chave = String(chave || '').replace(/\D/g, '');
  if (chave.length !== 44) throw new Error('Chave de acesso inválida (precisa de 44 dígitos).');
  tpAmb = String(tpAmb || '1');

  const cnpj = lerCnpjDoPfx(pfxBuffer, senha);
  if (!cnpj) throw new Error('Não foi possível ler o CNPJ do certificado (verifique a senha e se é um e-CNPJ A1).');

  const cUF = String(cUFAutor || chave.substr(0, 2)); // padrão: UF da própria nota
  const soap = montarSoap(tpAmb, cUF, cnpj, chave);
  const resp = await httpsPost(ENDPOINTS[tpAmb], soap, pfxBuffer, senha);

  const cStat = tag(resp.body, 'cStat');
  const motivo = tag(resp.body, 'xMotivo');
  const docs = extrairDocs(resp.body);
  const proc = docs.find((d) => /procNFe|nfeProc/i.test(d.schema) || /<nfeProc|<NFe[ >]/.test(d.xml));

  return {
    ok: !!proc,
    cStat,
    motivo,
    cnpj,
    procNFe: proc ? proc.xml : null,
    resumoApenas: !proc && docs.length > 0, // achou resumo (resNFe) mas não o XML completo
    httpStatus: resp.status,
  };
}

module.exports = { baixarPorChave, lerCnpjDoPfx };
