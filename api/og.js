import { ImageResponse } from '@vercel/og';

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

export default async function handler(request) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const id = searchParams.get('id');

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
      loadGoogleFont('Playfair+Display:wght', '700', fontText),
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
          style: { width: '10px', height: '10px', borderRadius: '50%', background: GOLD_LIGHT },
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
      fonts: [
        { name: 'Playfair Display', data: playfair, weight: 700, style: 'normal' },
        { name: 'DM Sans', data: dmsans, weight: 400, style: 'normal' },
      ],
    });
  } catch (err) {
    return new Response(`Error generando la imagen OG: ${err.message}`, { status: 500 });
  }
}
