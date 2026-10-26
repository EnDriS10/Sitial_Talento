// ════════════════════════════════════════════════════════════════════
// Edge Middleware — OG dinámico por página
// ════════════════════════════════════════════════════════════════════
// Intercepta 3 tipos de URL compartible ANTES de que Vercel resuelva el
// archivo estático correspondiente, y devuelve ese mismo HTML pero con
// los meta tags Open Graph (título, descripción, imagen) rellenados
// para ESE cuadrito / foto / problema en concreto. Así, cuando alguien
// pega el enlace en WhatsApp, Telegram, etc., el bot que genera la
// vista previa (que NO ejecuta JavaScript) ve datos correctos — no el
// título genérico del sitio.
//
//   /Historial_Medallas/cuadrito=<slug>   → tarjeta de un competidor
//   /media  ó  /media.html   ?foto=<name> → una foto de la galería
//   /Banco_Problemas/<id>/<tab>           → un problema del banco
//
// Para cualquier otra ruta, la función no devuelve nada y Vercel sigue
// resolviendo la petición normalmente (archivo estático, rewrite, 404).
// ════════════════════════════════════════════════════════════════════

import { datosEquipo, perfilHonor, fotoMedia, describirFoto, recortar } from './api/_lib/sitial-data.js';

export const config = {
  matcher: [
    '/Historial_Medallas/:path*',
    '/media',
    '/media.html',
    '/Banco_Problemas/:path*',
    '/Equipo/:path*',
    '/equipo.html',
    '/Honor_Merece/:path*',
  ],
};

const MEDALLA_LABEL = {
  oro: 'Medalla de Oro',
  plata: 'Medalla de Plata',
  bronce: 'Medalla de Bronce',
  mencion: 'Mención Honorífica',
};

