// ════════════════════════════════════════════════════════════════════
// Cliente LLM: varios proveedores y modelos gratuitos con relevo automático
// ════════════════════════════════════════════════════════════════════
// Todos hablan el protocolo "OpenAI-compatible" (/chat/completions + stream),
// incluido DeepSeek: el tutor del Banco de Problemas reutilizará este código.
//
// · Un "objetivo" = proveedor + modelo. Cada modelo gratuito tiene su propia
//   cuota, así que se encadenan varios (p. ej. mistral-small → gemini-flash
//   → groq gpt-oss-20b → …) intercalando proveedores distintos primero.
// · Si un objetivo se queda sin cuota o falla, se anota un enfriamiento
//   (health.js) y la PETICIÓN ACTUAL pasa al siguiente sin esperar; las
//   siguientes peticiones ni lo intentan hasta que pase el enfriamiento.
// · Si el fallo ocurre ya emitiendo texto no se puede cambiar de modelo a
//   mitad de frase: se avisa de que se cortó.
// ════════════════════════════════════════════════════════════════════
import { estado, marcarMal, marcarBien } from './health.js';

export const PROVEEDORES = {
  mistral: {
    env: 'MISTRAL_API_KEY',
    url: 'https://api.mistral.ai/v1/chat/completions',
    modelos: ['mistral-small-latest', 'open-mistral-nemo'],
  },
  gemini: {
    env: 'GEMINI_API_KEY',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    modelos: ['gemini-flash-latest', 'gemini-flash-lite-latest'],
  },
  groq: {
    env: 'GROQ_API_KEY',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    modelos: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'],
    extra: (m) => (/gpt-oss/.test(m) ? { reasoning_effort: 'low' } : {}),
  },
  openrouter: {
    env: 'OPENROUTER_API_KEY',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    modelos: ['meta-llama/llama-3.3-70b-instruct:free'],
  },
  deepseek: {                      // de pago: solo entra si lo pones en LLM_PROVIDERS
    env: 'DEEPSEEK_API_KEY',
    url: 'https://api.deepseek.com/chat/completions',
    modelos: ['deepseek-chat'],
  },
};

const ORDEN_DEFECTO = 'mistral,gemini,groq,openrouter';

function modelosDe(nombre) {
  const p = PROVEEDORES[nombre];
  const env = process.env[nombre.toUpperCase() + '_MODELS'] || process.env[nombre.toUpperCase() + '_MODEL'];
  const lista = env ? env.split(',').map((s) => s.trim()).filter(Boolean) : p.modelos;
  return lista;
}

export function proveedoresActivos(orden) {
  return (orden || process.env.LLM_PROVIDERS || ORDEN_DEFECTO).split(',').map((s) => s.trim().toLowerCase())
    .filter((n) => PROVEEDORES[n] && process.env[PROVEEDORES[n].env]);
}

// Lista ordenada de objetivos. LLM_TARGETS="mistral:mistral-small-latest,groq:openai/gpt-oss-20b" la fija a mano.
export function objetivos(orden) {
  if (process.env.LLM_TARGETS) {
    return process.env.LLM_TARGETS.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
      const i = s.indexOf(':'); return { prov: s.slice(0, i).toLowerCase(), modelo: s.slice(i + 1) };
    }).filter((t) => PROVEEDORES[t.prov] && process.env[PROVEEDORES[t.prov].env] && t.modelo)
      .map((t) => ({ ...t, clave: t.prov + ':' + t.modelo }));
  }
  const provs = proveedoresActivos(orden);
  const listas = provs.map((n) => modelosDe(n));
  const out = [];
  const rondas = Math.max(0, ...listas.map((l) => l.length));
  for (let r = 0; r < rondas; r++) {
    provs.forEach((n, i) => { if (listas[i][r]) out.push({ prov: n, modelo: listas[i][r], clave: n + ':' + listas[i][r] }); });
  }
  return out;
}

const urlDe = (nombre) => process.env['LLM_BASE_URL_' + nombre.toUpperCase()] || PROVEEDORES[nombre].url;

class ErrorObjetivo extends Error {
  constructor(msg, extra) { super(msg); Object.assign(this, extra); }
}

