// ═══════════════════════════════════════════════════════════════
// CARLOS P. NAUTO INTERACTIVE — Cuentas y respaldo (Google Apps Script)
// ═══════════════════════════════════════════════════════════════
// Inicio de sesión con el correo (código de verificación de 6 dígitos) y respaldo de la
// biblioteca y preferencias de cada usuario en un Google Sheet.
//
// INSTALACIÓN (una sola vez):
//  1. Crea un Google Sheet nuevo (p. ej. "CPN Cuentas"). Copia su ID de la dirección:
//     https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit
//  2. En el Sheet: Extensiones → Apps Script. Borra lo que haya y pega todo este archivo.
//  3. (Opcional) Configuración del proyecto (engranaje) → Propiedades de la secuencia de comandos:
//       SHEET_ID  = solo si el script NO se creó desde el Sheet (acepta el ID o la dirección)
//       CODE_SALT = se crea solo; puedes poner uno propio (texto largo y secreto)
//  4. Ejecuta la función "instalar" una vez (pide permisos: Sheets y enviar correos).
//  5. Implementar → Nueva implementación → Tipo: Aplicación web
//       Ejecutar como: Yo   ·   Quién tiene acceso: Cualquier persona
//     Copia la URL que termina en /exec y agrégala en Vercel como CUENTA_GAS_URL.
// ═══════════════════════════════════════════════════════════════

const PROPS = PropertiesService.getScriptProperties()
const APP_NAME = 'Carlos P. Nauto Interactive'
const CHUNK = 40000 // una celda admite hasta 50.000 caracteres
const CODE_MINUTES = 15
const MAX_ATTEMPTS = 5

// El Sheet donde se creó este script (Extensiones → Apps Script). SHEET_ID es opcional: solo si
// el script se creó aparte. Acepta el ID o la dirección completa del Sheet.
function ss() {
  const raw = String(PROPS.getProperty('SHEET_ID') || '').trim()
  const id = (raw.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || [])[1] || raw
  if (id) return SpreadsheetApp.openById(id)
  const active = SpreadsheetApp.getActiveSpreadsheet()
  if (!active) throw new Error('Crea este script desde el Sheet (Extensiones → Apps Script) o agrega la propiedad SHEET_ID')
  return active
}

// Clave para guardar los códigos cifrados: si no se configuró CODE_SALT, se crea una sola vez
function salt() {
  let s = PROPS.getProperty('CODE_SALT')
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid()
    PROPS.setProperty('CODE_SALT', s)
  }
  return s
}

function sheet(name, header) {
  const book = ss()
  let sh = book.getSheetByName(name)
  if (!sh) {
    sh = book.insertSheet(name)
    sh.appendRow(header)
    sh.getRange(1, 1, 1, header.length).setFontWeight('bold')
    sh.setFrozenRows(1)
  }
  return sh
}

const usuarios = () => sheet('Usuarios', ['email', 'creado', 'ultimoIngreso', 'ingresos', 'ultimoRespaldo'])
const codigos = () => sheet('Codigos', ['email', 'hash', 'creado', 'intentos'])
const sesiones = () => sheet('Sesiones', ['token', 'email', 'creado', 'ultimoUso', 'dispositivo'])
const datos = () => sheet('Datos', ['email', 'parte', 'contenido', 'actualizado'])
// Comunidad: playlists que cada usuario decide compartir (con su nombre público, nunca el correo)
const comunidad = () => sheet('Comunidad', ['id', 'email', 'alias', 'clave', 'nombre', 'genero', 'tipo', 'canciones', 'actualizado'])
// Me gusta y comentarios de canciones y videos (los ven todos; se muestra el nombre público, nunca el correo)
const meGusta = () => sheet('MeGusta', ['item', 'email', 'fecha'])
const comentarios = () => sheet('Comentarios', ['id', 'item', 'email', 'alias', 'texto', 'fecha'])

function instalar() {
  usuarios(); codigos(); sesiones(); datos(); comunidad(); meGusta(); comentarios(); salt()
  Logger.log('Listo: hojas creadas en "' + ss().getName() + '". Ahora implementa como aplicación web.')
}

// ══════════════ HTTP ══════════════
function doPost(e) {
  // Leer me gusta y comentarios no espera a nadie (es lo que más se pide)
  try {
    const peek = JSON.parse(e.postData.contents)
    if (peek && peek.action === 'social') return out(social(peek))
  } catch (err) {}
  const lock = LockService.getScriptLock()
  try {
    lock.waitLock(20000)
    const body = JSON.parse(e.postData.contents)
    const a = body.action
    if (a === 'like') return out(like(body))
    if (a === 'comment') return out(comment(body))
    if (a === 'uncomment') return out(uncomment(body))
    if (a === 'requestCode') return out(requestCode(body))
    if (a === 'verifyCode') return out(verifyCode(body))
    if (a === 'load') return out(load(body))
    if (a === 'save') return out(save(body))
    if (a === 'logout') return out(logout(body))
    if (a === 'publish') return out(publish(body))
    if (a === 'unpublish') return out(unpublish(body))
    if (a === 'community') return out(community(body))
    return out({ ok: false, error: 'Acción desconocida' })
  } catch (err) {
    return out({ ok: false, error: String(err && err.message ? err.message : err) })
  } finally {
    try { lock.releaseLock() } catch (e) {}
  }
}

