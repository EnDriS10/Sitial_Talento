// ════════════════════════════════════════════════════════════════════
// POST /api/chat — chatbot del Sitial (respuesta en streaming SSE)
// ════════════════════════════════════════════════════════════════════
// Entrada : { messages:[{role,content}…], page?:{path,title}, lang?:'es'|'en', mode?:'general' }
// Salida  : text/event-stream con eventos JSON, uno por línea "data: …":
//             {t:'meta', provider, sources:[{title,url}]}
//             {t:'delta', v:'texto…'}   (varios)
//             {t:'done'}  |  {t:'error', code, message}
// Flujo   : validar → límite de uso → buscar en la base de conocimiento
//           → prompt con contexto → proveedor de IA (con respaldo) → stream
// ════════════════════════════════════════════════════════════════════
import { buscarWeb, contextoWeb } from './_lib/web.js';
import { obtenerKB, contextoDe, fuentesDe, resumenUltimas, fichaSitial } from './_lib/kb.js';
import { planificar } from './_lib/plan.js';
import { chatStream, proveedoresActivos, objetivos, resumenSalud } from './_lib/llm.js';
import { MODOS } from './_lib/prompts.js';
import { ipDe, origenPermitido, validar, limitar } from './_lib/guard.js';

export const config = { runtime: 'nodejs' };

function json(res, status, obj, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(obj));
}
async function leerBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw) {
    const partes = [];
    let total = 0;
    for await (const c of req) { total += c.length; if (total > 64 * 1024) throw new Error('grande'); partes.push(c); }
    raw = Buffer.concat(partes).toString('utf8');
  }
  return JSON.parse(raw || '{}');
}

