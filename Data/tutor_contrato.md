# Tutor de problemas con IA — contrato

Implementado en `api/tutor.js` y en la pestaña «✍️ Tu respuesta» de `Problem_Data/visor.html`. Todo con modelos gratuitos (Gemini, Mistral, Groq, OpenRouter).

## Acciones
**hint** `{action:'hint', problemId, question, history?, images?, lang}` → `{answer, level, cost}` (nivel: aclaracion 0 %, pista 5 %, pista_fuerte 12 %, rechazada 0 %).

**grade** `{action:'grade', problemId, images?, texts?, hints:[{level}], lang}`:
1. Lector con visión → transcripción + incisos presentes/faltantes + `cortada`.
2. Si es parcial: responde `{parcial:true, presentes, faltan, cortada, transcripcion}`. El cliente pregunta al estudiante y, si decide calificar lo enviado, reenvía `{transcripcion, presentes, faltan, confirmarParcial:true}`.
3. Dos calificadores en paralelo → `{incisos:[{id,max,puntos,comentario,como_se_hace,discrepancia?}], bruto, max, penalizacionPct, penalizacion, final, maxEnviado, resumen, advertencias, revisionCruzada}`.

## Datos
`api/_lib/problemas.js` lee `Problem_Data/*` y extrae el baremo de las líneas `(a) «2 puntos»` de la solución. Si un problema no tiene esas etiquetas (p. ej. q6), el modelo decide los máximos.

## Conversar sobre la solución (sin penalización)
`{action:'discuss', problemId, question, quote?, fuente:'respuesta'|'resultado', history, resultado?}` → `{answer, foco}`. El servidor proyecta la pregunta/selección sobre los trozos del problema (campo vectorial por incisos) y responde explicando cómo y por qué. Si la selección viene del enunciado, el cliente usa `hint` (cuesta puntos) con `quote`.
