/* ══════════════════════════════════════════════════════════════
   Service Worker — Sitial de Talentos Cubanos (PWA / modo offline)

   Estrategias
   · Páginas (HTML) ........ red primero (siempre lo último publicado en
                             Vercel) y, si no hay red o tarda >4 s, la
                             copia guardada. Rutas bonitas sin conexión
                             (/Historial_Eventos/IChO, /Equipo/…,
                             /Banco_Problemas/<id>/<tab>) se resuelven
                             contra su página real.
   · Data/ y Problem_Data/ . red primero (3 s) → caché. Los datos se
                             actualizan solos al volver a tener internet.
   · Assets/ y JS/CSS UI ... caché primero + actualización en segundo plano.
   · Fuentes / CDN ......... caché primero + actualización en segundo plano.
   · Imágenes de Imgur ..... caché primero (máx. 250), pedidas con CORS para
                             no gastar cuota con respuestas "opacas".
   · /api/ ................. nunca se cachea.

   Todas las rutas se calculan relativas al scope del SW, así que
   funciona igual en Vercel (raíz) y en GitHub Pages (/Sitial_Talento/).

   Para forzar que todos los usuarios renueven la caché de la "carcasa"
   tras un cambio grande, sube VERSION.
   ══════════════════════════════════════════════════════════════ */
const VERSION   = 'v17';
const SHELL     = 'sitial-shell-' + VERSION;
const DATA      = 'sitial-data-' + VERSION;
const STATIC    = 'sitial-static-' + VERSION;
const IMAGES    = 'sitial-img-' + VERSION;
const MAX_IMGS  = 250;
const ROOT      = self.registration.scope;               // termina en "/"

const PRECACHE_SHELL = [
  '', 'index.html', 'media.html', 'noticias.html', 'Banco_Problemas.html',
  'equipo.html', 'offline.html', 'manifest.webmanifest',
  'Problem_Data/visor.html',
  'Assets/UI/modern-ui.css', 'Assets/UI/modern-ui.js',
  'Assets/UI/pwa.js', 'Assets/UI/tools.js', 'Assets/UI/chatbot.js',
  'Assets/UI/menu.js', 'Assets/vendor/xlsx.mini.min.js',
  'Assets/icons/icon-192.png', 'Assets/icons/icon-512.png'
];
const PRECACHE_DATA = [
  'Data/olympiad_data.html', 'Data/professor_data.html', 'Data/olympiad_date.html',
  'Data/media_data.html', 'Data/newspapers.html', 'Data/CNQ_data.html',
  'Data/honor_merece_ES.html', 'Data/honor_merece_EN.html', 'Data/entrevistas_data.html',
  'Problem_Data/problemas_data.html', 'Problem_Data/problemas_contenido.html',
  'Problem_Data/imagenes.html', 'Problem_Data/mol-graph.html'
];

const SPA_SECTIONS = ['Historial_Eventos', 'Historial_Medallas', 'Olimpiada_Cubana', 'Honor_Merece'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const add = async (name, list) => {
      const c = await caches.open(name);
      // allSettled: si un archivo no existe (404) no se cae toda la instalación
      await Promise.allSettled(list.map((p) => c.add(new Request(ROOT + p, { cache: 'reload' }))));
    };
    await add(SHELL, PRECACHE_SHELL);
    await add(DATA, PRECACHE_DATA);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL, DATA, STATIC, IMAGES];
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('sitial-') && !keep.includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// ── utilidades ──────────────────────────────────────────────────
function conTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function redGuardando(req, cacheName, ms) {
  const cache = await caches.open(cacheName);
  try {
    const net = fetch(req);
    const res = ms ? await conTimeout(net, ms) : await net;
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: false });
    if (hit) return hit;
    throw err;
  }
}

async function cachePrimero(req, cacheName, revalidar) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) {
    if (revalidar) fetch(req).then((r) => { if (r && r.ok) cache.put(req, r.clone()); }).catch(() => {});
    return hit;
  }
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

