'use client'
import { getAlwaysVideo, setAlwaysVideo } from '@/lib/always-video'
import RepairAppButton from '@/components/RepairAppButton'
import { getDownloadQuality, setDownloadQuality } from '@/lib/audio-quality'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ADMIN_KEY } from '@/lib/admin-session'
import Link from 'next/link'
import {
  RefreshCw,
  HelpCircle,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Radio,
  LayoutGrid,
  Languages,
  CloudUpload,
  Download,
  Smartphone,
  ChevronRight,
  Info,
  Watch,
  Users, AudioLines, HardDriveDownload, TvMinimalPlay, EyeOff, ShieldCheck } from 'lucide-react'
import { useEqStore, EQ_PRESETS } from '@/store/eqStore'
import { useMusicStore } from '@/store/musicStore'
import { useBlockStore } from '@/store/blockStore'
import { useLangStore } from '@/store/langStore'
import { useAccountStore } from '@/store/accountStore'
import { readAlias, saveAlias } from '@/lib/community'
import { useOfflineStore } from '@/store/offlineStore'
import { LANGUAGES } from '@/lib/translate'
import { getNative } from '@/lib/native'
import ViewToggle from '@/components/ViewToggle'
import { useHelpTips, setHelpTips } from '@/components/HelpTip'
import { importSiblingLibrary, otherAppName } from '@/lib/sibling-library'
import ShareAppButton from '@/components/ShareAppButton'
import { THEMES, getTheme, setTheme, type ThemeId } from '@/lib/theme'

// Configuración: todo lo que se puede ajustar en la app, en un solo lugar.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 px-1">{title}</h2>
      <div className="rounded-2xl bg-surface-1 border border-white/8 divide-y divide-white/5">{children}</div>
    </section>
  )
}

function Row({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="w-9 h-9 rounded-full bg-surface-2 text-violet-300 flex items-center justify-center shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-white text-sm font-semibold">{title}</span>
        {desc && <span className="block text-slate-500 text-xs mt-0.5">{desc}</span>}
      </span>
      {children}
    </div>
  )
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative w-12 h-7 rounded-full shrink-0 transition-colors ${on ? 'bg-emerald-500' : 'bg-surface-2 border border-white/10'}`}
    >
      <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-6' : 'left-1'}`} />
    </button>
  )
}

