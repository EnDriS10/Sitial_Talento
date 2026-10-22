// ════════════════════════════════════════════════════════════════════
// Base de conocimiento del chatbot (RAG sin base de datos ni build)
// ════════════════════════════════════════════════════════════════════
// Lee los MISMOS archivos que ya edita el dueño del sitio (Data/*.html,
// Problem_Data/problemas_data.html y Data/chatbot_guia.md), los convierte
// en "fragmentos" de texto y ofrece una búsqueda por palabras clave
// (BM25 ligero, sin acentos). Así, cada vez que se publica un cambio en
// los datos, el chatbot lo sabe sin tocar nada más.
//
// Los archivos viajan dentro de la función gracias a "includeFiles" en
// vercel.json. En local se leen directamente de la carpeta del repo.
// ════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Carpeta raíz del proyecto: en Vercel los archivos listados en "includeFiles" (vercel.json)
// quedan junto a la función; en local se usa la carpeta del repo.
const ROOT = (() => {
  const aqui = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const candidatas = [process.env.KB_ROOT, aqui, process.cwd(), '/var/task'].filter(Boolean);
  return candidatas.find((d) => { try { return fs.existsSync(path.join(d, 'Data', 'olympiad_data.html')); } catch (e) { return false; } }) || aqui;
})();
export const SITE_URL = (process.env.SITE_URL || 'https://sitialtalento.vercel.app').replace(/\/+$/, '');

// ── utilidades ──────────────────────────────────────────────────────
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slugify = (s) => norm(s).trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const abs = (p) => SITE_URL + p;
const MEDAL = { oro: 'Oro', plata: 'Plata', bronce: 'Bronce', mencion: 'Mención honorífica', participante: 'Participante' };
const OL_PATH = { icho: 'IChO', imcho: 'IMChO', oiaq: 'OIAQ', ocacq: 'OCACQ', otras: 'Otros' };
const OL_LONG = {
  IChO: 'Olimpiada Internacional de Química (IChO)',
  IMChO: 'Olimpiada Internacional Mendeléiev de Química (IMChO)',
  OIAQ: 'Olimpiada Iberoamericana de Química (OIAQ)',
  OCACQ: 'Olimpiada Centroamericana y del Caribe de Química (OCACQ)',
};

function leer(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return null; }
}
function scripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html || ''))) out.push({ attrs: m[1], body: m[2] });
  return out;
}
// Ejecuta el JS de un archivo de datos en un sandbox y devuelve las variables pedidas.
function evalDatos(html, nombres) {
  const code = scripts(html).filter((s) => !/application\/json/.test(s.attrs)).map((s) => s.body).join('\n');
  if (!code.trim()) return {};
  const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sandbox);
  const expr = '({' + nombres.map((n) => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(',') + '})';
  try {
    const res = vm.runInContext(code + '\n;' + expr, sandbox, { timeout: 3000 });
    return JSON.parse(JSON.stringify(res));
  } catch (e) {
    console.error('[kb] error evaluando datos:', e.message);
    return {};
  }
}
function jsonScript(html, id) {
  const s = scripts(html).find((x) => new RegExp(`id=["']${id}["']`).test(x.attrs));
  if (!s) return null;
  try { return JSON.parse(s.body); } catch (e) { return null; }
}
const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// ── tokenización y búsqueda ─────────────────────────────────────────
const STOP = new Set(('el la los las un una unos unas de del al y o u e en a por para con sin sobre entre que se su sus es son fue fueron ser ha han he hay lo le les me mi mis tu tus te nos como mas muy pero si no ni ya este esta estos estas ese esa eso aqui alli donde cuando cual cuales quien quienes cuanto cuantos cuanta cuantas hola dime puedes puede podria quiero quisiera favor ' +
  'the of and or in on for to with is are was were be been has have do does did what which who whom how many much when where why this that these those it its my your can could please tell me about').split(/\s+/));
function tokens(s) {
  return norm(s).split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t) && (t.length > 1 || /\d/.test(t)));
}

