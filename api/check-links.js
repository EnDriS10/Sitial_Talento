// Cron diario (ver "crons" en vercel.json) que escanea las páginas del
// sitio en busca de enlaces de i.imgur.com y reporta cuáles ya no cargan
// (borrados, movidos o baneados por Imgur). No hay base de datos: el
// resultado se imprime en los logs de la función (Vercel → tu proyecto →
// pestaña "Logs" / "Cron Jobs") y, si defines la variable de entorno
// WEBHOOK_URL (p.ej. un webhook de Discord o Telegram), también se
// envía ahí un resumen.

export const config = { runtime: 'nodejs' };

// Páginas donde pueden aparecer imágenes de Imgur. Ajusta esta lista si
// agregas más archivos .html con contenido.
const PAGES_TO_SCAN = [
  '/index.html',
  '/media.html',
  '/noticias.html',
  '/Data/CNQ_data.html',
  '/Data/honor_merece_ES.html',
  '/Data/honor_merece_EN.html',
  '/Data/media_data.html',
  '/Data/newspapers.html',
  '/Data/olympiad_data.html',
  '/Data/professor_data.html',
  '/Problem_Data/problemas_contenido.html',
  '/Problem_Data/imagenes.html',
];

const IMGUR_RE = /https?:\/\/i\.imgur\.com\/[^\s"'<>)]+/g;

async function withTimeout(promise, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await promise(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function checkUrl(url) {
  try {
    const res = await withTimeout(
      (signal) => fetch(url, { method: 'HEAD', signal }),
      8000
    );
    // Imgur a veces no soporta HEAD correctamente en imágenes borradas
    // (devuelve 200 con una imagen "removed.png" en vez de 404), así que
    // si HEAD da 200, no hace falta más; si falla, reintenta con GET.
    if (res.status >= 400) return { url, status: res.status };
    return null;
  } catch {
    try {
      const res = await withTimeout((signal) => fetch(url, { signal }), 8000);
      if (res.status >= 400) return { url, status: res.status };
      return null;
    } catch (err) {
      return { url, status: 'error', error: String(err) };
    }
  }
}

// Ejecuta con un límite de concurrencia para no saturar Imgur ni el
// tiempo de ejecución de la función.
async function checkAllUrls(urls, concurrency = 8) {
  const broken = [];
  let i = 0;
  async function worker() {
    while (i < urls.length) {
      const url = urls[i++];
      const result = await checkUrl(url);
      if (result) broken.push(result);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return broken;
}

export default async function handler(request) {
  // Verificación del cron: Vercel envía "Authorization: Bearer <CRON_SECRET>"
  // en invocaciones reales de cron si defines CRON_SECRET como variable de
  // entorno. Si la defines, esto evita que cualquiera dispare el endpoint
  // manualmente. Si no la defines, el chequeo se salta (útil mientras
  // pruebas a mano visitando la URL en el navegador).
  if (process.env.CRON_SECRET) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response('No autorizado', { status: 401 });
    }
  }

  const origin = new URL(request.url).origin;
  const urlSet = new Set();

  for (const page of PAGES_TO_SCAN) {
    try {
      const res = await fetch(`${origin}${page}`);
      if (!res.ok) continue;
      const text = await res.text();
      for (const match of text.matchAll(IMGUR_RE)) {
        urlSet.add(match[0].replace(/[).,]+$/, ''));
      }
    } catch {
      // página no encontrada / error de red — se ignora y se sigue
    }
  }

  const allUrls = [...urlSet];
  const broken = await checkAllUrls(allUrls);

  const summary = {
    fecha: new Date().toISOString(),
    total_revisados: allUrls.length,
    rotos: broken.length,
    detalle: broken,
  };

  console.log('[check-links]', JSON.stringify(summary));

  if (process.env.WEBHOOK_URL && broken.length > 0) {
    const lines = broken.map((b) => `• ${b.url} → ${b.status}`).join('\n');
    try {
      await fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `⚠️ Sitial de Talentos: ${broken.length} enlace(s) de Imgur roto(s) de ${allUrls.length} revisados.\n${lines}`,
        }),
      });
    } catch (err) {
      console.error('[check-links] fallo enviando webhook', err);
    }
  }

  return new Response(JSON.stringify(summary, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}