export default async function handler(req, res) {
  if (req.method === 'GET') {            // comprobación de estado (sin datos sensibles)
    const kb = obtenerKB();
    const salud = await resumenSalud();
    const base = { ok: true, proveedores: proveedoresActivos().length, modelos: objetivos().length, modelosSanos: salud.filter((x) => !x.enfriamientoSeg).length, fragmentos: kb.n };
    // Detalle por modelo solo con CHAT_DEBUG_TOKEN (cabecera x-debug-token)
    if (process.env.CHAT_DEBUG_TOKEN && req.headers['x-debug-token'] === process.env.CHAT_DEBUG_TOKEN) base.detalle = salud;
    return json(res, 200, base);
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' }, { Allow: 'GET, POST' });
  if (!origenPermitido(req)) return json(res, 403, { code: 'origin', error: 'Origen no permitido.' });

  let body;
  try { body = await leerBody(req); } catch (e) { return json(res, 400, { code: 'bad_request', error: 'Solicitud no válida.' }); }
  const v = validar(body);
  if (v.error) return json(res, 400, { code: 'bad_request', error: v.error });

  if (!proveedoresActivos().length) {
    return json(res, 503, { code: 'not_configured', error: 'El asistente aún no está configurado en el servidor.' });
  }
  const lim = await limitar(ipDe(req));
  if (lim) return json(res, 429, { code: lim.codigo, error: lim.mensaje, retryAfter: lim.reintentarEn }, { 'Retry-After': String(lim.reintentarEn || 60) });

  // ── 1) entender la pregunta: un modelo reformula y clasifica (sin listas de preguntas fijas) ──
  const modo = MODOS[body.mode] ? body.mode : 'general';
  const lang = body.lang === 'en' ? 'en' : 'es';
  const kb = obtenerKB();
  const ultimaPregunta = v.msgs.filter((m) => m.role === 'user').slice(-1)[0].content;
  const ultimas = v.msgs.filter((m) => m.role === 'user').slice(-2).map((m) => m.content).join(' ');
  const plan = await planificar(v.msgs, resumenUltimas(), fichaSitial());

  // ── 2) buscar en los datos del Sitial con la consulta reformulada + la pregunta original ──
  const consulta = [plan && plan.consulta, ultimas].filter(Boolean).join(' ');
  const fragmentos = kb.idx.buscar(consulta, { k: 8, maxChars: 7000 });
  const pagina = body.page && typeof body.page === 'object'
    ? `${String(body.page.title || '').slice(0, 120)} (${String(body.page.path || '').slice(0, 160)})` : '';

  // ── 3) internet: de entrada si el planificador lo marca como actualidad; si no, solo cuando el propio
  //       asistente dice que el Sitial no tiene el dato (marcador [[BUSCAR: …]]) ──
  let web = [];
  if (modo === 'general' && plan && plan.ambito === 'actualidad' && !fragmentos.fijados && !(fragmentos.top >= 18)) web = await buscarWeb(plan.web || ultimaPregunta, lang);
  const construir = () => MODOS[modo]({ contexto: contextoDe(fragmentos), web: contextoWeb(web), ultimas: resumenUltimas(), ficha: fichaSitial(), pagina, lang, puedeBuscar: modo === 'general' && !web.length && !webIntentada });
  let webIntentada = web.length > 0 || (plan && plan.ambito === 'actualidad');
  let system = construir();

  // ── stream hacia el navegador ──
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (o) => { try { res.write('data: ' + JSON.stringify(o) + '\n\n'); } catch (e) {} };
  const ctl = new AbortController();
  res.on('close', () => ctl.abort());

  // Ejecuta una generación. Si empieza por [[BUSCAR: …]] devuelve {buscar} sin haber enviado nada al usuario.
  async function generar(sys) {
    let buf = '', decidido = false, meta = null;
    for await (const ev of chatStream({
      messages: [{ role: 'system', content: sys }, ...v.msgs],
      maxTokens: Number(process.env.CHAT_MAX_TOKENS || 700), temperature: 0.3, signal: ctl.signal,
    })) {
      if (ev.meta) { meta = ev.meta; if (decidido) emitirMeta(meta); continue; }
      if (decidido) { send({ t: 'delta', v: ev.texto }); continue; }
      buf += ev.texto;
      const t = buf.trimStart();
      if (t.startsWith('[[')) {
        const m = t.match(/^\[\[\s*BUSCAR\s*:?\s*([^\]]*)\]\]/i);
        if (m) { return { buscar: (m[1] || '').trim() || ultimaPregunta }; }
        if (t.length < 14) continue;               // aún no sabemos si es el marcador
      } else if (t.length < 2) continue;
      decidido = true;
      if (meta) emitirMeta(meta);
      send({ t: 'delta', v: buf });
    }
    if (!decidido) {                                // respuesta muy corta: enviarla tal cual
      const m = buf.trim().match(/^\[\[\s*BUSCAR\s*:?\s*([^\]]*)\]\]/i);
      if (m) return { buscar: (m[1] || '').trim() || ultimaPregunta };
      if (meta) emitirMeta(meta);
      if (buf) send({ t: 'delta', v: buf });
    }
    return {};
  }
  const emitirMeta = (m) => send({ t: 'meta', provider: m.proveedor, model: m.modelo,
    sources: fuentesDe(fragmentos, 3), web: web.length > 0 });

  try {
    let r = await generar(system);
    if (r.buscar) {                                  // el Sitial no tenía el dato → internet
      webIntentada = true;
      web = await buscarWeb(r.buscar, lang);
      system = construir();
      r = await generar(system);
      if (r.buscar) send({ t: 'delta', v: lang === 'en' ? "I couldn't find that information." : 'No he podido encontrar esa información.' });
    }
    send({ t: 'done' });
  } catch (e) {
    console.error('[chat]', e.message);
    const todos = e.todos || e.status === 503;
    send({ t: 'error', code: todos ? 'unavailable' : 'stream', message: todos ? 'El asistente no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.' : 'Se interrumpió la respuesta.' });
  }
  res.end();
}
