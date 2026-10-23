// Conocimiento del Banco de Problemas para el tutor: se construye UNA vez al arrancar la función
// (enunciado, solución con esquema de puntuación, imágenes y puntos máximos) y queda en memoria.
import { leer, evalDatos } from './kb.js';

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&hellip;': '…', '&rarr;': '→', '&larr;': '←', '&harr;': '↔', '&rlarr;': '⇄', '&minus;': '−', '&times;': '×', '&middot;': '·', '&deg;': '°', '&plusmn;': '±', '&le;': '≤', '&ge;': '≥', '&ne;': '≠', '&asymp;': '≈', '&Delta;': 'Δ', '&delta;': 'δ', '&alpha;': 'α', '&beta;': 'β', '&gamma;': 'γ', '&lambda;': 'λ', '&mu;': 'μ', '&nu;': 'ν', '&pi;': 'π', '&sigma;': 'σ', '&omega;': 'ω', '&theta;': 'θ', '&epsilon;': 'ε', '&rArr;': '⇒', '&lArr;': '⇐', '&ndash;': '–', '&mdash;': '—', '&lsquo;': '‘', '&rsquo;': '’', '&ldquo;': '“', '&rdquo;': '”', '&laquo;': '«', '&raquo;': '»', '&Aring;': 'Å', '&sup2;': '²', '&sup3;': '³' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋' };
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻' };
const conv = (t, m) => String(t).split('').map((c) => m[c] || c).join('');

export function htmlATexto(h) {
  return String(h || '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '[diagrama]')
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '[imagen: $1]')
    .replace(/<[^>]*data-mol="([^"]+)"[^>]*>\s*<\/[a-z]+>/gi, '[estructura: $1]')
    .replace(/<[^>]*data-scheme="([^"]+)"[^>]*>/gi, '[esquema de síntesis: $1]')
    .replace(/<[^>]*data-diagram="([^"]+)"[^>]*>/gi, '[diagrama: $1]')
    .replace(/<sub>([\s\S]*?)<\/sub>/gi, (_, x) => conv(x.replace(/<[^>]+>/g, ''), SUB))
    .replace(/<sup>([\s\S]*?)<\/sup>/gi, (_, x) => conv(x.replace(/<[^>]+>/g, ''), SUP))
    .replace(/<span class="pc-marks">([\s\S]*?)<\/span>/gi, ' «$1» ')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<\/(p|div|li|tr|h[1-6]|ul|ol|table|section|article)>|<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&[a-zA-Z0-9]+;/g, (e) => ENT[e] || e)
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

let _cache = null;
function cargar() {
  if (_cache) return _cache;
  const cont = evalDatos(leer('Problem_Data/problemas_contenido.html'), ['contenidoProblemas']).contenidoProblemas || {};
  const meta = evalDatos(leer('Problem_Data/problemas_data.html'), ['datosProblemas']).datosProblemas || [];
  const gal = evalDatos(leer('Problem_Data/imagenes.html'), ['imagenesProblemas']).imagenesProblemas || {};
  const metaPor = {}; (Array.isArray(meta) ? meta : Object.values(meta)).forEach((m) => { metaPor[m.id] = m; });
  _cache = { cont, metaPor, gal };
  return _cache;
}

export function listaProblemas() { return Object.keys(cargar().cont); }

export function datosProblema(id) {
  const { cont, metaPor, gal } = cargar();
  const c = cont[id];
  if (!c) return null;
  const resp = String(c.respuesta || '');
  // puntos máximos: suma de los «N punto(s)» de las etiquetas pc-marks de la solución
  let max = 0;
  (resp.match(/<span class="pc-marks">[\s\S]*?<\/span>/gi) || []).forEach((s) => { const n = parseFloat((s.replace(/<[^>]+>/g, '').match(/[\d.,]+/) || ['0'])[0].replace(',', '.')); if (n) max += n; });
  if (!max) { const t = resp.replace(/<[^>]+>/g, ' ').match(/Total:?\s*(\d+)\s*punto/i); if (t) max = +t[1]; }
  const imgs = [];
  (String(c.enunciado || '').match(/<img[^>]*src="([^"]+)"/gi) || []).forEach((t) => { const u = (t.match(/src="([^"]+)"/) || [])[1]; if (u && /^https:\/\//.test(u)) imgs.push(u); });
  (String(c.enunciado || '').match(/data-gallery="([^"]+)"/g) || []).forEach((t) => { const k = t.match(/"([^"]+)"/)[1]; (gal[k] || []).forEach((g) => g.url && imgs.push(g.url)); });
  const solTxt = htmlATexto(resp);
  // baremo oficial: «(c)(i) «1 punto»» → [{id:'(c)(i)', max:1}]
  const baremo = [];
  solTxt.split('\n').forEach((ln) => {
    const m = ln.match(/^\s*((?:\([a-z0-9]+\))+)\s*«\s*([\d.,]+)\s*punt/i);
    if (m) baremo.push({ id: m[1], max: parseFloat(m[2].replace(',', '.')) });
  });
  const m = metaPor[id] || {};
  return {
    id, titulo: c.titulo, numero: c.numero, fuente: c.fuente, dificultad: m.dificultad,
    enunciado: htmlATexto(c.enunciado), solucion: solTxt, maxPuntos: max || null, baremo,
    imagenes: [...new Set(imgs)].slice(0, 4),
  };
}
