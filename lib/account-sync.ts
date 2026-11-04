// Respaldo de la biblioteca y preferencias en la cuenta (Google Sheet por /api/cuenta).
// - Al iniciar sesión: se juntan lo del teléfono y lo respaldado (sin perder nada) y se sube.
// - Después: cada cambio se sube a los pocos segundos; al abrir la app, si otro dispositivo
//   respaldó algo más nuevo, se trae (así también se reflejan las canciones quitadas).
import { useMusicStore, splitHeartedAlbums } from '@/store/musicStore'
import { usePlaylistStore } from '@/store/playlistStore'
import { useLinksStore } from '@/store/linksStore'
import { useFollowStore } from '@/store/followStore'
import { useLiveStore } from '@/store/liveStore'
import { useVideoStore } from '@/store/videoStore'
import { useEqStore } from '@/store/eqStore'
import { useViewStore } from '@/store/viewStore'
import { useLangStore } from '@/store/langStore'

export interface Backup {
  v: 1
  saved: ReturnType<typeof useMusicStore.getState>['saved']
  /** Álbumes guardados (con su ♥, sin marcar sus canciones) */
  albums?: ReturnType<typeof useMusicStore.getState>['savedAlbums']
  playlists: ReturnType<typeof usePlaylistStore.getState>['playlists']
  links: { tracks: ReturnType<typeof useLinksStore.getState>['tracks']; albums: ReturnType<typeof useLinksStore.getState>['albums'] }
  follow: ReturnType<typeof useFollowStore.getState>['artists']
  radios: ReturnType<typeof useLiveStore.getState>['favoriteRadios']
  channels: ReturnType<typeof useLiveStore.getState>['favoriteChannels']
  videos: { liked: ReturnType<typeof useVideoStore.getState>['liked']; watchLater: ReturnType<typeof useVideoStore.getState>['watchLater'] }
  prefs: {
    eq: { enabled: boolean; preset: string; gains: number[]; leveler: boolean }
    view: 'list' | 'grid'
    lang: string
    audioBoost: boolean
    radioEnabled: boolean
  }
}

export function snapshot(): Backup {
  const m = useMusicStore.getState()
  const l = useLinksStore.getState()
  const live = useLiveStore.getState()
  const vid = useVideoStore.getState()
  const eq = useEqStore.getState()
  return {
    v: 1,
    saved: m.saved,
    albums: m.savedAlbums,
    playlists: usePlaylistStore.getState().playlists,
    links: { tracks: l.tracks, albums: l.albums },
    follow: useFollowStore.getState().artists,
    radios: live.favoriteRadios,
    channels: live.favoriteChannels,
    videos: { liked: vid.liked, watchLater: vid.watchLater },
    prefs: {
      eq: { enabled: eq.enabled, preset: eq.preset, gains: eq.gains, leveler: eq.leveler },
      view: useViewStore.getState().view,
      lang: useLangStore.getState().lang,
      audioBoost: m.audioBoost,
      radioEnabled: m.radioEnabled,
    },
  }
}

/** Reemplaza lo del teléfono por el respaldo */
export function apply(b: Backup) {
  const split = splitHeartedAlbums(b.saved ?? [], b.albums ?? useMusicStore.getState().savedAlbums)
  useMusicStore.setState({ saved: split.saved, savedAlbums: split.savedAlbums, albumsSplit: true, audioBoost: !!b.prefs?.audioBoost, radioEnabled: b.prefs?.radioEnabled ?? true })
  usePlaylistStore.setState({ playlists: b.playlists ?? [] })
  useLinksStore.setState({ tracks: b.links?.tracks ?? [], albums: b.links?.albums ?? [] })
  useFollowStore.setState({ artists: b.follow ?? [] })
  useLiveStore.setState({ favoriteRadios: b.radios ?? [], favoriteChannels: b.channels ?? [] })
  useVideoStore.setState({ liked: b.videos?.liked ?? [], watchLater: b.videos?.watchLater ?? [] })
  if (b.prefs?.eq) useEqStore.setState({ ...b.prefs.eq })
  if (b.prefs?.view) useViewStore.setState({ view: b.prefs.view })
  if (b.prefs?.lang) useLangStore.setState({ lang: b.prefs.lang })
}

function union<T>(a: T[] = [], b: T[] = [], key: (x: T) => string): T[] {
  const seen = new Set<string>()
  return [...a, ...b].filter((x) => {
    const k = key(x)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Junta dos respaldos sin perder nada (al iniciar sesión en un dispositivo con cosas guardadas) */
export function merge(local: Backup, remote: Backup): Backup {
  const playlists = union(remote.playlists, local.playlists, (p) => p.id).map((p) => {
    const other = local.playlists?.find((x) => x.id === p.id)
    return other && other !== p ? { ...p, tracks: union(p.tracks, other.tracks, (t) => t.id) } : p
  })
  const albums = union(remote.links?.albums, local.links?.albums, (a) => a.id).map((a) => {
    const other = local.links?.albums?.find((x) => x.id === a.id)
    return other && other !== a ? { ...a, trackIds: Array.from(new Set([...a.trackIds, ...other.trackIds])) } : a
  })
  return {
    v: 1,
    saved: union(remote.saved, local.saved, (t) => t.id),
    albums: union(remote.albums, local.albums, (a) => a.id),
    playlists,
    links: { tracks: union(remote.links?.tracks, local.links?.tracks, (t) => t.id), albums },
    follow: union(remote.follow, local.follow, (a) => String(a.id)),
    radios: union(remote.radios, local.radios, (r) => r.id),
    channels: union(remote.channels, local.channels, (c) => c.url),
    videos: {
      liked: union(remote.videos?.liked, local.videos?.liked, (v) => v.id),
      watchLater: union(remote.videos?.watchLater, local.videos?.watchLater, (v) => v.id),
    },
    prefs: remote.prefs ?? local.prefs,
  }
}

export async function callAccount<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T & { ok: boolean; error?: string }> {
  const r = await fetch('/api/cuenta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return (await r.json().catch(() => ({ ok: false, error: 'Sin respuesta' }))) as T & { ok: boolean; error?: string }
}

/** Todas las tiendas que se respaldan (para escuchar cambios) */
export const BACKED_STORES = [
  useMusicStore,
  usePlaylistStore,
  useLinksStore,
  useFollowStore,
  useLiveStore,
  useVideoStore,
  useEqStore,
  useViewStore,
  useLangStore,
] as const
