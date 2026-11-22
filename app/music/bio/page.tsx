import type { Metadata } from 'next'
import Image from 'next/image'
import { ChevronLeft, BookOpen, Music2, Disc3 } from 'lucide-react'
import BackButton from '@/components/BackButton'
import { BioSong, BioAlbum, BioArtist } from '@/components/BioParts'
import { getArtistArticle, type BioPart } from '@/lib/music-info'

// Historia completa del artista, dentro de la app: el artículo de Wikipedia por secciones. Las
// canciones (♪), discos y artistas que nombra se tocan aquí mismo (suenan o se abren en la app).

export const revalidate = 604800

type Props = { searchParams: { name?: string } }

export function generateMetadata({ searchParams }: Props): Metadata {
  const name = (searchParams.name || '').slice(0, 120)
  return { title: name ? `Historia de ${name}` : 'Historia del artista' }
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function Paragraph({ parts, artist }: { parts: BioPart[]; artist: string }) {
  return (
    <p className="text-slate-300 text-[15px] leading-7">
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <span key={i}>{p}</span>
        ) : p.k === 'song' ? (
          <BioSong key={i} artist={artist} title={p.v} />
        ) : p.k === 'album' ? (
          <BioAlbum key={i} artist={artist} title={p.v} />
        ) : (
          <BioArtist key={i} name={p.v} />
        )
      )}
    </p>
  )
}

export default async function ArtistBioPage({ searchParams }: Props) {
  const name = (searchParams.name || '').trim().slice(0, 120)
  const article = name ? await getArtistArticle(name).catch(() => null) : null
  const songs = article ? article.sections.flatMap((s) => s.paras.flat()).filter((p) => typeof p !== 'string' && p.k === 'song').length : 0
  const albums = article ? article.sections.flatMap((s) => s.paras.flat()).filter((p) => typeof p !== 'string' && p.k === 'album').length : 0
  const toc = article?.sections.filter((s) => s.title && s.level <= 3) ?? []

  return (
    <div className="pt-20 pb-10 bg-obsidian min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <BackButton fallbackHref="/music" className="inline-flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-5">
          <ChevronLeft className="w-4 h-4" /> Volver
        </BackButton>

        {!article ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
            <BookOpen className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-white font-semibold">{name ? `No encontramos la historia de ${name}` : 'Falta el nombre del artista'}</p>
            <p className="text-slate-500 text-sm mt-1">Puede que no tenga artículo o que no haya conexión. Intenta más tarde.</p>
          </div>
        ) : (
          <>
            <header className="flex items-end gap-5">
              {article.image && (
                <span className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-2xl overflow-hidden bg-surface-2 shrink-0 shadow-2xl">
                  <Image src={article.image} alt={name} fill sizes="144px" className="object-cover" unoptimized />
                </span>
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-300 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" /> Historia
                </p>
                <h1 className="text-3xl sm:text-5xl font-black text-white font-display leading-tight break-words">{article.title}</h1>
                {article.description && <p className="text-slate-400 text-sm mt-1 first-letter:uppercase">{article.description}</p>}
              </div>
            </header>

            {(songs > 0 || albums > 0) && (
              <p className="mt-5 text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1"><Music2 className="w-3.5 h-3.5 text-violet-300" /> Toca una canción para escucharla</span>
                <span className="inline-flex items-center gap-1"><Disc3 className="w-3.5 h-3.5 text-sky-300" /> o un disco para abrirlo</span>
              </p>
            )}

            {toc.length > 2 && (
              <nav aria-label="Secciones" className="mt-6 flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap [scrollbar-width:none]">
                {toc.map((s) => (
                  <a key={s.title} href={`#${slug(s.title)}`} className={`shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold hover:text-white ${s.level === 2 ? 'bg-surface-2 text-slate-200' : 'bg-surface-1 text-slate-400'}`}>
                    {s.title}
                  </a>
                ))}
              </nav>
            )}

            <article className="mt-8 space-y-8">
              {article.sections.map((s, i) => (
                <section key={i} id={s.title ? slug(s.title) : undefined} className="scroll-mt-24 space-y-3">
                  {s.title &&
                    (s.level <= 2 ? (
                      <h2 className="text-white text-2xl font-bold font-display pt-2 border-t border-white/8">{s.title}</h2>
                    ) : (
                      <h3 className="text-white text-lg font-bold">{s.title}</h3>
                    ))}
                  {s.paras.map((p, j) => (
                    <Paragraph key={j} parts={p} artist={name} />
                  ))}
                </section>
              ))}
            </article>

            {/* Licencia de Wikipedia (CC BY-SA): se indica la fuente */}
            <p className="mt-10 pt-4 border-t border-white/8 text-xs text-slate-500">
              Texto de Wikipedia{article.lang === 'en' ? ' (en inglés)' : ''}, bajo licencia CC BY-SA ·{' '}
              <a href={article.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">
                ver el artículo original
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
