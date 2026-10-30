import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getArtist, type CatalogAlbum } from '@/lib/catalog'
import BackButton from '@/components/BackButton'
import FollowArtistButton from '@/components/FollowArtistButton'
import ArtistPlayButtons from '@/components/ArtistPlayButtons'
import MusicInfoPanel from '@/components/MusicInfoPanel'
import ArtistVideos from '@/components/ArtistVideos'

interface Props {
  params: { id: string }
}

export const revalidate = 86400

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!/^\d+$/.test(params.id)) return {}
  try {
    const { artist } = await getArtist(params.id)
    return {
      title: `${artist.name} — Discografía`,
      description: `Álbumes y sencillos de ${artist.name} para escuchar completos.`,
      openGraph: { images: artist.picture ? [{ url: artist.picture }] : undefined },
    }
  } catch {
    return {}
  }
}

const SECTIONS: { type: string; title: string }[] = [
  { type: 'album', title: 'Álbumes' },
  { type: 'ep', title: 'EPs' },
  { type: 'single', title: 'Sencillos' },
  { type: 'compile', title: 'Recopilatorios' },
]

function AlbumGrid({ albums }: { albums: CatalogAlbum[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
      {albums.map((a) => (
        <Link key={a.id} href={`/music/album/${a.id}`} className="group block">
          <div className="relative aspect-square rounded-xl overflow-hidden bg-surface-2 border border-white/8 shadow-rim">
            {a.cover && (
              <Image
                src={a.cover}
                alt={a.title}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                className="object-cover group-hover:scale-105 transition-transform duration-500"
              />
            )}
          </div>
          <p className="text-white text-sm font-semibold font-display leading-tight line-clamp-2 mt-2 group-hover:text-violet-300">{a.title}</p>
          <p className="text-slate-500 text-xs mt-0.5">{a.year}</p>
        </Link>
      ))}
    </div>
  )
}

export default async function ArtistPage({ params }: Props) {
  if (!/^\d+$/.test(params.id)) notFound()
  const data = await getArtist(params.id).catch(() => null)
  if (!data) notFound()
  const { artist, albums } = data

  return (
    <div className="relative min-h-screen pt-20 pb-32 overflow-hidden">
      {artist.picture && (
        <div className="absolute inset-x-0 top-0 h-[460px] pointer-events-none" aria-hidden>
          <Image src={artist.picture} alt="" fill sizes="100vw" className="object-cover blur-3xl opacity-30 scale-125" />
          <div className="absolute inset-0 bg-gradient-to-b from-obsidian/30 via-obsidian/80 to-obsidian" />
        </div>
      )}
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <BackButton fallbackHref="/music" className="inline-flex items-center gap-1 text-slate-300 hover:text-white text-sm mb-5">
          <ChevronLeft className="w-4 h-4" /> Volver
        </BackButton>

        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 sm:gap-8 mb-10">
          <div className="relative w-40 h-40 sm:w-52 sm:h-52 rounded-full overflow-hidden bg-surface-2 border border-white/10 shadow-[0_20px_60px_rgba(139,92,246,0.35)] shrink-0">
            {artist.picture && <Image src={artist.picture} alt={artist.name} fill sizes="208px" className="object-cover" priority />}
          </div>
          <div className="text-center sm:text-left">
            <p className="text-emerald-400 text-[11px] font-bold uppercase tracking-[0.08em] font-display">Artista</p>
            <h1 className="text-white text-[32px] leading-[38px] sm:text-[48px] sm:leading-[54px] font-extrabold mt-1">{artist.name}</h1>
            <p className="text-slate-400 text-sm mt-2">
              {albums.length} lanzamientos
              {artist.fans ? ` · ${artist.fans.toLocaleString('es')} seguidores en Deezer` : ''}
            </p>
            <div className="mt-4 flex flex-col sm:flex-row items-center sm:items-start gap-3">
              {/* Discos propios (sin recopilatorios), del más reciente al más antiguo */}
              <ArtistPlayButtons albumIds={albums.filter((a) => a.type !== 'compile').slice(0, 30).map((a) => a.id)} />
              <FollowArtistButton artist={{ id: artist.id, name: artist.name, picture: artist.picture }} />
            </div>
          </div>
        </div>

        <div className="mb-10 -mt-10">
          <MusicInfoPanel artist={{ id: artist.id, name: artist.name, picture: artist.picture, fans: artist.fans, albums: albums.length }} />
        </div>

        {SECTIONS.map(({ type, title }) => {
          const list = albums.filter((a) => (a.type || 'album') === type)
          if (list.length === 0) return null
          return (
            <section key={type} id={type === 'album' ? 'discografia' : undefined} className="mb-10 scroll-mt-20">
              <h2 className="text-white font-bold text-[22px] leading-7 mb-4">{title}</h2>
              <AlbumGrid albums={list} />
            </section>
          )
        })}

        <ArtistVideos name={artist.name} />

        <p className="text-slate-600 text-xs">Discografía: Deezer · Audio: YouTube · Biografías: Wikipedia</p>
      </div>
    </div>
  )
}