function doGet() {
  return out({ ok: true, app: APP_NAME })
}

function out(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON)
}

// ══════════════ Utilidades ══════════════
function norm(email) {
  return String(email || '').trim().toLowerCase()
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

function sha(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text)
  return bytes.map(function (b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0') }).join('')
}

function findRow(sh, col, value) {
  const data = sh.getDataRange().getValues()
  for (let i = 1; i < data.length; i++) if (String(data[i][col]) === value) return { row: i + 1, values: data[i] }
  return null
}

function sessionEmail(token) {
  if (!token) return null
  const sh = sesiones()
  const hit = findRow(sh, 0, sha(String(token)))
  if (!hit) return null
  sh.getRange(hit.row, 4).setValue(new Date().toISOString())
  return String(hit.values[1])
}

// ══════════════ Código por correo ══════════════
function requestCode(body) {
  const email = norm(body.email)
  if (!validEmail(email)) return { ok: false, error: 'Correo no válido.' }
  const sh = codigos()
  const prev = findRow(sh, 0, email)
  if (prev && Date.now() - new Date(prev.values[2]).getTime() < 60 * 1000)
    return { ok: false, error: 'Espera un minuto antes de pedir otro código.' }
  if (prev) sh.deleteRow(prev.row)

  const code = String(Math.floor(100000 + Math.random() * 900000))
  sh.appendRow([email, sha(email + ':' + code + ':' + salt()), new Date().toISOString(), 0])

  MailApp.sendEmail({
    to: email,
    name: APP_NAME,
    subject: 'Tu código para entrar: ' + code,
    body: 'Tu código para entrar a ' + APP_NAME + ' es: ' + code + '\n\nVence en ' + CODE_MINUTES + ' minutos.\nSi no lo pediste, ignora este mensaje.',
    htmlBody: [
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto">',
      '<div style="background:#0B0C10;border-radius:16px;padding:32px">',
      '<p style="color:#c4b5fd;font-size:18px;font-weight:bold;margin:0 0 8px">' + APP_NAME + '</p>',
      '<p style="color:#cbd5e1;font-size:15px;margin:0 0 24px">Tu código para entrar y respaldar tu biblioteca:</p>',
      '<div style="background:#16171d;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px">',
      '<span style="font-size:42px;font-weight:bold;letter-spacing:10px;color:#ddd6fe;font-family:monospace">' + code + '</span>',
      '</div>',
      '<p style="color:#94a3b8;font-size:13px;margin:0">Vence en <b>' + CODE_MINUTES + ' minutos</b>. Si no lo pediste, ignora este mensaje.</p>',
      '</div></div>',
    ].join(''),
  })
  return { ok: true }
}

function verifyCode(body) {
  const email = norm(body.email)
  const code = String(body.code || '').trim()
  const sh = codigos()
  const hit = findRow(sh, 0, email)
  if (!hit) return { ok: false, error: 'El código venció o no existe. Pide uno nuevo.' }
  if (Date.now() - new Date(hit.values[2]).getTime() > CODE_MINUTES * 60 * 1000) {
    sh.deleteRow(hit.row)
    return { ok: false, error: 'El código venció. Pide uno nuevo.' }
  }
  const attempts = Number(hit.values[3]) + 1
  if (sha(email + ':' + code + ':' + salt()) !== String(hit.values[1])) {
    if (attempts >= MAX_ATTEMPTS) {
      sh.deleteRow(hit.row)
      return { ok: false, error: 'Demasiados intentos. Pide un código nuevo.' }
    }
    sh.getRange(hit.row, 4).setValue(attempts)
    return { ok: false, error: 'Código incorrecto. Te quedan ' + (MAX_ATTEMPTS - attempts) + ' intentos.' }
  }
  sh.deleteRow(hit.row)

  // Usuario (se crea la primera vez)
  const now = new Date().toISOString()
  const us = usuarios()
  const user = findRow(us, 0, email)
  if (user) {
    us.getRange(user.row, 3).setValue(now)
    us.getRange(user.row, 4).setValue(Number(user.values[3] || 0) + 1)
  } else us.appendRow([email, now, now, 1, ''])

  // Sesión: el teléfono guarda el token; aquí solo su huella (sha)
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '')
  sesiones().appendRow([sha(token), email, now, now, String(body.device || '').slice(0, 120)])
  return { ok: true, token: token, email: email }
}

function logout(body) {
  const sh = sesiones()
  const hit = findRow(sh, 0, sha(String(body.token || '')))
  if (hit) sh.deleteRow(hit.row)
  return { ok: true }
}

// ══════════════ Respaldo ══════════════
function load(body) {
  const email = sessionEmail(body.token)
  if (!email) return { ok: false, error: 'session' }
  const data = datos().getDataRange().getValues()
  const parts = []
  let updatedAt = 0
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== email) continue
    parts.push({ n: Number(data[i][1]), c: String(data[i][2]) })
    updatedAt = Math.max(updatedAt, Number(data[i][3]) || 0)
  }
  parts.sort(function (a, b) { return a.n - b.n })
  return { ok: true, email: email, updatedAt: updatedAt, data: parts.map(function (p) { return p.c }).join('') || null }
}

