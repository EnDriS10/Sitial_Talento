// Esquemas de síntesis y moléculas del motor gráfico (Problem_Data/mol-graph.html) en forma de TEXTO,
// para que el tutor «vea» lo que el estudiante ve: cada compuesto con su SMILES y cada flecha con sus reactivos.
import { leer } from './kb.js';

let _c = null;
function cargar() {
  if (_c) return _c;
  const html = leer('Problem_Data/mol-graph.html') || '';
  const mols = {};
  const bloque = (html.match(/const MOLS = \{([\s\S]*?)\n\s*\};/) || [])[1] || '';
  for (const m of bloque.matchAll(/['"]([\w\-.]+)['"]\s*:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
    mols[m[1]] = (m[2] ?? m[3]).replace(/\\\\/g, '\\');
  }
  const esq = {};
  for (const m of html.matchAll(/SCHEMES\['([^']+)'\]\s*=\s*\(\)\s*=>\s*freeHost\(`([\s\S]*?)`\)/g)) esq[m[1]] = m[2].replace(/\\\\/g, '\\');
  _c = { mols, esq };
  return _c;
}

export function smilesDe(id) { return cargar().mols[id] || null; }

// DSL del esquema libre → texto legible (resuelve m:id a su SMILES)
export function dslATexto(dsl) {
  const { mols } = cargar();
  const out = [];
  String(dsl).split('\n').forEach((ln0) => {
    const ln = ln0.trim();
    if (!ln || /^size=|^escala=|^gap/.test(ln)) return;
    let m = ln.match(/^(\w+)\s*@[\d.,\s-]+:\s*(.*)$/);
    if (m) {
      const partes = m[2].split('|').map((s) => s.trim());
      let cont = partes[0], extra = partes.slice(1).filter((x) => x && !/^(caja|resaltar|tam)=/.test(x));
      if (/^m:/.test(cont)) cont = 'estructura SMILES: ' + (mols[cont.slice(2)] || cont.slice(2));
      else if (/^t:/.test(cont)) cont = 'texto: ' + cont.slice(2);
      else cont = 'estructura SMILES: ' + cont;
      out.push(`compuesto ${m[1]} — ${cont}${extra.length ? ' (' + extra.join(' · ') + ')' : ''}`);
      return;
    }
    m = ln.match(/^(\w+(?::[\d-]+)?)\s*(<=>|<->|-->|->)\s*(\w+(?::[\d-]+)?)\s*(?:\|(.*))?$/);
    if (m) {
      const info = (m[4] || '').split('|').map((s) => s.trim()).filter((x) => x && !/^(arriba|abajo|estilo=|ruta=|largo=|color=)/.test(x));
      out.push(`flecha ${m[1]} → ${m[3]}${info.length ? ': ' + info.join(' ; ') : ''}`);
      return;
    }
    if (/^(caja|corchete|curva)/.test(ln)) return;
    out.push(ln);
  });
  return out.join('\n');
}

export function esquemaATexto(id) {
  const d = cargar().esq[id];
  return d ? '\n[ESQUEMA «' + id + '» — compuestos y flechas (cada compuesto con su SMILES):\n' + dslATexto(d) + '\n]\n' : '[esquema de síntesis: ' + id + ']';
}
export function molATexto(id) { const s = smilesDe(id); return s ? '[estructura SMILES: ' + s + ']' : '[estructura: ' + id + ']'; }
