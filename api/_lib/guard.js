// ════════════════════════════════════════════════════════════════════
// Protección del endpoint público: origen, validación y límite de uso
// ════════════════════════════════════════════════════════════════════
// El endpoint es gratuito y público, así que se protege para que nadie
// gaste la cuota de IA:
//   · Solo se acepta desde el propio sitio (mismo origen), localhost y los
//     orígenes de ALLOWED_ORIGINS.
//   · Límite por IP: CHAT_RATE_MIN mensajes/minuto y CHAT_RATE_DAY/día.
//   · Tope global diario CHAT_GLOBAL_DAY (para que la cuota gratuita nunca
//     se agote de golpe).
//   · Contadores en Upstash Redis (gratis) si defines UPSTASH_REDIS_REST_URL
//     y UPSTASH_REDIS_REST_TOKEN; si no, en memoria de cada instancia
//     (menos preciso, pero suficiente para empezar).
// ════════════════════════════════════════════════════════════════════

export const LIM = {
  min: () => Number(process.env.CHAT_RATE_MIN || 8),
  dia: () => Number(process.env.CHAT_RATE_DAY || 80),
  global: () => Number(process.env.CHAT_GLOBAL_DAY || 4000),
  maxMsg: 1000,        // caracteres por mensaje
  maxHist: 10,         // mensajes de historial que se envían al modelo
  maxTotal: 6000,      // caracteres totales
};

export function ipDe(req) {
  const h = req.headers || {};
  const xf = String(h['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || String(h['x-real-ip'] || '') || (req.socket && req.socket.remoteAddress) || 'desconocida';
}

export function origenPermitido(req) {
  const h = req.headers || {};
  const o = h.origin || h.referer || '';
  if (!o) return false;                         // los navegadores siempre lo envían en POST
  let host;
  try { host = new URL(o).host; } catch (e) { return false; }
  const miHost = h['x-forwarded-host'] || h.host;
  if (host === miHost) return true;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return true;
  const extra = String(process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/^https?:\/\//, '')).filter(Boolean);
  return extra.includes(host);
}

export function validar(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages)) return { error: 'Formato de mensaje no válido.' };
  const msgs = body.messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, m.role === 'user' ? LIM.maxMsg : 2500) }))
    .slice(-LIM.maxHist);
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return { error: 'Escribe una pregunta.' };
  if (body.messages[body.messages.length - 1].content.length > LIM.maxMsg) return { error: `El mensaje es demasiado largo (máximo ${LIM.maxMsg} caracteres).` };
  const total = msgs.reduce((a, m) => a + m.content.length, 0);
  if (total > LIM.maxTotal) {
    while (msgs.length > 1 && msgs.reduce((a, m) => a + m.content.length, 0) > LIM.maxTotal) msgs.shift();
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  }
  return { msgs };
}

// ── contadores ──
const mem = new Map();
function memIncr(key, ttl) {
  const now = Date.now();
  const e = mem.get(key);
  if (!e || e.exp < now) { mem.set(key, { n: 1, exp: now + ttl * 1000 }); return { n: 1, ttl }; }
  e.n++;
  return { n: e.n, ttl: Math.ceil((e.exp - now) / 1000) };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of mem) if (v.exp < now) mem.delete(k); }, 60000).unref?.();

async function upstashIncr(key, ttl) {
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const r = await fetch(url.replace(/\/$/, '') + '/pipeline', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify([['INCR', key], ['EXPIRE', key, ttl, 'NX'], ['TTL', key]]),
  });
  if (!r.ok) throw new Error('upstash ' + r.status);
  const j = await r.json();
  return { n: Number(j[0].result), ttl: Number(j[2].result) };
}
async function incr(key, ttl) {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try { return await upstashIncr(key, ttl); } catch (e) { console.warn('[guard] upstash:', e.message); }
  }
  return memIncr(key, ttl);
}

// Devuelve null si todo bien, o { codigo, mensaje, reintentarEn }
export async function limitar(ip) {
  const dia = new Date().toISOString().slice(0, 10);
  const [m, d] = await Promise.all([incr(`chat:m:${ip}`, 60), incr(`chat:d:${dia}:${ip}`, 86400)]);
  if (m.n > LIM.min()) return { codigo: 'rate_minute', mensaje: 'Estás preguntando muy rápido. Espera un momento y vuelve a intentarlo.', reintentarEn: m.ttl };
  if (d.n > LIM.dia()) return { codigo: 'rate_day', mensaje: 'Has llegado al límite de preguntas de hoy. Vuelve mañana.', reintentarEn: d.ttl };
  if (process.env.UPSTASH_REDIS_REST_URL) {
    const g = await incr(`chat:g:${dia}`, 86400);
    if (g.n > LIM.global()) return { codigo: 'global_day', mensaje: 'El asistente ha alcanzado su límite diario gratuito. Vuelve mañana.', reintentarEn: g.ttl };
  }
  return null;
}

// Límites propios del tutor del Banco de Problemas (más estrictos: cada llamada es más cara)
export async function limitarTutor(ip, tipo) {
  const dia = new Date().toISOString().slice(0, 10);
  const maxDia = tipo === 'grade' ? Number(process.env.TUTOR_GRADE_DAY || 8) : Number(process.env.TUTOR_HINT_DAY || 40);
  const [m, d] = await Promise.all([incr(`tutor:m:${ip}`, 60), incr(`tutor:${tipo}:${dia}:${ip}`, 86400)]);
  if (m.n > 6) return { codigo: 'rate_minute', mensaje: 'Vas demasiado rápido. Espera un momento.', reintentarEn: m.ttl };
  if (d.n > maxDia) return { codigo: 'rate_day', mensaje: tipo === 'grade' ? 'Has llegado al límite diario de calificaciones. Vuelve mañana.' : 'Has llegado al límite diario de preguntas al tutor. Vuelve mañana.', reintentarEn: d.ttl };
  if (process.env.UPSTASH_REDIS_REST_URL) {
    const g = await incr(`tutor:g:${dia}`, 86400);
    if (g.n > Number(process.env.TUTOR_GLOBAL_DAY || 300)) return { codigo: 'global_day', mensaje: 'El tutor alcanzó su límite diario. Vuelve mañana.', reintentarEn: g.ttl };
  }
  return null;
}