function save(body) {
  const email = sessionEmail(body.token)
  if (!email) return { ok: false, error: 'session' }
  const text = String(body.data || '')
  if (text.length > 4000000) return { ok: false, error: 'Respaldo demasiado grande' }
  const sh = datos()
  // Se borran las partes anteriores de este usuario (de abajo hacia arriba)
  const data = sh.getDataRange().getValues()
  for (let i = data.length - 1; i >= 1; i--) if (String(data[i][0]) === email) sh.deleteRow(i + 1)
  const updatedAt = Date.now()
  const rows = []
  for (let i = 0, n = 0; i < text.length; i += CHUNK, n++) rows.push([email, n, text.slice(i, i + CHUNK), updatedAt])
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows)
  const us = usuarios()
  const user = findRow(us, 0, email)
  if (user) us.getRange(user.row, 5).setValue(new Date(updatedAt).toISOString())
  return { ok: true, updatedAt: updatedAt }
}

// ══════════════ Comunidad de playlists ══════════════
// publish: comparte (o actualiza) una playlist. Se identifica por la "clave" que le da el teléfono,
// así volver a publicarla la actualiza en vez de duplicarla. Máximo 60 playlists por persona.
const MAX_PUBLISHED = 60
const MAX_CELL = 48000

function clean(text, max) {
  return String(text || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function publish(body) {
  const email = sessionEmail(body.token)
  if (!email) return { ok: false, error: 'session' }
  const alias = clean(body.alias, 40)
  const nombre = clean(body.name, 80)
  const clave = clean(body.key, 80)
  if (!alias || !nombre || !clave) return { ok: false, error: 'Falta el nombre público o el de la playlist' }
  const tipo = body.kind === 'mix' ? 'mix' : 'playlist'
  const genero = clean(body.genre, 30)
  // Canciones: solo los datos para sonar; si no caben en una celda se dejan las primeras
  let tracks = Array.isArray(body.tracks) ? body.tracks.slice(0, 200) : []
  let json = JSON.stringify(tracks)
  while (json.length > MAX_CELL && tracks.length > 1) {
    tracks = tracks.slice(0, Math.floor(tracks.length * 0.8))
    json = JSON.stringify(tracks)
  }
  if (!tracks.length) return { ok: false, error: 'La playlist no tiene canciones' }
  const sh = comunidad()
  const data = sh.getDataRange().getValues()
  const now = Date.now()
  let mine = 0
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) !== email) continue
    mine++
    if (String(data[i][3]) === clave) {
      sh.getRange(i + 1, 3, 1, 7).setValues([[alias, clave, nombre, genero, tipo, json, now]])
      return { ok: true, id: String(data[i][0]), count: tracks.length }
    }
  }
  if (mine >= MAX_PUBLISHED) return { ok: false, error: 'Ya compartiste ' + MAX_PUBLISHED + ' playlists: quita alguna para compartir otra' }
  const id = Utilities.getUuid().slice(0, 12)
  sh.appendRow([id, email, alias, clave, nombre, genero, tipo, json, now])
  return { ok: true, id: id, count: tracks.length }
}

function unpublish(body) {
  const email = sessionEmail(body.token)
  if (!email) return { ok: false, error: 'session' }
  const sh = comunidad()
  const data = sh.getDataRange().getValues()
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]) === email && (String(data[i][0]) === String(body.id) || String(data[i][3]) === String(body.key))) sh.deleteRow(i + 1)
  }
  return { ok: true }
}

