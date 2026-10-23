// ════════════════════════════════════════════════════════════════════
// «Campo vectorial» del Sitial
// ════════════════════════════════════════════════════════════════════
// Cada fragmento de contenido (persona, equipo, olimpiada, noticia, problema…) es un VECTOR
// en un espacio; una pregunta también. Comparar vectores (coseno) dice HACIA DÓNDE apunta la
// pregunta, aunque no comparta palabras exactas con el contenido. Hay dos capas:
//
//  1) LOCAL (siempre disponible, sin API ni cuota): vectores «hash» de palabras, bigramas y
//     trigramas de letras con pesos idf. Tolera erratas y variantes («ibero» ~ «iberoamericana»).
//  2) SEMÁNTICA (opcional): embeddings reales de Gemini (gemini-embedding-001) o Mistral
//     (mistral-embed), calculados UNA vez con `node scripts/build-vectores.mjs` y guardados en
//     Data/vectores.json. En cada pregunta solo se calcula el vector de la pregunta.
//
// Con los vectores de un grupo (p. ej. todos los «equipo · OIAQ») se forma su CENTROIDE; la
// pregunta se proyecta sobre los centroides para saber la «dirección» (equipo OIAQ, noticia, …).
// ════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const D = 1024;
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const STOP = new Set(('el la los las un una unos unas de del al y o u e en a por para con sin sobre entre que se su sus es son fue fueron ser ha han he hay lo le les me mi mis tu tus te nos como mas muy pero si no ni ya este esta estos estas ese esa eso aqui alli donde cuando cual cuales quien quienes cuanto cuantos hola dime puedes puede quiero ' +
  'the of and or in on for to with is are was were be been has have do does did what which who how many much when where why this that these those it its my your can could please tell me about').split(/\s+/));

// Sinónimos/alias que acercan variantes del mismo concepto (también inglés → español)
export const ALIAS = {
  ibero: 'oiaq iberoamericana', iberoamericana: 'oiaq', iberoamericano: 'oiaq', centroamericana: 'ocacq', caribe: 'ocacq',
  mendeleev: 'imcho', mendeleiev: 'imcho', mendeleyev: 'imcho', internacional: 'icho',
  medallistas: 'medallas equipo', medallista: 'medalla equipo', ganadores: 'medallas equipo', ganador: 'medalla equipo', ganaron: 'medallas equipo',
  premiados: 'medallas equipo', delegacion: 'equipo', integrantes: 'equipo', representantes: 'equipo', participaron: 'equipo',
  winners: 'medallas equipo', medalists: 'medallas equipo', team: 'equipo', delegation: 'equipo', members: 'equipo', medals: 'medallas', medal: 'medalla',
  gold: 'oro', silver: 'plata', bronze: 'bronce', news: 'noticias', photos: 'fotos', pictures: 'fotos', teacher: 'profesor', coach: 'entrenador',
  trainer: 'entrenador', problems: 'problemas', exercises: 'problemas', exercise: 'problema', contest: 'concurso', national: 'nacional',
};

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function rasgos(texto) {
  const palabras = norm(texto).split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t) && (t.length > 1 || /\d/.test(t)));
  const ext = [];
  palabras.forEach((w) => { ext.push(w); if (ALIAS[w]) ALIAS[w].split(' ').forEach((x) => ext.push(x)); });
  const out = new Map();
  const add = (k, v) => { out.set(k, (out.get(k) || 0) + v); };
  ext.forEach((w, i) => {
    add('w:' + w, 1);
    if (i > 0) add('b:' + ext[i - 1] + '_' + w, 0.6);
    if (w.length > 3 && !/\d/.test(w)) { const p = '#' + w + '#'; for (let j = 0; j + 3 <= p.length; j++) add('t:' + p.slice(j, j + 3), 0.3); }
  });
  return out;
}

