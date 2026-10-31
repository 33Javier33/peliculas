// Última versión publicada del APK, leída directo de la API de GitHub (siempre al día; los
// enlaces de descarga de GitHub pasan por una caché que tardaba en mostrar la versión nueva)
const REPO = '33Javier33/peliculas'
const TAG = 'android-latest'

interface Asset {
  id: number
  name: string
  url: string
}

export async function releaseAssets(): Promise<{ assets: Asset[]; body: string }> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'CarlosPNautoInteractive' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`GitHub ${res.status}`)
  const d = (await res.json()) as { assets?: Asset[]; body?: string }
  return { assets: d.assets ?? [], body: d.body ?? '' }
}

/** Contenido de un archivo de la versión publicada (por la API: sin caché) */
export async function fetchAsset(asset: Asset): Promise<Response> {
  return fetch(asset.url, {
    headers: { Accept: 'application/octet-stream', 'User-Agent': 'CarlosPNautoInteractive' },
    redirect: 'follow',
    cache: 'no-store',
  })
}
