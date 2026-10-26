// ════════════════════════════════════════════════════════════════════
// Datos compartidos del sitio (lectura de Data/ por HTTP, en el edge)
// ════════════════════════════════════════════════════════════════════
// Lo usan: middleware.js (meta OG), api/og.js (imágenes) y api/sitemap.js.
// Una sola fuente de verdad para parsear Data/*.html, así el sitemap, las
// vistas previas y las imágenes nunca se desincronizan entre sí.
//
// Solo LEE los archivos publicados (fetch a /Data/... y /Problem_Data/...);
// no escribe ni modifica nada.
// ════════════════════════════════════════════════════════════════════

// ── Olimpiadas ──────────────────────────────────────────────────────
export const OL = {
  icho:  { ruta: 'IChO',  corto: 'IChO',  es: 'Olimpiada Internacional de Química',                 arr: 'datosIChO',  prof: 'datosProfesoresIChO'  },
  imcho: { ruta: 'IMChO', corto: 'IMChO', es: 'Olimpiada Internacional Mendeléiev de Química',      arr: 'datosIMChO', prof: 'datosProfesoresIMChO' },
  oiaq:  { ruta: 'OIAQ',  corto: 'OIAQ',  es: 'Olimpiada Iberoamericana de Química',                arr: 'datosOIAQ',  prof: 'datosProfesoresOIAQ'  },
  ocacq: { ruta: 'OCACQ', corto: 'OCACQ', es: 'Olimpiada Centroamericana y del Caribe de Química',  arr: 'datosOCACQ', prof: 'datosProfesoresOCACQ' },
  otras: { ruta: 'Otros', corto: 'Otras', es: 'Otras olimpiadas de química',                        arr: 'datosOtras', prof: 'datosProfesoresOtras' },
};
export const OL_KEYS = Object.keys(OL);

const OL_FROM = { icho: 'icho', imcho: 'imcho', oiaq: 'oiaq', ocacq: 'ocacq', otros: 'otras', otras: 'otras', otra: 'otras', otro: 'otras' };
export const resolverOl = (s) => OL_FROM[String(s || '').toLowerCase()] || null;

export const MED_ORDEN = { oro: 1, plata: 2, bronce: 3, mencion: 4, participante: 5 };

// ── Utilidades ──────────────────────────────────────────────────────
export function slugify(nombre) {
  return (nombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function recortar(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

// Miniaturas de Imgur: …/AbCdEfG.png → …/AbCdEfGm.png (t,b,m,l,h = 160,160,320,640,1024 px).
// Cargan mucho más rápido y no revientan el límite de tamaño del generador de imágenes.
export function imgurTam(url, sufijo) {
  const m = /^(https:\/\/i\.imgur\.com\/)([A-Za-z0-9]{7})(\.(?:png|jpe?g|webp))$/i.exec(url || '');
  return m ? m[1] + m[2] + sufijo + m[3] : url;
}

// ── Caché en memoria del edge (se reutiliza entre peticiones calientes) ──
const _memo = new Map();
function memo(clave, ttlMs, fn) {
  const hit = _memo.get(clave);
  if (hit && Date.now() - hit.t < ttlMs) return hit.p;
  const p = fn();
  _memo.set(clave, { t: Date.now(), p });
  p.catch(() => { if (_memo.get(clave)?.p === p) _memo.delete(clave); });
  return p;
}

async function textoDe(origin, ruta) {
  const res = await fetch(origin + ruta);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${ruta}`);
  return res.text();
}

// Extrae los objetos { ... } de un array "const NOMBRE = [ ... ];" en
// texto plano, sin evaluarlo como JS.
export function parseArray(raw, arrName) {
  const m = raw.match(new RegExp(`const\\s+${arrName}\\s*=\\s*\\[([\\s\\S]*?)\\n\\];`));
  if (!m) return [];
  const out = [];
  const objRe = /\{([^{}]*)\}/g;
  let om;
  while ((om = objRe.exec(m[1]))) {
    const c = om[1];
    const str = (k) => { const x = c.match(new RegExp(`(?:^|[\\s,])${k}\\s*:\\s*"([^"]*)"`)); return x ? x[1] : null; };
    const num = (k) => { const x = c.match(new RegExp(`(?:^|[\\s,])${k}\\s*:\\s*(\\d+)`)); return x ? Number(x[1]) : null; };
    out.push({
      ed: num('ed'), año: num('año'), sede: str('sede'), pais: str('pais'),
      nombre: str('nombre'), prov: str('prov'), medalla: str('medalla'),
      rank: num('rank'), foto: str('foto'), rol: str('rol'),
      Olimp: str('Olimp'), Olimpiada: str('Olimpiada'),
    });
  }
  return out;
}

// ── Cargadores (con caché de 5 min) ─────────────────────────────────
export function cargarOlimpiadas(origin) {
  return memo('olim|' + origin, 300000, async () => {
    const raw = await textoDe(origin, '/Data/olympiad_data.html');
    const r = {};
    for (const k of OL_KEYS) r[k] = parseArray(raw, OL[k].arr);
    return r;
  });
}

