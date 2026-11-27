// Arreglo de youtube-video-element (lo usa react-player para los videos de YouTube):
// si el script de YouTube (www.youtube.com/iframe_api) no cargaba una vez —por ejemplo, un momento
// sin internet—, la librería guardaba ese fallo y ya no volvía a intentarlo hasta reiniciar la app.
// Ahora, al fallar, se olvida el intento: el siguiente video lo vuelve a cargar.
// Se aplica solo después de cada `npm install` (también en Vercel).
const fs = require('fs')
const path = require('path')

const files = [
  'node_modules/youtube-video-element/dist/youtube-video-element.js',
  'node_modules/youtube-video-element/dist/cjs/youtube-video-element.js',
]
const from = 'script.onerror = reject;'
const to = 'script.onerror = (e) => { delete loadScriptCache[src]; script.remove(); reject(e); };'

for (const rel of files) {
  const file = path.join(__dirname, '..', rel)
  if (!fs.existsSync(file)) continue
  const src = fs.readFileSync(file, 'utf8')
  if (src.includes(to)) continue
  if (!src.includes(from)) {
    console.warn(`[patch-youtube-element] no se encontró el punto a corregir en ${rel}`)
    continue
  }
  fs.writeFileSync(file, src.replace(from, to))
  console.log(`[patch-youtube-element] corregido ${rel}`)
}