const TIPO_TRIGGERS = [
  { tipo: 'noticia', re: /noticia|news|prensa|articulo|cronica|publicaron|periodico|entrevista/, boost: 3 },
  { tipo: 'problema', re: /problema|ejercicio|banco|entrenar|practicar|resolver|dificultad|enunciado|problem|exercise/, boost: 3 },
  { tipo: 'media', re: /foto|imagen|galeria|media|picture|photo|video/, boost: 3 },
  { tipo: 'honor', re: /entrenador|profesor|mentor|proceres|honor|historia de|biografia|trainer|teacher|coach|biography/, boost: 2.5 },
  { tipo: 'agregado', re: /cuantas|cuantos|total|mas medallas|mejor|ranking|record|promedio|how many|total|most|best|por provincia|provincia con/, boost: 2.5 },
  { tipo: 'cnq', re: /cnq|concurso nacional|olimpiada cubana|decimo|onceno|duodecimo|noveno|preseleccion|psn|escuela|ipvce/, boost: 2.5 },
  { tipo: 'guia', re: /como|donde|que es|para que|pagina|seccion|sitio|web|funciona|exportar|imprimir|offline|instalar|contacto|correo|telegram|contactar|how|where|what is|section|site|contact/, boost: 1.2 },
  { tipo: 'equipo', re: /equipo|delegacion|integrantes|participantes|medallista|ganador|premiad|galardonad|representa|clasific|resultados|quienes (fueron|participaron|viajaron|asistieron)|team|members|delegation|medalist|winner/, boost: 2.2 },
];

// Sinónimos inglés → español para que las preguntas en inglés encuentren los datos
const SIN = {
  next: 'proxima', upcoming: 'proxima', medals: 'medallas', medal: 'medalla', gold: 'oro', silver: 'plata', bronze: 'bronce',
  mention: 'mencion', team: 'equipo', teams: 'equipo', delegation: 'delegacion', members: 'integrantes', news: 'noticias',
  article: 'noticia', photos: 'fotos', photo: 'foto', pictures: 'fotos', gallery: 'galeria', problems: 'problemas', problem: 'problema',
  exercises: 'problemas', teacher: 'profesor', teachers: 'profesores', coach: 'entrenador', coaches: 'entrenadores', trainer: 'entrenador',
  mentor: 'mentor', province: 'provincia', provinces: 'provincias', results: 'resultados', ranking: 'ranking', students: 'estudiantes',
  student: 'estudiante', contact: 'contacto', email: 'correo', export: 'exportar', print: 'imprimir', install: 'instalar',
  offline: 'offline', hall: 'sitial', honor: 'honor', national: 'nacional', contest: 'concurso', competition: 'concurso', difficulty: 'dificultad',
  winners: 'medallistas', winner: 'medallista', medalists: 'medallistas', medallists: 'medallistas', latest: 'ultima', last: 'ultima', recent: 'ultima', current: 'ultima', won: 'medallas', participated: 'participantes', cuban: 'cuba', cubans: 'cuba', total: 'total', most: 'mas', best: 'mejor', how: 'como', host: 'sede', venue: 'sede', city: 'sede', year: 'ano',
};
function tokensConsulta(s) {
  const base = tokens(s);
  const extra = [];
  base.forEach((t) => { if (SIN[t] && SIN[t] !== t) extra.push(SIN[t]); });
  return [...base, ...extra];
}
const ANIO_RE = /\b(19|20)\d{2}\b/g;

