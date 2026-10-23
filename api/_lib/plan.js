// Planificador: un modelo rápido entiende la pregunta (en cualquier idioma/forma) y devuelve
//   consulta → palabras clave para buscar en los datos del Sitial (sinónimos, entidades,
//              «última/actual» ya resuelto al año/edición concreta)
//   ambito   → 'sitio' | 'general' | 'actualidad'   (actualidad = requiere datos externos recientes)
//   web      → consulta para buscador web (solo si ambito = actualidad)
// No hay listas de preguntas: si falla o tarda, el chat sigue con la búsqueda normal.
import { chatStream } from './llm.js';

const T_MS = Number(process.env.CHAT_PLAN_MS || 5000);

export async function planificar(msgs, ultimas, ficha = '', brujula = '') {
  if (process.env.CHAT_PLAN === '0') return null;
  const hist = msgs.slice(-4).map((m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${String(m.content).slice(0, 400)}`).join('\n');
  const sistema = `Analizas preguntas para un asistente del «Sitial de Talentos Cubanos» (sitio con los estudiantes cubanos en olimpiadas de química IChO, IMChO, OIAQ, OCACQ y otras: medallas, equipos por año, profesores/mentores, concurso nacional CNQ, noticias, fotos, banco de problemas, honor a entrenadores y próceres, ranking de provincias).
${ficha}\nÚltima edición registrada por olimpiada: ${ultimas}.\n${brujula ? `Brújula vectorial (hacia dónde apunta la pregunta en el contenido del Sitial): ${brujula}.` : ''}
Devuelve SOLO un JSON: {"consulta":"…","ambito":"sitio|general|actualidad","web":"…"}
- consulta: 4-12 palabras clave en español para buscar en los datos del Sitial. Añade sinónimos y las entidades implícitas (p. ej. «medallistas», «ganadores», «delegación» ≈ «equipo» + «medallas»); resuelve «última/reciente/actual» a la sigla y año concretos de la lista anterior; completa con el contexto de la conversación si la pregunta es un seguimiento («y el año anterior?»).
- ambito: «sitio» si trata de las personas, olimpiadas, datos o secciones del Sitial; «actualidad» si exige información externa reciente o cambiante (noticias de hoy, resultados recientes fuera del Sitial, precios, clima, eventos actuales); «general» para conocimiento estable (ciencia, química, cultura, ayuda con problemas).
- web: solo si ambito = actualidad, la mejor consulta de buscador, SIEMPRE en el contexto de las olimpiadas de química / Cuba (incluye sigla, año y «Cuba» o «olimpiada de química»); si no, "".`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), T_MS);
  try {
    let out = '';
    for await (const ev of chatStream({ messages: [{ role: 'system', content: sistema }, { role: 'user', content: hist }], maxTokens: 160, temperature: 0, signal: ctl.signal })) {
      if (ev.texto) out += ev.texto;
    }
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    return {
      consulta: String(j.consulta || '').slice(0, 200),
      ambito: ['sitio', 'general', 'actualidad'].includes(j.ambito) ? j.ambito : 'sitio',
      web: String(j.web || '').slice(0, 200),
    };
  } catch (e) {
    return null;
  } finally { clearTimeout(t); }
}
