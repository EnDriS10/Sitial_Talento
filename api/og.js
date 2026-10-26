import { ImageResponse } from '@vercel/og';
import { datosEquipo, perfilHonor, fotoMedia, describirFoto, recortar, imgurTam } from './_lib/sitial-data.js';

export const config = { runtime: 'edge' };

// ────────────────────────────────────────────────────────────────────
// Paleta tomada directamente de :root en index.html
// ────────────────────────────────────────────────────────────────────
const NAVY = '#04122b';
const NAVY_MID = '#0b2150';
const GOLD_LIGHT = '#f0c84a';
const SILVER = '#b0bec5';
const BRONZE = '#a0522d';
const TEXT_MUTED = '#9fb0d0';

const DIFICULTAD_COLOR = { 1: BRONZE, 2: SILVER, 3: GOLD_LIGHT };
const DIFICULTAD_LABEL = { 1: 'Nivel 1', 2: 'Nivel 2', 3: 'Nivel 3' };

const TEMA_LABEL = {
  inorganica: 'Inorgánica',
  organica: 'Orgánica',
  fisica: 'Físico-química',
  analitica: 'Analítica',
};

// Caché: las vistas previas cambian poco; el CDN las guarda 1 día y las
// revalida en segundo plano (así una foto nueva se refleja sin esperar un año).
const IMG_HEADERS = {
  'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
};

function aBase64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}

// Descarga una imagen y la devuelve como data URI. Si falla (timeout, 404,
// formato no soportado como WebP, demasiado grande) devuelve null y la
// tarjeta usa iniciales: una foto rota NUNCA debe tumbar la imagen entera.
async function imgDataUri(url, { timeout = 3500, max = 2500000 } = {}) {
  if (!url) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    const r = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const ct = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!/^image\/(png|jpe?g|gif)$/.test(ct)) return null;
    const buf = await r.arrayBuffer();
    if (buf.byteLength > max) return null;
    return `data:${ct};base64,${aBase64(buf)}`;
  } catch {
    return null;
  }
}

// Solo los caracteres que de verdad se dibujan, para pedir el subconjunto
// mínimo de la fuente a Google Fonts (los emojis los pinta twemoji aparte).
function textoFuente(...partes) {
  return partes.join(' ').replace(/[^\u0020-\u024F\u2010-\u206F]/g, '') + ' 0123456789·–—×:,.()/…';
}

const MEDALLA_COLOR = { oro: GOLD_LIGHT, plata: SILVER, bronce: BRONZE, mencion: TEXT_MUTED };
const MEDALLA_EMOJI = { oro: '🥇', plata: '🥈', bronce: '🥉', mencion: '🎖' };

function slugify(nombre) {
  return (nombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Extrae los objetos { ... } de un array "const NOMBRE = [ ... ];" en
// texto plano, sin evaluarlo como JS (mismo enfoque que extractProblem).
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
    });
  }
  return objetos;
}

