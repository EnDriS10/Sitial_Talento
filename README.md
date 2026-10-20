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

Extras: español/inglés, modo claro/oscuro, tablas pintadas por tandas, vistas previas (Open Graph) dinámicas al compartir enlaces.

---

## 🗂️ Estructura del repositorio

```
├── index.html              Aplicación principal (SPA con secciones)
├── equipo.html             Página de equipo por olimpiada+año
├── media.html              Galería de fotos
├── noticias.html           Prensa
├── Banco_Problemas.html    Listado del banco de problemas
├── 404.html                Enrutador de URLs bonitas (truco SPA de rafgraph)
├── Data/                   Datos del sitio (ver abajo)
├── Problem_Data/           Datos y visor del Banco de Problemas
├── Assets/                 Logos, CSS/JS de UI y material del CNQ
├── api/
│   ├── og.js               Genera imágenes Open Graph (Edge, @vercel/og)
│   └── check-links.js      Cron diario: detecta enlaces rotos de Imgur
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
- **Vistas previas al compartir**: `middleware.js` intercepta `/Historial_Medallas/cuadrito=<slug>`, `/media?foto=<name>` y `/Banco_Problemas/<id>/<tab>` y devuelve el HTML con meta tags Open Graph propios; la imagen sale de `api/og.js`.
- **Cron** (`vercel.json`): `/api/check-links` corre a diario y reporta imágenes de Imgur caídas en los logs (opcional: variable `WEBHOOK_URL` para recibir el aviso).
- **Caché**: `Assets/` con caché larga; `Data/` con `s-maxage=300` + `stale-while-revalidate`, de modo que los cambios en los datos se ven en pocos minutos.

### Probar en local
```bash
npx serve .        # o: python3 -m http.server
```
(No abrir con `file://`: los datos se cargan con `fetch`.)

---

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
- [ ] Imagen Open Graph dinámica para `/Equipo/<olimpiada>/<año>`.
- [ ] Sitemap generado automáticamente a partir de `Data/` (equipos, cuadritos, problemas).
- [ ] Mirror/subida propia de imágenes (menos dependencia de Imgur) y aviso del cron por Telegram.
- [ ] Más problemas en el Banco con filtros por tema, dificultad y año.
- [ ] Modo offline (PWA) y versión imprimible de rankings.
- [ ] Panel de edición de datos (formulario que genere las entradas de `Data/`).
- [ ] Traducción completa al inglés de todas las secciones.

---

## 🤝 Créditos

Proyecto de **César Acosta Martínez** ([@EnDriS10](https://github.com/EnDriS10)), con la comunidad de la Olimpiada de Química de Telegram (TChO). Las sugerencias y correcciones de datos son bienvenidas vía issues o pull requests.
