// Género principal de un artista según el catálogo de iTunes (gratis y sin clave). Sirve de
// respaldo de MusicBrainz, que no tiene géneros de muchos artistas (sobre todo latinos).
const ITUNES = process.env.ITUNES_BASE || 'https://itunes.apple.com'

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, '')

export async function itunesGenre(name: string): Promise<string | null> {
  const r = await fetch(`${ITUNES}/search?${new URLSearchParams({ term: name, entity: 'musicArtist', limit: '5', country: 'US' })}`, {
    next: { revalidate: 2592000 },
    signal: AbortSignal.timeout(6000),
  })
  if (!r.ok) throw new Error(`iTunes ${r.status}`)
  const d = (await r.json()) as { results?: { artistName?: string; primaryGenreName?: string }[] }
  const want = norm(name)
  // Solo si el nombre coincide (para no ponerle el género de otro artista)
  const hit = (d.results ?? []).find((x) => x.artistName && norm(x.artistName) === want)
  return hit?.primaryGenreName?.trim() || null
}
