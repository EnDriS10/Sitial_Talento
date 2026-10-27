// Conocimiento del Banco de Problemas para el tutor: se construye UNA vez al arrancar la función
// (enunciado, solución con esquema de puntuación, imágenes y puntos máximos) y queda en memoria.
import { leer, evalDatos } from './kb.js';
import { Espacio, coseno } from './vectores.js';
import { esquemaATexto, molATexto, dslATexto, legible } from './esquemas.js';

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&hellip;': '…', '&rarr;': '→', '&larr;': '←', '&harr;': '↔', '&rlarr;': '⇄', '&minus;': '−', '&times;': '×', '&middot;': '·', '&deg;': '°', '&plusmn;': '±', '&le;': '≤', '&ge;': '≥', '&ne;': '≠', '&asymp;': '≈', '&Delta;': 'Δ', '&delta;': 'δ', '&alpha;': 'α', '&beta;': 'β', '&gamma;': 'γ', '&lambda;': 'λ', '&mu;': 'μ', '&nu;': 'ν', '&pi;': 'π', '&sigma;': 'σ', '&omega;': 'ω', '&theta;': 'θ', '&epsilon;': 'ε', '&rArr;': '⇒', '&lArr;': '⇐', '&ndash;': '–', '&mdash;': '—', '&lsquo;': '‘', '&rsquo;': '’', '&ldquo;': '“', '&rdquo;': '”', '&laquo;': '«', '&raquo;': '»', '&Aring;': 'Å', '&sup2;': '²', '&sup3;': '³' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋' };
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻' };
const conv = (t, m) => String(t).split('').map((c) => m[c] || c).join('');

export function htmlATexto(h) {
  return String(h || '')
    .replace(/<svg[^>]*pc-sqrt-sign[\s\S]*?<\/svg>/gi, '√')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '[diagrama]')
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '[imagen: $1]')
    .replace(/<[^>]*data-mol="([^"]+)"[^>]*>\s*<\/[a-z]+>/gi, (_, x) => molATexto(x))
    .replace(/<[^>]*data-scheme="([^"]+)"[^>]*>/gi, (_, x) => esquemaATexto(x))
    .replace(/<[^>]*data-smiles="([^"]+)"[^>]*>\s*<\/[a-z]+>/gi, (_, x) => '[estructura SMILES: ' + legible(x) + ']')
    .replace(/<div class="pc-free-host" data-esquema="([^"]*)"[^>]*>\s*<\/div>/gi, (_, x) => '\n[ESQUEMA — compuestos y flechas:\n' + dslATexto(x.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')) + '\n]\n')
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
  // problema de práctica sin «N puntos»: baremo por defecto (4 por inciso del enunciado) para poder calificar
  let baremoDefecto = false;
  if (!baremo.length) {
    const enTxt = htmlATexto(c.enunciado);
    const vistos = new Set();
    enTxt.split('\n').forEach((ln) => {
      const mm = ln.match(/^\s*((?:\([a-z0-9]+\))+)\s*$/i);
      if (mm && !vistos.has(mm[1])) { vistos.add(mm[1]); baremo.push({ id: mm[1], max: 4 }); }
    });
    if (baremo.length) { baremoDefecto = true; max = baremo.reduce((a, x) => a + x.max, 0); }
  }
  const m = metaPor[id] || {};
  return {
    id, titulo: c.titulo, numero: c.numero, fuente: c.fuente, dificultad: m.dificultad,
    enunciado: htmlATexto(c.enunciado), solucion: solTxt, maxPuntos: max || null, baremo, baremoDefecto,
    imagenes: [...new Set(imgs)].slice(0, 4),
    temas: [m.temas, m.temaEspecifico].flat().filter(Boolean).join(', '),
  };
}

// ── Campo vectorial del problema ─────────────────────────────────────
// Cada problema se trocea por incisos (enunciado y solución). Una pregunta (o un texto seleccionado)
// se proyecta sobre esos trozos para saber a QUÉ inciso apunta y qué parte de la solución importa.
let _esp = null;
const _trozos = new Map();
function trocear(texto, fuente) {
  const out = []; let id = 'general', buf = [];
  const cierra = () => { const t = buf.join('\n').trim(); if (t) out.push({ fuente, id, texto: t.slice(0, 1800) }); buf = []; };
  String(texto).split('\n').forEach((ln) => {
    const m = ln.match(/^\s*((?:\([a-z0-9]+\))+)\s*(?:«[^»]*»)?\s*$/i) || ln.match(/^\s*((?:\([a-z0-9]+\))+)\s*«/i);
    if (m) { cierra(); id = m[1]; buf.push(ln); } else buf.push(ln);
  });
  cierra();
  return out;
}
function trozosDe(id) {
  if (_trozos.has(id)) return _trozos.get(id);
  const d = datosProblema(id);
  const t = d ? [...trocear(d.enunciado, 'enunciado'), ...trocear(d.solucion, 'solucion')] : [];
  if (!_esp) {
    const todos = listaProblemas().flatMap((k) => { const x = datosProblema(k); return x ? [x.enunciado, x.solucion] : []; });
    _esp = new Espacio(todos.flatMap((tx) => tx.split(/\n{2,}/)));
  }
  t.forEach((x) => { x.v = _esp.vec(x.id + ' ' + x.texto); });
  _trozos.set(id, t);
  return t;
}
// → { incisos:[{id, peso}], trozos:[{fuente,id,texto,sim}] } ordenado por cercanía a la pregunta
export function enfoqueProblema(id, consulta, k = 3) {
  const t = trozosDe(id);
  if (!t.length || !String(consulta || '').trim()) return { incisos: [], trozos: [] };
  const qv = _esp.vec(consulta);
  const sc = t.map((x) => ({ ...x, sim: coseno(qv, x.v) })).sort((a, b) => b.sim - a.sim);
  const max = sc[0].sim || 1;
  const por = new Map();
  sc.slice(0, 6).forEach((x) => { if (x.id !== 'general') por.set(x.id, (por.get(x.id) || 0) + Math.max(0, x.sim) / max); });
  const tot = [...por.values()].reduce((a, b) => a + b, 0) || 1;
  return { incisos: [...por].map(([i, w]) => ({ id: i, peso: w / tot })).sort((a, b) => b.peso - a.peso).slice(0, 2), trozos: sc.slice(0, k).map(({ v, ...r }) => r) };
}
