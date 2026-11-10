'use client'

import { useCallback, useEffect, useState } from 'react'
import { ThumbsUp, MessageCircle, Heart, Users, Send, Trash2, Loader2, Eye } from 'lucide-react'
import { appBrand } from '@/lib/app-flavor'
import { callAccount } from '@/lib/account-sync'
import { readAlias, saveAlias } from '@/lib/community'
import { useAccountStore } from '@/store/accountStore'

// Me gusta y comentarios de una canción o video:
// - Números de YouTube y Deezer, solo para mostrar (no se publica nada allá)
// - Me gusta y comentarios propios de la app, que ven todos los usuarios (con nombre público)

interface YtData {
  likes: number | null
  views: number | null
  commentCount: number | null
  commentsOff?: boolean
  comments: { id: string; author: string; avatar: string; text: string; likes: number; at: number }[]
}
interface OwnComment {
  id: string
  alias: string
  text: string
  at: number
  mine: boolean
}
interface Own {
  likes: number
  liked: boolean
  comments: OwnComment[]
}

const compact = (n: number) => new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
const rtf = typeof Intl !== 'undefined' ? new Intl.RelativeTimeFormat('es', { numeric: 'auto' }) : null
function ago(at: number) {
  if (!at || !rtf) return ''
  const s = (at - Date.now()) / 1000
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [30, 'day'],
    [12, 'month'],
    [Infinity, 'year'],
  ]
  let v = s
  for (const [size, unit] of steps) {
    if (Math.abs(v) < size) return rtf.format(Math.round(v), unit)
    v /= size
  }
  return ''
}