// Espacio vectorial local: aprende el idf de cada «casilla» con el corpus
export class Espacio {
  constructor(textos) {
    this.idf = new Float32Array(D).fill(1);
    const df = new Uint32Array(D);
    textos.forEach((t) => { const vis = new Set(); for (const k of rasgos(t).keys()) vis.add(fnv(k) % D); vis.forEach((b) => df[b]++); });
    const N = Math.max(1, textos.length);
    for (let i = 0; i < D; i++) this.idf[i] = Math.log(1 + (N - df[i] + 0.5) / (df[i] + 0.5));
  }
  vec(texto) {
    const v = new Float32Array(D);
    for (const [k, c] of rasgos(texto)) { const b = fnv(k) % D; v[b] += Math.log(1 + c) * this.idf[b]; }
    return normaliza(v);
  }
}
export function normaliza(v) {
  let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s) || 1; for (let i = 0; i < v.length; i++) v[i] /= s;
  return v;
}
export function coseno(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
export function centroide(vs) {
  if (!vs.length) return null;
  const c = new Float32Array(vs[0].length);
  vs.forEach((v) => { for (let i = 0; i < c.length; i++) c[i] += v[i]; });
  return normaliza(c);
}
// Pesos de «dirección»: softmax de las similitudes con cada centroide
export function direccion(qv, centroides, { temp = 30, top = 3, minPeso = 0.15 } = {}) {
  const sims = [...centroides].map(([g, c]) => [g, coseno(qv, c)]);
  if (!sims.length) return [];
  const m = Math.max(...sims.map((x) => x[1]));
  const ex = sims.map(([g, s]) => [g, Math.exp((s - m) * temp)]);
  const Z = ex.reduce((a, x) => a + x[1], 0) || 1;
  return ex.map(([g, e]) => ({ grupo: g, peso: e / Z })).sort((a, b) => b.peso - a.peso).filter((x) => x.peso >= minPeso).slice(0, top);
}

// ── Embeddings semánticos (opcional) ─────────────────────────────────
export const hashTexto = (t) => crypto.createHash('sha1').update(String(t)).digest('hex').slice(0, 10);
const f32 = (b64) => { const b = Buffer.from(b64, 'base64'); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
export const b64 = (v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64');

const EMB = {
  gemini: { env: 'GEMINI_API_KEY', modelo: 'gemini-embedding-001', dim: 256 },
  mistral: { env: 'MISTRAL_API_KEY', modelo: 'mistral-embed', dim: 1024 },
};
async function post(url, body, headers, ms = 3000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 120));
    return await r.json();
  } finally { clearTimeout(t); }
}
// textos → Float32Array[] normalizados. tipo: 'doc' | 'query'
export async function embeber(proveedor, textos, tipo = 'doc', ms = 3000) {
  const cfg = EMB[proveedor]; const key = process.env[cfg.env];
  if (!key) throw new Error('sin clave ' + proveedor);
  if (proveedor === 'gemini') {
    const base = process.env.EMBED_BASE_GEMINI || 'https://generativelanguage.googleapis.com/v1beta';
    const reqs = textos.map((t) => ({ model: 'models/' + cfg.modelo, content: { parts: [{ text: String(t).slice(0, 6000) }] }, taskType: tipo === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT', outputDimensionality: cfg.dim }));
    const j = await post(`${base}/models/${cfg.modelo}:batchEmbedContents`, { requests: reqs }, { 'x-goog-api-key': key }, ms);
    return j.embeddings.map((e) => normaliza(Float32Array.from(e.values)));
  }
  const base = process.env.EMBED_BASE_MISTRAL || 'https://api.mistral.ai/v1';
  const j = await post(`${base}/embeddings`, { model: cfg.modelo, input: textos.map((t) => String(t).slice(0, 6000)) }, { Authorization: 'Bearer ' + key }, ms);
  return j.data.map((e) => normaliza(Float32Array.from(e.embedding)));
}
export const proveedorEmb = (pref) => [pref, 'gemini', 'mistral'].filter(Boolean).find((p) => EMB[p] && process.env[EMB[p].env]);

// Carga Data/vectores.json (generado por scripts/build-vectores.mjs): {proveedor, modelo, dim, items:{id:{h,v}}}
export function cargarVectores(root) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(root, 'Data', 'vectores.json'), 'utf8'));
    const items = new Map();
    for (const [id, x] of Object.entries(j.items || {})) items.set(id, { h: x.h, v: f32(x.v) });
    return { proveedor: j.proveedor, modelo: j.modelo, dim: j.dim, items };
  } catch (e) { return null; }
}

const _qCache = new Map();
export async function vectorConsulta(proveedor, texto) {
  const k = proveedor + '|' + texto;
  if (_qCache.has(k)) return _qCache.get(k);
  let v = null;
  try { v = (await embeber(proveedor, [texto], 'query', Number(process.env.EMBED_TIMEOUT_MS || 2500)))[0]; } catch (e) { console.warn('[vec] consulta:', e.message); }
  if (_qCache.size > 300) _qCache.clear();
  _qCache.set(k, v);
  return v;
}
