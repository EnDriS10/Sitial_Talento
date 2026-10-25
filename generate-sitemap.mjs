#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Generador de sitemap.xml — Sitial de Talentos Cubanos
// ════════════════════════════════════════════════════════════════════
// Uso (desde la raíz del repo):
//     node scripts/generate-sitemap.mjs
//
// Lee (solo lectura) los mismos archivos de datos que usa el sitio y
// escribe ./sitemap.xml con TODAS las URLs "bonitas" reales:
//   · páginas fijas y secciones/subsecciones del SPA (index.html)
//   · /Equipo/<Olimpiada>/<año>         ← de Data/olympiad_data.html
//   · /Banco_Problemas/<id>             ← de Problem_Data/problemas_data.html
//   · /Honor_Merece/<Cat>/<id>          ← de Data/honor_merece_ES.html
//   · /Historial_Medallas/cuadrito=<s>  ← de Data/olympiad_data.html
//
// No modifica ningún otro archivo (Problem_Data y sw.js solo se leen /
// ni se tocan).
// ════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEN = 'https://sitialtalento.vercel.app';

// Pon a false si no quieres las ~150 URLs de tarjetas individuales.
const INCLUIR_CUADRITOS = true;

const leer = (ruta) => readFileSync(join(RAIZ, ruta), 'utf8');

// Fecha del último commit que tocó alguno de esos archivos (YYYY-MM-DD).
function lastmod(...archivos) {
  try {
    const out = execSync(`git log -1 --format=%cs -- ${archivos.join(' ')}`, {
      cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    if (out) return out;
  } catch { /* sin git: se usa la fecha de hoy */ }
  return new Date().toISOString().slice(0, 10);
}

// Mismo slugify que middleware.js (tiene que coincidir letra por letra).
const slugify = (n) => (n || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Datos ───────────────────────────────────────────────────────────
const olimp = leer('Data/olympiad_data.html');
const ARRAYS = [
  ['datosIChO', 'IChO'], ['datosIMChO', 'IMChO'], ['datosOIAQ', 'OIAQ'],
  ['datosOCACQ', 'OCACQ'], ['datosOtras', 'Otros'],
];
const añosPor = {};
const nombres = new Set();
for (const [arr, ruta] of ARRAYS) {
  const m = olimp.match(new RegExp(`const\\s+${arr}\\s*=\\s*\\[([\\s\\S]*?)\\n\\];`));
  if (!m) { console.warn(`⚠ No se encontró ${arr} en olympiad_data.html`); continue; }
  añosPor[ruta] = [...new Set([...m[1].matchAll(/año:\s*(\d+)/g)].map((x) => +x[1]))]
    .sort((a, b) => b - a);
  for (const n of m[1].matchAll(/nombre:\s*"([^"]+)"/g)) nombres.add(slugify(n[1]));
}

const problemas = [...new Set(
  [...leer('Problem_Data/problemas_data.html').matchAll(/\bid:\s*"([^"]+)"/g)].map((x) => x[1]),
)];

const honorRaw = leer('Data/honor_merece_ES.html')
  .match(/<script type="application\/json" id="honor-data">([\s\S]*?)<\/script>/);
const honor = honorRaw ? JSON.parse(honorRaw[1]) : [];

// ── Construcción ────────────────────────────────────────────────────
const dSPA = lastmod('index.html', 'Data/olympiad_data.html', 'Data/professor_data.html');
const dCNQ = lastmod('index.html', 'Data/CNQ_data.html');
const dHonor = lastmod('Data/honor_merece_ES.html', 'Data/honor_merece_EN.html');
const dEquipo = lastmod('equipo.html', 'Data/olympiad_data.html', 'Data/professor_data.html');
const dBanco = lastmod('Banco_Problemas.html', 'Problem_Data/problemas_data.html');
const dMedia = lastmod('media.html', 'Data/media_data.html');
const dNoticias = lastmod('noticias.html', 'Data/newspapers.html', 'Data/entrevistas_data.html');

const urls = [];
const add = (ruta, mod, freq, prio) => urls.push({ loc: ORIGEN + ruta, mod, freq, prio });

add('/', dSPA, 'weekly', '1.0');

// Historial por Eventos
add('/Historial_Eventos/IChO', dSPA, 'monthly', '0.9');
for (const o of ['IMChO', 'OIAQ', 'OCACQ', 'Otros']) add(`/Historial_Eventos/${o}`, dSPA, 'monthly', '0.7');

// Historial por Medallas
add('/Historial_Medallas', dSPA, 'monthly', '0.8');

// Olimpiada Cubana (CNQ)
add('/Olimpiada_Cubana', dCNQ, 'monthly', '0.9');
for (const s of ['Ranking', 'Concursos', 'Estadisticas']) add(`/Olimpiada_Cubana/${s}`, dCNQ, 'monthly', '0.6');

// Honor a Quien Honor Merece
add('/Honor_Merece', dHonor, 'monthly', '0.7');
add('/Honor_Merece/Entrenadores', dHonor, 'monthly', '0.7');
add('/Honor_Merece/Proceres', dHonor, 'monthly', '0.7');
for (const p of honor) {
  const cat = String(p.Entrenador) === '1' ? 'Entrenadores' : 'Proceres';
  add(`/Honor_Merece/${cat}/${encodeURIComponent(p.id)}`, dHonor, 'monthly', '0.5');
}

// Enlaces y Contacto
add('/Contacto', dSPA, 'yearly', '0.4');

// Páginas independientes
add('/Banco_Problemas', dBanco, 'monthly', '0.8');
for (const id of problemas) add(`/Banco_Problemas/${encodeURIComponent(id)}`, dBanco, 'monthly', '0.6');
add('/noticias', dNoticias, 'weekly', '0.7');
add('/media', dMedia, 'monthly', '0.5');

// Equipo por olimpiada y año
for (const [, ruta] of ARRAYS) {
  for (const año of añosPor[ruta] || []) add(`/Equipo/${ruta}/${año}`, dEquipo, 'yearly', ruta === 'IChO' ? '0.6' : '0.5');
}

// Tarjetas individuales (middleware.js les pone título/OG propios)
if (INCLUIR_CUADRITOS) {
  for (const slug of [...nombres].sort()) add(`/Historial_Medallas/cuadrito=${slug}`, dSPA, 'yearly', '0.3');
}

const cuerpo = urls.map((u) =>
  `  <url>\n    <loc>${xml(u.loc)}</loc>\n    <lastmod>${u.mod}</lastmod>\n` +
  `    <changefreq>${u.freq}</changefreq>\n    <priority>${u.prio}</priority>\n  </url>`,
).join('\n');

const salida = `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${cuerpo}\n</urlset>\n`;

writeFileSync(join(RAIZ, 'sitemap.xml'), salida);
console.log(`✓ sitemap.xml escrito con ${urls.length} URLs`);
