# Sitial de Talentos Cubanos 🇨🇺⚗️

Sitio web estático que recoge la historia de la participación cubana en las **Olimpiadas de Química**: medallas, competidores, equipos, profesores, fotos, prensa y un banco de problemas.

- 🌐 Sitio (Vercel): https://sitialtalento.vercel.app/
- 📄 Sitio (GitHub Pages): https://endris10.github.io/Sitial_Talento/
- 📷 Fotos: https://imgur.com/a/98WvY48

---

## ✨ Qué incluye

| Sección | Qué muestra |
|---|---|
| **Sitial** (`index.html`) | Tarjetas ("cuadritos") por competidor con sus medallas, búsqueda, filtros y enlace compartible por persona. |
| **Historial por Eventos** | Tablas por olimpiada (IChO, IMChO, OIAQ, OCACQ y otras) y año, con filtros y orden. |
| **Historial por Medallas / Ranking / Estadísticas** | Rankings y gráficos (SVG propios) por provincia, medallas y puntos. |
| **Olimpiada Cubana (CNQ)** | Resultados y material de la Olimpiada Cubana de Química. |
| **Honor a quien honor merece** | Artículos sobre entrenadores y figuras destacadas (ES/EN). |
| **Equipo** (`equipo.html`) | Página compartible de un equipo concreto (olimpiada + año): participantes con medallas, profesores y fotos. URL: `/Equipo/IChO/2026`. |
| **Media** (`media.html`) | Galería de fotos con visor ampliado y enlace por foto. |
| **Noticias** (`noticias.html`) | Recortes de prensa. |
| **Banco de Problemas** | Problemas de olimpiada con visor (`Problem_Data/visor.html`), enunciado/solución y moléculas dibujadas con SVG. |

Extras: **funciona sin conexión (PWA instalable)**, **exportar tablas a Excel/CSV e imprimirlas**, español/inglés, modo claro/oscuro, tablas pintadas por tandas, vistas previas (Open Graph) dinámicas al compartir enlaces.

---

## 🗂️ Estructura del repositorio

```
├── index.html              Aplicación principal (SPA con secciones)
├── equipo.html             Página de equipo por olimpiada+año
├── media.html              Galería de fotos
├── noticias.html           Prensa
├── Banco_Problemas.html    Listado del banco de problemas
├── 404.html                Enrutador de URLs bonitas (truco SPA de rafgraph)
├── sw.js                   Service Worker (modo offline)
├── .env.example            Variables de entorno del chatbot (plantilla)
├── scripts/chat-dev.mjs    Servidor local para probar sitio + chatbot
├── manifest.webmanifest    Manifiesto PWA (instalable)
├── offline.html            Pantalla de respaldo sin conexión
├── Data/                   Datos del sitio (ver abajo)
├── Problem_Data/           Datos y visor del Banco de Problemas
├── Assets/                 Logos, iconos PWA, CSS/JS de UI (pwa.js, tools.js), vendor/ y material del CNQ
├── api/
│   ├── og.js               Genera imágenes Open Graph (Edge, @vercel/og)
│   ├── chat.js             Chatbot: POST /api/chat (streaming)
│   └── _lib/               kb.js (búsqueda en los datos), llm.js + health.js (IA con relevo), guard.js (límites), prompts.js
│   ├── check-links.js      Cron diario: detecta enlaces rotos de Imgur
├── middleware.js           Edge Middleware: meta tags OG por cuadrito/foto/problema
├── vercel.json             Rewrites, cabeceras de caché y cron
├── package.json            Dependencia @vercel/og
├── robots.txt / sitemap.xml
```

### Datos (`Data/`)
Los datos son archivos `.html` con un `<script id="…">` que la página descarga con `fetch` y ejecuta. **Para actualizar contenido solo se editan estos archivos:**

- `olympiad_data.html` — participantes y medallas por olimpiada/año.
- `professor_data.html` — profesores y roles.
- `media_data.html` — fotos. Formato de cada entrada:
  - `name: "DD_MM_AAAA_evento[_num]"` (entre comillas). `evento` ∈ `icho, imcho, oiaq, ocacq, otras`; `_num` es opcional para varias fotos del mismo día/evento (`_1`, `_2`…).
  - `link: "URL directa de la imagen"` (entre comillas).
- `CNQ_data.html`, `honor_merece_ES/EN.html`, `newspapers.html`, `entrevistas_data.html`, `olympiad_date.html`.

---

## 🚀 Despliegue

Es un sitio 100 % estático: no hay build. En **Vercel** basta con importar el repositorio (framework "Other").