class Indice {
  constructor(chunks) {
    this.chunks = chunks;
    this.df = new Map();
    chunks.forEach((c) => {
      c._tf = new Map();
      const toks = tokens(c.title + ' ' + c.title + ' ' + c.text + ' ' + (c.extra || ''));
      c._len = toks.length || 1;
      toks.forEach((t) => c._tf.set(t, (c._tf.get(t) || 0) + 1));
      new Set(toks).forEach((t) => this.df.set(t, (this.df.get(t) || 0) + 1));
      c._nombreNorm = c.nombres ? c.nombres.map(norm) : [];
      c._titleToks = new Set(tokens(c.title));
    });
    // última edición registrada por olimpiada (para resolver «la última IChO»)
    this.ultima = {};
    chunks.forEach((c) => { if (c.tipo === 'equipo' && c.sigla && (!this.ultima[c.sigla] || c.anio > this.ultima[c.sigla].anio)) this.ultima[c.sigla] = c; });
    this.N = chunks.length;
    this.avg = chunks.reduce((a, c) => a + c._len, 0) / Math.max(1, this.N);
  }
  buscar(consulta, { k = 8, maxChars = 7000 } = {}) {
    const q = tokensConsulta(consulta);
    if (!q.length) return [];
    const qn = norm(consulta);
    // intención: «última/reciente/actual» + (olimpiada) → fijar la edición más reciente
    const RECIENTE = /\b(ultim[oa]s?|reciente|recientes|actual|pasad[oa]|este ano|latest|last|recent|current|newest)\b/.test(qn);
    const SIGLAS = { icho: 'IChO', imcho: 'IMChO', oiaq: 'OIAQ', ocacq: 'OCACQ' };
    const mencionadas = Object.keys(SIGLAS).filter((k) => new RegExp('\\b' + k + '\\b').test(qn)).map((k) => SIGLAS[k]);
    const sinAnio = !(qn.match(ANIO_RE) || []).length;
    const fijados = [];
    if (RECIENTE && sinAnio) {
      const objetivo = mencionadas.length ? mencionadas : (/internacional|olimpiada|olympiad/.test(qn) || /medallista|ganador|equipo|delegacion|team|medal/.test(qn) ? Object.keys(this.ultima) : []);
      objetivo.forEach((sg) => { if (this.ultima[sg]) fijados.push(this.ultima[sg]); });
    }
    const boosts = TIPO_TRIGGERS.filter((t) => t.re.test(qn)).concat(/next|upcoming|proxima|siguiente/.test(qn) ? [{ tipo: 'agregado', boost: 1.6 }] : []);
    const anios = qn.match(ANIO_RE) || [];
    const scored = [];
    for (const c of this.chunks) {
      let s = 0;
      for (const t of q) {
        const tf = c._tf.get(t);
        if (!tf) continue;
        const df = this.df.get(t) || 1;
        const idf = Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
        s += idf * ((tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (c._len / this.avg))));
        if (c._titleToks.has(t)) s += idf * 1.5;
      }
      if (!s) continue;
      // nombre completo (o casi) mencionado en la pregunta → muy relevante
      for (const n of c._nombreNorm) {
        if (qn.includes(n)) { s += 25; break; }
        const nt = n.split(' ').filter((x) => x.length > 2);
        const hit = nt.filter((x) => qn.includes(x)).length;
        if (nt.length >= 2 && hit >= 2) s += 6 * hit;
      }
      for (const b of boosts) if (c.tipo === b.tipo) s *= b.boost;
      // si la pregunta menciona un año, favorecer fragmentos de ese año y penalizar los de otros años
      if (anios.length && (c.tipo === 'equipo' || c.tipo === 'cnq' || c.tipo === 'media')) {
        const ya = (c.title.match(ANIO_RE) || []).length ? c.title.match(/\b(19|20)\d{2}\b/g) : [];
        if (ya.length) s *= ya.some((y) => anios.includes(y)) ? 2 : 0.35;
      }
      if (c.prioridad) s *= c.prioridad;
      scored.push([s, c]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    const fij = fijados.slice(0, 4);
    const corte = scored.length ? Math.max(1.5, scored[0][0] * 0.18) : 0;
    const out = fij.slice();
    let chars = fij.reduce((a, c) => a + c.text.length + c.title.length + 80, 0);
    for (const [sc, c] of scored) {
      if (fij.includes(c)) continue;
      if (sc < corte) break;
      const len = c.text.length + c.title.length + 80;
      if (out.length >= k) break;
      if (chars + len > maxChars && out.length) continue;
      out.push(c); chars += len;
    }
    out.fijados = fij.length;
    out.top = scored.length ? scored[0][0] : 0;
    return out;
  }
}

// ── construcción de fragmentos ──────────────────────────────────────
function construir() {
  const chunks = [];
  const add = (c) => chunks.push(c);

  // Datos crudos
  const ol = evalDatos(leer('Data/olympiad_data.html'), ['todasLasOlimpiadas', 'datosOtras']);
  const pr = evalDatos(leer('Data/professor_data.html'), ['todasLosProfesores']);
  const cn = evalDatos(leer('Data/CNQ_data.html'), ['todasLasCNQ', 'nombreProvincia', 'nombreGradoCNQ']);
  const med = evalDatos(leer('Data/media_data.html'), ['datosMedia']);
  const ent = evalDatos(leer('Data/entrevistas_data.html'), ['datosEntrevistas']);
  const prob = evalDatos(leer('Problem_Data/problemas_data.html'), ['datosProblemas']);
  const honor = jsonScript(leer('Data/honor_merece_ES.html'), 'honor-data') || [];
  const fechaIcho = jsonScript(leer('Data/olympiad_date.html'), 'olympiad-date-data');

  const provNombre = cn.nombreProvincia || {};
  const prov = (c) => provNombre[c] || c || '';
  const todas = ol.todasLasOlimpiadas || {};
  const otras = Array.isArray(ol.datosOtras) ? ol.datosOtras : [];
  const profs = pr.todasLosProfesores || {};
  const NOM = { icho: 'IChO', imcho: 'IMChO', oiaq: 'OIAQ', ocacq: 'OCACQ' };

  // Filas internacionales normalizadas
  const filas = [];
  Object.entries(todas).forEach(([k, arr]) => (arr || []).forEach((r) => filas.push({ ...r, k, sigla: NOM[k], largo: OL_LONG[NOM[k]] })));
  otras.forEach((r) => filas.push({ ...r, k: 'otras', sigla: r.Olimp || 'Otras', largo: r.Olimpiada || 'Otra olimpiada' }));
  const filasProf = [];
  Object.entries(profs).forEach(([k, arr]) => (arr || []).forEach((r) => filasProf.push({ ...r, k, sigla: k === 'otras' ? (r.Olimp || 'Otras') : NOM[k] })));

  const urlEquipo = (r) => {
    const base = '/Equipo/' + OL_PATH[r.k] + '/' + r.año;
    return abs(r.k === 'otras' ? base + '/' + encodeURIComponent(r.Olimp || '') : base);
  };

  // ── 1) Personas ────────────────────────────────────────────────
  const personas = new Map();
  const persona = (n) => {
    if (!personas.has(n)) personas.set(n, { nombre: n, res: [], cnq: [], prof: [], honor: null });
    return personas.get(n);
  };
  filas.forEach((r) => r.nombre && persona(r.nombre).res.push(r));
  filasProf.forEach((r) => r.nombre && persona(r.nombre).prof.push(r));
  Object.values(cn.todasLasCNQ || {}).flat().forEach((r) => r.nombre && persona(r.nombre).cnq.push(r));
  honor.forEach((h) => {
    const nombres = [h.nombre, h.nombreArticulo].filter(Boolean);
    nombres.forEach((n) => {
      const key = [...personas.keys()].find((k) => norm(k) === norm(n.replace(/^(msc|dr|dra|lic|prof|ing)\.?\s+/i, '')));
      if (key) personas.get(key).honor = h;
    });
  });

  for (const p of personas.values()) {
    const lineas = [];
    const conMedalla = p.res.some((r) => r.medalla && r.medalla !== 'participante');
    p.res.sort((a, b) => b.año - a.año).forEach((r) => {
      lineas.push(`- ${r.sigla} ${r.año} (${r.sede || ''}${r.ed ? ', ed. ' + r.ed : ''}): ${MEDAL[r.medalla] || r.medalla}${r.rank ? ', puesto ' + r.rank : ''}${r.prov ? ', provincia ' + prov(r.prov) : ''}`);
    });
    p.prof.sort((a, b) => b.año - a.año).forEach((r) => lineas.push(`- ${r.sigla} ${r.año} (${r.sede || ''}): ${r.rol || 'Profesor'} (profesor/mentor del equipo cubano)`));
    p.cnq.sort((a, b) => b.año - a.año).forEach((r) => lineas.push(`- CNQ (Concurso Nacional de Química de Cuba) ${r.año}, ${r.grado} grado: ${r.medalla ? MEDAL[r.medalla] : 'sin medalla'}, ${r.pts} puntos, puesto ${r.rank}${r.psn ? ', Preselección Nacional' : ''}, ${prov(r.prov)}${r.escuela ? ', ' + r.escuela : ''}`));
    let url = abs('/');
    if (conMedalla) url = abs('/Historial_Medallas/cuadrito=' + slugify(p.nombre));
    else if (p.honor) url = abs('/Honor_Merece/' + (String(p.honor.Entrenador) === '1' ? 'Entrenadores' : 'Proceres') + '/' + encodeURIComponent(p.honor.id));
    const hon = p.honor ? `\nPerfil en «Honor a quien Honor Merece»: ${p.honor.role}. ${p.honor.descripcionCorta || ''}` : '';
    add({
      id: 'p:' + p.nombre, tipo: 'persona', title: p.nombre, nombres: [p.nombre],
      text: lineas.join('\n') + hon, url,
      etiqueta: conMedalla ? 'Tarjeta de ' + p.nombre : 'Ficha de ' + p.nombre,
    });
  }

  // ── 2) Equipos (olimpiada + año) ───────────────────────────────
  const eq = new Map();
  filas.forEach((r) => {
    const key = r.sigla + '|' + r.año;
    if (!eq.has(key)) eq.set(key, { r, est: [], prof: [] });
    eq.get(key).est.push(r);
  });
  filasProf.forEach((r) => {
    const key = r.sigla + '|' + r.año;
    if (!eq.has(key)) eq.set(key, { r, est: [], prof: [] });
    eq.get(key).prof.push(r);
  });
  const orden = { oro: 0, plata: 1, bronce: 2, mencion: 3, participante: 4 };
  for (const [key, e] of eq) {
    const [sigla, año] = key.split('|');
    const r = e.r;
    const cnt = { oro: 0, plata: 0, bronce: 0, mencion: 0, participante: 0 };
    e.est.forEach((x) => { if (cnt[x.medalla] !== undefined) cnt[x.medalla]++; });
    const est = e.est.slice().sort((a, b) => (orden[a.medalla] ?? 9) - (orden[b.medalla] ?? 9) || (a.rank || 9999) - (b.rank || 9999));
    const txt = `${r.largo || sigla}, edición ${r.ed || '?'} (${año}), sede: ${r.sede || '?'} ${r.pais || ''}.\n` +
      `Delegación cubana: ${e.est.length} estudiante(s) — ${cnt.oro} oro, ${cnt.plata} plata, ${cnt.bronce} bronce, ${cnt.mencion} mención, ${cnt.participante} participante(s).\n` +
      est.map((x) => `- ${x.nombre}: ${MEDAL[x.medalla] || x.medalla}${x.rank ? ' (puesto ' + x.rank + ')' : ''}${x.prov ? ', ' + prov(x.prov) : ''}`).join('\n') +
      (e.prof.length ? '\nProfesores/mentores: ' + e.prof.map((x) => `${x.nombre} (${x.rol || 'Profesor'})`).join('; ') : '');
    add({
      id: 'e:' + key, tipo: 'equipo', title: `Equipo de Cuba en ${sigla} ${año}`, text: txt,
      extra: `${r.sede || ''} ${r.largo || ''}`, url: urlEquipo(r), etiqueta: `Equipo ${sigla} ${año}`,
      nombres: [], prioridad: 1.1, sigla, anio: Number(año),
    });
  }

  // ── 3) Agregados (para preguntas de conteo/ranking) ─────────────
  const sumaPor = (rows) => {
    const c = { oro: 0, plata: 0, bronce: 0, mencion: 0, participante: 0 };
    rows.forEach((x) => { if (c[x.medalla] !== undefined) c[x.medalla]++; });
    return c;
  };
  const bySigla = new Map();
  filas.forEach((r) => { if (!bySigla.has(r.sigla)) bySigla.set(r.sigla, []); bySigla.get(r.sigla).push(r); });
  for (const [sigla, rows] of bySigla) {
    const c = sumaPor(rows);
    const años = [...new Set(rows.map((x) => x.año))].sort((a, b) => b - a);
    const porAño = años.map((a) => {
      const cc = sumaPor(rows.filter((x) => x.año === a));
      const n = rows.filter((x) => x.año === a).length;
      return `${a}: ${n} part. (${cc.oro} oro, ${cc.plata} plata, ${cc.bronce} bronce, ${cc.mencion} mención)`;
    });
    const km = Object.keys(OL_PATH).find((k) => NOM[k] === sigla);
    add({
      id: 'a:' + sigla, tipo: 'agregado', title: `Resumen histórico de Cuba en ${sigla}`,
      text: `${rows[0].largo}. Registros en el Sitial: ${rows.length} participaciones individuales (${años.length} ediciones, de ${años[años.length - 1]} a ${años[0]}).\n` +
        `Total: ${c.oro} oro, ${c.plata} plata, ${c.bronce} bronce, ${c.mencion} menciones honoríficas, ${c.participante} participantes sin medalla.\n` +
        `Por año:\n` + porAño.join('\n'),
      url: abs(km ? '/Historial_Eventos/' + OL_PATH[km] : '/Historial_Eventos/IChO'), etiqueta: `Historial ${sigla}`, prioridad: 1.2,
    });
  }
  // total global y por provincia (olimpiadas internacionales)
  const internac = filas.filter((r) => r.k !== 'otras');
  const gTot = sumaPor(filas);
  const medallistas = new Set(filas.filter((r) => r.medalla && r.medalla !== 'participante').map((r) => r.nombre));
  const sedes = new Set(filas.map((r) => r.sede).filter(Boolean));
  add({
    id: 'a:global', tipo: 'agregado', title: 'Cuba en números: totales de todas las olimpiadas',
    text: `En todas las olimpiadas registradas (IChO, IMChO, OIAQ, OCACQ y otras): ${gTot.oro} oro, ${gTot.plata} plata, ${gTot.bronce} bronce, ${gTot.mencion} menciones honoríficas y ${gTot.participante} participaciones sin medalla. ` +
      `${medallistas.size} estudiantes distintos han obtenido medalla o mención. ${sedes.size} sedes/ciudades distintas visitadas.\n` +
      [...bySigla].map(([s, rows]) => { const c = sumaPor(rows); return `${s}: ${c.oro} oro, ${c.plata} plata, ${c.bronce} bronce, ${c.mencion} mención`; }).join('\n'),
    url: abs('/Historial_Medallas'), etiqueta: 'Historial por medallas', prioridad: 1.3,
  });
  const porProv = new Map();
  internac.forEach((r) => { if (!r.prov) return; if (!porProv.has(r.prov)) porProv.set(r.prov, []); porProv.get(r.prov).push(r); });
  const provCNQ = new Map();
  Object.values(cn.todasLasCNQ || {}).flat().forEach((r) => { if (!r.prov) return; if (!provCNQ.has(r.prov)) provCNQ.set(r.prov, []); provCNQ.get(r.prov).push(r); });
  const provLista = [...porProv].map(([p, rows]) => ({ p, c: sumaPor(rows), n: rows.length }))
    .sort((a, b) => (b.c.oro * 3 + b.c.plata * 2 + b.c.bronce + b.c.mencion * 0.5) - (a.c.oro * 3 + a.c.plata * 2 + a.c.bronce + a.c.mencion * 0.5));
  add({
    id: 'a:provincias', tipo: 'agregado', title: 'Ranking de provincias en olimpiadas internacionales (IChO, IMChO, OIAQ, OCACQ)',
    text: 'Puntuación ponderada usada por el Sitial: oro = 3, plata = 2, bronce = 1, mención = 0,5.\n' +
      provLista.map((x, i) => `${i + 1}. ${prov(x.p)}: ${x.c.oro} oro, ${x.c.plata} plata, ${x.c.bronce} bronce, ${x.c.mencion} mención (${x.n} participaciones)`).join('\n'),
    url: abs('/Olimpiada_Cubana/Estadisticas'), etiqueta: 'Estadísticas por provincia', prioridad: 1.3,
  });
  for (const x of provLista) {
    const cnqRows = provCNQ.get(x.p) || [];
    const cc = sumaPor(cnqRows);
    add({
      id: 'pv:' + x.p, tipo: 'agregado', title: `Provincia: ${prov(x.p)}`, nombres: [prov(x.p)],
      text: `Olimpiadas internacionales: ${x.c.oro} oro, ${x.c.plata} plata, ${x.c.bronce} bronce, ${x.c.mencion} mención, ${x.n} participaciones.\n` +
        `CNQ (Concurso Nacional): ${cnqRows.length} resultados registrados — ${cc.oro} oro, ${cc.plata} plata, ${cc.bronce} bronce, ${cc.mencion} mención.`,
      url: abs('/Olimpiada_Cubana/Estadisticas'), etiqueta: 'Estadísticas por provincia',
    });
  }
  // más medallistas
  const top = [...personas.values()].map((p) => ({ p, c: sumaPor(p.res) })).filter((x) => x.c.oro + x.c.plata + x.c.bronce + x.c.mencion > 1)
    .sort((a, b) => (b.c.oro * 3 + b.c.plata * 2 + b.c.bronce + b.c.mencion * .5) - (a.c.oro * 3 + a.c.plata * 2 + a.c.bronce + a.c.mencion * .5)).slice(0, 15);
  if (top.length) add({
    id: 'a:top', tipo: 'agregado', title: 'Estudiantes con más medallas en olimpiadas',
    text: top.map((x, i) => `${i + 1}. ${x.p.nombre}: ${x.c.oro} oro, ${x.c.plata} plata, ${x.c.bronce} bronce, ${x.c.mencion} mención`).join('\n'),
    url: abs('/Historial_Medallas'), etiqueta: 'Historial por medallas', prioridad: 1.2,
  });

  // ── 4) CNQ por año y grado ──────────────────────────────────────
  for (const [g, arr] of Object.entries(cn.todasLasCNQ || {})) {
    const porAño = new Map();
    (arr || []).forEach((r) => { if (!porAño.has(r.año)) porAño.set(r.año, []); porAño.get(r.año).push(r); });
    for (const [a, rows] of porAño) {
      rows.sort((x, y) => (x.rank || 999) - (y.rank || 999));
      add({
        id: `cnq:${g}:${a}`, tipo: 'cnq', title: `CNQ ${a} — ${(cn.nombreGradoCNQ || {})[g] || g} grado (Concurso Nacional de Química)`,
        text: rows.slice(0, 40).map((r) => `${r.rank}. ${r.nombre} — ${prov(r.prov)}${r.escuela ? ', ' + r.escuela : ''}, ${r.pts} pts${r.medalla ? ', ' + MEDAL[r.medalla] : ''}${r.psn ? ', PSN' : ''}`).join('\n'),
        url: abs('/Olimpiada_Cubana/Ranking'), etiqueta: 'Ranking del CNQ',
      });
    }
  }

  // ── 5) Honor (biografías por párrafos) ──────────────────────────
  honor.forEach((h) => {
    const url = abs('/Honor_Merece/' + (String(h.Entrenador) === '1' ? 'Entrenadores' : 'Proceres') + '/' + encodeURIComponent(h.id));
    const paras = (h.paragrafos || []).map(decode);
    let buf = '', n = 1;
    const flush = () => {
      if (!buf) return;
      add({
        id: `h:${h.id}:${n}`, tipo: 'honor', title: `${h.nombreArticulo || h.nombre} — ${h.role}` + (n > 1 ? ` (parte ${n})` : ''),
        nombres: [h.nombreArticulo, h.nombre].filter(Boolean), text: (n === 1 ? `${h.subtituloArticulo || ''}. ${h.descripcionCorta || ''}\n` : '') + buf,
        url, etiqueta: `Perfil de ${h.nombreArticulo || h.nombre}`,
      });
      buf = ''; n++;
    };
    paras.forEach((p) => { if ((buf + p).length > 1100 && buf) flush(); buf += (buf ? '\n' : '') + p; });
    flush();
  });

  // ── 6) Noticias y entrevistas ───────────────────────────────────
  const htmlNews = leer('Data/newspapers.html') || '';
  const noticias = [];
  const reTr = /<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = reTr.exec(htmlNews))) {
    const link = decode(m[1]), titulo = decode(m[2]), fecha = decode(m[3]);
    if (!/^https?:\/\//i.test(link)) continue;
    noticias.push({ link, titulo, fecha });
  }
  noticias.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  noticias.forEach((n, i) => {
    let host = ''; try { host = new URL(n.link).hostname.replace(/^www\./, ''); } catch (e) {}
    add({ id: 'n:' + i, tipo: 'noticia', title: n.titulo, text: `Noticia publicada el ${n.fecha} en ${host}.`, extra: host + ' noticia prensa', url: n.link, etiqueta: n.titulo });
  });
  if (noticias.length) add({
    id: 'n:indice', tipo: 'noticia', title: 'Últimas noticias sobre las olimpiadas de química cubanas',
    text: 'Noticias más recientes (de más nueva a más antigua):\n' + noticias.slice(0, 10).map((n) => `- ${n.fecha}: ${n.titulo} → ${n.link}`).join('\n') +
      `\nTodas las noticias están en ${abs('/noticias')}.`,
    url: abs('/noticias'), etiqueta: 'Noticias y Entrevistas', prioridad: 1.3,
  });
  (Array.isArray(ent.datosEntrevistas) ? ent.datosEntrevistas : []).forEach((e, i) => add({
    id: 'en:' + i, tipo: 'noticia', title: `Entrevista a ${e.nombre}`, nombres: [e.nombre],
    text: `${e.rol || ''}. ${e.resumen || ''}${e.fecha ? ' (' + e.fecha + ')' : ''}`, url: e.link || abs('/noticias'), etiqueta: `Entrevista a ${e.nombre}`,
  }));

  // ── 7) Media ────────────────────────────────────────────────────
  const fotos = (Array.isArray(med.datosMedia) ? med.datosMedia : []).map((f) => {
    const mm = /^(\d{2})_(\d{2})_(\d{4})_([a-z]+)(?:_(\d+))?$/i.exec(f.name || '');
    return mm ? { name: f.name, d: mm[1], m: mm[2], y: mm[3], ev: mm[4].toLowerCase() } : null;
  }).filter(Boolean);
  const grupos = new Map();
  fotos.forEach((f) => { const k = f.ev + '|' + f.y; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(f); });
  for (const [k, arr] of grupos) {
    const [ev, y] = k.split('|');
    const sigla = ev === 'otras' ? 'Otras olimpiadas' : ev.toUpperCase();
    const km = ev === 'otras' ? 'otras' : ev;
    add({
      id: 'm:' + k, tipo: 'media', title: `Fotos de ${sigla} ${y}`,
      text: `La galería Media tiene ${arr.length} foto(s) de ${sigla} ${y}. Ver una: ${abs('/media?foto=' + arr[0].name)}. Ver el equipo: ${abs('/Equipo/' + OL_PATH[km] + '/' + y)}.`,
      url: abs('/media?foto=' + arr[0].name), etiqueta: `Fotos de ${sigla} ${y}`,
    });
  }
  if (fotos.length) add({
    id: 'm:indice', tipo: 'media', title: 'Galería de fotos (Media)',
    text: `La galería Media reúne ${fotos.length} fotos de eventos, equipos y momentos de las olimpiadas (IChO, IMChO, OIAQ, OCACQ y otras), ordenadas por fecha. Cada foto tiene su enlace propio (/media?foto=nombre) y al tocar la insignia del evento con el año se abre la página del equipo.`,
    url: abs('/media'), etiqueta: 'Galería Media', prioridad: 1.2,
  });

  // ── 8) Banco de problemas ───────────────────────────────────────
  const problemas = Array.isArray(prob.datosProblemas) ? prob.datosProblemas : [];
  const TEMA = { inorganica: 'Inorgánica', organica: 'Orgánica', fisica: 'Físico-química', analitica: 'Analítica' };
  problemas.forEach((p) => add({
    id: 'pb:' + p.id, tipo: 'problema', title: `Problema: ${p.titulo}`,
    text: `${p.numero ? p.numero + ' · ' : ''}Fuente: ${p.fuente || '?'}. Dificultad: nivel ${p.dificultad}/3. Temas: ${(p.temas || []).map((t) => TEMA[t] || t).join(', ')}${p.temaEspecifico ? ' (' + p.temaEspecifico + ')' : ''}.\n${p.descripcion || ''}\n` +
      `Enunciado: ${abs('/Banco_Problemas/' + p.id + '/enunciado')} · Respuesta: ${abs('/Banco_Problemas/' + p.id + '/respuesta')}`,
    extra: String(p.contenido || '').slice(0, 1500), url: abs('/Banco_Problemas/' + p.id + '/enunciado'), etiqueta: p.titulo,
  }));
  if (problemas.length) add({
    id: 'pb:indice', tipo: 'problema', title: 'Banco de Problemas: lista de problemas',
    text: `El Banco de Problemas tiene ${problemas.length} problemas para entrenar, organizados por dificultad (1-3) y tema, con respuesta.\n` +
      problemas.map((p) => `- ${p.titulo} (${p.fuente}; nivel ${p.dificultad})`).join('\n') + `\nPágina: ${abs('/Banco_Problemas')}`,
    url: abs('/Banco_Problemas'), etiqueta: 'Banco de Problemas', prioridad: 1.3,
  });

  // ── 9) Próxima IChO ─────────────────────────────────────────────
  if (fechaIcho && fechaIcho.anio) add({
    id: 'proxima', tipo: 'agregado', title: `Próxima IChO: ${fechaIcho.anio}`,
    text: `La próxima Olimpiada Internacional de Química (IChO ${fechaIcho.anio}) será en ${fechaIcho.lugar}, a partir del ${String(fechaIcho.fecha).slice(0, 10)}` +
      (fechaIcho.closingCeremonyFecha ? `, con ceremonia de clausura el ${String(fechaIcho.closingCeremonyFecha).slice(0, 10)}` : '') + '. La portada del sitio muestra una cuenta atrás.',
    url: abs('/'), etiqueta: 'Portada', prioridad: 1.2,
  });

  // ── 10) Guía editable del sitio (Data/chatbot_guia.md) ──────────
  const guia = leer('Data/chatbot_guia.md') || '';
  guia.split(/^## /m).slice(1).forEach((sec, i) => {
    const [head, ...rest] = sec.split('\n');
    let body = rest.join('\n').trim();
    let url = abs('/');
    body = body.replace(/^url:\s*(\S+)\s*$/im, (_, u) => { url = /^https?:/.test(u) ? u : abs(u); return ''; }).trim();
    add({ id: 'g:' + i, tipo: 'guia', title: head.trim(), text: body, url, etiqueta: head.trim(), prioridad: 1.1 });
  });

  return chunks;
}

