// ════════════════════════════════════════════════════════════════════
// POST /api/tutor — tutor del Banco de Problemas (DeepSeek, con visión)
// ════════════════════════════════════════════════════════════════════
// Acciones (JSON):
//  · {action:'hint', problemId, question, history?, images?, lang}
//       → {answer, level:'aclaracion'|'pista'|'pista_fuerte'|'rechazada', cost}
//  · {action:'grade', problemId, images?:[dataURL…], texts?:[…], hints:[{level}…], lang,
//       transcripcion?, confirmarParcial?}
//       → {incisos:[{id,max,puntos,comentario,como_se_hace,discrepancia?}], bruto, max, penalizacion, final, resumen}
//       o, si solo envió una parte de la resolución y no lo ha confirmado:
//       → {parcial:true, presentes, faltan, cortada, transcripcion, mensaje}
// Calificar = 3 pasos rápidos y SIN modelos de pago (todo gratuito):
//   1) LECTOR (con visión: Gemini / Mistral / Groq): transcribe las fotos y detecta qué incisos hay,
//      cuáles faltan y si la respuesta quedó cortada.
//   2) Si es parcial → se le pregunta al estudiante si continúa o califica solo lo enviado.
//   3) DOS CALIFICADORES en paralelo (modelos distintos) comparan con la solución oficial; los puntos
//      por inciso se promedian (revisión cruzada) y se acotan al baremo oficial (Problem_Data).
// Modelos configurables: TUTOR_VISION, TUTOR_GRADERS, TUTOR_FAST.
// ════════════════════════════════════════════════════════════════════
import { completar } from './_lib/llm.js';
import { GUIA_DIBUJO } from './_lib/dibujo.js';
import { datosProblema, enfoqueProblema } from './_lib/problemas.js';
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

// ── Modelos (todos gratuitos; los que no tienen clave o están enfriados se saltan solos) ──
const lista = (txt) => String(txt).split(',').map((x) => x.trim()).filter(Boolean)
  .map((x) => { const i = x.indexOf(':'); return { prov: x.slice(0, i).toLowerCase(), modelo: x.slice(i + 1) }; });
const VISION  = () => lista(process.env.TUTOR_VISION  || 'gemini:gemini-flash-latest,mistral:mistral-small-latest,groq:meta-llama/llama-4-scout-17b-16e-instruct,gemini:gemini-flash-lite-latest');
const GRADERS = () => lista(process.env.TUTOR_GRADERS || 'gemini:gemini-flash-latest,mistral:mistral-small-latest,groq:openai/gpt-oss-120b,gemini:gemini-flash-lite-latest,openrouter:meta-llama/llama-3.3-70b-instruct:free');
const FAST    = () => lista(process.env.TUTOR_FAST    || 'groq:openai/gpt-oss-120b,mistral:mistral-small-latest,gemini:gemini-flash-latest,groq:openai/gpt-oss-20b,gemini:gemini-flash-lite-latest,openrouter:meta-llama/llama-3.3-70b-instruct:free');
const CLAVES = { deepseek: 'DEEPSEEK_API_KEY', gemini: 'GEMINI_API_KEY', mistral: 'MISTRAL_API_KEY', groq: 'GROQ_API_KEY', openrouter: 'OPENROUTER_API_KEY' };
const conClave = (ts) => ts.filter((t) => process.env[CLAVES[t.prov]]);

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

