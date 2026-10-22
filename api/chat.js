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
import { obtenerKB, contextoDe, fuentesDe } from './_lib/kb.js';
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

  // ── contexto (búsqueda en los datos del sitio) ──
  const modo = MODOS[body.mode] ? body.mode : 'general';
  const kb = obtenerKB();
  const ultimas = v.msgs.filter((m) => m.role === 'user').slice(-2).map((m) => m.content).join(' ');
  const fragmentos = kb.idx.buscar(ultimas, { k: 8, maxChars: 7000 });
  const pagina = body.page && typeof body.page === 'object'
    ? `${String(body.page.title || '').slice(0, 120)} (${String(body.page.path || '').slice(0, 160)})` : '';
  const system = MODOS[modo]({ contexto: contextoDe(fragmentos), pagina, lang: body.lang === 'en' ? 'en' : 'es' });

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

  try {
    let primero = true;
    for await (const ev of chatStream({
      messages: [{ role: 'system', content: system }, ...v.msgs],
      maxTokens: Number(process.env.CHAT_MAX_TOKENS || 700), temperature: 0.3, signal: ctl.signal,
    })) {
      if (ev.meta) { send({ t: 'meta', provider: ev.meta.proveedor, model: ev.meta.modelo, sources: fuentesDe(fragmentos, 3) }); primero = false; continue; }
      send({ t: 'delta', v: ev.texto });
    }
    send({ t: 'done' });
  } catch (e) {
    console.error('[chat]', e.message);
    const todos = e.todos || e.status === 503;
    send({ t: 'error', code: todos ? 'unavailable' : 'stream', message: todos ? 'El asistente no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.' : 'Se interrumpió la respuesta.' });
  }
  res.end();
}
