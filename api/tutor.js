// ════════════════════════════════════════════════════════════════════
// POST /api/tutor — BASE del corrector del Banco de Problemas (DeepSeek)
// ════════════════════════════════════════════════════════════════════
// ESTADO: sin programar a propósito. Solo fija el contrato (ver Data/tutor_contrato.md)
// para que la pestaña «Tu respuesta» de Problem_Data/visor.html pueda conectarse
// después sin cambiar nada más. Cuando se implemente:
//   1) validar { problemId, images:[dataURL…≤4], lang } con el guard.js de siempre
//   2) cargar enunciado + solución + baremo del problema (Problem_Data/*)
//   3) llamar a DeepSeek con prompts.MODOS.problema (modelo con visión) vía llm.js
//      con LLM_PROVIDERS=deepseek y devolver { total, max, incisos:[{id,puntos,max,comentario}] }
// ════════════════════════════════════════════════════════════════════
export default function handler(req, res) {
  res.statusCode = 501;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ code: 'not_implemented', error: 'El corrector con IA aún no está disponible.' }));
}