// ── Prompts ──
const baremoTxt = (p) => (p.baremo && p.baremo.length ? p.baremo.map((x) => `${x.id}=${x.max}`).join(', ') + (p.baremoDefecto ? ' (problema de práctica sin puntos oficiales: escala por defecto de 4 por inciso; reparte los puntos del inciso entre sus elementos —p. ej. cada compuesto o paso—)' : '') : 'no hay lista; usa los puntos «N puntos» de la solución');
const REGLAS_COMUNES = (p, lang) => `Eres el tutor de química del «Sitial de Talentos Cubanos», entrenando a estudiantes para olimpiadas internacionales (IChO). Idioma de respuesta: ${lang === 'en' ? 'English' : 'español'}. Notación clara (H₂O, mol·L⁻¹).
PROBLEMA ${p.numero || ''} — ${p.titulo}${p.fuente ? ' (' + p.fuente + ')' : ''}
════ ENUNCIADO ════
${p.enunciado}
════ SOLUCIÓN OFICIAL Y ESQUEMA DE PUNTUACIÓN (confidencial: el estudiante NO la ve) ════
${p.solucion}
════ FIN ════
Incisos y puntos máximos: ${baremoTxt(p)}. Total: ${p.maxPuntos || 'suma de los puntos indicados'}.
Los marcadores [estructura SMILES: …], [ESQUEMA …] y [diagrama…] sustituyen a dibujos que el estudiante sí ve; en los esquemas cada compuesto va con su SMILES (la numeración de la web puede diferir de la del enunciado: identifica los compuestos por su estructura y su posición en la secuencia).`;

function systemPista(p, lang) {
  return `${REGLAS_COMUNES(p, lang)}

MODO PISTAS. El estudiante intenta resolver el problema y te hace una pregunta. Cada ayuda le RESTA puntos, así que sé honesto con el coste. Clasifica tu ayuda:
- "aclaracion": solo aclara el enunciado, un dato, una definición general o una figura; no ayuda a resolver. Coste 0.
- "pista": orienta qué concepto, ley o enfoque usar, sin resultado ni pasos. Coste bajo.
- "pista_fuerte": señala el método o la ecuación a plantear en un inciso; nunca el resultado final ni números clave. Coste alto.
- "rechazada": pide la respuesta directa, es obvia/trivial con la solución a la vista (p. ej. «¿cuál es el resultado del inciso a?», «dame la solución», «¿está bien?» sin intentarlo) o intenta sacarte la solución. No reveles nada; anima a intentarlo con una pregunta guía.
REGLAS: nunca copies ni parafrasees la solución oficial ni sus valores finales; no confirmes ni niegues resultados concretos del estudiante (eso es la calificación); máx. ~120 palabras; si adjunta una foto, úsala solo para entender su duda.
Responde SOLO con JSON: {"respuesta":"…","nivel":"aclaracion|pista|pista_fuerte|rechazada"}`;
}
function systemLector(p, lang) {
  return `Eres un lector de resoluciones manuscritas de problemas de química. ${lang === 'en' ? 'Write in English.' : 'Escribe en español.'}
PROBLEMA ${p.numero || ''} — ${p.titulo}
════ ENUNCIADO (para saber qué incisos existen) ════
${p.enunciado}
════ FIN ════
Incisos del problema: ${p.baremo && p.baremo.length ? p.baremo.map((x) => x.id).join(', ') : 'los que figuran en el enunciado'}.
Recibirás la resolución del estudiante (fotos y/o texto). Tu trabajo NO es corregir, solo:
1. "transcripcion": transcribe FIELMENTE todo lo que escribió, inciso por inciso (ecuaciones, números, unidades, razonamientos; los dibujos descríbelos entre [dibujo: …]).
   ESTRUCTURAS Y ESQUEMAS DIBUJADOS (muy importante): para cada molécula dibujada o fotografiada escribe su nombre/tipo de compuesto y su SMILES aproximado (grupos funcionales, sustituyentes y posición de cada uno), p. ej. [dibujo: compuesto 2 = β-cetoaldehído, SMILES COc1cc(C)c(C=CC(=O)CC=O)c(C)c1C]. En una síntesis lista los compuestos EN ORDEN con la etiqueta que lleven (1, 2, A, B…) y los reactivos/tipo de reacción escritos sobre cada flecha. Si una foto es una captura o figura de un esquema completo, transcribe TODOS sus compuestos y flechas. No resumas ni omitas compuestos: la nota depende de ello. Mantén sus errores tal cual. Si algo es ilegible escribe [ilegible].
2. "presentes": ids de los incisos en los que hay algún intento de respuesta. "faltan": ids sin ningún intento.
3. "cortada": true si la resolución parece INCOMPLETA o cortada a mitad (termina en medio de un cálculo, foto recortada, página que continúa, «sigue…»), aunque haya incisos presentes.
4. "ilegible": lista breve de partes que no pudiste leer.
Usa exactamente los ids indicados, p. ej. (a), (c)(i).
Responde SOLO con JSON: {"transcripcion":"…","presentes":["(a)"],"faltan":["(b)"],"cortada":false,"ilegible":[]}`;
}
function systemCalificar(p, lang, penal) {
  return `${REGLAS_COMUNES(p, lang)}

MODO CALIFICACIÓN. Recibirás la TRANSCRIPCIÓN de la resolución del estudiante (ya leída de sus fotos; puede tener pequeños errores de lectura marcados como [ilegible]). Corrígela como un tribunal de olimpiada, comparando con la solución oficial:
- Para CADA inciso del baremo (ids exactos) asigna "puntos" aplicando el esquema de puntuación: parciales, resultados aceptados y errores arrastrados cuando el esquema lo prevea. No superes el máximo del inciso ni inventes puntos que el esquema no tiene. Un inciso sin intento puntúa 0 («no resuelto»).
- "comentario": qué hizo bien/mal, una o dos frases concretas. "como_se_hace": explica brevemente cómo se resuelve ese inciso (pasos clave y resultado correcto), didáctico.
- No penalices por una mala lectura de la letra: si dudas, dilo en "advertencias" y sé generoso.
- "resumen": 2-3 frases de balance y un consejo.
${penal ? `Nota: el estudiante usó ayudas (penalización ${penal}% que aplica el sistema; tú NO la descuentes).` : ''}
- Las estructuras se comparan por su fórmula/SMILES y sus grupos funcionales, no por cómo estén dibujadas ni por la numeración. Si la transcripción contiene la secuencia correcta de compuestos y reactivos, otórgale los puntos aunque el formato sea distinto (captura, foto o texto). Nunca pongas 0 en un inciso si la transcripción contiene contenido pertinente a él.
Responde SOLO con JSON: {"incisos":[{"id":"(a)","max":1,"puntos":1,"comentario":"…","como_se_hace":"…"}],"resumen":"…","advertencias":["…"]}`;
}

