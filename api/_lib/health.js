// ════════════════════════════════════════════════════════════════════
// Salud de los proveedores de IA ("cortacircuitos")
// ════════════════════════════════════════════════════════════════════
// Cuando un modelo/proveedor se queda sin cuota (429), falla (5xx/timeout)
// o tiene la clave mal, se anota un "enfriamiento": durante ese tiempo el
// chat ni lo intenta y pasa directamente al siguiente, sin hacer esperar al
// usuario. Al terminar el enfriamiento se vuelve a probar solo.
//
// El estado se comparte entre instancias de Vercel si defines Upstash Redis
// (UPSTASH_REDIS_REST_URL / _TOKEN); si no, vive en la memoria de cada
// instancia (también funciona, solo que cada instancia aprende por separado).
// ════════════════════════════════════════════════════════════════════

const mem = new Map();          // clave → { hasta (ms), motivo, fallos }
const redisOn = () => !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

async function redis(cmds) {
  const r = await fetch(process.env.UPSTASH_REDIS_REST_URL.replace(/\/$/, '') + '/pipeline', {
    method: 'POST', headers: { Authorization: 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds), signal: AbortSignal.timeout(1500),
  });
  if (!r.ok) throw new Error('upstash ' + r.status);
  return r.json();
}

// Cuánto enfriar según el tipo de error (segundos)
export function cooldownDe({ status, retryAfter, cuerpo, fallos }) {
  const txt = String(cuerpo || '').toLowerCase();
  if (status === 429) {
    const diaria = /per day|daily|tpd|rpd|quota|exhausted|billing|credits/.test(txt);
    if (retryAfter > 0) return Math.min(Math.max(retryAfter, 2), diaria ? 3600 : 900);
    return diaria ? 1800 : 45;                       // cuota diaria: reintentar en 30 min; por minuto: 45 s
  }
  if (status === 402) return 6 * 3600;                // sin saldo/crédito
  if (status === 401 || status === 403) return 3600; // clave inválida o sin permiso
  if (status === 404) return 6 * 3600;                // modelo inexistente
  if (status === 400) return 600;                     // petición rechazada por ese modelo
  const escala = [30, 120, 300, 600];                 // 5xx / timeout / red / respuesta vacía
  return escala[Math.min((fallos || 1) - 1, escala.length - 1)];
}

export async function marcarMal(clave, opts) {
  const prev = mem.get(clave);
  const fallos = (prev && prev.hasta > Date.now() - 600000 ? prev.fallos : 0) + 1;
  const seg = cooldownDe({ ...opts, fallos });
  mem.set(clave, { hasta: Date.now() + seg * 1000, motivo: opts.motivo || String(opts.status || 'error'), fallos });
  if (redisOn()) redis([['SET', 'chat:cool:' + clave, String(Date.now() + seg * 1000), 'EX', Math.max(1, Math.ceil(seg))]]).catch(() => {});
  return seg;
}
export function marcarBien(clave) {
  if (mem.has(clave)) mem.delete(clave);
  if (redisOn()) redis([['DEL', 'chat:cool:' + clave]]).catch(() => {});
}

// Devuelve Map clave → ms restantes de enfriamiento (0 = sano)
export async function estado(claves) {
  const ahora = Date.now();
  const out = new Map();
  for (const k of claves) { const e = mem.get(k); out.set(k, e && e.hasta > ahora ? e.hasta - ahora : 0); }
  if (redisOn()) {
    try {
      const res = await redis(claves.map((k) => ['GET', 'chat:cool:' + k]));
      claves.forEach((k, i) => {
        const v = Number(res[i] && res[i].result);
        if (v && v > ahora) out.set(k, Math.max(out.get(k), v - ahora));
      });
    } catch (e) { /* sin Redis seguimos con la memoria local */ }
  }
  return out;
}