async function buildCuadrito(origin, slug) {
  const res = await fetch(`${origin}/Data/olympiad_data.html`);
  const text = await res.text();
  const arrays = ['datosIChO', 'datosIMChO', 'datosOIAQ', 'datosOCACQ', 'datosOtras'];
  const labels = ['IChO', 'IMChO', 'OIAQ', 'OCACQ', 'Otras'];
  let filas = [];
  arrays.forEach((arrName, i) => {
    filas = filas.concat(parseArrayObjetos(text, arrName).map((r) => ({ ...r, olimpiada: labels[i] })));
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
  const olimpiadas = [...new Set(propias.map((r) => r.olimpiada))].join(' · ');

  return { nombre, foto, rango, conteo, olimpiadas };
}

// Pequeño helper para construir el árbol de elementos que espera
// @vercel/og (el mismo shape que React.createElement) sin necesitar
// JSX ni un paso de build — este es un archivo .js plano.
function h(type, props, ...children) {
  return { type, props: { ...props, children: children.flat() } };
}

// Extrae un problema del array `datosProblemas` sin evaluar el archivo
// completo como JS (evita depender de un parser pesado en el edge).
function extractProblem(rawText, id) {
  const marker = `id: "${id}"`;
  const start = rawText.indexOf(marker);
  if (start === -1) return null;

  const objStart = rawText.lastIndexOf('{', start);
  let objEnd = rawText.indexOf('\n    },', start);
  if (objEnd === -1) objEnd = rawText.indexOf('\n    }', start);
  const block = rawText.slice(objStart, objEnd === -1 ? rawText.length : objEnd);

  const field = (re) => {
    const m = block.match(re);
    return m ? m[1] : null;
  };

  const titulo = field(/titulo:\s*"([^"]*)"/);
  const dificultad = Number(field(/dificultad:\s*(\d+)/)) || 1;
  const temasRaw = field(/temas:\s*\[([^\]]*)\]/);
  const temas = temasRaw
    ? temasRaw.split(',').map((s) => s.replace(/["'\s]/g, '')).filter(Boolean)
    : [];
  const fuente = field(/fuente:\s*"([^"]*)"/);

  if (!titulo) return null;
  return { titulo, dificultad, temas, fuente };
}

async function loadGoogleFont(family, weight, text) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(cssUrl)).text();
  const match = css.match(/src: url\(([^)]+)\) format\('(?:opentype|truetype)'\)/);
  if (match) {
    const res = await fetch(match[1]);
    if (res.status === 200) return await res.arrayBuffer();
  }
  throw new Error(`No se pudo cargar la fuente ${family}`);
}

async function renderCuadritoImage(origin, slug) {
  const cuadrito = await buildCuadrito(origin, slug);
  const nombre = cuadrito ? cuadrito.nombre : 'Sitial de Talentos Cubanos';
  const fontText = nombre + (cuadrito ? cuadrito.olimpiadas : '') + Object.values(MEDALLA_EMOJI).join('');
  const [playfair, dmsans, fotoData] = await Promise.all([
    loadGoogleFont('Playfair+Display', '700', fontText),
    loadGoogleFont('DM+Sans', '400', fontText),
    cuadrito && cuadrito.foto ? imgDataUri(imgurTam(cuadrito.foto, 'm')) : null,
  ]);

  const medallas = cuadrito
    ? ['oro', 'plata', 'bronce', 'mencion']
        .filter((m) => cuadrito.conteo[m] > 0)
        .map((m) =>
          h(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.08)',
                border: `2px solid ${MEDALLA_COLOR[m]}`,
                color: MEDALLA_COLOR[m],
                fontSize: '22px',
                fontWeight: 600,
              },
            },
            `${MEDALLA_EMOJI[m]} ×${cuadrito.conteo[m]}`
          )
        )
    : [];

  const avatar = fotoData
    ? h('img', {
        src: fotoData,
        width: 220,
        height: 220,
        style: { borderRadius: '50%', objectFit: 'cover', border: `4px solid ${GOLD_LIGHT}` },
      })
    : h(
        'div',
        {
          style: {
            display: 'flex',
            width: '220px',
            height: '220px',
            borderRadius: '50%',
            background: NAVY_MID,
            border: `4px solid ${GOLD_LIGHT}`,
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '72px',
            color: GOLD_LIGHT,
            fontFamily: 'Playfair Display',
          },
        },
        (nombre || '?').charAt(0)
      );

  const tree = h(
    'div',
    {
      style: {
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '64px',
        background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_MID} 100%)`,
        fontFamily: 'DM Sans',
      },
    },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '14px' } },
      h('div', {
        style: { display: 'flex', width: '10px', height: '10px', borderRadius: '50%', background: GOLD_LIGHT },
      }),
      h(
        'span',
        { style: { color: TEXT_MUTED, fontSize: '24px', letterSpacing: '2px', display: 'flex' } },
        'SITIAL DE TALENTOS CUBANOS · HISTORIAL POR MEDALLAS'
      )
    ),
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '48px' } },
      avatar,
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '20px' } },
        h(
          'div',
          {
            style: {
              display: 'flex',
              fontFamily: 'Playfair Display',
              fontWeight: 700,
              fontSize: nombre.length > 28 ? '52px' : '64px',
              color: GOLD_LIGHT,
              maxWidth: '820px',
            },
          },
          nombre
        ),
        cuadrito && cuadrito.olimpiadas
          ? h(
              'div',
              { style: { display: 'flex', color: TEXT_MUTED, fontSize: '26px' } },
              `${cuadrito.olimpiadas}${cuadrito.rango ? ' · ' + cuadrito.rango : ''}`
            )
          : null,
        h('div', { style: { display: 'flex', gap: '12px' } }, ...medallas)
      )
    )
  );

  return new ImageResponse(tree, {
    width: 1200,
    height: 630,
    headers: IMG_HEADERS,
    fonts: [
      { name: 'Playfair Display', data: playfair, weight: 700, style: 'normal' },
      { name: 'DM Sans', data: dmsans, weight: 400, style: 'normal' },
    ],
  });
}

// ════════════════════════════════════════════════════════════════════
// Tarjetas nuevas: equipo, perfil de honor (profesor/entrenador) y foto
// ════════════════════════════════════════════════════════════════════
async function cargarFuentes(texto) {
  const [playfair, dmsans] = await Promise.all([
    loadGoogleFont('Playfair+Display', '700', texto),
    loadGoogleFont('DM+Sans', '400', texto),
  ]);
  return [
    { name: 'Playfair Display', data: playfair, weight: 700, style: 'normal' },
    { name: 'DM Sans', data: dmsans, weight: 400, style: 'normal' },
  ];
}

function barraSuperior(texto) {
  return h(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: '14px' } },
    h('div', { style: { display: 'flex', width: '10px', height: '10px', borderRadius: '50%', background: GOLD_LIGHT } }),
    h('span', { style: { color: TEXT_MUTED, fontSize: '24px', letterSpacing: '2px', display: 'flex' } }, texto)
  );
}

function pie(origin) {
  return h(
    'div',
    { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: TEXT_MUTED, fontSize: '22px' } },
    h('span', { style: { display: 'flex' } }, new URL(origin).host),
    h('span', { style: { display: 'flex', color: GOLD_LIGHT, letterSpacing: '1px' } }, 'Talentos Cubanos · Olimpiadas de Química')
  );
}

function marco(...hijos) {
  return h(
    'div',
    {
      style: {
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '56px 64px',
        background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_MID} 100%)`,
        fontFamily: 'DM Sans',
      },
    },
    ...hijos
  );
}