let _cache = null;
export function obtenerKB() {
  if (_cache) return _cache;
  const t0 = Date.now();
  const chunks = construir();
  const idx = new Indice(chunks);
  _cache = { idx, n: chunks.length, ms: Date.now() - t0 };
  return _cache;
}

// Una línea con la última edición registrada de cada olimpiada (siempre va al prompt)
export function resumenUltimas() {
  const u = obtenerKB().idx.ultima;
  return Object.keys(u).map((k) => `${k} ${u[k].anio} (${u[k].url})`).join('; ');
}

// Texto del contexto que se inserta en el prompt
export function contextoDe(chunks) {
  return chunks.map((c, i) => `[${i + 1}] ${c.title}\n${c.text}${c.url ? `\nEnlace: ${c.url}` : ''}`).join('\n\n');
}
export function fuentesDe(chunks, max = 3) {
  // Enlaces "Ver también": el mejor fragmento y el mejor de cada otro tipo (sin repetir)
  const seen = new Set(), tipos = new Set(), out = [];
  for (const c of chunks) {
    if (!c.url || seen.has(c.url) || tipos.has(c.tipo) || (c.tipo === 'agregado' && c.url === abs('/'))) continue;
    seen.add(c.url); tipos.add(c.tipo); out.push({ title: c.etiqueta || c.title, url: c.url });
    if (out.length >= max) break;
  }
  return out;
}
