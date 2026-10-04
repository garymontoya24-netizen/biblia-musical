# Biblia Musical

Cuaderno de composición para el proyecto de poner toda la Biblia en música:
mapa de los 66 libros → obras → números (coros, recitativos, arias, corales) →
hojas de pentagrama escritas a mano con Apple Pencil.

Es una app web instalable (PWA): se agrega a la pantalla de inicio del iPad,
abre en pantalla completa, funciona sin internet y guarda todo en el iPad
(IndexedDB). La sección **Respaldo** exporta e importa una copia en un archivo
`.json` para guardarla en iCloud Drive.

## Archivos

- `index.html` — toda la app.
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