function circulo(dataUri, nombre, tam, anillo) {
  const base = { width: `${tam}px`, height: `${tam}px`, borderRadius: '50%', border: `4px solid ${anillo}` };
  if (dataUri) {
    return h('img', { src: dataUri, width: tam, height: tam, style: { ...base, objectFit: 'cover' } });
  }
  const ini = String(nombre || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return h(
    'div',
    {
      style: {
        ...base,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: NAVY_MID,
        color: GOLD_LIGHT,
        fontFamily: 'Playfair Display',
        fontSize: `${Math.round(tam * 0.34)}px`,
      },
    },
    ini
  );
}

// ImageResponse renderiza dentro del stream de la respuesta: si algo falla,
// el error NO llega a nuestro try/catch y el cliente recibe una imagen rota.
// Por eso se consume entera aquí (await) antes de responder: así cualquier
// fallo es capturable y el handler puede degradar a la imagen genérica.
async function responder(tree, fonts) {
  const r = new ImageResponse(tree, { width: 1200, height: 630, headers: IMG_HEADERS, fonts });
  const buf = await r.arrayBuffer();
  return new Response(buf, { status: 200, headers: r.headers });
}

async function renderEquipoImage(origin, ol, anio, sub) {
  const eq = await datosEquipo(origin, ol, anio, sub);
  if (!eq) return null;

  // Hasta 6 caras: primero los estudiantes (por medalla) y, si sobra sitio, los profesores.
  const miembros = [...eq.est, ...eq.prof].slice(0, 6);
  const mentores = recortar(eq.prof.map((p) => p.nombre).filter(Boolean).slice(0, 3).join(' · '), 80);
  const sedeTxt = [eq.pais, eq.sede].filter(Boolean).join(' ') + (eq.ed ? ` · Edición ${eq.ed}` : '');

  const fontText = textoFuente(
    eq.titulo, eq.largo, sedeTxt, mentores, miembros.map((m) => m.nombre).join(' '),
    'SITIAL DE TALENTOS CUBANOS · EQUIPO CUBANO participantes participante Mentores Talentos Cubanos Olimpiadas de Química', new URL(origin).host
  );
  const [fonts, ...fotos] = await Promise.all([
    cargarFuentes(fontText),
    ...miembros.map((m) => (m.foto ? imgDataUri(imgurTam(m.foto, 'm')) : null)),
  ]);

  const chips = ['oro', 'plata', 'bronce', 'mencion']
    .filter((m) => eq.conteo[m] > 0)
    .map((m) =>
      h(
        'div',
        {
          style: {
            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 18px', borderRadius: '999px',
            background: 'rgba(255,255,255,0.08)', border: `2px solid ${MEDALLA_COLOR[m]}`,
            color: MEDALLA_COLOR[m], fontSize: '22px', fontWeight: 600,
          },
        },
        `${MEDALLA_EMOJI[m]} ×${eq.conteo[m]}`
      )
    );

  const n = eq.est.length;
  const participantes = n ? `${n} ${n === 1 ? 'participante' : 'participantes'}` : null;

  const izquierda = h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: '16px', width: '560px' } },
    h(
      'div',
      { style: { display: 'flex', fontFamily: 'Playfair Display', fontWeight: 700, fontSize: eq.titulo.length > 12 ? '56px' : eq.titulo.length > 9 ? '72px' : '88px', color: GOLD_LIGHT, lineHeight: 1.05 } },
      eq.titulo
    ),
    h('div', { style: { display: 'flex', color: TEXT_MUTED, fontSize: '26px', lineHeight: 1.25 } }, recortar(eq.largo, 70)),
    sedeTxt ? h('div', { style: { display: 'flex', color: '#dbe5f7', fontSize: '28px' } }, sedeTxt) : null,
    h(
      'div',
      { style: { display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '6px' } },
      participantes
        ? h('div', { style: { display: 'flex', padding: '8px 18px', borderRadius: '999px', background: GOLD_LIGHT, color: NAVY, fontSize: '22px', fontWeight: 600 } }, participantes)
        : null,
      ...chips
    )
  );

  const derecha = miembros.length
    ? h(
        'div',
        { style: { display: 'flex', flexWrap: 'wrap', gap: '22px', width: '494px', justifyContent: 'center' } },
        ...miembros.map((m, i) => circulo(fotos[i], m.nombre, 150, MEDALLA_COLOR[m.medalla] || TEXT_MUTED))
      )
    : null;

  const tree = marco(
    barraSuperior('SITIAL DE TALENTOS CUBANOS · EQUIPO CUBANO'),
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '48px' } }, izquierda, derecha),
    mentores
      ? h('div', { style: { display: 'flex', color: TEXT_MUTED, fontSize: '22px' } }, `Mentores: ${mentores}`)
      : pie(origin)
  );
  return await responder(tree, fonts);
}