- **URLs bonitas** (`/Historial_Eventos/IChO`, `/Equipo/IChO/2026`, `/Banco_Problemas/<id>/<tab>`): al no existir archivo real, Vercel/GitHub Pages sirven `404.html`, que redirige al archivo correcto.
- **Vistas previas al compartir**: `middleware.js` intercepta `/Equipo/<olimpiada>/<año>`, `/Historial_Medallas/cuadrito=<slug>`, `/media?foto=<name>` y `/Banco_Problemas/<id>/<tab>` y devuelve el HTML con meta tags Open Graph propios; la imagen sale de `api/og.js`.
- **Sitemap**: `/sitemap.xml` se sirve desde `api/sitemap.js`, que lo genera a partir de `Data/` (equipos, cuadritos, problemas); `generate-sitemap.mjs` crea la copia estática.
- **Cron** (`vercel.json`): `/api/check-links` corre a diario y reporta imágenes de Imgur caídas en los logs (opcional: variable `WEBHOOK_URL` para recibir el aviso).
- **Caché**: `Assets/` con caché larga; `Data/` con `s-maxage=300` + `stale-while-revalidate`, de modo que los cambios en los datos se ven en pocos minutos.

### Probar en local
```bash
npx serve .        # o: python3 -m http.server
```
(No abrir con `file://`: los datos se cargan con `fetch`.)

---

## 📲 PWA, impresión y exportación

**Modo offline / app instalable**
- `sw.js` (raíz) + `manifest.webmanifest` + `Assets/UI/pwa.js` (registro, botón *Instalar app*, aviso de "Sin conexión" y de "Nueva versión").
- Estrategias: páginas y `Data/` → **red primero** (siempre lo último publicado) con copia guardada si no hay red (4 s / 3 s); `Assets/`, fuentes y CDN → caché primero con actualización en segundo plano; fotos de Imgur → caché (máx. 250); `/api/` nunca se cachea.
- Las rutas bonitas (`/Historial_Eventos/IChO`, `/Equipo/IChO/2026`, `/Banco_Problemas/<id>/<tab>`) también abren sin conexión.
- Tras instalar, el sitio descarga la carcasa y todos los `Data/` y `Problem_Data/`. Si algún día cambias algo grande en la carcasa, sube `VERSION` en `sw.js`.
- En Vercel: `vercel.json` sirve `sw.js` sin caché (con `Service-Worker-Allowed: /`), el manifiesto con su `Content-Type` y caché larga para iconos y `vendor/`. No requiere build.

**Exportar e imprimir** (`Assets/UI/tools.js`)
- Cada tabla (Historial por eventos, ranking CNQ, estadísticas por provincia) y la lista del Sitial muestran una barra con **⬇ Excel · ⬇ CSV · 🖨 Imprimir**.
- Exporta lo que estás viendo (filtros y orden incluidos): año y edición en columnas separadas, provincia completa, autofiltro y anchos de columna. Excel usa SheetJS incluido en `Assets/vendor/` (funciona sin conexión).
- Imprimir genera un documento A4 limpio con cabecera repetida en cada hoja (horizontal si la tabla es ancha).

---

## 🤖 Chatbot (Asistente del Sitial)

Botón flotante en todas las páginas que abre un chat con IA. Responde sobre el sitio —medallas, equipos, personas, profesores, CNQ, noticias, fotos, problemas, cómo usar cada sección— **dando los enlaces correspondientes**, y también contesta preguntas generales. Todo gratis.

**Arquitectura**
```
navegador (Assets/UI/chatbot.js) ──POST──► /api/chat (Vercel, Node, streaming SSE)
                                              │ 1. valida + origen + límite por IP        (guard.js)
                                              │ 2. busca fragmentos relevantes             (kb.js)
                                              │ 3. arma el prompt con ese contexto         (prompts.js)
                                              └ 4. llama a la IA, con relevo automático    (llm.js + health.js)
```
- **Conocimiento (RAG sin base de datos):** `kb.js` lee los mismos archivos que ya editas (`Data/*.html`, `Problem_Data/problemas_data.html`) y los convierte en ~800 fragmentos (personas, equipos, resúmenes y rankings, CNQ, biografías, noticias, fotos, problemas…). Busca por palabras (sin acentos, ES/EN) y manda al modelo solo lo relevante. Cada deploy lo actualiza solo.
- **Guía del sitio:** `Data/chatbot_guia.md` es texto normal con lo que el bot debe saber de la web (secciones, contacto, preguntas frecuentes). Cada bloque empieza con `## Título` y, opcionalmente, `url: /ruta`. Edítalo cuando quieras.
- **IA gratuita con relevo automático:** orden por defecto Mistral → Gemini → Groq → OpenRouter, con varios modelos por proveedor (cada modelo gratuito tiene su propia cuota). Si un modelo se queda sin cuota (429), falla (5xx/timeout), devuelve vacío o tiene la clave mal, **esa misma petición pasa al siguiente sin esperar** y el modelo queda "enfriado" (30 s–6 h según el error; 30 min si es cuota diaria) para que las siguientes preguntas ni lo intenten hasta que se recupere. Todos usan el protocolo OpenAI-compatible, igual que DeepSeek.
- **Por qué Mistral primero:** su capa gratuita es la más generosa (1 petición/s y ~1.000 millones de tokens/mes, sin tope diario práctico) y responde bien en español. Groq (~1.000 peticiones y 200 K tokens/día por modelo) y Gemini son el respaldo. Los límites gratuitos cambian: compruébalos en cada consola.
- **Anti-abuso:** solo acepta peticiones del propio sitio (mismo origen), máx. 1.000 caracteres por mensaje y 10 de historial, límite por IP (8/min y 80/día por defecto) y tope global diario. Con Upstash Redis (gratis) los contadores y el estado de salud se comparten entre instancias; sin él funcionan en memoria.
- **Privacidad:** en las capas gratuitas los proveedores pueden usar las conversaciones para mejorar sus modelos (Mistral lo exige en su plan gratuito; Google también). El widget no pide ni guarda datos personales; la conversación solo vive en `sessionStorage` de la pestaña.