const formatSize = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(0, Math.round(b / 1e6))} MB`)

export default function SettingsClient() {
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const tapsRef = useRef({ n: 0, at: 0 })
  const [hasAdmin, setHasAdmin] = useState(false)
  useEffect(() => {
    try {
      setHasAdmin(!!localStorage.getItem(ADMIN_KEY))
    } catch {}
  }, [])
  // Último error anotado (para enviarlo si algo falla, por ejemplo sin conexión)
  const [lastError, setLastError] = useState<{ where: string; msg: string; at: number; online: boolean } | null>(null)
  useEffect(() => {
    setMounted(true)
    try {
      setLastError(JSON.parse(localStorage.getItem('cpn-last-error') || 'null'))
    } catch {}
  }, [])
  const eq = useEqStore()
  const audioBoost = useMusicStore((s) => s.audioBoost)
  const [dlMax, setDlMax] = useState(true)
  const [alwaysVideo, setAlwaysVideoOn] = useState(false)
  const helpOn = useHelpTips()
  useEffect(() => setAlwaysVideoOn(getAlwaysVideo()), [])
  useEffect(() => setDlMax(getDownloadQuality() === 'max'), [])
  const radioEnabled = useMusicStore((s) => s.radioEnabled)
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)
  const items = useOfflineStore((s) => s.items)
  const account = { email: useAccountStore((s) => s.email), syncedAt: useAccountStore((s) => s.syncedAt) }
  const [alias, setAliasState] = useState('')
  useEffect(() => setAliasState(readAlias()), [])
  const [apk, setApk] = useState<string | null>(null)
  useEffect(() => {
    try {
      setApk(getNative()?.version() ?? null)
    } catch {}
  }, [])

  if (!mounted) return <div className="pt-24 min-h-screen" />
  const presetName = EQ_PRESETS.find((p) => p.id === eq.preset)?.name ?? 'Personalizado'
  const downloads = Object.values(items)
  const size = downloads.reduce((n, i) => n + (i.size || 0), 0)

  return (
    <div className="pt-24 pb-8 px-4 max-w-2xl mx-auto">
      {/* (5 toques seguidos al título abren la administración; con sesión de administrador en este
          dispositivo además aparece abajo) */}
      <h1
        onClick={() => {
          const now = Date.now()
          tapsRef.current = now - tapsRef.current.at < 1500 ? { n: tapsRef.current.n + 1, at: now } : { n: 1, at: now }
          if (tapsRef.current.n >= 5) router.push('/admin')
        }}
        className="flex items-center gap-3 text-2xl font-bold text-white font-display mb-6 select-none"
      >
        <Settings className="w-6 h-6 text-violet-300" /> Configuración
      </h1>

      <div className="space-y-7">
        <Section title="Tema">
          <ThemePicker />
        </Section>

        <Section title="Sonido">
          <Row
            icon={<SlidersHorizontal className="w-4 h-4" />}
            title="Ecualizador"
            desc={eq.enabled ? `Activo · ${presetName}${eq.leveler ? ' · nivelador' : ''}` : 'Apagado'}
          >
            <Switch on={eq.enabled} onChange={eq.setEnabled} label="Ecualizador" />
          </Row>
          <button onClick={() => eq.setOpen(true)} className="w-full flex items-center gap-2 px-4 py-3 text-sm text-violet-300 font-semibold">
            Ajustar bandas y preajustes <ChevronRight className="w-4 h-4 ml-auto" />
          </button>
          <Row icon={<Sparkles className="w-4 h-4" />} title="Audio en alta calidad" desc="Al escuchar con internet: la mejor calidad disponible, también los originales de archive.org (FLAC, MP3 320). Gasta más datos">
            <Switch on={audioBoost} onChange={(v) => useMusicStore.getState().setAudioBoost(v)} label="Audio en alta calidad" />
          </Row>
          <Row
            icon={<HardDriveDownload className="w-4 h-4" />}
            title="Descargas en calidad máxima"
            desc={dlMax ? 'Máxima: originales (FLAC / MP3 320) y la mejor pista de YouTube. Ocupan más espacio' : 'Normal: archivos livianos (ocupan menos espacio)'}
          >
            <Switch
              on={dlMax}
              onChange={(v) => {
                setDownloadQuality(v ? 'max' : 'normal')
                setDlMax(v)
              }}
              label="Descargas en calidad máxima"
            />
          </Row>
          <Row
            icon={<TvMinimalPlay className="w-4 h-4" />}
            title="Ver siempre el video"
            desc="Las canciones que tienen video se ven como video. Al bloquear el teléfono siguen sonando (pasan al audio) y al volver, otra vez el video"
          >
            <Switch
              on={alwaysVideo}
              onChange={(v) => {
                setAlwaysVideo(v)
                setAlwaysVideoOn(v)
              }}
              label="Ver siempre el video"
            />
          </Row>
          <Row icon={<Radio className="w-4 h-4" />} title="Radio automática" desc="Al terminar la cola sigue con música parecida">
            <Switch on={radioEnabled} onChange={(v) => useMusicStore.getState().setRadioEnabled(v)} label="Radio automática" />
          </Row>
        </Section>

        <Section title="Apariencia e idioma">
          <Row icon={<HelpCircle className="w-4 h-4" />} title="Ayudas «?»" desc="Signos ? pequeños junto a lo importante: al tocarlos explican cómo funciona">
            <Switch on={helpOn} onChange={(v) => setHelpTips(v)} label="Ayudas" />
          </Row>
          <Row icon={<LayoutGrid className="w-4 h-4" />} title="Vista de las listas" desc="Lista o mosaico, en todas las secciones">
            <ViewToggle />
          </Row>
          <Row icon={<Languages className="w-4 h-4" />} title="Traducir descripciones y letras a">
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              aria-label="Idioma de la traducción"
              className="bg-surface-2 text-sm text-white border border-white/10 rounded-full px-3 py-1.5 focus:outline-none"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="bg-surface-1">
                  {l.name}
                </option>
              ))}
            </select>
          </Row>
        </Section>

        <Section title="Tu música">
          {/* PulsoMedia ↔ PulsoMusic en el mismo teléfono */}
          {mounted && apk && (
            <button onClick={() => importSiblingLibrary()} className="w-full text-left">
              <Row
                icon={<RefreshCw className="w-4 h-4" />}
                title={`Traer mi biblioteca de ${otherAppName()}`}
                desc={`Si tienes ${otherAppName()} en este teléfono: trae sus playlists, Me gusta y discos (se juntan con los de aquí). Las descargas ya se comparten solas. Con la misma cuenta en las dos, todo queda igual siempre.`}
              />
            </button>
          )}
          <button onClick={() => useAccountStore.getState().setOpen(true)} className="w-full text-left">
            <Row
              icon={<CloudUpload className={`w-4 h-4 ${account.email ? 'text-emerald-300' : ''}`} />}
              title={account.email ? 'Cuenta activa' : 'Cuenta y respaldo'}
              desc={
                account.email
                  ? `${account.email}${account.syncedAt ? ` · respaldo: ${new Date(account.syncedAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}` : ''}`
                  : 'Inicia sesión con tu correo: guarda tu biblioteca y úsala en otro teléfono'
              }
            >
              {account.email ? (
                <span className="shrink-0 rounded-full bg-emerald-500/15 text-emerald-300 text-[11px] font-bold px-2.5 py-1">Conectada</span>
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-500" />
              )}
            </Row>
          </button>
          <Row icon={<Users className="w-4 h-4" />} title="Nombre en la comunidad" desc="Se muestra en lo que compartes (nunca el correo)">
            <input
              value={alias}
              onChange={(e) => {
                setAliasState(e.target.value)
                saveAlias(e.target.value)
              }}
              maxLength={40}
              placeholder="Tu nombre"
              aria-label="Nombre en la comunidad"
              className="w-32 bg-surface-2 text-sm text-white border border-white/10 rounded-full px-3 py-1.5 focus:outline-none focus:border-violet-500"
            />
          </Row>
          <Link href="/music/comunidad" className="block">
            <Row icon={<Users className="w-4 h-4" />} title="Comunidad de playlists" desc="Lo que comparten todos y lo que compartiste tú">
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </Row>
          </Link>
          <Link href="/music/library#descargas" className="block">
            <Row
              icon={<Download className="w-4 h-4" />}
              title="Descargas"
              desc={downloads.length ? `${downloads.length} canciones · ${formatSize(size)}` : 'Nada descargado todavía'}
            >
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </Row>
          </Link>
        </Section>

        <HiddenSection />

        <Section title="La app">
          <Link href="/app-android" className="block">
            <Row icon={<Smartphone className="w-4 h-4" />} title="App de Android" desc={apk ? `Instalada: ${apk}` : 'Instálala o actualízala'}>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </Row>
          </Link>
          <Link href="/music/convertir" className="block">
            <Row icon={<AudioLines className="w-4 h-4" />} title="Convertir YouTube a audio" desc="Guarda solo el sonido de un video para escucharlo sin internet">
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </Row>
          </Link>
          <Link href="/app-reloj" className="block">
            <Row icon={<Watch className="w-4 h-4" />} title="App para el reloj" desc="Wear OS: elige qué suena desde el reloj">
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </Row>
          </Link>
          <Link href="/esferas" className="block">
            <Row icon={<Watch className="w-4 h-4" />} title="Tienda de esferas" desc="Esferas para tu reloj: descárgalas e instálalas">
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </Row>
          </Link>
          <RepairAppButton />
          {hasAdmin && (
            <Link href="/admin" className="block">
              <Row icon={<ShieldCheck className="w-4 h-4" />} title="Administración" desc="Panel con tu cuenta de administrador (aparte de tu cuenta personal)">
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </Row>
            </Link>
          )}
          <Link href="/novedades" className="block">
            <Row icon={<Info className="w-4 h-4" />} title="Novedades" desc={`Versión ${process.env.NEXT_PUBLIC_APP_VERSION}`}>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </Row>
          </Link>
          {lastError && (
            <div className="px-4 py-3 text-[11px] text-slate-500 break-words">
              Último error ({new Date(lastError.at).toLocaleString('es')}, {lastError.online ? 'con internet' : 'sin conexión'}): {lastError.where} · {lastError.msg}
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem('cpn-last-error')
                  } catch {}
                  setLastError(null)
                }}
                className="ml-2 underline text-slate-400"
              >
                Borrar
              </button>
            </div>
          )}
          <div className="px-4 py-3.5">
            <ShareAppButton />
          </div>
        </Section>
      </div>
    </div>
  )
}

/** «No me interesa»: lo ocultado, con «Mostrar de nuevo» */
/** Tema de colores: se aplica al instante y queda guardado en este teléfono o computador */
function ThemePicker() {
  const [cur, setCur] = useState<ThemeId>('original')
  const [isMusic, setIsMusic] = useState(false)
  useEffect(() => {
    setCur(getTheme())
    setIsMusic(document.documentElement.getAttribute('data-app') === 'music')
  }, [])
  return (
    <div className="grid grid-cols-3 gap-2 p-3">
      {THEMES.map((t) => {
        const on = cur === t.id
        // El original de PulsoMusic es carmesí; el de PulsoMedia y la web, violeta
        const [a, b, bg] = t.id === 'original' && isMusic ? ['#d63454', '#f69ca7', '#100f11'] : t.colors
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTheme(t.id)
              setCur(t.id)
            }}
            aria-pressed={on}
            className={`rounded-xl p-2 text-left border transition-colors ${on ? 'border-white/70 bg-white/8' : 'border-white/10 hover:border-white/25'}`}
          >
            <span className="relative block h-14 rounded-lg overflow-hidden" style={{ background: bg }}>
              <span className="absolute left-2 top-2 h-1.5 w-10 rounded-full" style={{ background: a }} />
              <span className="absolute left-2 top-5 h-1.5 w-6 rounded-full opacity-60" style={{ background: b }} />
              <span className="absolute right-2 bottom-2 w-6 h-6 rounded-full" style={{ background: a, boxShadow: `0 0 10px ${a}88` }} />
            </span>
            <span className="mt-1.5 flex items-center gap-1 text-[13px] font-semibold text-white">
              {t.name}
              {on && <span className="ml-auto w-2 h-2 rounded-full bg-white" aria-hidden />}
            </span>
            <span className="block text-[11px] text-slate-400 leading-tight">{t.desc}</span>
          </button>
        )
      })}
    </div>
  )
}

function HiddenSection() {
  const songs = useBlockStore((s) => s.songs)
  const artists = useBlockStore((s) => s.artists)
  const [open, setOpen] = useState(false)
  const artistList = Object.entries(artists)
  const total = songs.length + artistList.length
  const btn = 'shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white'
  return (
    <Section title="Ocultados">
      <button onClick={() => setOpen(!open)} className="w-full text-left" aria-expanded={open}>
        <Row
          icon={<EyeOff className="w-4 h-4" />}
          title="No me interesa"
          desc={total ? `${artistList.length} ${artistList.length === 1 ? 'artista' : 'artistas'} · ${songs.length} ${songs.length === 1 ? 'canción o video' : 'canciones o videos'}` : 'Nada oculto. Usa ⋮ → «No me interesa» en una canción o video'}
        >
          {total > 0 && <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`} />}
        </Row>
      </button>
      {open &&
        artistList.map(([k, name]) => (
          <div key={`a:${k}`} className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex-1 min-w-0">
              <span className="block text-white text-sm truncate">{name}</span>
              <span className="block text-slate-500 text-xs">Artista</span>
            </span>
            <button onClick={() => useBlockStore.getState().unblockArtist(k)} className={btn}>
              Mostrar de nuevo
            </button>
          </div>
        ))}
      {open &&
        songs.map((t) => (
          <div key={`s:${t.id}`} className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex-1 min-w-0">
              <span className="block text-white text-sm truncate">{t.title}</span>
              <span className="block text-slate-500 text-xs truncate">{t.artist || 'Canción o video'}</span>
            </span>
            <button onClick={() => useBlockStore.getState().unblockSong(t.id)} className={btn}>
              Mostrar de nuevo
            </button>
          </div>
        ))}
    </Section>
  )
}
