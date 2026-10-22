# Corrector de problemas con IA (DeepSeek) — contrato y bases

Estado: **sin programar**. La pestaña «✍️ Tu respuesta» de `Problem_Data/visor.html` es solo un marcador.
`api/tutor.js` devuelve 501 y `prompts.js` ya trae `systemProblema()` (sin activar en `MODOS`).

## Flujo previsto
1. El estudiante abre un problema y pestaña «Tu respuesta», sube 1–4 fotos de su resolución.
2. El navegador reduce las fotos (máx. ~1600 px, JPEG ~0.8) y las envía a `POST /api/tutor`.
3. El servidor construye el prompt con enunciado + solución oficial + **baremo** (puntos por inciso)
   y llama a DeepSeek (variable `DEEPSEEK_API_KEY`, `LLM_PROVIDERS=deepseek` para este modo).
4. Respuesta JSON (no streaming): ver abajo. La pestaña muestra puntuación por inciso y comentarios.

## Petición
```json
{ "problemId": "cinetica-alimentos", "lang": "es", "images": ["data:image/jpeg;base64,…"] }
```
## Respuesta
```json
{ "total": 7.5, "max": 10,
  "incisos": [ { "id": "1a", "puntos": 2, "max": 2, "comentario": "…" } ] }
```
## Datos que faltan en `Problem_Data/problemas_data.html`
- `baremo: [{ id: "1a", max: 2 }, …]` por problema (puntos/marcas de cada inciso).
- Comprobar si el modelo elegido admite imágenes; si no, OCR previo.
## Límites a añadir
Cuota por IP más estricta que el chat (p. ej. 5/día), tamaño máximo de imagen y moderación básica.
