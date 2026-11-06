import type { Metadata } from 'next'
import Link from 'next/link'
import { readArchive } from '@/lib/audio-link'
import { toEntries } from '@/lib/link-albums'
import { archiveParts, songCode } from '@/lib/short-link'
import SharedTrackClient from '@/components/SharedTrackClient'
import type { MusicVideo } from '@/lib/youtube-music'

// Canción compartida de archive.org con enlace corto: /a/DISCO/CÓDIGO
export const revalidate = 86400

interface Props {
  params: { id: string; code: string }
}

async function findSong(id: string, code: string): Promise<MusicVideo | null> {
  const albums = await readArchive(id, `https://archive.org/details/${encodeURIComponent(id)}`).catch(() => [])
  for (const a of albums) {
    for (const t of toEntries(a).tracks) {
      const p = archiveParts(t.description) || archiveParts(t.audioUrl)
      if (p && songCode(p.file) === code) return t
    }
  }
  return null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await findSong(decodeURIComponent(params.id), params.code)
  if (!t) return { title: 'Canción compartida' }
  const description = `Escúchala en PulsoMedia${t.channelTitle ? ` · ${t.channelTitle}` : ''}`
  return {
    title: t.title,
    description,
    openGraph: { title: `${t.title} — PulsoMedia`, description, type: 'music.song', images: t.thumbnail?.startsWith('http') ? [{ url: t.thumbnail }] : undefined },
  }
}

export default async function ShortArchiveTrackPage({ params }: Props) {
  const t = await findSong(decodeURIComponent(params.id), params.code)
  if (!t)
    return (
      <div className="pt-32 min-h-screen text-center px-4">
        <p className="text-slate-300">No encontramos esa canción en Internet Archive.</p>
        <Link href={`/music/archive/${params.id}`} className="inline-block mt-4 text-violet-300 underline">
          Ver el disco
        </Link>
      </div>
    )
  return <SharedTrackClient video={t} />
}
