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
//  3. Configuración del proyecto (engranaje) → Propiedades de la secuencia de comandos:
//       SHEET_ID     = el ID del paso 1
//       CODE_SALT    = cualquier texto largo y secreto (p. ej. 40 letras al azar)
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

function ss() {
  return SpreadsheetApp.openById(PROPS.getProperty('SHEET_ID'))
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

function instalar() {
  usuarios(); codigos(); sesiones(); datos()
  Logger.log('Listo: hojas creadas. Ahora implementa como aplicación web.')
}

// ══════════════ HTTP ══════════════
function doPost(e) {
  const lock = LockService.getScriptLock()
  try {
    lock.waitLock(20000)
    const body = JSON.parse(e.postData.contents)
    const a = body.action
    if (a === 'requestCode') return out(requestCode(body))
    if (a === 'verifyCode') return out(verifyCode(body))
    if (a === 'load') return out(load(body))
    if (a === 'save') return out(save(body))
    if (a === 'logout') return out(logout(body))
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
  sh.appendRow([email, sha(email + ':' + code + ':' + PROPS.getProperty('CODE_SALT')), new Date().toISOString(), 0])

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
  if (sha(email + ':' + code + ':' + PROPS.getProperty('CODE_SALT')) !== String(hit.values[1])) {
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
