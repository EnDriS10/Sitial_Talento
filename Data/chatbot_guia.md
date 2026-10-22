<!--
  GUÍA DEL CHATBOT — Data/chatbot_guia.md
  ───────────────────────────────────────────────────────────────
  Aquí se escribe, en texto normal, lo que el asistente debe saber del
  SITIO (qué hay en cada sección, cómo se usa, contacto, preguntas
  frecuentes…). Los datos de medallas, equipos, profesores, CNQ,
  noticias, fotos y problemas NO hace falta copiarlos aquí: el
  asistente los lee solo de Data/*.html y Problem_Data/.

  Formato: cada bloque empieza con "## Título". Opcionalmente, la primera
  línea del bloque puede ser "url: /ruta" (o una URL completa) para
  indicar el enlace que el asistente debe ofrecer. Guarda, sube a GitHub
  y Vercel lo aplica en el siguiente despliegue.
-->

## Qué es el Sitial de Talentos Cubanos
url: /
El Sitial de Talentos Cubanos (sitialtalento.vercel.app) es el registro de los estudiantes cubanos que han representado a Cuba en las olimpiadas internacionales de química (IChO, IMChO, OIAQ, OCACQ y otras) y de las personas que los formaron. Reúne medallas, equipos, profesores, el Concurso Nacional de Química (CNQ), fotos, noticias y un banco de problemas para entrenar. Está en español e inglés (botón ES/EN) y tiene modo claro y oscuro. Su portada muestra una cuenta atrás hacia la próxima IChO y cifras de «Cuba en números».

## Secciones del sitio y cómo llegar
url: /
- Inicio: portada con cifras (medallas, años de impacto, países visitados) y cuenta atrás de la próxima IChO.
- Historial por Eventos (/Historial_Eventos/IChO, /IMChO, /OIAQ, /OCACQ): tablas por olimpiada, con rol (estudiante, profesor o delegación), orden y filtros. Tocar el año abre la página del equipo.
- Historial por Medallas / Sitial de Honor (/Historial_Medallas): tarjetas de todos los medallistas y mencionados, con búsqueda, filtro por medalla y por provincia.
- Olimpiada Cubana de Química (/Olimpiada_Cubana): ranking del CNQ (/Olimpiada_Cubana/Ranking), exámenes y soluciones por edición (/Olimpiada_Cubana/Concursos) y estadísticas por provincia (/Olimpiada_Cubana/Estadisticas).
- Banco de Problemas (/Banco_Problemas): problemas de química por dificultad y tema, con enunciado y respuesta.
- Honor a quien Honor Merece (/Honor_Merece/Entrenadores y /Honor_Merece/Proceres): biografías de entrenadores nacionales y próceres de la química cubana.
- Noticias y Entrevistas (/noticias) y Media con fotos (/media).
- Enlaces y Contacto: al pie del sitio.

## Cómo compartir una tarjeta, un equipo, una foto o un problema
url: /Historial_Medallas
Cada tarjeta de competidor tiene botón de compartir con enlace propio (/Historial_Medallas/cuadrito=nombre-apellidos). Cada equipo (olimpiada + año) tiene su página compartible, por ejemplo /Equipo/IChO/2026, con participantes y medallas, profesores y fotos; se abre desde el chip de evento de una tarjeta, desde el año en Historial por Eventos o tocando la insignia del evento en una foto de Media. Las fotos se comparten con /media?foto=nombre y los problemas con /Banco_Problemas/<id>/enunciado o /respuesta. Al pegar estos enlaces en WhatsApp, Telegram, etc., se ve una vista previa con título e imagen.

## Exportar a Excel e imprimir tablas
url: /Historial_Eventos/IChO
Sobre cada tabla (Historial por eventos, ranking del CNQ, estadísticas por provincia) y sobre la lista del Sitial hay botones pequeños: «Excel» (descarga .xlsx), «CSV» e «Imprimir» (documento A4 limpio con cabecera repetida). Se exporta lo que se está viendo, con los filtros y el orden elegidos.

## Usar el sitio sin conexión e instalarlo como app
url: /
El Sitial es una aplicación web instalable (PWA): al entrar la primera vez guarda las páginas y los datos y funciona sin conexión. En el navegador aparece la opción «Instalar app» (o «Añadir a pantalla de inicio» en el móvil). Cuando hay una versión nueva avisa con un botón para actualizar.

## Qué son las olimpiadas (IChO, IMChO, OIAQ, OCACQ, CNQ)
url: /Historial_Eventos/IChO
- IChO: Olimpiada Internacional de Química, la mayor del mundo; se celebra cada año en un país distinto y participan equipos de unos 90 países (hasta 4 estudiantes por país).
- IMChO: Olimpiada Internacional Mendeléiev de Química (organizada en Rusia).
- OIAQ: Olimpiada Iberoamericana de Química.
- OCACQ: Olimpiada Centroamericana y del Caribe de Química.
- Otras: olimpiadas varias (por ejemplo la Olimpiada Española de Química, OEQ, o la Hondureña, OHQ) en las que ha participado Cuba.
- CNQ: Concurso Nacional de Química de Cuba (décimo, onceno y duodécimo grado), de donde sale la Preselección Nacional (PSN) que forma los equipos.
Los premios se dan como oro, plata, bronce y mención honorífica.

## Puntuación ponderada de las estadísticas
url: /Olimpiada_Cubana/Estadisticas
En las estadísticas por provincia el Sitial usa una puntuación ponderada: oro = 3 puntos, plata = 2, bronce = 1 y mención honorífica = 0,5. Las gráficas se pueden ampliar y la sección tiene vista de histogramas y vista de tabla.

## Contacto y enlaces de interés
url: /
- Comité Científico de la Olimpiada Cubana de Química: Dr. Gerardo Manuel Ojeda Carralero, gmojedac@gmail.com.
- Presidente de la Sociedad Cubana de Química: Dr. Julieta Coro Bermello, corobermellojulieta@gmail.com.
- Web developer y Telegram Chemistry Olympiad: César Acosta Martínez, tchoquimica@yahoo.com. Aquí también se puede escribir para enviar una historia, noticia o corregir datos del sitio.
- Sociedad Cubana de Química: https://scqcuba.org/
- Canal de Telegram del Concurso: https://t.me/Concursantes_Quimica

## Cómo se actualizan los datos y cómo corregir un error
url: /
Los datos del Sitial (medallas, profesores, CNQ, fotos, noticias, problemas) se mantienen en archivos de texto del repositorio público https://github.com/EnDriS10/Sitial_Talento. Si encuentras un dato incorrecto o falta algo (una medalla, una foto, un profesor), escribe al equipo web a tchoquimica@yahoo.com indicando la olimpiada, el año y la corrección.

## Sobre este asistente
url: /
Soy el asistente de IA del Sitial. Respondo sobre el sitio y sus datos (medallas, equipos, profesores, CNQ, noticias, fotos, problemas) y también puedo ayudar con preguntas generales. Puedo equivocarme: para datos importantes conviene comprobarlos en el enlace que indico.