**Puesta en marcha en Vercel**
1. Consigue al menos una clave gratuita (Mistral recomendada; añade Gemini y Groq para respaldo): enlaces en `.env.example`.
2. Vercel → tu proyecto → *Settings → Environment Variables*: añade `MISTRAL_API_KEY` (y las demás) para *Production* y *Preview*. Redespliega.
3. Comprueba `https://sitialtalento.vercel.app/api/chat` (GET): debe mostrar `"proveedores"` ≥ 1 y `"fragmentos"` ≈ 800. Si `fragmentos` es 0, los datos no viajan con la función: revisa `functions → includeFiles` en `vercel.json`.
4. Opcional: crea una base gratuita en Upstash y añade `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`; y `CHAT_DEBUG_TOKEN` para ver la salud de cada modelo.

**Probar en local:** `cp .env.example .env`, rellena una clave y `node --env-file=.env scripts/chat-dev.mjs` → http://localhost:3000.


---

### Cómo entiende y responde las preguntas
1. **Entender** (`api/_lib/plan.js`): un modelo rápido reformula la pregunta (sinónimos, «última» → edición concreta, seguimientos) y decide si es del Sitial, general o de actualidad. No hay listas de preguntas; `CHAT_PLAN=0` lo desactiva.
2. **Sitial primero**: se buscan los datos del sitio con esa consulta.
3. **Internet después** (`api/_lib/web.js`): si es de actualidad, o si el asistente responde `[[BUSCAR: …]]` porque el Sitial no tiene el dato. Usa Tavily con `TAVILY_API_KEY` (plan gratuito) o Wikipedia sin clave.
4. **Guidelines** en `api/_lib/prompts.js` y `Data/chatbot_guia.md`.

### Conocimiento precargado
Al arrancar, `kb.js` construye una **ficha base** del Sitial (olimpiadas y alias —«ibero» = OIAQ—, última edición de cada una con su delegación, otras olimpiadas, fecha de hoy) que acompaña SIEMPRE al asistente, además de los fragmentos que recupera por pregunta. Para añadir conocimiento permanente edita `Data/chatbot_guia.md`.

### Campo vectorial (chatbot y tutor)
Cada fragmento de contenido del Sitial es un **vector** y cada pregunta también; así se sabe *hacia dónde apunta* aunque no repita las palabras del contenido (`api/_lib/vectores.js`).
- **Capa local** (siempre activa, sin API ni cuota): vectores de palabras, bigramas y trigramas de letras con pesos idf; tolera erratas y alias («ibero» ≈ OIAQ).
- **Capa semántica** (opcional): embeddings de Gemini (`gemini-embedding-001`, 256 dim.) o Mistral. Se generan **una vez** en tu ordenador con `GEMINI_API_KEY=… node scripts/build-vectores.mjs`, que crea `Data/vectores.json` (≈1 MB); súbelo al repo. Después, cada pregunta solo calcula su propio vector. Si cambias mucho los datos, vuelve a ejecutarlo (los fragmentos cambiados se detectan por hash y usan solo la capa local hasta entonces). `CHAT_VECTORS=0` la desactiva.
- **Dirección («brújula»)**: cada grupo (equipo·IChO, equipo·OIAQ, noticia, honor, problema…) tiene un centroide; la pregunta se proyecta sobre ellos y la dirección resultante refuerza esos fragmentos y se pasa al modelo (`BRÚJULA VECTORIAL`).
- Puntuación final = BM25 + similitud local + similitud semántica, × refuerzo por dirección.
- **Tutor**: cada problema se trocea por incisos (enunciado y solución) y la pregunta, o el texto seleccionado, se proyecta sobre esos trozos para saber a qué inciso apunta (`enfoqueProblema` en `api/_lib/problemas.js`).

