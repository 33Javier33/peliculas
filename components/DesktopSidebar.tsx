'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Home, MonitorPlay, Clapperboard, Music2, Radio, Tv, Library, ThumbsUp, Clock3, Search, Heart, Plus, Disc3, ListMusic, Settings } from 'lucide-react'
import { useMusicStore } from '@/store/musicStore'
import { usePlaylistStore } from '@/store/playlistStore'
import { useFollowStore } from '@/store/followStore'
import { useVideoStore } from '@/store/videoStore'
import PlaylistCover from '@/components/PlaylistCover'
import { isMusicApp } from '@/lib/app-flavor'

// Menú lateral del computador (desde 1024 px; en el teléfono y las apps no se muestra):
// - En general, como YouTube: secciones, «Tú» y tus artistas como suscripciones.
// - En Música, como Spotify: Inicio, Buscar y «Tu biblioteca» (me gusta, playlists, discos, artistas).

const isMusicPath = (p: string) => p.startsWith('/music') || p.startsWith('/escuchar')

export default function DesktopSidebar() {
  const pathname = usePathname() || '/'
  const [mounted, setMounted] = useState(false)
  const [musicOnly, setMusicOnly] = useState(false)
  useEffect(() => {
    setMounted(true)
    setMusicOnly(isMusicApp())
  }, [])
  const music = musicOnly || isMusicPath(pathname)
  return (
    <aside
      className="hidden lg:flex fixed left-0 top-16 bottom-0 z-40 w-60 flex-col bg-obsidian border-r border-white/5 overflow-y-auto overscroll-contain pb-28 [scrollbar-width:thin]"
      aria-label="Menú principal"
    >
      {music ? <MusicSide pathname={pathname} mounted={mounted} musicOnly={musicOnly} /> : <MainSide pathname={pathname} mounted={mounted} />}
    </aside>
  )
}

function Item({ href, icon, label, active, extra }: { href: string; icon: React.ReactNode; label: string; active?: boolean; extra?: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-5 rounded-xl px-3 py-2.5 text-sm transition-colors ${active ? 'bg-white/10 text-white font-semibold' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
    >
      <span className={active ? 'text-violet-300' : ''}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {extra}
    </Link>
  )
}

const Divider = () => <div className="my-3 border-t border-white/8" />
const Title = ({ children }: { children: React.ReactNode }) => <p className="px-3 pb-1 pt-1 text-[15px] font-bold text-white">{children}</p>

/** Como YouTube */
function MainSide({ pathname, mounted }: { pathname: string; mounted: boolean }) {
  const follows = useFollowStore((s) => s.artists)
  const likedVideos = useVideoStore((s) => s.liked.length)
  const later = useVideoStore((s) => s.watchLater.length)
  const is = (p: string) => (p === '/' ? pathname === '/' : pathname.startsWith(p))
  const ic = 'w-5 h-5'
  return (
    <nav className="px-3 pt-3">
      <Item href="/" icon={<Home className={ic} />} label="Principal" active={is('/')} />
      <Item href="/tube" icon={<MonitorPlay className={ic} />} label="PulsoTube" active={is('/tube')} />
      <Item href="/peliculas" icon={<Clapperboard className={ic} />} label="Películas" active={is('/peliculas') || is('/movie') || is('/cine')} />
      <Item href="/music" icon={<Music2 className={ic} />} label="Música" active={is('/music')} />
      <Item href="/radio" icon={<Radio className={ic} />} label="En vivo" active={is('/radio')} />
      <Item href="/tv" icon={<Tv className={ic} />} label="TV" active={is('/tv')} />
      <Divider />
      <Title>Tú</Title>
      <Item href="/music/library" icon={<Library className={ic} />} label="Biblioteca" />
      <Item href="/music/library?seccion=videos" icon={<ThumbsUp className={ic} />} label="Videos que me gustan" extra={mounted && likedVideos > 0 ? <Count n={likedVideos} /> : null} />
      <Item href="/music/library?seccion=videos" icon={<Clock3 className={ic} />} label="Ver más tarde" extra={mounted && later > 0 ? <Count n={later} /> : null} />
      <Item href="/music/me-gusta" icon={<Heart className={ic} />} label="Tus me gusta" />
      {mounted && follows.length > 0 && (
        <>
          <Divider />
          <Title>Suscripciones</Title>
          {follows.slice(0, 12).map((a) => (
            <Link key={a.id} href={`/music/artist/${a.id}`} className="flex items-center gap-4 rounded-xl px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {a.picture ? <img src={a.picture} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" /> : <span className="w-6 h-6 rounded-full bg-surface-2 shrink-0" />}
              <span className="truncate">{a.name}</span>
            </Link>
          ))}
        </>
      )}
      <Divider />
      <Item href="/configuracion" icon={<Settings className={ic} />} label="Configuración" active={is('/configuracion')} />
    </nav>
  )
}

const Count = ({ n }: { n: number }) => <span className="text-xs text-slate-500 tabular-nums">{n}</span>

type Filter = 'all' | 'playlists' | 'albums' | 'artists'