function systemDiscutir(p, lang, resultado, foco) {
  const res = resultado && Array.isArray(resultado.incisos) ? `
════ RESOLUCIÓN DEL ESTUDIANTE Y SU CALIFICACIÓN (ya entregada) ════
${resultado.transcripcion ? 'Transcripción:\n' + String(resultado.transcripcion).slice(0, 4000) + '\n' : ''}${resultado.incisos.slice(0, 30).map((x) => `${x.id}: ${x.puntos}/${x.max} — ${String(x.comentario || '').slice(0, 220)} | Cómo se hace: ${String(x.como_se_hace || '').slice(0, 300)}`).join('\n')}
════ FIN ════` : '';
  return `${REGLAS_COMUNES(p, lang)}${res}

MODO CONVERSACIÓN SOBRE LA SOLUCIÓN. El estudiante YA ve la solución y/o su calificación y quiere ENTENDERLAS. No hay penalización: ayuda a fondo.
- Explica CÓMO se hace y, sobre todo, POR QUÉ se hace así (el concepto, la ley, la razón de cada paso), con ejemplos o analogías cuando ayuden. Si cita un texto seleccionado, explícalo parte por parte.
- Si pregunta por qué perdió puntos, compara su resolución con el esquema de puntuación con honestidad; si crees que la calificación fue demasiado dura o se leyó mal su letra, dilo (no puedes cambiar la nota, pero recomiéndale revisarlo).
- Sé claro y didáctico, sin rodeos: normalmente 80–200 palabras; más solo si lo pide. Usa notación química clara y, si hay cálculo, muéstralo paso a paso con unidades.
- Termina, cuando tenga sentido, con una pregunta corta para comprobar que lo entendió o proponiendo un ejercicio similar.
- Si la pregunta es de química orgánica (o una estructura, síntesis o mecanismo lo aclara), DIBUJA con la sintaxis de abajo: moléculas, la síntesis completa o el mecanismo paso a paso, y explica cada paso. Si el estudiante pide «dibújalo», «hazme el mecanismo» o similar, hazlo siempre.
- Evita listas largas y tablas; el estudiante puede seguir preguntando, no cierres la conversación.
${GUIA_DIBUJO}
${foco ? `Foco vectorial: la pregunta apunta a ${foco}.\n` : ''}Responde SOLO con JSON (dentro de la cadena usa \n para los saltos de línea): {"respuesta":"…"}`;
}