### Banco de Problemas — tutor con IA (gratuito, con visión)
Pestañas: Enunciado · ✍️ Tu respuesta · 🔑 Respuesta (pide confirmación).
- **Preguntar al tutor** (`api/tutor.js`, acción `hint`): aclaraciones (0 %), pistas (−5 %) y pistas fuertes (−12 %) restan puntos; las preguntas obvias o que piden la respuesta se rechazan. Acepta texto o una foto de la duda.
- **Calificar** (acción `grade`), 3 pasos rápidos: 1) un modelo con **visión** (Gemini / Mistral / Groq) transcribe las fotos o el texto y detecta qué incisos hay, cuáles faltan y si quedó cortada; 2) si solo enviaste una parte, el tutor pregunta si continúas o calificas solo lo enviado; 3) **dos modelos distintos califican en paralelo** (revisión cruzada) comparando con la solución oficial; los puntos se promedian y se acotan al baremo.
- Sin DeepSeek ni modelos de pago: `TUTOR_VISION`, `TUTOR_GRADERS`, `TUTOR_FAST` fijan los modelos; `TUTOR_DUAL=0` desactiva la revisión cruzada. Límites: `TUTOR_HINT_DAY`, `TUTOR_GRADE_DAY`, `TUTOR_GLOBAL_DAY`.
- **Conversar sobre la solución** (acción `discuss`, sin penalización): tras calificar aparece un chat para preguntar *cómo* y *por qué* (botones «¿Cómo se hace?» / «¿Por qué?» en cada inciso), y se puede **seleccionar cualquier texto** de la solución, de la corrección o del enunciado y pulsar «Preguntar al tutor» (en el enunciado cuenta como pista y resta puntos). La corrección y la conversación se guardan en el navegador.
- Los problemas se cargan en memoria una vez (`api/_lib/problemas.js`), incluido el baremo por inciso (de las etiquetas «N puntos» de la solución).

### Menú hamburguesa
`Assets/UI/menu.js` añade el menú a media, noticias, Banco de Problemas, equipos y visor; en todas las páginas no muestra la sección donde ya estás.

## ⚗️ Esquemas libres y dibujo por IA (MolGraph)

`Problem_Data/mol-graph.html` incluye un motor de **esquemas libres**: nodos en rejilla `@columna,fila`, flechas en cualquier dirección (→ ← ↓ ↑, en escuadra `ruta=hv`, equilibrio `<=>`, resonancia `<->`, punteada `-->`), reactivos arriba (azul) y abajo (rojo), nota gris entre corchetes, cajas de resalte (`caja amarillo: a, b | Stobbe`), átomos resaltados (`resaltar=3,4`) y flechas curvas de mecanismo (`curva: a:3 -> a:5`). La sintaxis completa está en `api/_lib/dibujo.js`; es la misma que se le da al tutor, que puede responder con `[[MOL: SMILES | nombre]]` o con bloques ```esquema``` y el visor los dibuja (todo se escapa; la IA nunca inyecta HTML). El cajón del tutor se puede mover (arrastrando la cabecera), redimensionar, maximizar (⤢ o doble clic) y siempre hay un botón flotante «Habla con el tutor».

## 🛠️ Notas técnicas (lecciones aprendidas)

- `<base id="app-base-href">` se fija a `/` fuera de GitHub Pages para que `fetch('Data/…')` y las imágenes relativas funcionen bajo cualquier URL bonita.
- **No activar `cleanUrls`/`trailingSlash` en `vercel.json`**: cada `fetch('Data/x.html')` pasaba por un redirect 308 extra, ralentizando la carga de tablas y gráficos.
- Si el prefetch temprano de un dataset falla, el cargador reintenta contra la raíz del sitio en lugar de dar el error por definitivo.
- Las tablas grandes se renderizan por tandas (`_instalarTablasPorTandas`).

---

## 📋 Funcionalidades por añadir

- [ ] Buscador global (competidores, profesores, problemas) en la cabecera.
- [ ] Página de perfil por profesor/entrenador compartible.
- [ ] Comparador de equipos entre años y países.
- [ ] Más fotos/vídeos por equipo y descarga de la ficha del equipo como imagen (para redes).
- [ ] Mirror/subida propia de imágenes (menos dependencia de Imgur) y aviso del cron por Telegram.
- [ ] Panel de edición de datos (formulario que genere las entradas de `Data/`).
- [ ] Traducción completa al inglés de todas las secciones.

---

## 🤝 Créditos

Proyecto de **César Acosta Martínez** ([@EnDriS10](https://github.com/EnDriS10)), con la comunidad de la Olimpiada de Química de Telegram (TChO). Las sugerencias y correcciones de datos son bienvenidas vía issues o pull requests.