function slugify(nombre) {
  return (nombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Extrae los objetos { ... } de un array "const NOMBRE = [ ... ];" en
// texto plano, sin evaluarlo como JS.
function parseArrayObjetos(rawText, arrayName) {
  const arrRe = new RegExp(`const\\s+${arrayName}\\s*=\\s*\\[([\\s\\S]*?)\\n\\];`);
  const m = rawText.match(arrRe);
  if (!m) return [];
  const body = m[1];
  const objetos = [];
  const objRe = /\{([^{}]*)\}/g;
  let om;
  while ((om = objRe.exec(body))) {
    const chunk = om[1];
    const str = (key) => {
      const mm = chunk.match(new RegExp(key + ':\\s*"([^"]*)"'));
      return mm ? mm[1] : null;
    };
    const num = (key) => {
      const mm = chunk.match(new RegExp(key + ':\\s*(\\d+)'));
      return mm ? Number(mm[1]) : null;
    };
    objetos.push({
      año: num('año'),
      nombre: str('nombre'),
      medalla: str('medalla'),
      foto: str('foto'),
      prov: str('prov'),
    });
  }
  return objetos;
}

async function buildCuadritoOG(origin, slug) {
  const res = await fetch(`${origin}/Data/olympiad_data.html`);
  if (!res.ok) return null;
  const text = await res.text();

  const arrays = ['datosIChO', 'datosIMChO', 'datosOIAQ', 'datosOCACQ', 'datosOtras'];
  const labels = ['IChO', 'IMChO', 'OIAQ', 'OCACQ', 'Otras'];
  let filas = [];
  arrays.forEach((arrName, i) => {
    const rows = parseArrayObjetos(text, arrName).map((r) => ({ ...r, olimpiada: labels[i] }));
    filas = filas.concat(rows);
  });

  const propias = filas.filter((r) => r.nombre && slugify(r.nombre) === slug);
  if (propias.length === 0) return null;

  const nombre = propias[0].nombre;
  const foto = propias.find((r) => r.foto)?.foto || null;
  const años = propias.map((r) => r.año).filter(Boolean);
  const rango = años.length
    ? Math.min(...años) === Math.max(...años)
      ? `${Math.min(...años)}`
      : `${Math.min(...años)}–${Math.max(...años)}`
    : '';

  const conteo = { oro: 0, plata: 0, bronce: 0, mencion: 0 };
  propias.forEach((r) => {
    if (conteo[r.medalla] !== undefined) conteo[r.medalla]++;
  });
  const mejor = ['oro', 'plata', 'bronce', 'mencion'].find((m) => conteo[m] > 0);
  const olimpiadas = [...new Set(propias.map((r) => r.olimpiada))].join(', ');

  const descBits = [];
  if (mejor) descBits.push(MEDALLA_LABEL[mejor]);
  if (olimpiadas) descBits.push(olimpiadas);
  if (rango) descBits.push(rango);

  const imgQs = new URLSearchParams({ tipo: 'cuadrito', slug });
  return {
    title: `${nombre} — Sitial de Talentos Cubanos`,
    description: descBits.join(' · ') || 'Historial por Medallas — Sitial de Talentos Cubanos',
    image: `${origin}/api/og?${imgQs.toString()}`,
  };
}

async function buildMediaOG(origin, fotoName) {
  const f = await fotoMedia(origin, fotoName);
  if (!f) return null;
  const { evento, fecha } = describirFoto(fotoName);
  return {
    title: `Foto — ${evento || 'Sitial de Talentos Cubanos'}${fecha ? ' · ' + fecha.corta : ''}`,
    description: 'Galería de fotos — Sitial de Talentos Cubanos, Olimpiadas de Química.',
    // Tarjeta de marca con la propia foto de fondo (api/og?tipo=foto). Si la
    // foto no se puede preparar, esa ruta redirige a la imagen original.
    image: `${origin}/api/og?${new URLSearchParams({ tipo: 'foto', n: fotoName }).toString()}`,
  };
}

async function buildEquipoOG(origin, ol, año, sub) {
  const eq = await datosEquipo(origin, ol, año, sub);
  if (!eq) return null;
  const sedeTxt = [eq.pais, eq.sede].filter(Boolean).join(' ');
  const n = eq.est.length;
  const desc =
    `${eq.titulo}: ${n} ${n === 1 ? 'participante' : 'participantes'}, ` +
    `${eq.nMed} ${eq.nMed === 1 ? 'medalla' : 'medallas'}${sedeTxt ? ' · ' + sedeTxt : ''}`;
  const qs = new URLSearchParams({ tipo: 'equipo', ol: eq.K, anio: String(eq.año) });
  if (eq.sub) qs.set('sub', eq.sub);
  return {
    title: `${eq.titulo} — Equipo cubano | Sitial de Talentos`,
    description: desc,
    image: `${origin}/api/og?${qs.toString()}`,
    url: origin + eq.ruta,
  };
}

async function buildHonorOG(origin, id) {
  const p = await perfilHonor(origin, id);
  if (!p) return null;
  return {
    title: `${p.nombre} — Honor a quien Honor Merece`,
    description: recortar(p.desc || p.subtitulo || p.role, 200) || 'Honor a quien Honor Merece — Sitial de Talentos Cubanos',
    image: `${origin}/api/og?${new URLSearchParams({ tipo: 'profesor', id: p.id }).toString()}`,
    url: origin + p.ruta,
  };
}

async function buildProblemaOG(origin, id) {
  const res = await fetch(`${origin}/Problem_Data/problemas_data.html`);
  if (!res.ok) return null;
  const text = await res.text();
  const marker = `id: "${id}"`;
  const start = text.indexOf(marker);
  if (start === -1) return null;
  const objStart = text.lastIndexOf('{', start);
  let objEnd = text.indexOf('\n    },', start);
  if (objEnd === -1) objEnd = text.indexOf('\n    }', start);
  const block = text.slice(objStart, objEnd === -1 ? text.length : objEnd);
  const field = (re) => {
    const m = block.match(re);
    return m ? m[1] : null;
  };
  const titulo = field(/titulo:\s*"([^"]*)"/);
  const descripcion = field(/descripcion:\s*"([^"]*)"/);
  const fuente = field(/fuente:\s*"([^"]*)"/);
  if (!titulo) return null;

  return {
    title: `${titulo} — Banco de Problemas`,
    description: descripcion || fuente || 'Banco de Problemas — Sitial de Talentos Cubanos',
    image: `${origin}/api/og?id=${encodeURIComponent(id)}`,
  };
}