async function renderProfesorImage(origin, id) {
  const p = await perfilHonor(origin, id);
  if (!p) return null;

  const desc = recortar(p.desc, 190);
  const fontText = textoFuente(p.nombre, p.role, p.subtitulo, desc, p.iniciales,
    'SITIAL DE TALENTOS CUBANOS · HONOR A QUIEN HONOR MERECE Talentos Cubanos Olimpiadas de Química', new URL(origin).host);
  const [fonts, fotoData] = await Promise.all([
    cargarFuentes(fontText),
    p.foto ? imgDataUri(imgurTam(p.foto, 'l')) : null,
  ]);

  const tree = marco(
    barraSuperior('SITIAL DE TALENTOS CUBANOS · HONOR A QUIEN HONOR MERECE'),
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '48px' } },
      circulo(fotoData, p.nombre, 260, GOLD_LIGHT),
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '14px', width: '780px' } },
        p.role
          ? h(
              'div',
              { style: { display: 'flex' } },
              h('div', { style: { display: 'flex', padding: '6px 18px', borderRadius: '999px', border: `2px solid ${GOLD_LIGHT}`, color: GOLD_LIGHT, fontSize: '20px', letterSpacing: '2px' } }, p.role.toUpperCase())
            )
          : null,
        h(
          'div',
          { style: { display: 'flex', fontFamily: 'Playfair Display', fontWeight: 700, fontSize: p.nombre.length > 26 ? '50px' : '62px', lineHeight: 1.1, color: GOLD_LIGHT } },
          p.nombre
        ),
        p.subtitulo ? h('div', { style: { display: 'flex', color: TEXT_MUTED, fontSize: '24px', lineHeight: 1.25 } }, recortar(p.subtitulo, 110)) : null,
        desc ? h('div', { style: { display: 'flex', color: '#cdd8ee', fontSize: '24px', lineHeight: 1.35 } }, desc) : null
      )
    ),
    pie(origin)
  );
  return await responder(tree, fonts);
}

