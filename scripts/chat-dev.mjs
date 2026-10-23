// Servidor local para probar el sitio + el chatbot SIN Vercel.
//   MISTRAL_API_KEY=tu_clave node scripts/chat-dev.mjs
//   → http://localhost:3000
// Sirve los archivos estáticos del repo (con 404.html para rutas bonitas) y
// monta api/chat.js con la misma firma que usa Vercel.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chat from '../api/chat.js';
import tutor from '../api/tutor.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3000);
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.md': 'text/markdown; charset=utf-8' };
const REWRITES = { '/media': '/media.html', '/noticias': '/noticias.html', '/Banco_Problemas': '/Banco_Problemas.html' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/chat' || url.pathname === '/api/tutor') {
    if (req.method === 'POST') {
      const partes = []; for await (const c of req) partes.push(c);
      try { req.body = JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'); } catch (e) { req.body = {}; }
    }
    return (url.pathname === '/api/tutor' ? tutor : chat)(req, res);
  }
  let p = REWRITES[url.pathname] || decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  let f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    const nf = fs.readFileSync(path.join(ROOT, '404.html'));
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(nf);
  }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log(`Sitial en http://localhost:${PORT}  (proveedores: ${Object.keys(process.env).filter((k) => /_API_KEY$/.test(k)).join(', ') || 'ninguno — define MISTRAL_API_KEY'})`));