// community: todo lo compartido (sin correos). Con token, marca también lo propio.
function community(body) {
  const email = body.token ? sessionEmail(body.token) : null
  const data = comunidad().getDataRange().getValues()
  const list = []
  for (let i = 1; i < data.length; i++) {
    let tracks = []
    try { tracks = JSON.parse(String(data[i][7] || '[]')) } catch (e) {}
    list.push({
      id: String(data[i][0]),
      alias: String(data[i][2]),
      key: email && String(data[i][1]) === email ? String(data[i][3]) : undefined,
      mine: !!email && String(data[i][1]) === email,
      name: String(data[i][4]),
      genre: String(data[i][5]),
      kind: String(data[i][6]),
      tracks: tracks,
      updated: Number(data[i][8]) || 0,
    })
  }
  return { ok: true, playlists: list }
}

// ══════════════ Me gusta y comentarios ══════════════
// item: id de la canción o video (el de YouTube, o el de archive.org / enlace). Hasta 120 letras.
const MAX_COMMENT = 500

function itemId(v) {
  return String(v || '').replace(/[^\w:./?=&%-]/g, '').slice(0, 120)
}

// Filas (número) cuya columna `col` (1 = primera) es exactamente `value`: rápido con TextFinder
function rowsWith(sh, col, value) {
  if (!value || sh.getLastRow() < 2) return []
  return sh
    .getRange(2, col, sh.getLastRow() - 1, 1)
    .createTextFinder(value)
    .matchEntireCell(true)
    .findAll()
    .map(function (c) { return c.getRow() })
}

// social: cuántos me gusta tiene, si es tuyo, y los comentarios (los más nuevos primero)
function social(body) {
  const item = itemId(body.item)
  if (!item) return { ok: false, error: 'item' }
  const email = body.token ? sessionEmail(body.token) : null
  const lg = meGusta()
  const likeRows = rowsWith(lg, 1, item)
  let liked = false
  if (email) for (let i = 0; i < likeRows.length; i++) if (String(lg.getRange(likeRows[i], 2).getValue()) === email) { liked = true; break }
  const cm = comentarios()
  const list = rowsWith(cm, 2, item)
    .map(function (r) {
      const v = cm.getRange(r, 1, 1, 6).getValues()[0]
      return { id: String(v[0]), alias: String(v[3]), text: String(v[4]), at: Number(v[5]) || 0, mine: !!email && String(v[2]) === email }
    })
    .sort(function (a, b) { return b.at - a.at })
    .slice(0, 100)
  return { ok: true, likes: likeRows.length, liked: liked, comments: list, count: list.length }
}

// like: { token, item, on } → pone o quita tu me gusta
function like(body) {
  const email = sessionEmail(body.token)
  if (!email) return { ok: false, error: 'session' }
  const item = itemId(body.item)
  if (!item) return { ok: false, error: 'item' }
  const sh = meGusta()
  const rows = rowsWith(sh, 1, item)
  let mineRow = 0
  for (let i = 0; i < rows.length; i++) if (String(sh.getRange(rows[i], 2).getValue()) === email) { mineRow = rows[i]; break }
  let count = rows.length
  if (body.on && !mineRow) {
    sh.appendRow([item, email, Date.now()])
    count++
  } else if (!body.on && mineRow) {
    sh.deleteRow(mineRow)
    count--
  }
  return { ok: true, likes: Math.max(0, count), liked: !!body.on }
}

// comment: { token, item, alias, text } → agrega un comentario (máx. 500 letras; uno cada 10 s)
function comment(body) {
  const email = sessionEmail(body.token)
  if (!email) return { ok: false, error: 'session' }
  const item = itemId(body.item)
  const alias = clean(body.alias, 40)
  const text = String(body.text || '').replace(/[<>]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, MAX_COMMENT)
  if (!item || !text) return { ok: false, error: 'Escribe tu comentario' }
  if (!alias) return { ok: false, error: 'Falta tu nombre público' }
  const sh = comentarios()
  const last = sh.getLastRow()
  if (last >= 2) {
    const from = Math.max(2, last - 30)
    const recent = sh.getRange(from, 3, last - from + 1, 4).getValues()
    const now = Date.now()
    for (let i = 0; i < recent.length; i++) if (String(recent[i][0]) === email && now - Number(recent[i][3]) < 10000) return { ok: false, error: 'Espera unos segundos para comentar de nuevo' }
  }
  const id = Utilities.getUuid().slice(0, 12)
  const at = Date.now()
  sh.appendRow([id, item, email, alias, text, at])
  return { ok: true, comment: { id: id, alias: alias, text: text, at: at, mine: true } }
}

// uncomment: { token, id } → borra un comentario tuyo
function uncomment(body) {
  const email = sessionEmail(body.token)
  if (!email) return { ok: false, error: 'session' }
  const sh = comentarios()
  const rows = rowsWith(sh, 1, String(body.id || ''))
  for (let i = rows.length - 1; i >= 0; i--) if (String(sh.getRange(rows[i], 3).getValue()) === email) sh.deleteRow(rows[i])
  return { ok: true }
}