/** Como Spotify */
function MusicSide({ pathname, mounted, musicOnly }: { pathname: string; mounted: boolean; musicOnly: boolean }) {
  const liked = useMusicStore((s) => s.saved.length)
  const albums = useMusicStore((s) => s.savedAlbums)
  const playlists = usePlaylistStore((s) => s.playlists)
  const follows = useFollowStore((s) => s.artists)
  const [filter, setFilter] = useState<Filter>('all')
  const router = useRouter()
  const ic = 'w-5 h-5'
  const row = (active: boolean) =>
    `flex items-center gap-3 rounded-lg p-2 text-left transition-colors ${active ? 'bg-white/10' : 'hover:bg-white/5'}`
  const chip = (f: Filter, label: string) => (
    <button
      key={f}
      onClick={() => setFilter(filter === f ? 'all' : f)}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${filter === f ? 'bg-white text-black' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}
    >
      {label}
    </button>
  )
  const show = (f: Filter) => filter === 'all' || filter === f
  return (
    <div className="flex flex-col gap-2 p-2">
      <nav className="rounded-xl bg-surface-1 p-2">
        <Item href="/music" icon={<Home className={ic} />} label="Inicio" active={pathname === '/music'} />
        <Item href="/music?buscar=1" icon={<Search className={ic} />} label="Buscar" />
        {!musicOnly && <Item href="/" icon={<MonitorPlay className={ic} />} label="Volver a PulsoMedia" />}
      </nav>
      <section className="rounded-xl bg-surface-1 p-2 flex-1 min-h-0">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Link href="/music/library" className="flex items-center gap-3 text-slate-300 hover:text-white font-bold text-sm flex-1">
            <Library className="w-5 h-5" /> Tu biblioteca
          </Link>
          <button
            onClick={() => {
              const st = usePlaylistStore.getState()
              const id = st.create(`Mi playlist n.º ${st.playlists.length + 1}`)
              router.push(`/music/playlist/${id}`)
            }}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white"
            title="Crear playlist"
            aria-label="Crear playlist"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto px-2 py-2 [scrollbar-width:none]">
          {chip('playlists', 'Playlists')}
          {chip('albums', 'Álbumes')}
          {chip('artists', 'Artistas')}
        </div>
        {mounted && (
          <div className="flex flex-col">
            {show('playlists') && (
              <Link href="/music/me-gusta" className={row(pathname === '/music/me-gusta')}>
                <span className="w-12 h-12 rounded-md cpn-keep bg-gradient-to-br from-violet-600 to-cyan-300 flex items-center justify-center shrink-0">
                  <Heart className="w-5 h-5 text-white fill-white" />
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold truncate ${pathname === '/music/me-gusta' ? 'text-violet-300' : 'text-white'}`}>Tus me gusta</span>
                  <span className="block text-xs text-slate-400 truncate">Playlist · {liked} canciones</span>
                </span>
              </Link>
            )}
            {show('playlists') &&
              playlists.map((p) => {
                const href = `/music/playlist/${p.id}`
                const active = pathname === href
                return (
                  <Link key={p.id} href={href} className={row(active)}>
                    <PlaylistCover tracks={p.tracks} className="w-12 h-12 rounded-md shrink-0" />
                    <span className="min-w-0">
                      <span className={`block text-sm font-semibold truncate ${active ? 'text-violet-300' : 'text-white'}`}>{p.name}</span>
                      <span className="block text-xs text-slate-400 truncate">Playlist · {p.tracks.length} canciones</span>
                    </span>
                  </Link>
                )
              })}
            {show('albums') &&
              albums.map((a) => {
                const href = /^deezer-\d+$/.test(a.id) ? `/music/album/${a.id.slice(7)}` : '/music/library'
                return (
                  <Link key={a.id} href={href} className={row(pathname === href)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {a.cover ? <img src={a.cover} alt="" className="w-12 h-12 rounded-md object-cover shrink-0" /> : <span className="w-12 h-12 rounded-md bg-surface-2 flex items-center justify-center shrink-0"><Disc3 className="w-5 h-5 text-slate-500" /></span>}
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white truncate">{a.title}</span>
                      <span className="block text-xs text-slate-400 truncate">Álbum · {a.artist}</span>
                    </span>
                  </Link>
                )
              })}
            {show('artists') &&
              follows.map((a) => {
                const href = `/music/artist/${a.id}`
                return (
                  <Link key={a.id} href={href} className={row(pathname === href)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {a.picture ? <img src={a.picture} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" /> : <span className="w-12 h-12 rounded-full bg-surface-2 shrink-0" />}
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white truncate">{a.name}</span>
                      <span className="block text-xs text-slate-400">Artista</span>
                    </span>
                  </Link>
                )
              })}
            {playlists.length === 0 && albums.length === 0 && follows.length === 0 && (
              <div className="m-2 rounded-lg bg-surface-2/60 p-4">
                <p className="text-sm font-bold text-white">Crea tu primera playlist</p>
                <p className="text-xs text-slate-400 mt-1">Toca ⋮ en una canción → «Agregar a playlist».</p>
              </div>
            )}
          </div>
        )}
        {!mounted && <ListMusic className="m-4 w-5 h-5 text-slate-600" />}
      </section>
    </div>
  )
}
