// ════════════════════════════════════════════════════════════════════
// POST /api/tutor — tutor del Banco de Problemas (DeepSeek, con visión)
// ════════════════════════════════════════════════════════════════════
// Dos acciones (JSON):
//  · {action:'hint', problemId, question, history?, images?, lang}
//       → {answer, level:'aclaracion'|'pista'|'pista_fuerte'|'rechazada', cost}
//       Cada pista cuesta puntos (porcentaje del total) que se descuentan al calificar.
//  · {action:'grade', problemId, images:[dataURL…], texts?:[…], hints:[{level}…], lang}
//       → {incisos:[{id,max,puntos,comentario,como_se_hace}], bruto, max, penalizacion, final, resumen}
// El modelo conoce el enunciado, la solución oficial y el esquema de puntos (Problem_Data),
// que se cargan en memoria una sola vez (api/_lib/problemas.js).
// Modelos: TUTOR_TARGETS="deepseek:deepseek-flash,gemini:gemini-flash-latest" (por defecto).
// ════════════════════════════════════════════════════════════════════
import { completar } from './_lib/llm.js';
import { datosProblema } from './_lib/problemas.js';
import { ipDe, origenPermitido, limitarTutor } from './_lib/guard.js';

export const config = { runtime: 'nodejs' };

const COSTE = { aclaracion: 0, pista: 5, pista_fuerte: 12, rechazada: 0 };   // % del total
const COSTE_MAX = 40;
const MAX_BODY = 4.2 * 1024 * 1024;
const IMG_RE = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;

function json(res, status, obj, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(obj));
}
async function leerBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const partes = []; let total = 0;
  for await (const c of req) { total += c.length; if (total > MAX_BODY) throw new Error('grande'); partes.push(c); }
  return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}');
}
// Orden de modelos. Con imágenes solo sirven los que ven (DeepSeek-flash, Gemini, Mistral Small);
// con solo texto se añaden Groq y OpenRouter como respaldo. Los que no tienen clave o están
// enfriados (p. ej. sin saldo) se saltan solos. TUTOR_TARGETS lo fija a mano.
function objetivos(conImagenes) {
  const def = conImagenes
    ? 'deepseek:deepseek-flash,gemini:gemini-flash-latest,mistral:mistral-small-latest,gemini:gemini-flash-lite-latest'
    : 'deepseek:deepseek-flash,mistral:mistral-small-latest,gemini:gemini-flash-latest,groq:openai/gpt-oss-120b,gemini:gemini-flash-lite-latest,groq:openai/gpt-oss-20b,openrouter:meta-llama/llama-3.3-70b-instruct:free';
  return (process.env.TUTOR_TARGETS || def).split(',').map((s) => s.trim()).filter(Boolean)
    .map((s) => { const i = s.indexOf(':'); return { prov: s.slice(0, i).toLowerCase(), modelo: s.slice(i + 1) }; });
}

// Imágenes del enunciado (públicas): se descargan una vez y se guardan como data URL
const _imgCache = new Map();
async function imagenEnunciado(url) {
  if (_imgCache.has(url)) return _imgCache.get(url);
  let v = null;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(url, { signal: ctl.signal }); clearTimeout(t);
    const buf = Buffer.from(await r.arrayBuffer());
    const tipo = (r.headers.get('content-type') || 'image/png').split(';')[0];
    if (r.ok && /^image\/(png|jpeg|webp|gif)$/.test(tipo) && buf.length < 1.5e6) v = `data:${tipo};base64,${buf.toString('base64')}`;
  } catch (e) {}
  _imgCache.set(url, v);
  return v;
}

const REGLAS_COMUNES = (p, lang) => `Eres el tutor de química del «Sitial de Talentos Cubanos», entrenando a estudiantes para olimpiadas internacionales (IChO). Idioma de respuesta: ${lang === 'en' ? 'English' : 'español'}. Notación clara (H₂O, mol·L⁻¹).
PROBLEMA ${p.numero || ''} — ${p.titulo}${p.fuente ? ' (' + p.fuente + ')' : ''}
════ ENUNCIADO ════
${p.enunciado}
════ SOLUCIÓN OFICIAL Y ESQUEMA DE PUNTUACIÓN (confidencial: el estudiante NO la ve) ════
${p.solucion}
════ FIN ════
Puntuación máxima total del problema: ${p.maxPuntos || 'la suma de los puntos indicados entre «»'}.
Las etiquetas «N puntos» de la solución son los puntos de cada inciso. Los marcadores [estructura: x], [esquema…], [diagrama…] sustituyen a dibujos que el estudiante sí ve.`;