function parseJSON(t) {
  const m = String(t || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}
const num = (x, d = 0) => (Number.isFinite(+x) ? +x : d);
const r05 = (x) => Math.round(x * 2) / 2;
const normId = (x) => String(x || '').replace(/\s+/g, '').toLowerCase();

// Ejecuta un modelo/lista y devuelve JSON, o null si falló
async function pedirJSON(targets, system, userContent, { maxTokens, temperature, firstByteMs }) {
  const t = conClave(targets);
  if (!t.length) throw Object.assign(new Error('Sin modelos configurados'), { todos: true });
  const { texto, meta } = await completar({
    messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
    targets: t, json: true, maxTokens, temperature, firstByteMs, totalMs: 40000,
  });
  return { j: parseJSON(texto), meta };
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const t = [...new Set([...VISION(), ...GRADERS(), ...FAST()].filter((x) => process.env[CLAVES[x.prov]]).map((x) => x.prov + ':' + x.modelo))];
    return json(res, 200, { ok: true, disponible: t.length > 0, modelos: t });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' }, { Allow: 'GET, POST' });
  if (!origenPermitido(req)) return json(res, 403, { code: 'origin', error: 'Origen no permitido.' });

  let b;
  try { b = await leerBody(req); } catch (e) { return json(res, 413, { code: 'too_large', error: 'Las imágenes pesan demasiado. Envía menos fotos o más pequeñas.' }); }
  const accion = b.action === 'grade' ? 'grade' : b.action === 'discuss' ? 'discuss' : 'hint';
  const lang = b.lang === 'en' ? 'en' : 'es';
  const p = datosProblema(String(b.problemId || ''));
  if (!p) return json(res, 404, { code: 'no_problem', error: 'Problema no encontrado.' });

  const imgs = (Array.isArray(b.images) ? b.images : []).filter((x) => typeof x === 'string' && IMG_RE.test(x) && x.length < 2.2e6).slice(0, accion === 'grade' ? 4 : 2);
  const crudas = Array.isArray(b.images) ? b.images.length : 0;
  if (crudas > imgs.length && crudas <= (accion === 'grade' ? 4 : 2)) return json(res, 413, { code: 'too_large', error: 'Alguna imagen no es válida o pesa demasiado (máx. ~1.6 MB por foto). Prueba con otra captura o más pequeña.' });
  if (imgs.reduce((a, x) => a + x.length, 0) > 4e6) return json(res, 413, { code: 'too_large', error: 'Las imágenes pesan demasiado.' });

  try {
    // ═══════════ PISTAS ═══════════
    if (accion === 'hint') {
      const q = String(b.question || '').trim().slice(0, 600);
      if (!q) return json(res, 400, { code: 'bad_request', error: 'Escribe tu pregunta.' });
      const lim = await limitarTutor(ipDe(req), 'hint');
      if (lim) return json(res, 429, { code: lim.codigo, error: lim.mensaje, retryAfter: lim.reintentarEn }, { 'Retry-After': String(lim.reintentarEn || 60) });
      const hist = (Array.isArray(b.history) ? b.history : []).slice(-5).map((h) => `Estudiante: ${String(h.q || '').slice(0, 300)}\nTutor: ${String(h.a || '').slice(0, 500)}`).join('\n\n');
      const quote = String(b.quote || '').trim().slice(0, 600);
      const foco = enfoqueProblema(p.id, q + ' ' + quote);
      const focoTxt = foco.incisos.length ? `\n[Brújula vectorial: la pregunta apunta al inciso ${foco.incisos.map((x) => `${x.id} (${Math.round(x.peso * 100)} %)`).join(' / ')}. El coste de la pista se mide respecto a ese inciso.]` : '';
      const texto = (hist ? 'Conversación previa:\n' + hist + '\n\n' : '') + (quote ? `Texto que seleccionó el estudiante: «${quote}»\n` : '') + 'Pregunta del estudiante: ' + q + focoTxt;
      let contenido = texto;
      if (imgs.length) {
        contenido = [{ type: 'text', text: texto }, { type: 'text', text: '[Imágenes del estudiante:]' }, ...imgs.map((u) => ({ type: 'image_url', image_url: { url: u } }))];
      }
      const { j, meta } = await pedirJSON(imgs.length ? VISION() : FAST(), systemPista(p, lang), contenido, { maxTokens: 900, temperature: 0.4, firstByteMs: 15000 });
      if (!j) return json(res, 502, { code: 'bad_output', error: 'No pude interpretar la respuesta de la IA. Inténtalo de nuevo.' });
      const nivel = COSTE[j.nivel] !== undefined ? j.nivel : 'pista';
      return json(res, 200, { answer: String(j.respuesta || '').slice(0, 1500), level: nivel, cost: COSTE[nivel], model: meta && meta.modelo });
    }

    // ═══════════ CONVERSAR SOBRE LA SOLUCIÓN / LA CALIFICACIÓN (sin penalización) ═══════════
    if (accion === 'discuss') {
      const q = String(b.question || '').trim().slice(0, 800);
      if (!q) return json(res, 400, { code: 'bad_request', error: 'Escribe tu pregunta.' });
      const lim = await limitarTutor(ipDe(req), 'chat');
      if (lim) return json(res, 429, { code: lim.codigo, error: lim.mensaje, retryAfter: lim.reintentarEn }, { 'Retry-After': String(lim.reintentarEn || 60) });
      const quote = String(b.quote || '').trim().slice(0, 1200);
      const foco = enfoqueProblema(p.id, q + ' ' + quote);
      const focoTxt = foco.incisos.map((x) => `${x.id} (${Math.round(x.peso * 100)} %)`).join(' / ');
      const hist = (Array.isArray(b.history) ? b.history : []).slice(-6).map((h) => `Estudiante: ${String(h.q || '').slice(0, 400)}\nTutor: ${String(h.a || '').slice(0, 700)}`).join('\n\n');
      const user = (hist ? 'Conversación previa:\n' + hist + '\n\n' : '') + (quote ? `Texto seleccionado por el estudiante (de ${b.fuente === 'respuesta' ? 'la solución oficial' : b.fuente === 'resultado' ? 'la corrección' : 'el enunciado'}): «${quote}»\n` : '') + 'Pregunta del estudiante: ' + q +
        (foco.trozos.length && quote === '' ? '\n\nFragmentos más cercanos de la solución:\n' + foco.trozos.filter((t) => t.fuente === 'solucion').map((t) => t.texto.slice(0, 700)).join('\n---\n') : '');
      const { j, meta } = await pedirJSON(GRADERS(), systemDiscutir(p, lang, b.resultado, focoTxt), user, { maxTokens: 2600, temperature: 0.3, firstByteMs: 20000 });
      if (!j || !String(j.respuesta || '').trim()) return json(res, 502, { code: 'bad_output', error: 'No pude interpretar la respuesta de la IA. Inténtalo de nuevo.' });
      return json(res, 200, { answer: String(j.respuesta).slice(0, 6000), model: meta && meta.modelo, foco: foco.incisos });
    }

    // ═══════════ CALIFICAR ═══════════
    const textos = (Array.isArray(b.texts) ? b.texts : []).map((x) => String(x).slice(0, 6000)).join('\n\n---\n\n').slice(0, 9000);
    let transcripcion = typeof b.transcripcion === 'string' ? b.transcripcion.slice(0, 14000) : '';
    if (!transcripcion && !imgs.length && !textos.trim()) return json(res, 400, { code: 'bad_request', error: 'Sube al menos una foto o texto con tu resolución.' });
    // la confirmación de «califica solo lo enviado» (con transcripción ya hecha) no gasta una calificación del día
    const lim = await limitarTutor(ipDe(req), transcripcion && b.confirmarParcial ? 'hint' : 'grade');
    if (lim) return json(res, 429, { code: lim.codigo, error: lim.mensaje, retryAfter: lim.reintentarEn }, { 'Retry-After': String(lim.reintentarEn || 60) });

    const ids = (p.baremo || []).map((x) => x.id);
    let presentes = Array.isArray(b.presentes) ? b.presentes.map(String) : null, faltan = Array.isArray(b.faltan) ? b.faltan.map(String) : [];
    let cortada = !!b.cortada, modelos = {};

    // 1) LECTOR
    if (!transcripcion) {
      const intro = 'Resolución del estudiante.' + (textos.trim() ? '\n\nTexto aportado:\n' + textos : '') + (imgs.length ? `\n\nAdjunto ${imgs.length} imagen(es), en orden.` : '');
      const cont = [{ type: 'text', text: intro }];
      if (imgs.length) {
        for (const u of p.imagenes) { const d = await imagenEnunciado(u); if (d) { cont.push({ type: 'text', text: '[Figura del enunciado, NO es del estudiante:]' }); cont.push({ type: 'image_url', image_url: { url: d } }); } }
        cont.push({ type: 'text', text: '[Imágenes del estudiante:]' }); imgs.forEach((u) => cont.push({ type: 'image_url', image_url: { url: u } }));
      }
      const { j, meta } = await pedirJSON(imgs.length ? VISION() : FAST(), systemLector(p, lang), imgs.length ? cont : intro, { maxTokens: 3500, temperature: 0, firstByteMs: 25000 });
      if (!j || !String(j.transcripcion || '').trim()) return json(res, 502, { code: 'bad_output', error: 'No pude leer tu resolución. Prueba con una foto más nítida.' });
      transcripcion = String(j.transcripcion).slice(0, 14000);
      const lim2 = (a) => (Array.isArray(a) ? a.map(String).slice(0, 40) : []);
      presentes = lim2(j.presentes); faltan = lim2(j.faltan); cortada = !!j.cortada;
      modelos.lector = meta && meta.modelo;
      if (!presentes.length) return json(res, 200, { vacio: true, transcripcion, mensaje: 'No encontré ninguna respuesta a los incisos en lo que enviaste. Revisa que la foto se vea bien y que escribas el número del inciso.' });
      // ¿solo envió una parte? → preguntar antes de calificar
      if ((faltan.length > 0 || cortada) && !b.confirmarParcial) {
        return json(res, 200, { parcial: true, presentes, faltan, cortada, transcripcion, model: modelos.lector });
      }
    }

    // 2) CALIFICADORES (dos modelos distintos en paralelo = revisión cruzada)
    const nivelesOk = (Array.isArray(b.hints) ? b.hints : []).map((h) => (COSTE[h && h.level] !== undefined ? h.level : null)).filter(Boolean).slice(0, 30);
    const penal = Math.min(COSTE_MAX, nivelesOk.reduce((a, n) => a + COSTE[n], 0));
    const sys = systemCalificar(p, lang, penal);
    const user = 'TRANSCRIPCIÓN DE LA RESOLUCIÓN DEL ESTUDIANTE:\n' + transcripcion +
      (faltan.length ? `\n\n(El estudiante confirmó que solo envió una parte. Incisos sin intento: ${faltan.join(', ')} → 0 puntos, «no enviado».)` : '');
    const cands = conClave(GRADERS());
    if (!cands.length) throw Object.assign(new Error('Sin modelos configurados'), { todos: true });
    const opts = { maxTokens: 3500, temperature: 0.1, firstByteMs: 25000 };
    const dual = process.env.TUTOR_DUAL !== '0' && new Set(cands.map((c) => c.prov)).size > 1;
    // A: empieza por el 1.º; B: empieza por el primero de OTRO proveedor (y repite el resto como respaldo)
    const idxB = dual ? cands.findIndex((c) => c.prov !== cands[0].prov) : -1;
    const listaA = cands;
    const listaB = dual ? [cands[idxB], ...cands.filter((_, i) => i !== idxB)] : null;
    const salidas = await Promise.allSettled([pedirJSON(listaA, sys, user, opts), ...(dual ? [pedirJSON(listaB, sys, user, opts)] : [])]);
    const buenas = salidas.filter((x) => x.status === 'fulfilled' && x.value.j && Array.isArray(x.value.j.incisos)).map((x) => x.value);
    if (!buenas.length) {
      const err = salidas.find((x) => x.status === 'rejected');
      if (err) throw err.reason;
      return json(res, 502, { code: 'bad_output', error: 'No pude interpretar la calificación de la IA. Inténtalo de nuevo.' });
    }
    modelos.calificadores = buenas.map((x) => x.meta && x.meta.modelo);

    // 3) Fusión: puntos por inciso = media de calificadores (a 0,5), acotados al baremo oficial
    const por = (g) => { const m = new Map(); (g.j.incisos || []).forEach((x) => m.set(normId(x.id), x)); return m; };
    const mapas = buenas.map(por);
    const base = (p.baremo && p.baremo.length) ? p.baremo : [...mapas[0].values()].map((x) => ({ id: String(x.id), max: Math.max(0, num(x.max)) }));
    const incisos = base.slice(0, 40).map((it) => {
      const k = normId(it.id);
      const vistos = mapas.map((m) => m.get(k)).filter(Boolean);
      const max = it.max;
      const pts = vistos.map((v) => Math.min(max, Math.max(0, num(v.puntos))));
      const puntos = pts.length ? Math.min(max, r05(pts.reduce((a, x) => a + x, 0) / pts.length)) : 0;
      const sinEnviar = faltan.map(normId).includes(k);
      const a = vistos[0] || {};
      return {
        id: it.id, max, puntos: sinEnviar ? 0 : puntos,
        comentario: sinEnviar ? 'No enviado.' : String(a.comentario || (vistos[1] && vistos[1].comentario) || '').slice(0, 600),
        como_se_hace: String(a.como_se_hace || (vistos[1] && vistos[1].como_se_hace) || '').slice(0, 900),
        discrepancia: pts.length > 1 && Math.abs(pts[0] - pts[1]) > 0 ? pts : undefined,
      };
    });
    const max = Math.max(incisos.reduce((a, x) => a + x.max, 0), p.maxPuntos || 0);
    const bruto = incisos.reduce((a, x) => a + x.puntos, 0);
    const descuento = Math.round(max * penal) / 100;
    const final = Math.max(0, Math.round((bruto - descuento) * 100) / 100);
    const maxEnviado = faltan.length ? incisos.filter((x) => !faltan.map(normId).includes(normId(x.id))).reduce((a, x) => a + x.max, 0) : null;
    const primero = buenas[0].j;
    const adv = [...new Set(buenas.flatMap((x) => (Array.isArray(x.j.advertencias) ? x.j.advertencias : [])).map((x) => String(x).slice(0, 200)))].slice(0, 5);
    return json(res, 200, {
      incisos, max, bruto, penalizacionPct: penal, penalizacion: descuento, final,
      maxEnviado, transcripcion: transcripcion.slice(0, 5000), resumen: String(primero.resumen || '').slice(0, 800), advertencias: adv,
      revisionCruzada: buenas.length > 1, model: modelos,
    });
  } catch (e) {
    console.error('[tutor]', e.message);
    // `detalle` ayuda a diagnosticar (estado HTTP del proveedor, modelo…); no contiene claves
    return json(res, e.todos ? 503 : 500, { code: 'unavailable', error: 'El tutor no está disponible ahora mismo. Inténtalo en unos minutos.', detalle: String(e.message).slice(0, 500) });
  }
}
