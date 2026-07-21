#!/usr/bin/env node
/**
 * Genera páginas estáticas de "compartir" para cada foto en Assets/Media.
 *
 * Por qué existe este script
 * ---------------------------
 * WhatsApp, Facebook, Telegram, etc. generan la vista previa de un enlace
 * leyendo las etiquetas <meta property="og:*"> del HTML tal cual lo devuelve
 * el servidor — sus "crawlers" NO ejecutan JavaScript. Como Sitial de
 * Talentos es un sitio 100% estático (GitHub Pages) donde las fotos se
 * cargan dinámicamente con JS desde la API de GitHub, el archivo media.html
 * siempre tiene las mismas etiquetas <meta> genéricas sin importar qué foto
 * se esté viendo (?foto=...). Por eso el link compartido no mostraba la
 * imagen correcta.
 *
 * Este script crea, para cada foto, un archivo diminuto en share/<slug>.html
 * con las etiquetas og:image / og:title correctas para ESA foto, y que
 * redirige de inmediato (meta refresh + JS) a media.html?foto=<archivo> para
 * la persona que sí abre el enlace. Los crawlers ven el <meta>; los humanos
 * ven la app normal.
 *
 * Se ejecuta automáticamente vía GitHub Actions
 * (.github/workflows/paginas-compartir.yml) cada vez que se suben o borran
 * fotos en Assets/Media. También se puede correr a mano:
 *
 *   node scripts/generar-paginas-compartir.js
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const DIR_MEDIA = path.join(RAIZ, 'Assets', 'Media');
const DIR_SHARE = path.join(RAIZ, 'share');
const RAMA = process.env.GITHUB_REF_NAME || 'main';

function repoInfo() {
    // En GitHub Actions esta variable viene como "owner/repo"
    if (process.env.GITHUB_REPOSITORY) {
        const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
        return { owner, repo };
    }
    // Fallback para ejecución local: intenta leerlo del remoto de git
    try {
        const { execSync } = require('child_process');
        const remoto = execSync('git config --get remote.origin.url').toString().trim();
        const m = remoto.match(/[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/);
        if (m) return { owner: m[1], repo: m[2] };
    } catch (_) { /* ignorar */ }
    return { owner: 'EnDriS10', repo: 'Sitial_Talento' };
}

function baseUrlPaginas(owner, repo) {
    // Si existe un CNAME (dominio propio), se respeta; si no, la URL típica
    // de un project site de GitHub Pages.
    const cname = path.join(RAIZ, 'CNAME');
    if (fs.existsSync(cname)) {
        const dominio = fs.readFileSync(cname, 'utf8').trim();
        return `https://${dominio}/`;
    }
    return `https://${owner}.github.io/${repo}/`;
}

function slug(nombreArchivo) {
    // Los nombres siguen el patrón DD_MM_AAAA_evento[_num].ext (ya son
    // seguros para URL), así que basta con quitar la extensión.
    return nombreArchivo.replace(/\.[^.]+$/, '');
}

function escaparHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function paginaCompartir({ archivo, urlImagen, urlPagina, urlDestino }) {
    const titulo = 'Sitial de Talentos Cubanos';
    const descripcion = 'Mira esta foto en el Sitial de Talentos Cubanos.';
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaparHtml(titulo)}</title>
<meta name="robots" content="noindex">

<!-- Open Graph: esto es lo que leen WhatsApp / Facebook / Telegram / etc. -->
<meta property="og:type" content="website">
<meta property="og:title" content="${escaparHtml(titulo)}">
<meta property="og:description" content="${escaparHtml(descripcion)}">
<meta property="og:image" content="${escaparHtml(urlImagen)}">
<meta property="og:image:secure_url" content="${escaparHtml(urlImagen)}">
<meta property="og:url" content="${escaparHtml(urlPagina)}">
<meta property="og:site_name" content="${escaparHtml(titulo)}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escaparHtml(titulo)}">
<meta name="twitter:description" content="${escaparHtml(descripcion)}">
<meta name="twitter:image" content="${escaparHtml(urlImagen)}">

<!-- Redirección para quien sí abre el enlace (los crawlers no llegan a esto) -->
<meta http-equiv="refresh" content="0; url=${escaparHtml(urlDestino)}">
<script>location.replace(${JSON.stringify(urlDestino)});</script>
</head>
<body>
<p style="font-family:sans-serif">
  Abriendo la foto… si no ocurre automáticamente,
  <a href="${escaparHtml(urlDestino)}">toca aquí</a>.
</p>
</body>
</html>
`;
}

function main() {
    const { owner, repo } = repoInfo();
    const base = baseUrlPaginas(owner, repo);

    if (!fs.existsSync(DIR_MEDIA)) {
        console.error(`No existe ${DIR_MEDIA}; nada que generar.`);
        process.exit(0);
    }
    fs.mkdirSync(DIR_SHARE, { recursive: true });

    const archivos = fs.readdirSync(DIR_MEDIA)
        .filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f));

    const generados = new Set();
    for (const archivo of archivos) {
        const s = slug(archivo);
        const urlImagen = `https://raw.githubusercontent.com/${owner}/${repo}/${RAMA}/Assets/Media/${encodeURIComponent(archivo)}`;
        const urlPagina = `${base}share/${s}.html`;
        const urlDestino = `${base}media.html?foto=${encodeURIComponent(archivo)}`;
        const html = paginaCompartir({ archivo, urlImagen, urlPagina, urlDestino });
        fs.writeFileSync(path.join(DIR_SHARE, `${s}.html`), html, 'utf8');
        generados.add(`${s}.html`);
    }

    // Elimina páginas de compartir de fotos que ya no existen
    for (const existente of fs.readdirSync(DIR_SHARE)) {
        if (existente.endsWith('.html') && !generados.has(existente)) {
            fs.unlinkSync(path.join(DIR_SHARE, existente));
        }
    }

    console.log(`Listo: ${generados.size} página(s) de compartir generadas en share/.`);
}

main();
