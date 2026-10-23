// Acceso a internet en tiempo real para el asistente.
// Proveedores (en orden): Tavily (si hay TAVILY_API_KEY; plan gratuito mensual) y
// Wikipedia (sin clave, siempre disponible). Todo con timeout corto: si falla,
// el chat sigue funcionando solo con los datos del Sitial.
// LLM_BASE_URL_TAVILY / WEB_WIKI_BASE existen para pruebas locales.

const CACHE = new Map();
const TTL = 10 * 60 * 1000;
const T_MS = Number(process.env.WEB_TIMEOUT_MS || 4500);

async function getJSON(url, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), T_MS);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
const limpia = (s, n = 500) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, n);

async function tavily(q) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const base = process.env.LLM_BASE_URL_TAVILY || 'https://api.tavily.com/search';
  const d = await getJSON(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ query: q, max_results: 4, search_depth: 'basic', include_answer: false, topic: /noticia|news|hoy|today|ultim|latest|recent/i.test(q) ? 'news' : 'general' }),
  });
  return (d.results || []).filter((x) => x.score == null || x.score >= 0.45).map((x) => ({ title: limpia(x.title, 120), url: x.url, snippet: limpia(x.content, 600) }));
}

async function wikipedia(q, lang) {
  const base = process.env.WEB_WIKI_BASE || `https://${lang}.wikipedia.org`;
  const u = base + '/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=3&gsrsearch=' + encodeURIComponent(q) +
    '&prop=extracts|info&exintro=1&explaintext=1&exchars=700&inprop=url';
  const d = await getJSON(u, { headers: { 'User-Agent': 'SitialTalentoBot/1.0 (https://sitialtalento.vercel.app)' } });
  const pages = Object.values((d.query && d.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  return pages.map((p) => ({ title: limpia(p.title, 120), url: p.fullurl, snippet: limpia(p.extract, 700) })).filter((x) => x.snippet);
}

export async function buscarWeb(consulta, lang = 'es') {
  const q = String(consulta || '').trim().slice(0, 200);
  if (!q) return [];
  const k = lang + '|' + q.toLowerCase();
  const hit = CACHE.get(k);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  let res = [];
  try { res = await tavily(q); } catch (e) { console.error('[web] tavily:', e.message); }
  if (!res.length) {
    try { res = await wikipedia(q, lang === 'en' ? 'en' : 'es'); } catch (e) { console.error('[web] wikipedia:', e.message); }
    if (!res.length && lang !== 'en') { try { res = await wikipedia(q, 'en'); } catch (e) {} }
  }
  if (CACHE.size > 200) CACHE.clear();
  CACHE.set(k, { t: Date.now(), v: res });
  return res;
}

export function contextoWeb(res) {
  return res.map((x, i) => `[W${i + 1}] ${x.title}\n${x.snippet}\nFuente: ${x.url}`).join('\n\n');
}
