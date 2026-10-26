// ════════════════════════════════════════════════════════════════════
// /sitemap.xml — generado AUTOMÁTICAMENTE a partir de Data/
// ════════════════════════════════════════════════════════════════════
// vercel.json reescribe /sitemap.xml → /api/sitemap. Cada vez que se pide
// (y la CDN lo refresca cada hora) lee los mismos archivos de datos que usa
// el sitio, así que al añadir un año, un competidor, un problema o un
// perfil de honor, su URL aparece sola en el sitemap: no hay nada que
// regenerar ni que subir a mano.
//
//   · secciones y subsecciones del SPA (index.html)
//   · /Equipo/<Olimpiada>/<año>           ← Data/olympiad_data.html + professor_data.html
//   · /Historial_Medallas/cuadrito=<slug> ← Data/olympiad_data.html
//   · /Banco_Problemas/<id>               ← Problem_Data/problemas_data.html (solo lectura)
//   · /Honor_Merece/<Cat>/<id>            ← Data/honor_merece_ES.html
//
// IMPORTANTE: no debe existir un sitemap.xml estático en la raíz del repo;
// Vercel sirve primero los archivos estáticos y taparía esta función.
// ════════════════════════════════════════════════════════════════════
import {
  OL, OL_KEYS, slugify,
  cargarOlimpiadas, cargarProfesores, cargarHonor, cargarIdsProblemas,
} from './_lib/sitial-data.js';

export const config = { runtime: 'edge' };

// Dominio canónico (el que va en robots.txt). Se puede cambiar con la
// variable de entorno SITE_URL en Vercel si algún día cambia el dominio.
const SITE = ((typeof process !== 'undefined' && process.env && process.env.SITE_URL) || 'https://sitialtalento.vercel.app').replace(/\/$/, '');

// false → no incluye las ~150 URLs de tarjetas individuales (cuadritos).
const INCLUIR_CUADRITOS = true;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default async function handler(request) {
  try {
    const origin = new URL(request.url).origin; // de dónde leer Data/ (este mismo despliegue)
    const [olim, prof, honor, problemas] = await Promise.all([
      cargarOlimpiadas(origin), cargarProfesores(origin), cargarHonor(origin), cargarIdsProblemas(origin),
    ]);

    const urls = [];
    const add = (ruta, freq, prio) => urls.push({ loc: SITE + ruta, freq, prio });

    add('/', 'weekly', '1.0');

    // Historial por Eventos
    add('/Historial_Eventos/IChO', 'monthly', '0.9');
    for (const o of ['IMChO', 'OIAQ', 'OCACQ', 'Otros']) add(`/Historial_Eventos/${o}`, 'monthly', '0.7');

    // Historial por Medallas
    add('/Historial_Medallas', 'monthly', '0.8');

    // Olimpiada Cubana
    add('/Olimpiada_Cubana', 'monthly', '0.9');
    for (const s of ['Ranking', 'Concursos', 'Estadisticas']) add(`/Olimpiada_Cubana/${s}`, 'monthly', '0.6');

    // Honor a Quien Honor Merece (+ un perfil por entrada de honor_merece_ES.html)
    add('/Honor_Merece', 'monthly', '0.7');
    add('/Honor_Merece/Entrenadores', 'monthly', '0.7');
    add('/Honor_Merece/Proceres', 'monthly', '0.7');
    for (const p of honor) {
      const cat = String(p.Entrenador) === '1' ? 'Entrenadores' : 'Proceres';
      add(`/Honor_Merece/${cat}/${encodeURIComponent(p.id)}`, 'monthly', '0.5');
    }

    add('/Contacto', 'yearly', '0.4');

    // Páginas independientes + un problema por id
    add('/Banco_Problemas', 'monthly', '0.8');
    for (const id of problemas) add(`/Banco_Problemas/${encodeURIComponent(id)}`, 'monthly', '0.6');
    add('/noticias', 'weekly', '0.7');
    add('/media', 'monthly', '0.5');

    // Equipo por olimpiada y año: todos los años que tengan estudiantes o profesores
    for (const k of OL_KEYS) {
      const años = new Set();
      for (const r of [...(olim[k] || []), ...(prof[k] || [])]) if (r.año) años.add(r.año);
      for (const año of [...años].sort((a, b) => b - a)) {
        add(`/Equipo/${OL[k].ruta}/${año}`, 'yearly', k === 'icho' ? '0.6' : '0.5');
      }
    }

    // Tarjetas individuales del Historial por Medallas (una por persona)
    if (INCLUIR_CUADRITOS) {
      const slugs = new Set();
      for (const k of OL_KEYS) for (const r of olim[k] || []) if (r.nombre) slugs.add(slugify(r.nombre));
      slugs.delete('');
      for (const slug of [...slugs].sort()) add(`/Historial_Medallas/cuadrito=${slug}`, 'yearly', '0.3');
    }

    // Sin duplicados (por si dos fuentes generan la misma ruta)
    const vistos = new Set();
    const unicas = urls.filter((u) => (vistos.has(u.loc) ? false : vistos.add(u.loc)));

    const cuerpo = unicas.map((u) =>
      `  <url>\n    <loc>${esc(u.loc)}</loc>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.prio}</priority>\n  </url>`
    ).join('\n');

    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${cuerpo}\n</urlset>\n`,
      {
        status: 200,
        headers: {
          'content-type': 'application/xml; charset=utf-8',
          // 1 h en la CDN y se refresca en segundo plano hasta 1 día
          'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (err) {
    console.error('[sitemap]', err);
    return new Response(`No se pudo generar el sitemap: ${err.message}`, { status: 500 });
  }
}