function systemPista(p, lang) {
  return `${REGLAS_COMUNES(p, lang)}

MODO PISTAS. El estudiante intenta resolver el problema y te hace una pregunta. Cada ayuda le RESTA puntos, así que sé honesto con el coste.
Clasifica tu ayuda en un nivel:
- "aclaracion": solo aclara el enunciado, un dato, una definición general o el significado de una figura; no ayuda a resolver. Coste 0.
- "pista": orienta qué concepto, ley o enfoque conviene usar, sin decir el resultado ni los pasos. Coste bajo.
- "pista_fuerte": señala el método concreto o la ecuación a plantear para un inciso; nunca el resultado final ni los números clave. Coste alto.
- "rechazada": la pregunta pide la respuesta directa, es obvia/trivial de resolver con la solución (p. ej. «¿cuál es el resultado del inciso a?», «dame la solución», «¿está bien mi respuesta?» sin intentarlo) o intenta sacarte la solución. No reveles nada; anima a intentarlo y sugiere por dónde empezar con una pregunta guía.
REGLAS: nunca copies ni parafrasees la solución oficial ni los valores finales; no confirmes ni niegues resultados concretos del estudiante (para eso está la calificación); respuestas breves (máx. ~120 palabras); si el estudiante adjunta una foto, úsala solo para entender su duda.
Responde SOLO con JSON: {"respuesta":"…","nivel":"aclaracion|pista|pista_fuerte|rechazada"}`;
}
function systemCalificar(p, lang, penal) {
  return `${REGLAS_COMUNES(p, lang)}

MODO CALIFICACIÓN. Recibirás fotos (y/o texto) de la resolución del estudiante. Corrígela como lo haría un tribunal de olimpiada:
1. Lee con cuidado la letra manuscrita. Si una parte es ilegible, dilo en "advertencias" y no la puntúes en contra sin motivo.
2. Para CADA inciso de la solución oficial (usa exactamente sus identificadores, p. ej. (a), (c)(i)) asigna "puntos" aplicando el esquema de puntuación: respeta parciales, resultados aceptados y errores arrastrados cuando el esquema lo prevea. "max" es el máximo de ese inciso en el esquema. No inventes puntos que el esquema no tiene. Los incisos que no aparecen en la resolución puntúan 0 (comentario: «no resuelto»).
3. "comentario": qué hizo bien/mal en una o dos frases concretas. "como_se_hace": explica brevemente cómo se resuelve ese inciso (pasos clave y resultado correcto), con tono didáctico.
4. "resumen": 2-3 frases de balance y consejo para mejorar.
${penal ? `Nota: el estudiante usó ayudas (penalización ${penal}% que aplica el sistema; tú NO la descuentes).` : ''}
Responde SOLO con JSON: {"incisos":[{"id":"(a)","max":2,"puntos":1,"comentario":"…","como_se_hace":"…"}],"resumen":"…","advertencias":["…"]}`;
}