// Reemplaza el contenido de un <meta property="X" content="...">
// (o <meta name="X" content="...">) existente. Si el tag no existe en
// el HTML no hace nada — por eso cada página necesita ya tener sus
// meta tags OG/Twitter por defecto (ver instrucciones adjuntas).
function setMetaAttr(html, attr, key, content) {
  const re = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(">)`);
  return html.replace(re, `$1${escapeHtml(content)}$2`);
}

async function injectMeta(fetchHtmlPromise, og, pageUrl, extraHeadScript) {
  const res = await fetchHtmlPromise;
  if (!res.ok) return null;
  let html = await res.text();

  // URL canónica de la página compartida (og.url si la ruta bonita difiere de
  // la petición, p.ej. /equipo.html?ol=icho&anio=2026 → /Equipo/IChO/2026).
  const urlFinal = og.url || pageUrl;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(og.title)}</title>`);
  html = setMetaAttr(html, 'name', 'description', og.description);
  html = setMetaAttr(html, 'property', 'og:title', og.title);
  html = setMetaAttr(html, 'property', 'og:description', og.description);
  html = setMetaAttr(html, 'property', 'og:url', urlFinal);
  html = html.replace(/(<link rel="canonical"[^>]*?href=")[^"]*(")/, (m, a, b) => a + escapeHtml(urlFinal) + b);
  html = setMetaAttr(html, 'name', 'twitter:title', og.title);
  html = setMetaAttr(html, 'name', 'twitter:description', og.description);
  // og:image / twitter:image llevan una URL, no texto — sin escapar comillas HTML.
  html = html.replace(/(<meta property="og:image" content=")[^"]*(">)/, `$1${og.image}$2`);
  html = html.replace(/(<meta name="twitter:image" content=")[^"]*(">)/, `$1${og.image}$2`);

  // IMPORTANTE: como esta respuesta se sirve directamente bajo la URL
  // bonita (sin que el navegador pase nunca por la URL/​query real),
  // los scripts propios de la página que calculan la carpeta base o
  // leen id/tab del query string quedan mal (ven un pathname más
  // "profundo" de lo que en verdad es, y un location.search vacío).
  // Este script se inserta AL FINAL del <head> — así corre DESPUÉS de
  // esos scripts originales y corrige lo que hizo falta.
  if (extraHeadScript) {
    html = html.replace('</head>', `<script>${extraHeadScript}</script>\n</head>`);
  }

  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const { pathname, searchParams, origin } = url;

  try {
    // 1) Cuadrito de Historial por Medallas
    const cuadritoMatch = pathname.match(/^\/Historial_Medallas\/cuadrito=(.+)$/);
    if (cuadritoMatch) {
      const slug = decodeURIComponent(cuadritoMatch[1]);
      // El HTML base se pide en paralelo con los datos (antes iban en serie).
      const htmlPromise = fetch(`${origin}/index.html`);
      htmlPromise.catch(() => {});
      const og = await buildCuadritoOG(origin, slug);
      if (og) {
        // index.html calcula su <base id="app-base-href"> a partir de
        // location.pathname asumiendo que termina en "index.html" o "/".
        // Aquí el pathname visible es /Historial_Medallas/cuadrito=...,
        // así que ese cálculo automático sale mal — lo forzamos a la
        // raíz del sitio explícitamente.
        const fixScript = `document.getElementById('app-base-href').href = location.origin + '/';`;
        const out = await injectMeta(htmlPromise, og, request.url, fixScript);
        if (out) return out;
      }
    }

    // 2) Foto individual de Media
    if ((pathname === '/media' || pathname === '/media.html') && searchParams.get('foto')) {
      const og = await buildMediaOG(origin, searchParams.get('foto'));
      if (og) {
        // media.html vive en la raíz igual que "/media", así que su
        // carpeta base no cambia — no hace falta script de corrección.
        const out = await injectMeta(fetch(`${origin}/media.html`), og, request.url);
        if (out) return out;
      }
    }

    // 3) Problema individual del Banco de Problemas
    const problemaMatch = pathname.match(/^\/Banco_Problemas\/([^/]+)(?:\/([^/]+))?$/);
    if (problemaMatch) {
      const id = decodeURIComponent(problemaMatch[1]);
      const tab = problemaMatch[2] ? decodeURIComponent(problemaMatch[2]) : 'enunciado';
      const og = await buildProblemaOG(origin, id);
      if (og) {
        // visor.html asume que, si llegó por la ruta bonita, en algún
        // momento pasó por una navegación REAL a
        // /Problem_Data/visor.html?id=..&tab=.. (vía 404.html) — de ahí
        // saca su <base> y sus variables __pvId/__pvTab. Aquí eso nunca
        // ocurre (servimos el HTML directo bajo la URL bonita), así que
        // fijamos ambas cosas a mano con los valores que ya conocemos
        // por el propio path de la petición.
        const fixScript =
          `document.getElementById('pv-base-href').href = location.origin + '/Problem_Data/';` +
          `window.__pvId = ${JSON.stringify(id)};` +
          `window.__pvTab = ${JSON.stringify(tab)};`;
        const out = await injectMeta(
          fetch(`${origin}/Problem_Data/visor.html`),
          og,
          request.url,
          fixScript
        );
        if (out) return out;
      }
    }

    // 4) Equipo de una olimpiada/año (ruta bonita o enlace con query)
    let eqArgs = null;
    const equipoPath = pathname.match(/^\/Equipo\/([^/]+)\/(\d{4})(?:\/([^/]+))?\/?$/);
    if (equipoPath) {
      eqArgs = [
        decodeURIComponent(equipoPath[1]),
        equipoPath[2],
        equipoPath[3] ? decodeURIComponent(equipoPath[3]) : null,
      ];
    } else if (pathname === '/equipo.html' && searchParams.get('ol') && searchParams.get('anio')) {
      eqArgs = [searchParams.get('ol'), searchParams.get('anio'), searchParams.get('sub')];
    }
    if (eqArgs) {
      const og = await buildEquipoOG(origin, ...eqArgs);
      if (og) {
        // equipo.html calcula su <base> y sus parámetros a partir de
        // location (que aquí ya es la ruta bonita), así que no necesita
        // script de corrección.
        const out = await injectMeta(fetch(`${origin}/equipo.html`), og, request.url);
        if (out) return out;
      }
    }

    // 5) Perfil de honor (entrenador / prócer): /Honor_Merece/<Cat>/<id>
    const honorMatch = pathname.match(/^\/Honor_Merece\/(?:Entrenadores|Proceres)\/([^/]+)\/?$/);
    if (honorMatch) {
      const og = await buildHonorOG(origin, decodeURIComponent(honorMatch[1]));
      if (og) {
        const fixScript = `document.getElementById('app-base-href').href = location.origin + '/';`;
        const out = await injectMeta(fetch(`${origin}/index.html`), og, request.url, fixScript);
        if (out) return out;
      }
    }
  } catch (err) {
    console.error('[middleware OG]', err);
  }

  // Nada que inyectar aquí: dejar que Vercel siga resolviendo la
  // petición de forma normal (archivo estático, rewrite o 404.html).
  return undefined;
}
