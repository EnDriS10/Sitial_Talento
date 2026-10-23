// Genera Data/vectores.json: embeddings SEMÁNTICOS de todo el contenido del Sitial (para el chatbot).
//   GEMINI_API_KEY=… node scripts/build-vectores.mjs            (gratis; 256 dimensiones)
//   MISTRAL_API_KEY=… EMBED_PROVIDER=mistral node scripts/build-vectores.mjs
// Se ejecuta una vez (y cada vez que cambien mucho los datos). Los fragmentos cuyo texto cambió
// se detectan por hash y simplemente dejan de usar el vector viejo hasta que lo regeneres.
// Es opcional: sin este archivo el chatbot usa solo el campo vectorial local + BM25.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { obtenerKB } from '../api/_lib/kb.js';
import { embeber, proveedorEmb, b64 } from '../api/_lib/vectores.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prov = proveedorEmb(process.env.EMBED_PROVIDER);
if (!prov) { console.error('Falta GEMINI_API_KEY (o MISTRAL_API_KEY).'); process.exit(1); }
const kb = obtenerKB();
const chunks = kb.idx.chunks;
const LOTE = prov === 'gemini' ? 50 : 32;
const items = {};
let dim = 0;
console.log(`Proveedor: ${prov} · ${chunks.length} fragmentos`);
for (let i = 0; i < chunks.length; i += LOTE) {
  const lote = chunks.slice(i, i + LOTE);
  let vs = null;
  for (let intento = 1; intento <= 4 && !vs; intento++) {
    try { vs = await embeber(prov, lote.map((c) => c._t), 'doc', 30000); }
    catch (e) { console.warn(`  lote ${i / LOTE + 1}: ${e.message} (intento ${intento})`); await new Promise((r) => setTimeout(r, 4000 * intento)); }
  }
  if (!vs) { console.error('No se pudo completar. Vuelve a ejecutarlo más tarde.'); process.exit(1); }
  lote.forEach((c, j) => { items[c.id] = { h: c._h, v: b64(vs[j]) }; dim = vs[j].length; });
  process.stdout.write(`\r  ${Math.min(i + LOTE, chunks.length)}/${chunks.length}`);
  await new Promise((r) => setTimeout(r, prov === 'gemini' ? 1500 : 1100));
}
const modelo = prov === 'gemini' ? 'gemini-embedding-001' : 'mistral-embed';
fs.writeFileSync(path.join(ROOT, 'Data', 'vectores.json'), JSON.stringify({ proveedor: prov, modelo, dim, generado: new Date().toISOString(), items }));
console.log(`\nListo: Data/vectores.json (${(fs.statSync(path.join(ROOT, 'Data', 'vectores.json')).size / 1024).toFixed(0)} KB)`);
