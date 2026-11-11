# Tank Battle Arena — prototipo inicial

Este proyecto es un prototipo web multijugador para una actividad de clase.

## Requisitos
- Node.js instalado en el computador.
- Conexión a internet para instalar dependencias.

## Ejecutar en tu computador
1. Descarga e instala Node.js desde https://nodejs.org/
2. Descomprime el proyecto.
3. Abre una terminal dentro de la carpeta `tank_battle`.
4. Ejecuta: `npm install`
5. Ejecuta: `npm start`
6. Abre `http://localhost:3000` en tu navegador.

Para probar dos jugadores en el mismo computador, abre dos ventanas o navegadores y crea/únete a una sala.

## Importante: estado del prototipo
Esta primera versión incluye:
- Crear salas con código y unirse a ellas.
- Lobby con lista de jugadores.
- Arena 2D y controles básicos táctiles/de mouse.
- Pregunta de opción múltiple con 20 segundos.
- Clasificación por respuestas correctas y rapidez.

Todavía es una base de desarrollo, no una versión lista para una presentación pública:
- Las preguntas de `public/game.js` son ejemplos y deben reemplazarse por las de tu exposición.
- La detección de impactos es una primera aproximación y necesita pruebas/mejoras antes de una presentación pública.
- Para jugar por internet, el servidor Node.js debe publicarse en un servicio que admita WebSockets. GitHub Pages por sí solo solo aloja archivos estáticos y no ejecuta `server.js`.
- El ganador de cada batalla responde en su propia pantalla; los demás ven la pregunta. La puntuación propuesta es `100 × (20 − segundos) / 20`, solo si la respuesta es correcta.

## Controles
- Al presionar/clicar sobre la arena: dispara una vez y cambia el sentido de giro.
- Mientras mantienes presionado: el tanque avanza.
- Al soltar: deja de avanzar.

## Editar preguntas
En `public/game.js`, busca `const QUESTIONS` y reemplaza las preguntas y respuestas de ejemplo. El índice `correct` empieza en 0: 0 = A, 1 = B, 2 = C, 3 = D.