export default function SocialPanel({ item, ytId, artist, className = '' }: { item: string; ytId?: string; artist?: string; className?: string }) {
  const brand = appBrand()
  const token = useAccountStore((s) => s.token)
  const [yt, setYt] = useState<YtData | null>(null)
  const [fans, setFans] = useState<{ fans: number | null; link?: string } | null>(null)
  // null: cargando · false: el servidor de cuentas aún no tiene esta función
  const [own, setOwn] = useState<Own | null | false>(null)
  const [tab, setTab] = useState<'own' | 'yt'>('own')
  const [tabTouched, setTabTouched] = useState(false)
  const [text, setText] = useState('')
  const [alias, setAlias] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  useEffect(() => setAlias(readAlias()), [])

  useEffect(() => {
    setYt(null)
    setShowAll(false)
    setTabTouched(false)
    if (!ytId) return
    let alive = true
    fetch(`/api/social?yt=${ytId}`)
      .then((r) => r.json())
      .then((d: YtData & { error?: string }) => alive && !d.error && setYt(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [ytId])

  useEffect(() => {
    setFans(null)
    if (!artist) return
    let alive = true
    fetch(`/api/social?artist=${encodeURIComponent(artist)}`)
      .then((r) => r.json())
      .then((d) => alive && setFans(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [artist])

  const loadOwn = useCallback(async () => {
    const r = await callAccount<Own>({ action: 'social', item, token: token ?? undefined }).catch(() => null)
    if (!r?.ok) return setOwn(false)
    setOwn({ likes: r.likes ?? 0, liked: !!r.liked, comments: r.comments ?? [] })
  }, [item, token])
  useEffect(() => {
    setOwn(null)
    setText('')
    setError('')
    loadOwn()
  }, [loadOwn])

  // Al abrir: si nadie comentó aún en la app pero sí en YouTube, se ven los de YouTube
  useEffect(() => {
    if (tabTouched || own === null) return
    setTab(own && own.comments.length ? 'own' : yt?.comments.length ? 'yt' : 'own')
  }, [own, yt, tabTouched])

  const needLogin = () => {
    setError('Inicia sesión (ícono de persona, arriba) para dar me gusta y comentar')
    useAccountStore.getState().setOpen(true)
  }

  const toggleLike = async () => {
    if (!own) return
    if (!token) return needLogin()
    const on = !own.liked
    setOwn({ ...own, liked: on, likes: Math.max(0, own.likes + (on ? 1 : -1)) })
    const r = await callAccount<{ likes: number; liked: boolean }>({ action: 'like', token, item, on })
    if (r.ok) setOwn((o) => (o ? { ...o, likes: r.likes, liked: r.liked } : o))
    else {
      if (r.error === 'session') needLogin()
      loadOwn()
    }
  }

  const send = async () => {
    if (!own || busy) return
    if (!token) return needLogin()
    const a = alias.trim()
    if (!a) return setError('Escribe tu nombre público (se muestra en vez de tu correo)')
    if (!text.trim()) return
    saveAlias(a)
    setBusy(true)
    setError('')
    const r = await callAccount<{ comment: OwnComment }>({ action: 'comment', token, item, alias: a, text: text.trim() })
    setBusy(false)
    if (!r.ok) {
      if (r.error === 'session') return needLogin()
      return setError(r.error || 'No se pudo publicar')
    }
    setText('')
    setTab('own')
    setTabTouched(true)
    setOwn((o) => (o ? { ...o, comments: [r.comment, ...o.comments] } : o))
  }

  const remove = async (id: string) => {
    if (!own || !token) return
    if (confirmDel !== id) {
      setConfirmDel(id)
      setTimeout(() => setConfirmDel((c) => (c === id ? null : c)), 4000)
      return
    }
    setConfirmDel(null)
    setOwn({ ...own, comments: own.comments.filter((c) => c.id !== id) })
    await callAccount({ action: 'uncomment', token, id })
  }

  const hasYt = !!yt && (yt.likes !== null || yt.comments.length > 0)
  const ownOk = own !== false
  if (!hasYt && !ownOk && !fans?.fans) return null

  const list = tab === 'own' ? (own ? own.comments : []) : yt?.comments ?? []
  const shown = showAll ? list : list.slice(0, 4)

  return (
    <section className={`rounded-2xl bg-surface-1/70 border border-white/8 p-4 ${className}`}>
      {/* Números: los de la app y, solo para mostrar, los de YouTube y Deezer */}
      <div className="flex flex-wrap items-center gap-2">
        {ownOk && (
          <button
            onClick={toggleLike}
            disabled={!own}
            aria-pressed={!!own && own.liked}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold border transition-colors ${
              own && own.liked ? 'bg-violet-500/25 border-violet-400/60 text-violet-100' : 'bg-surface-2/70 border-white/10 text-slate-200 hover:text-white'
            }`}
            title={`Me gusta en ${brand}`}
          >
            <ThumbsUp className={`w-4 h-4 ${own && own.liked ? 'fill-violet-300 text-violet-200' : ''}`} />
            {own === null ? '…' : own.likes > 0 ? compact(own.likes) : 'Me gusta'}
          </button>
        )}
        {yt?.likes != null && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-slate-300 bg-white/5" title="Me gusta en YouTube">
            <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400" /> {compact(yt.likes)} en YouTube
          </span>
        )}
        {yt?.views != null && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-slate-400 bg-white/5" title="Vistas en YouTube">
            <Eye className="w-3.5 h-3.5" /> {compact(yt.views)}
          </span>
        )}
        {fans?.fans != null && fans.fans > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-slate-300 bg-white/5" title={`Fans de ${artist} en Deezer`}>
            <Users className="w-3.5 h-3.5 text-fuchsia-300" /> {compact(fans.fans)} fans en Deezer
          </span>
        )}
      </div>

      {(ownOk || hasYt) && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <MessageCircle className="w-4 h-4 text-violet-300" />
            <h3 className="text-white text-sm font-bold font-display">Comentarios</h3>
            <div className="ml-auto flex p-0.5 rounded-full bg-surface-2/80 border border-white/8 text-xs font-semibold whitespace-nowrap" role="tablist" aria-label="Comentarios de">
              {ownOk && (
                <button
                  role="tab"
                  aria-selected={tab === 'own'}
                  onClick={() => (setTab('own'), setTabTouched(true), setShowAll(false))}
                  className={`px-3 py-1 rounded-full ${tab === 'own' ? 'bg-white text-black' : 'text-slate-300'}`}
                >
                  {brand}
                  {own && own.comments.length ? ` (${own.comments.length})` : ''}
                </button>
              )}
              {hasYt && !yt?.commentsOff && (
                <button
                  role="tab"
                  aria-selected={tab === 'yt'}
                  onClick={() => (setTab('yt'), setTabTouched(true), setShowAll(false))}
                  className={`px-3 py-1 rounded-full ${tab === 'yt' ? 'bg-white text-black' : 'text-slate-300'}`}
                >
                  YouTube{yt?.commentCount ? ` (${compact(yt.commentCount)})` : ''}
                </button>
              )}
            </div>
          </div>

          {/* Escribir (comentarios de la app) */}
          {tab === 'own' && ownOk && (
            <div className="mt-3">
              {token && !readAlias() && (
                <input
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  maxLength={40}
                  placeholder="Tu nombre público (se ve en vez de tu correo)"
                  className="mb-2 w-full rounded-xl bg-surface-2/70 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:border-violet-400/60"
                />
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onFocus={() => !token && needLogin()}
                  maxLength={500}
                  rows={text.length > 60 ? 3 : 1}
                  placeholder={token ? 'Escribe un comentario…' : `Inicia sesión para comentar en ${brand}`}
                  className="flex-1 resize-none rounded-xl bg-surface-2/70 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:border-violet-400/60"
                />
                <button
                  onClick={send}
                  disabled={busy || !text.trim()}
                  className="w-10 h-10 shrink-0 rounded-full bg-violet-500 text-white flex items-center justify-center disabled:opacity-40"
                  aria-label="Publicar comentario"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
          {error && <p className="mt-2 text-xs text-amber-300">{error}</p>}

          <ul className="mt-3 flex flex-col gap-3">
            {tab === 'own' && own === null && (
              <li className="flex items-center gap-2 text-slate-500 text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando…
              </li>
            )}
            {tab === 'own' && own && own.comments.length === 0 && <li className="text-slate-500 text-xs">Nadie comentó aún en {brand}. ¡Sé el primero!</li>}
            {shown.map((c) => {
              const name = 'author' in c ? c.author : c.alias
              const avatar = 'avatar' in c ? c.avatar : ''
              return (
                <li key={c.id} className="flex gap-2.5">
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full shrink-0 bg-surface-2" loading="lazy" />
                  ) : (
                    <span className="w-8 h-8 rounded-full shrink-0 bg-violet-500/25 text-violet-200 text-xs font-bold flex items-center justify-center">
                      {(name || '?').replace(/^@/, '').charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-400">
                      <span className="text-slate-200 font-semibold">{name}</span> · {ago(c.at)}
                      {'likes' in c && c.likes > 0 ? (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-slate-500">
                          <ThumbsUp className="w-3 h-3" /> {compact(c.likes)}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-slate-200 whitespace-pre-line break-words">{c.text}</p>
                  </div>
                  {'mine' in c && c.mine && (
                    <button
                      onClick={() => remove(c.id)}
                      className={`self-start shrink-0 rounded-full p-1.5 ${confirmDel === c.id ? 'bg-red-500/20 text-red-300' : 'text-slate-500 hover:text-red-300'}`}
                      aria-label={confirmDel === c.id ? 'Toca otra vez para borrar' : 'Borrar mi comentario'}
                      title={confirmDel === c.id ? 'Toca otra vez para borrar' : 'Borrar'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          {list.length > 4 && !showAll && (
            <button onClick={() => setShowAll(true)} className="mt-3 text-xs font-semibold text-violet-300">
              Ver {list.length - 4} más
            </button>
          )}
          {tab === 'yt' && (
            <p className="mt-3 text-[11px] text-slate-500">Comentarios destacados de YouTube, solo para leer. Lo que escribes aquí queda en {brand}.</p>
          )}
        </>
      )}
    </section>
  )
}