async function renderFotoImage(origin, nombre) {
  const f = await fotoMedia(origin, nombre);
  if (!f) return null;
  const data = await imgDataUri(imgurTam(f.link, 'h'), { timeout: 6000, max: 3500000 });
  // Si no se pudo preparar la foto, quien llama redirige a la foto original.
  if (!data) return { fallback: f.link };

  const { evento, fecha } = describirFoto(nombre);
  const titulo = evento ? `${evento}` : 'Sitial de Talentos Cubanos';
  const sub = fecha ? fecha.larga : 'Galería de fotos';
  const fonts = await cargarFuentes(textoFuente(titulo, sub, 'SITIAL DE TALENTOS CUBANOS · GALERÍA DE FOTOS', new URL(origin).host));

  const tree = h(
    'div',
    { style: { width: '1200px', height: '630px', display: 'flex', position: 'relative', background: NAVY, fontFamily: 'DM Sans' } },
    h('img', { src: data, width: 1200, height: 630, style: { position: 'absolute', top: 0, left: 0, width: '1200px', height: '630px', objectFit: 'cover' } }),
    h(
      'div',
      {
        style: {
          position: 'absolute', top: '36px', left: '44px', display: 'flex', padding: '8px 20px', borderRadius: '999px',
          background: 'rgba(4,18,43,0.78)', color: GOLD_LIGHT, fontSize: '22px', letterSpacing: '2px',
        },
      },
      'SITIAL DE TALENTOS CUBANOS · GALERÍA DE FOTOS'
    ),
    h(
      'div',
      {
        style: {
          position: 'absolute', left: 0, bottom: 0, width: '1200px', height: '230px', display: 'flex', flexDirection: 'column',
          justifyContent: 'flex-end', gap: '4px', padding: '0 64px 40px',
          background: 'linear-gradient(to top, rgba(4,18,43,0.96) 0%, rgba(4,18,43,0) 100%)',
        },
      },
      h('div', { style: { display: 'flex', fontFamily: 'Playfair Display', fontWeight: 700, fontSize: '68px', color: GOLD_LIGHT } }, titulo),
      h('div', { style: { display: 'flex', fontSize: '30px', color: '#ffffff' } }, sub)
    )
  );
  return await responder(tree, fonts);
}