async function recortar(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function imagenImgur(req) {
  const cache = await caches.open(IMAGES);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  try {
    const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
    if (res && res.ok) {
      await cache.put(req.url, res.clone());
      recortar(IMAGES, MAX_IMGS);
    }
    return res;
  } catch (e) {
    return fetch(req); // sin CORS: que lo resuelva el navegador normalmente
  }
}

// Ruta relativa al scope, sin query ni hash
function rutaRel(url) {
  const u = new URL(url);
  return decodeURIComponent(u.pathname.slice(new URL(ROOT).pathname.length));
}

// Dada una ruta "bonita", devuelve la página real que la sirve (o null)
async function paginaParaRuta(rel, url) {
  const seg = rel.split('/').filter(Boolean);
  const cache = await caches.open(SHELL);
  const get = (p) => cache.match(ROOT + p, { ignoreSearch: true });
  if (!seg.length) return (await get('index.html')) || get('');
  if (SPA_SECTIONS.includes(seg[0])) return get('index.html');
  if (seg[0] === 'media') return get('media.html');
  if (seg[0] === 'noticias') return get('noticias.html');
  if (seg[0] === 'Banco_Problemas' && seg.length === 1) return get('Banco_Problemas.html');
  if (seg[0] === 'Banco_Problemas' && seg.length >= 2) {
    const q = '?id=' + encodeURIComponent(seg[1]) + '&tab=' + encodeURIComponent(seg[2] || 'enunciado');
    return Response.redirect(ROOT + 'Problem_Data/visor.html' + q, 302);
  }
  if (seg[0] === 'Equipo' && seg.length >= 2) {
    const q = '?ol=' + encodeURIComponent(seg[1]) + '&anio=' + encodeURIComponent(seg[2] || '') + (seg[3] ? '&sub=' + encodeURIComponent(seg[3]) : '');
    return Response.redirect(ROOT + 'equipo.html' + q, 302);
  }
  return null;
}

async function navegacion(req) {
  const rel = rutaRel(req.url);
  const cache = await caches.open(SHELL);
  try {
    // Con copia guardada no se espera más de 4 s a la red
    const tieneCopia = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req);
    const res = tieneCopia ? await conTimeout(net, 4000) : await net;
    if (res.ok) {
      cache.put(req, res.clone());
      return res;
    }
    // 404 de una ruta bonita: la resolvemos directamente con su página real
    if (res.status === 404) {
      const alt = await paginaParaRuta(rel, req.url);
      if (alt) return alt;
    }
    return res;
  } catch (err) {
    const exacta = await cache.match(req, { ignoreSearch: false }) || await cache.match(req, { ignoreSearch: true });
    if (exacta) return exacta;
    const alt = await paginaParaRuta(rel, req.url);
    if (alt) return alt;
    return (await cache.match(ROOT + 'offline.html')) || Response.error();
  }
}

// ── fetch ───────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Cross-origin
  if (url.origin !== location.origin) {
    if (url.hostname === 'i.imgur.com') { event.respondWith(imagenImgur(req)); return; }
    if (/(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com)$/.test(url.hostname)) {
      event.respondWith(cachePrimero(req, STATIC, true).catch(() => Response.error()));
    }
    return;
  }

  const rel = rutaRel(req.url);
  if (rel.startsWith('api/') || rel === 'sw.js') return;

  if (req.mode === 'navigate') { event.respondWith(navegacion(req)); return; }

  if (rel.startsWith('Data/') || rel.startsWith('Problem_Data/')) {
    event.respondWith(redGuardando(req, DATA, 3000).catch(() => Response.error()));
    return;
  }
  if (rel.startsWith('Assets/') || rel === 'manifest.webmanifest') {
    // JS/CSS de UI cambian con los despliegues: revalidar. Imágenes/logos: caché primero.
    const revalidar = /\.(js|css|webmanifest)$/.test(rel);
    event.respondWith(cachePrimero(req, STATIC, revalidar).catch(() => Response.error()));
  }
});
