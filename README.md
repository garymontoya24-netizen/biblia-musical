# Biblia Musical

Cuaderno de composición para el proyecto de poner toda la Biblia en música:
mapa de los 66 libros → obras → números (coros, recitativos, arias, corales) →
hojas de pentagrama escritas a mano con Apple Pencil.

Es una app web instalable (PWA): se agrega a la pantalla de inicio del iPad,
abre en pantalla completa, funciona sin internet y guarda todo en el iPad
(IndexedDB). La sección **Respaldo** exporta e importa una copia en un archivo
`.json` para guardarla en iCloud Drive.

## Partituras que suenan

En cada número: **♪ Nueva partitura** (coro SATB, SATB y órgano, voz y piano, piano o una melodía).
Se escribe tocando el pentagrama con el lápiz donde va la nota (o con el teclado de piano en pantalla,
o con un teclado físico: letras A–G, números 2–6 para la figura, `.` puntillo, `0` silencio, flechas,
borrar, espacio para reproducir). Tiene puntillo, silencios, acordes, alteraciones, ligaduras, letra
sílaba por sílaba, compás, tonalidad, tempo y sonido por pentagrama (piano, órgano, voz, cuerdas, flauta).
**Exportar a MuseScore** guarda un archivo `.musicxml` que abre MuseScore, Dorico, Finale o Sibelius.

## Archivos

- `index.html` — la app (mapa, obras, números, hojas a mano, respaldo).
- `partitura.js` — el editor de partituras con sonido y exportación MusicXML.
- `vendor/vexflow-4.2.5.js` — VexFlow (licencia MIT, ver `vendor/VEXFLOW-LICENSE`), dibuja la notación.
- `sw.js` — funcionamiento sin conexión. **Al cambiar cualquier archivo, sube
  `VERSION`** para que el iPad reciba la actualización (aparece un aviso
  "Hay una versión nueva").
- `manifest.webmanifest` y `icons/` — instalación e ícono.

## Publicar

Son archivos estáticos, sin compilación. En Vercel: **Add New → Project**, elegir
este repositorio y **Deploy** (sin configurar nada). También sirve GitHub Pages.

## Probar en el computador

```bash
python3 -m http.server 8000   # y abrir http://localhost:8000
```
