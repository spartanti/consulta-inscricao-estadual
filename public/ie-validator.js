/* Validador de Inscrição Estadual (IE) por estado.
 * Regras padrão de dígito verificador. Uso informativo — para fins
 * oficiais, confirme no SINTEGRA da SEFAZ do estado.
 *
 * Expõe window.validarIE(uf, ie) => { valido: boolean, motivo: string }.
 */
(function () {
  'use strict';

  function d(v) { return String(v || '').replace(/\D/g, ''); }

  // Soma ponderada com pesos (da esquerda p/ direita).
  function somaPesos(num, pesos) {
    let s = 0;
    for (let i = 0; i < pesos.length; i++) s += parseInt(num[i], 10) * pesos[i];
    return s;
  }

  // DV por módulo 11 (resto): retorna dígito (11/10 -> 0, salvo regra própria).
  function dvMod11(num, pesos) {
    const resto = somaPesos(num, pesos) % 11;
    const dv = 11 - resto;
    return dv >= 10 ? 0 : dv;
  }

  const V = {
    AC: function (ie) {
      if (ie.length !== 13 || ie.slice(0, 2) !== '01') return false;
      const p1 = [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let r = somaPesos(ie.slice(0, 11), p1) % 11;
      let d1 = 11 - r; d1 = d1 >= 10 ? 0 : d1;
      if (d1 !== +ie[11]) return false;
      const p2 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      r = somaPesos(ie.slice(0, 12), p2) % 11;
      let d2 = 11 - r; d2 = d2 >= 10 ? 0 : d2;
      return d2 === +ie[12];
    },
    AL: function (ie) {
      if (ie.length !== 9 || ie.slice(0, 2) !== '24') return false;
      const p = [9, 8, 7, 6, 5, 4, 3, 2];
      let dv = (somaPesos(ie.slice(0, 8), p) * 10) % 11;
      if (dv === 10) dv = 0;
      return dv === +ie[8];
    },
    AP: function (ie) {
      if (ie.length !== 9 || ie.slice(0, 2) !== '03') return false;
      const p = [9, 8, 7, 6, 5, 4, 3, 2];
      let d1, p2 = 0;
      const n = parseInt(ie.slice(0, 8), 10);
      if (n >= 3000001 && n <= 3017000) { d1 = 5; p2 = 0; }
      else if (n >= 3017001 && n <= 3019022) { d1 = 9; p2 = 1; }
      else { d1 = 0; p2 = 0; }
      let dv = 11 - ((somaPesos(ie.slice(0, 8), p) + d1) % 11);
      if (dv === 10) dv = 0; else if (dv === 11) dv = p2;
      return dv === +ie[8];
    },
    AM: function (ie) {
      if (ie.length !== 9) return false;
      const p = [9, 8, 7, 6, 5, 4, 3, 2];
      const soma = somaPesos(ie.slice(0, 8), p);
      let dv;
      if (soma < 11) dv = 11 - soma;
      else { const r = soma % 11; dv = r <= 1 ? 0 : 11 - r; }
      return dv === +ie[8];
    },
    BA: function (ie) {
      if (ie.length !== 8 && ie.length !== 9) return false;
      const base = ie.length === 9 ? ie.slice(0, 7) : ie.slice(0, 6);
      const primeiro = ie.length === 9 ? +ie[1] : +ie[0];
      const modulo = [0, 1, 2, 3, 4, 5, 8].indexOf(primeiro) >= 0 ? 10 : 11;
      const calc = (str, pesos, mod) => {
        const r = somaPesos(str, pesos) % mod;
        if (mod === 10) return r === 0 ? 0 : mod - r;
        return r <= 1 ? 0 : mod - r;
      };
      if (ie.length === 9) {
        const d2 = calc(ie.slice(0, 7), [8, 7, 6, 5, 4, 3, 2], modulo);
        if (d2 !== +ie[8]) return false;
        const d1 = calc(ie.slice(0, 7) + ie[8], [9, 8, 7, 6, 5, 4, 3, 2], modulo);
        return d1 === +ie[7];
      } else {
        const d2 = calc(ie.slice(0, 6), [7, 6, 5, 4, 3, 2], modulo);
        if (d2 !== +ie[7]) return false;
        const d1 = calc(ie.slice(0, 6) + ie[7], [8, 7, 6, 5, 4, 3, 2], modulo);
        return d1 === +ie[6];
      }
    },
    CE: function (ie) {
      if (ie.length !== 9) return false;
      let dv = dvMod11(ie.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]);
      return dv === +ie[8];
    },
    DF: function (ie) {
      if (ie.length !== 13 || ie.slice(0, 2) !== '07') return false;
      const p1 = [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let r = somaPesos(ie.slice(0, 11), p1) % 11;
      let d1 = 11 - r; d1 = d1 >= 10 ? 0 : d1;
      if (d1 !== +ie[11]) return false;
      const p2 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      r = somaPesos(ie.slice(0, 12), p2) % 11;
      let d2 = 11 - r; d2 = d2 >= 10 ? 0 : d2;
      return d2 === +ie[12];
    },
    ES: function (ie) {
      if (ie.length !== 9) return false;
      const r = somaPesos(ie.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]) % 11;
      let dv = r < 2 ? 0 : 11 - r;
      return dv === +ie[8];
    },
    GO: function (ie) {
      if (ie.length !== 9) return false;
      if (['10', '11', '15'].indexOf(ie.slice(0, 2)) < 0) return false;
      const r = somaPesos(ie.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]) % 11;
      const n = parseInt(ie.slice(0, 8), 10);
      let dv;
      if (r === 0) dv = 0;
      else if (r === 1) dv = (n >= 10103105 && n <= 10119997) ? 1 : 0;
      else dv = 11 - r;
      return dv === +ie[8];
    },
    MA: function (ie) {
      if (ie.length !== 9 || ie.slice(0, 2) !== '12') return false;
      let dv = dvMod11(ie.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]);
      return dv === +ie[8];
    },
    MT: function (ie) {
      if (ie.length !== 11) return false;
      const r = somaPesos(ie.slice(0, 10), [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) % 11;
      let dv = r <= 1 ? 0 : 11 - r;
      return dv === +ie[10];
    },
    MS: function (ie) {
      if (ie.length !== 9 || ie.slice(0, 2) !== '28') return false;
      const r = somaPesos(ie.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]) % 11;
      let dv = r === 0 ? 0 : (11 - r > 9 ? 0 : 11 - r);
      return dv === +ie[8];
    },
    MG: function (ie) {
      if (ie.length !== 13) return false;
      // 1o DV (módulo 10) com inserção do "0" após os 3 primeiros
      let str = ie.slice(0, 3) + '0' + ie.slice(3, 11);
      let soma = 0;
      for (let i = 0; i < str.length; i++) {
        let prod = parseInt(str[i], 10) * (i % 2 === 0 ? 1 : 2);
        if (prod > 9) prod = Math.floor(prod / 10) + (prod % 10);
        soma += prod;
      }
      let d1 = (Math.ceil(soma / 10) * 10) - soma;
      if (d1 !== +ie[11]) return false;
      const r = somaPesos(ie.slice(0, 12), [3, 2, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) % 11;
      let d2 = r <= 1 ? 0 : 11 - r;
      return d2 === +ie[12];
    },
    PA: function (ie) {
      if (ie.length !== 9 || ie.slice(0, 2) !== '15') return false;
      const r = somaPesos(ie.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]) % 11;
      let dv = r <= 1 ? 0 : 11 - r;
      return dv === +ie[8];
    },
    PB: function (ie) {
      if (ie.length !== 9) return false;
      let dv = dvMod11(ie.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]);
      return dv === +ie[8];
    },
    PR: function (ie) {
      if (ie.length !== 10) return false;
      let d1 = 11 - (somaPesos(ie.slice(0, 8), [3, 2, 7, 6, 5, 4, 3, 2]) % 11);
      if (d1 >= 10) d1 = 0;
      if (d1 !== +ie[8]) return false;
      let d2 = 11 - (somaPesos(ie.slice(0, 9), [4, 3, 2, 7, 6, 5, 4, 3, 2]) % 11);
      if (d2 >= 10) d2 = 0;
      return d2 === +ie[9];
    },
    PE: function (ie) {
      if (ie.length !== 9) return false;
      let d1 = 11 - (somaPesos(ie.slice(0, 7), [8, 7, 6, 5, 4, 3, 2]) % 11);
      if (d1 > 9) d1 -= 10;
      if (d1 !== +ie[7]) return false;
      let d2 = 11 - (somaPesos(ie.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]) % 11);
      if (d2 > 9) d2 -= 10;
      return d2 === +ie[8];
    },
    PI: function (ie) {
      if (ie.length !== 9) return false;
      let dv = dvMod11(ie.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]);
      return dv === +ie[8];
    },
    RJ: function (ie) {
      if (ie.length !== 8) return false;
      const r = somaPesos(ie.slice(0, 7), [2, 7, 6, 5, 4, 3, 2]) % 11;
      let dv = r <= 1 ? 0 : 11 - r;
      return dv === +ie[7];
    },
    RN: function (ie) {
      if (ie.length !== 9 && ie.length !== 10) return false;
      if (ie.slice(0, 2) !== '20') return false;
      const base = ie.slice(0, ie.length - 1);
      const pesos = []; for (let i = base.length + 1; i >= 2; i--) pesos.push(i);
      let dv = (somaPesos(base, pesos) * 10) % 11;
      if (dv === 10) dv = 0;
      return dv === +ie[ie.length - 1];
    },
    RS: function (ie) {
      if (ie.length !== 10) return false;
      const r = somaPesos(ie.slice(0, 9), [2, 9, 8, 7, 6, 5, 4, 3, 2]) % 11;
      let dv = 11 - r; if (dv >= 10) dv = 0;
      return dv === +ie[9];
    },
    RO: function (ie) {
      if (ie.length !== 14) return false;
      const r = somaPesos(ie.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) % 11;
      let dv = 11 - r; if (dv > 9) dv -= 10;
      return dv === +ie[13];
    },
    RR: function (ie) {
      if (ie.length !== 9 || ie.slice(0, 2) !== '24') return false;
      let s = 0;
      for (let i = 0; i < 8; i++) s += parseInt(ie[i], 10) * (i + 1);
      const dv = s % 9;
      return dv === +ie[8];
    },
    SC: function (ie) {
      if (ie.length !== 9) return false;
      const r = somaPesos(ie.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]) % 11;
      let dv = r <= 1 ? 0 : 11 - r;
      return dv === +ie[8];
    },
    SP: function (ie) {
      if (ie.length !== 12) return false;
      const p1 = [1, 3, 4, 5, 6, 7, 8, 10];
      let d1 = somaPesos(ie.slice(0, 8), p1) % 11; d1 = d1 % 10;
      if (d1 !== +ie[8]) return false;
      const p2 = [3, 2, 10, 9, 8, 7, 6, 5, 4, 3, 2];
      let d2 = somaPesos(ie.slice(0, 11), p2) % 11; d2 = d2 % 10;
      return d2 === +ie[11];
    },
    SE: function (ie) {
      if (ie.length !== 9) return false;
      let dv = 11 - (somaPesos(ie.slice(0, 8), [9, 8, 7, 6, 5, 4, 3, 2]) % 11);
      if (dv > 9) dv = 0;
      return dv === +ie[8];
    },
    TO: function (ie) {
      if (ie.length !== 9 && ie.length !== 11) return false;
      let base;
      if (ie.length === 11) {
        const t = ie.slice(2, 4);
        if (['01', '02', '03', '99'].indexOf(t) < 0) return false;
        base = ie.slice(0, 2) + ie.slice(4, 10);
      } else {
        base = ie.slice(0, 8);
      }
      const r = somaPesos(base, [9, 8, 7, 6, 5, 4, 3, 2]) % 11;
      let dv = r < 2 ? 0 : 11 - r;
      return dv === +ie[ie.length - 1];
    },
  };

  window.validarIE = function (uf, ieRaw) {
    uf = String(uf || '').toUpperCase();
    const ie = d(ieRaw);
    if (!ie) return { valido: false, motivo: 'Informe a Inscrição Estadual.' };
    if (/^ISENTO$/i.test(String(ieRaw).trim())) return { valido: true, motivo: 'Contribuinte ISENTO.' };
    if (!V[uf]) return { valido: false, motivo: 'Selecione um estado válido.' };
    try {
      return V[uf](ie)
        ? { valido: true, motivo: 'Inscrição Estadual válida para ' + uf + '.' }
        : { valido: false, motivo: 'Inscrição Estadual inválida para ' + uf + ' (dígito ou formato).' };
    } catch (e) {
      return { valido: false, motivo: 'Não foi possível validar.' };
    }
  };
})();