export default async function handler(request) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const id = searchParams.get('id');
    const tipo = searchParams.get('tipo');

    if (tipo === 'cuadrito') {
      const slug = searchParams.get('slug');
      return await renderCuadritoImage(origin, slug || '');
    }

    // Tarjetas nuevas. Si el dato no existe (null) se cae a la imagen genérica
    // de abajo en vez de devolver un error: una vista previa siempre es mejor
    // que ninguna.
    if (tipo === 'equipo') {
      const r = await renderEquipoImage(origin, searchParams.get('ol'), searchParams.get('anio'), searchParams.get('sub'));
      if (r) return r;
    } else if (tipo === 'profesor') {
      const r = await renderProfesorImage(origin, searchParams.get('id') || '');
      if (r) return r;
    } else if (tipo === 'foto') {
      const r = await renderFotoImage(origin, searchParams.get('n') || '');
      if (r && r.fallback) return Response.redirect(r.fallback, 302);
      if (r) return r;
    }

    let titulo = 'Sitial de Talentos Cubanos';
    let subtitulo = 'Olimpiadas de Química';
    let dificultad = null;
    let temas = [];
    let fuente = null;

    if (id) {
      const dataRes = await fetch(`${origin}/Problem_Data/problemas_data.html`);
      const dataText = await dataRes.text();
      const problema = extractProblem(dataText, id);
      if (problema) {
        titulo = problema.titulo;
        subtitulo = 'Banco de Problemas';
        dificultad = problema.dificultad;
        temas = problema.temas;
        fuente = problema.fuente;
      }
    }

    const fontText = titulo + subtitulo + (fuente || '') + Object.values(TEMA_LABEL).join('');
    const [playfair, dmsans] = await Promise.all([
      loadGoogleFont('Playfair+Display', '700', fontText),
      loadGoogleFont('DM+Sans', '400', fontText),
    ]);

    const badges = dificultad
      ? h(
          'div',
          { style: { display: 'flex', gap: '12px' } },
          h(
            'div',
            {
              style: {
                display: 'flex',
                padding: '8px 20px',
                borderRadius: '999px',
                background: DIFICULTAD_COLOR[dificultad],
                color: NAVY,
                fontSize: '22px',
                fontWeight: 600,
              },
            },
            DIFICULTAD_LABEL[dificultad]
          ),
          ...temas.map((t) =>
            h(
              'div',
              {
                style: {
                  display: 'flex',
                  padding: '8px 20px',
                  borderRadius: '999px',
                  border: `2px solid ${TEXT_MUTED}`,
                  color: TEXT_MUTED,
                  fontSize: '22px',
                },
              },
              TEMA_LABEL[t] || t
            )
          )
        )
      : null;

    const tree = h(
      'div',
      {
        style: {
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px',
          background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_MID} 100%)`,
          fontFamily: 'DM Sans',
        },
      },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '14px' } },
        h('div', {
          style: { display: 'flex', width: '10px', height: '10px', borderRadius: '50%', background: GOLD_LIGHT },
        }),
        h(
          'span',
          { style: { color: TEXT_MUTED, fontSize: '24px', letterSpacing: '2px', display: 'flex' } },
          `SITIAL DE TALENTOS CUBANOS · ${subtitulo.toUpperCase()}`
        )
      ),
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '24px' } },
        badges,
        h(
          'div',
          {
            style: {
              display: 'flex',
              fontFamily: 'Playfair Display',
              fontWeight: 700,
              fontSize: titulo.length > 45 ? '54px' : '68px',
              lineHeight: 1.15,
              color: GOLD_LIGHT,
              maxWidth: '1000px',
            },
          },
          titulo
        ),
        fuente
          ? h('div', { style: { display: 'flex', color: TEXT_MUTED, fontSize: '26px' } }, fuente)
          : null
      )
    );

    return new ImageResponse(tree, {
      width: 1200,
      height: 630,
      headers: IMG_HEADERS,
      fonts: [
        { name: 'Playfair Display', data: playfair, weight: 700, style: 'normal' },
        { name: 'DM Sans', data: dmsans, weight: 400, style: 'normal' },
      ],
    });
  } catch (err) {
    console.error('[og]', err && err.stack ? err.stack : err);
    // Para las tarjetas con parámetros, degradar a la imagen genérica del
    // sitio (sin parámetros → no puede haber bucle) en lugar de un 500.
    try {
      const u = new URL(request.url);
      if (u.searchParams.get('tipo')) return Response.redirect(`${u.origin}/api/og`, 302);
    } catch (e) {}
    return new Response(`Error generando la imagen OG: ${err.message}`, { status: 500 });
  }
}