export function cargarProfesores(origin) {
  return memo('prof|' + origin, 300000, async () => {
    const raw = await textoDe(origin, '/Data/professor_data.html');
    const r = {};
    for (const k of OL_KEYS) r[k] = parseArray(raw, OL[k].prof);
    return r;
  });
}

export function cargarHonor(origin) {
  return memo('honor|' + origin, 300000, async () => {
    const raw = await textoDe(origin, '/Data/honor_merece_ES.html');
    const m = raw.match(/<script type="application\/json" id="honor-data">([\s\S]*?)<\/script>/);
    return m ? JSON.parse(m[1]) : [];
  });
}

export function cargarMedia(origin) {
  return memo('media|' + origin, 300000, async () => {
    const raw = await textoDe(origin, '/Data/media_data.html');
    return [...raw.matchAll(/name:\s*"([^"]+)"\s*,\s*link:\s*"([^"]+)"/g)].map((x) => ({ name: x[1], link: x[2] }));
  });
}

export function cargarIdsProblemas(origin) {
  return memo('prob|' + origin, 300000, async () => {
    const raw = await textoDe(origin, '/Problem_Data/problemas_data.html');
    return [...new Set([...raw.matchAll(/\bid:\s*"([^"]+)"/g)].map((x) => x[1]))];
  });
}

// ── Consultas ───────────────────────────────────────────────────────

// Equipo de una olimpiada y año: participantes, medallas y profesores.
// Misma lógica que equipo.html (incluida la subolimpiada de "Otras").
export async function datosEquipo(origin, olRaw, año, sub) {
  const K = resolverOl(olRaw);
  año = Number(año);
  if (!K || !año) return null;
  const [olim, prof] = await Promise.all([cargarOlimpiadas(origin), cargarProfesores(origin)]);
  const toL = (v) => String(v || '').toLowerCase();
  const match = (r) => !sub || toL(r.Olimp) === toL(sub);

  const est = (olim[K] || []).filter((r) => r.año === año && match(r)).sort((a, b) =>
    ((MED_ORDEN[a.medalla] || 9) - (MED_ORDEN[b.medalla] || 9)) ||
    ((a.rank == null ? 1e9 : a.rank) - (b.rank == null ? 1e9 : b.rank)) ||
    (a.nombre || '').localeCompare(b.nombre || ''));
  const pro = (prof[K] || []).filter((r) => r.año === año && match(r))
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  if (!est.length && !pro.length) return null;

  let corto = OL[K].corto;
  let largo = OL[K].es;
  if (K === 'otras') {
    const olimps = [...new Set((olim.otras || []).filter((r) => r.año === año).map((r) => r.Olimp).filter(Boolean))];
    const unico = sub || (olimps.length === 1 ? olimps[0] : null);
    if (unico) {
      corto = unico;
      const f = est[0] || (olim.otras || []).find((r) => toL(r.Olimp) === toL(unico));
      if (f && f.Olimpiada) largo = f.Olimpiada;
    }
  }

  const ref = est[0] || pro[0];
  const conteo = { oro: 0, plata: 0, bronce: 0, mencion: 0, participante: 0 };
  est.forEach((r) => { if (conteo[r.medalla] !== undefined) conteo[r.medalla]++; });
  const nMed = conteo.oro + conteo.plata + conteo.bronce + conteo.mencion;

  return {
    K, corto, largo, año, sub: sub || null,
    ed: ref.ed, sede: ref.sede, pais: ref.pais,
    est, prof: pro, conteo, nMed,
    titulo: `${corto} ${año}`,
    ruta: `/Equipo/${OL[K].ruta}/${año}${sub ? '/' + encodeURIComponent(sub) : ''}`,
  };
}

// Perfil de honor (entrenador / prócer) por id.
export async function perfilHonor(origin, id) {
  const lista = await cargarHonor(origin);
  const d = lista.find((x) => x.id === id);
  if (!d) return null;
  const cat = String(d.Entrenador) === '1' ? 'Entrenadores' : 'Proceres';
  return {
    id: d.id,
    nombre: d.nombreArticulo || d.nombre,
    role: d.role || '',
    subtitulo: d.subtituloArticulo || '',
    desc: d.descripcionCorta || '',
    foto: d.foto || null,
    iniciales: d.iniciales || '',
    cat,
    ruta: `/Honor_Merece/${cat}/${encodeURIComponent(d.id)}`,
  };
}

// Foto de Media por nombre "DD_MM_AAAA_evento[_n]".
export async function fotoMedia(origin, nombre) {
  const lista = await cargarMedia(origin);
  return lista.find((f) => f.name === nombre) || null;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function describirFoto(nombre) {
  const p = String(nombre || '').split('_');
  let evento = null, fecha = null;
  if (p.length >= 4) {
    const [dd, mm, aaaa, ev] = p;
    const k = resolverOl(ev);
    evento = k ? OL[k].corto : ev;
    if (/^\d{2}$/.test(dd) && /^\d{2}$/.test(mm) && /^\d{4}$/.test(aaaa) && MESES[+mm - 1]) {
      fecha = { corta: `${dd}/${mm}/${aaaa}`, larga: `${+dd} de ${MESES[+mm - 1]} de ${aaaa}` };
    }
  }
  return { evento, fecha };
}