async function abrir(t, { messages, maxTokens, temperature, signal }) {
  const p = PROVEEDORES[t.prov];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error('timeout')), Number(process.env.LLM_FIRST_BYTE_MS || 10000));
  const onAbort = () => ctl.abort(signal.reason);
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
  let res;
  try {
    res = await fetch(urlDe(t.prov), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env[p.env] },
      body: JSON.stringify({ model: t.modelo, messages, stream: true, max_tokens: maxTokens, temperature, ...(p.extra ? p.extra(t.modelo) : {}) }),
      signal: ctl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (signal && signal.aborted) throw e;            // el usuario cerró: no es culpa del modelo
    throw new ErrorObjetivo(/timeout|abort/i.test(String(e.message)) ? 'timeout' : 'red: ' + e.message, { status: 0 });
  }
  clearTimeout(timer);
  if (!res.ok) {
    const cuerpo = (await res.text().catch(() => '')).slice(0, 400);
    const ra = Number(res.headers.get('retry-after')) || 0;
    throw new ErrorObjetivo(`HTTP ${res.status} ${cuerpo.slice(0, 160)}`, { status: res.status, retryAfter: ra, cuerpo });
  }
  return { res, limpiar: () => signal && signal.removeEventListener('abort', onAbort) };
}

// Emite { meta:{proveedor,modelo,intentos} } y luego { texto } …
export async function* chatStream(opts) {
  const todos = objetivos(opts.orden);
  if (!todos.length) {
    const e = new Error('Ningún proveedor de IA configurado (faltan las claves API).'); e.status = 503; e.todos = true; throw e;
  }
  const sal = await estado(todos.map((t) => t.clave));
  // Primero los sanos (en su orden); luego, como último recurso, los enfriados por el que antes se recupere
  const sanos = todos.filter((t) => !sal.get(t.clave));
  const enfriados = todos.filter((t) => sal.get(t.clave)).sort((a, b) => sal.get(a.clave) - sal.get(b.clave));
  const cola = [...sanos, ...enfriados.slice(0, 1)];
  const maxIntentos = Number(process.env.LLM_MAX_ATTEMPTS || 5);
  const limite = Date.now() + Number(process.env.LLM_TOTAL_MS || 24000);
  const errores = [];
  let intentos = 0;

  for (const t of cola) {
    if (intentos >= maxIntentos || Date.now() > limite) break;
    intentos++;
    let abierto;
    try {
      abierto = await abrir(t, opts);
    } catch (e) {
      if (opts.signal && opts.signal.aborted) throw e;
      errores.push(`${t.clave}: ${e.message}`);
      const seg = await marcarMal(t.clave, { status: e.status, retryAfter: e.retryAfter, cuerpo: e.cuerpo, motivo: e.message });
      console.warn(`[llm] ${t.clave} falló (${e.message}); enfriado ${seg}s`);
      // Clave inválida / sin saldo: afecta a TODOS los modelos de ese proveedor
      if ([401, 402, 403].includes(e.status)) {
        for (const o of todos) if (o.prov === t.prov && o.clave !== t.clave) await marcarMal(o.clave, { status: e.status, motivo: 'proveedor: ' + e.message });
      }
      continue;
    }
    const reader = abierto.res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', emitido = false, metaEnviado = false;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const linea = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!linea.startsWith('data:')) continue;
          const dato = linea.slice(5).trim();
          if (dato === '[DONE]') { buf = ''; break; }
          let j; try { j = JSON.parse(dato); } catch (e) { continue; }
          if (j.error) throw new ErrorObjetivo(String(j.error.message || 'error del proveedor'), { status: Number(j.error.code) || 500, cuerpo: JSON.stringify(j.error) });
          const delta = j.choices && j.choices[0] && j.choices[0].delta;
          const texto = delta && typeof delta.content === 'string' ? delta.content : '';
          if (texto) {
            if (!metaEnviado) { metaEnviado = true; yield { meta: { proveedor: t.prov, modelo: t.modelo, intentos } }; }
            emitido = true; yield { texto };
          }
        }
      }
      if (emitido) { marcarBien(t.clave); return; }
      errores.push(`${t.clave}: respuesta vacía`);
      await marcarMal(t.clave, { status: 0, motivo: 'vacía' });
    } catch (e) {
      if (opts.signal && opts.signal.aborted) throw e;
      if (emitido) { await marcarMal(t.clave, { status: e.status || 0, retryAfter: e.retryAfter, cuerpo: e.cuerpo, motivo: e.message }); throw e; }
      errores.push(`${t.clave}: ${e.message}`);
      await marcarMal(t.clave, { status: e.status || 0, retryAfter: e.retryAfter, cuerpo: e.cuerpo, motivo: e.message });
    } finally {
      abierto.limpiar();
      try { reader.releaseLock(); } catch (e) {}
    }
  }
  const err = new Error('Todos los proveedores fallaron: ' + errores.join(' | '));
  err.todos = true; err.status = 502;
  throw err;
}

// Para el endpoint de estado
export async function resumenSalud() {
  const ts = objetivos();
  const sal = await estado(ts.map((t) => t.clave));
  return ts.map((t) => ({ objetivo: t.clave, enfriamientoSeg: Math.ceil((sal.get(t.clave) || 0) / 1000) }));
}