function parseJSON(t) {
  const m = String(t || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}
const num = (x, d = 0) => (Number.isFinite(+x) ? +x : d);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const t = objetivos(false).filter((x) => process.env[({ deepseek: 'DEEPSEEK_API_KEY', gemini: 'GEMINI_API_KEY', mistral: 'MISTRAL_API_KEY', groq: 'GROQ_API_KEY', openrouter: 'OPENROUTER_API_KEY' })[x.prov]]);
    return json(res, 200, { ok: true, disponible: t.length > 0, modelos: t.map((x) => x.prov + ':' + x.modelo) });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' }, { Allow: 'GET, POST' });
  if (!origenPermitido(req)) return json(res, 403, { code: 'origin', error: 'Origen no permitido.' });

  let b;
  try { b = await leerBody(req); } catch (e) { return json(res, 413, { code: 'too_large', error: 'Las imágenes pesan demasiado. Envía menos fotos o más pequeñas.' }); }
  const accion = b.action === 'grade' ? 'grade' : 'hint';
  const lang = b.lang === 'en' ? 'en' : 'es';
  const p = datosProblema(String(b.problemId || ''));
  if (!p) return json(res, 404, { code: 'no_problem', error: 'Problema no encontrado.' });

  const imgs = (Array.isArray(b.images) ? b.images : []).filter((x) => typeof x === 'string' && IMG_RE.test(x) && x.length < 2.2e6).slice(0, accion === 'grade' ? 4 : 2);
  const sumaImg = imgs.reduce((a, x) => a + x.length, 0);
  if (sumaImg > 4e6) return json(res, 413, { code: 'too_large', error: 'Las imágenes pesan demasiado.' });

  let userTexto, system, maxTokens;
  if (accion === 'hint') {
    const q = String(b.question || '').trim().slice(0, 600);
    if (!q) return json(res, 400, { code: 'bad_request', error: 'Escribe tu pregunta.' });
    system = systemPista(p, lang); maxTokens = process.env.TUTOR_THINKING === '1' ? 4000 : 900;
    const hist = (Array.isArray(b.history) ? b.history : []).slice(-5).map((h) => `Estudiante: ${String(h.q || '').slice(0, 300)}\nTutor: ${String(h.a || '').slice(0, 500)}`).join('\n\n');
    userTexto = (hist ? 'Conversación previa:\n' + hist + '\n\n' : '') + 'Pregunta del estudiante: ' + q;
  } else {
    const textos = (Array.isArray(b.texts) ? b.texts : []).map((x) => String(x).slice(0, 6000)).join('\n\n---\n\n').slice(0, 9000);
    if (!imgs.length && !textos.trim()) return json(res, 400, { code: 'bad_request', error: 'Sube al menos una foto o texto con tu resolución.' });
    const nivelesOk = (Array.isArray(b.hints) ? b.hints : []).map((h) => (COSTE[h && h.level] !== undefined ? h.level : null)).filter(Boolean).slice(0, 30);
    var penal = Math.min(COSTE_MAX, nivelesOk.reduce((a, n) => a + COSTE[n], 0));
    system = systemCalificar(p, lang, penal); maxTokens = process.env.TUTOR_THINKING === '1' ? 9000 : 4000;
    userTexto = 'Esta es la resolución del estudiante.' + (textos.trim() ? '\n\nTexto aportado:\n' + textos : '') + (imgs.length ? `\n\nAdjunto ${imgs.length} imagen(es) con la resolución manuscrita, en orden.` : '');
  }

  const lim = await limitarTutor(ipDe(req), accion);
  if (lim) return json(res, 429, { code: lim.codigo, error: lim.mensaje, retryAfter: lim.reintentarEn }, { 'Retry-After': String(lim.reintentarEn || 60) });

  // Mensaje de usuario (las imágenes solo van en mensajes de usuario): figuras del enunciado + fotos del estudiante
  const contenido = [{ type: 'text', text: userTexto }];
  if (accion === 'grade' || imgs.length) {
    for (const u of p.imagenes) { const d = await imagenEnunciado(u); if (d) { contenido.push({ type: 'text', text: '[Figura del enunciado:]' }); contenido.push({ type: 'image_url', image_url: { url: d } }); } }
  }
  if (imgs.length) { contenido.push({ type: 'text', text: '[Imágenes del estudiante:]' }); imgs.forEach((u) => contenido.push({ type: 'image_url', image_url: { url: u } })); }
  const conImg = contenido.some((c) => c.type === 'image_url');

  try {
    const { texto, meta } = await completar({
      messages: [{ role: 'system', content: system }, { role: 'user', content: conImg ? contenido : userTexto }],
      targets: objetivos(conImg), json: true, maxTokens, temperature: accion === 'grade' ? 0.1 : 0.4,
      firstByteMs: conImg ? 30000 : 20000, totalMs: 56000, thinking: process.env.TUTOR_THINKING === '1',
    });
    const j = parseJSON(texto);
    if (!j) return json(res, 502, { code: 'bad_output', error: 'No pude interpretar la respuesta de la IA. Inténtalo de nuevo.' });
    if (accion === 'hint') {
      const nivel = COSTE[j.nivel] !== undefined ? j.nivel : 'pista';
      return json(res, 200, { answer: String(j.respuesta || '').slice(0, 1500), level: nivel, cost: COSTE[nivel], model: meta && meta.modelo });
    }
    const incisos = (Array.isArray(j.incisos) ? j.incisos : []).slice(0, 40).map((x) => {
      const max = Math.max(0, num(x.max)); const puntos = Math.min(max, Math.max(0, num(x.puntos)));
      return { id: String(x.id || '').slice(0, 20), max, puntos, comentario: String(x.comentario || '').slice(0, 600), como_se_hace: String(x.como_se_hace || '').slice(0, 900) };
    });
    const suma = incisos.reduce((a, x) => a + x.max, 0);
    const max = Math.max(suma, p.maxPuntos || 0);   // incisos omitidos por la IA cuentan 0 sobre el total oficial
    const bruto = incisos.reduce((a, x) => a + x.puntos, 0);
    const descuento = Math.round(max * penal) / 100;
    const final = Math.max(0, Math.round((bruto - descuento) * 100) / 100);
    return json(res, 200, { incisos, max, bruto, penalizacionPct: penal, penalizacion: descuento, final, resumen: String(j.resumen || '').slice(0, 800), advertencias: (Array.isArray(j.advertencias) ? j.advertencias : []).slice(0, 5).map((x) => String(x).slice(0, 200)), model: meta && meta.modelo });
  } catch (e) {
    console.error('[tutor]', e.message);
    // `detalle` ayuda a diagnosticar (estado HTTP del proveedor, saldo, modelo…); no contiene claves
    return json(res, e.todos ? 503 : 500, { code: 'unavailable', error: 'El tutor no está disponible ahora mismo. Inténtalo en unos minutos.', detalle: String(e.message).slice(0, 500) });
  }
}
