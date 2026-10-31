// Traducción de textos (descripciones de discos, biografías, sinopsis) sin clave:
// 1) el traductor público de Google (el mismo de la extensión del navegador)
// 2) si no responde, MyMemory (traductor libre, con límite diario)
export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'es', name: 'Español' },
  { code: 'en', name: 'English' },
  { code: 'pt', name: 'Português' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'de', name: 'Deutsch' },
]

const GOOGLE = (typeof process !== 'undefined' && process.env.TRANSLATE_BASE) || 'https://translate.googleapis.com'

async function google(text: string, to: string): Promise<{ text: string; from: string }> {
  const params = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: to, dt: 't', q: text })
  const res = await fetch(`${GOOGLE}/translate_a/single?${params}`, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Traductor ${res.status}`)
  const data = (await res.json()) as [[string, string][], unknown, string]
  const out = (data[0] ?? []).map((p) => p[0]).join('')
  if (!out) throw new Error('Traducción vacía')
  return { text: out, from: data[2] || '' }
}

async function mymemory(text: string, to: string): Promise<{ text: string; from: string }> {
  // MyMemory no detecta el idioma solo: se asume inglés (lo habitual en estas descripciones)
  const from = to === 'en' ? 'es' : 'en'
  const params = new URLSearchParams({ q: text.slice(0, 500), langpair: `${from}|${to}` })
  const res = await fetch(`https://api.mymemory.translated.net/get?${params}`, { signal: AbortSignal.timeout(10000) })
  const data = (await res.json()) as { responseData?: { translatedText?: string } }
  const out = data.responseData?.translatedText
  if (!out) throw new Error('Traducción no disponible')
  return { text: out, from }
}

/** Traduce un texto (partes de hasta ~1800 letras para no pasar el límite de cada servicio) */
export async function translateText(text: string, to: string): Promise<{ text: string; from: string }> {
  const parts: string[] = []
  let rest = text.trim()
  while (rest.length > 1800) {
    const cut = Math.max(rest.lastIndexOf('. ', 1800), rest.lastIndexOf('\n', 1800), 1200)
    parts.push(rest.slice(0, cut + 1))
    rest = rest.slice(cut + 1)
  }
  if (rest) parts.push(rest)
  const done = await Promise.all(parts.map((p) => google(p, to).catch(() => mymemory(p, to))))
  return { text: done.map((d) => d.text).join(' '), from: done[0]?.from || '' }
}
