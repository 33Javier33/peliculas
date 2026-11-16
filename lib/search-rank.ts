// Orden de resultados como YouTube Music / Spotify: primero lo que coincide con lo buscado y es
// la versión oficial con mejor calidad (audio del sello «- Topic», VEVO, canal del artista, HD,
// más reproducido); covers, karaoke, versiones aceleradas o en bucle quedan abajo, salvo que
// se pidan en la búsqueda.

export interface RankInput {
  title: string
  channel: string
  views?: number
  seconds?: number
  hd?: boolean
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()

// Variantes que se castigan si la búsqueda no las nombra (palabra en la búsqueda → no se castiga)
const VARIANTS: { re: RegExp; ask: RegExp; music: number; video: number }[] = [
  { re: /\b(karaoke|sing ?along)\b/, ask: /karaoke/, music: 45, video: 25 },
  { re: /\b(reaction|reaccion|reacciono|reaccionando)\b/, ask: /reac/, music: 50, video: 15 },
  { re: /\b(slowed|sped up|speed up|nightcore|8d|bass boosted|reverb)\b/, ask: /slowed|sped|speed|nightcore|8d|bass|reverb/, music: 35, video: 20 },
  { re: /\b(1|10) (hour|hora|horas|hours)\b|\bloop\b/, ask: /hora|hour|loop/, music: 35, video: 15 },
  { re: /\b(tutorial|como tocar|how to play|cover de|guitar lesson|piano tutorial)\b/, ask: /tutorial|como tocar|how to/, music: 45, video: 0 },
  { re: /\bcover\b/, ask: /cover/, music: 30, video: 10 },
  { re: /\binstrumental\b/, ask: /instrumental/, music: 18, video: 5 },
  { re: /\b(live|en vivo|concierto|concert)\b/, ask: /live|vivo|concierto|concert/, music: 12, video: 0 },
  { re: /\b(remix|mashup|edit)\b/, ask: /remix|mashup|edit/, music: 10, video: 0 },
  { re: /\b(lyrics?|letra|lyric video)\b/, ask: /letra|lyric/, music: 6, video: 4 },
  { re: /\b(full album|album completo|disco completo|mix|enganchados|megamix)\b/, ask: /album|disco|mix|enganchad/, music: 15, video: 0 },
]

function score(qTokens: string[], qNorm: string, it: RankInput, mode: 'music' | 'video'): number {
  const title = norm(it.title)
  const channel = norm(it.channel)
  const hay = `${title} ${channel}`
  let s = 0

  // Coincidencia con lo buscado (lo más importante)
  if (qTokens.length) {
    const hit = qTokens.filter((t) => hay.includes(t)).length
    s += (hit / qTokens.length) * 40
    if (qNorm && title.includes(qNorm)) s += 10
  }

  // Fuente oficial: audio del sello (mejor calidad de audio), VEVO, canal del artista
  const rawChannel = it.channel.trim()
  if (/ - topic$/i.test(rawChannel)) s += mode === 'music' ? 25 : 10
  if (/vevo$/i.test(rawChannel)) s += 20
  const chanCore = channel.replace(/\b(topic|vevo|official|oficial|music|tv)\b/g, '').trim()
  if (chanCore.length >= 3 && (qNorm.includes(chanCore) || title.startsWith(chanCore))) s += 15
  if (/\b(official audio|audio oficial)\b/.test(title)) s += mode === 'music' ? 12 : 4
  if (/\b(official (music )?video|video oficial|videoclip oficial)\b/.test(title)) s += mode === 'music' ? 10 : 12
  if (/\b(official|oficial)\b/.test(title)) s += 3

  // Calidad de imagen
  if (it.hd) s += mode === 'video' ? 8 : 4
  if (/\b(4k|2160p|1080p|hd|remaster(ed|izado)?)\b/.test(title)) s += 3

  // Versiones que no se pidieron
  for (const v of VARIANTS) {
    if (!v.re.test(title)) continue
    // Versión que no se pidió: abajo. La que se pidió (en vivo, letra, remix…): arriba
    s += v.ask.test(qNorm) ? 20 : -(mode === 'music' ? v.music : v.video)
  }

  // Duración de una canción (no fragmentos de segundos ni horas de bucle)
  if (mode === 'music' && it.seconds) {
    if (it.seconds < 60) s -= 30
    else if (it.seconds > 15 * 60) s -= 20
  }

  // Popularidad: 1 M de reproducciones ≈ +24, 100 M ≈ +32
  if (it.views && it.views > 0) s += Math.log10(it.views + 1) * 4

  return s
}

/** Ordena los resultados (sin quitar ninguno). Empate: se mantiene el orden original */
export function rankResults<T>(query: string, items: T[], get: (t: T) => RankInput, mode: 'music' | 'video'): T[] {
  const qNorm = norm(query)
  const qTokens = Array.from(new Set(qNorm.split(' ').filter((t) => t.length > 1 && t !== 'official' && t !== 'oficial')))
  return items
    .map((t, i) => ({ t, s: score(qTokens, qNorm, get(t), mode) - i * 0.4 }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.t)
}

/** «3:45» o «1:02:03» → segundos */
export function clockToSeconds(d?: string): number | undefined {
  if (!d) return undefined
  const parts = d.split(':').map(Number)
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return undefined
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

/** ¿La búsqueda pide una versión concreta (en vivo, cover, letra…)? Entonces no se le suma «official» */
export function asksVariant(query: string): boolean {
  const q = norm(query)
  return VARIANTS.some((v) => v.ask.test(q))
}
