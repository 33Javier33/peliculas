'use client'
import { getAlwaysVideo, setAlwaysVideo } from '@/lib/always-video'
import RepairAppButton from '@/components/RepairAppButton'
import { getDownloadQuality, setDownloadQuality } from '@/lib/audio-quality'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
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
  Users, AudioLines, HardDriveDownload, TvMinimalPlay } from 'lucide-react'
import { useEqStore, EQ_PRESETS } from '@/store/eqStore'
import { useMusicStore } from '@/store/musicStore'
import { useLangStore } from '@/store/langStore'
import { useAccountStore } from '@/store/accountStore'
import { readAlias, saveAlias } from '@/lib/community'
import { useOfflineStore } from '@/store/offlineStore'
import { LANGUAGES } from '@/lib/translate'
import { getNative } from '@/lib/native'
import ViewToggle from '@/components/ViewToggle'
import ShareAppButton from '@/components/ShareAppButton'

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
    <div className="pt-24 pb-40 px-4 max-w-2xl mx-auto min-h-screen">
      <h1 className="flex items-center gap-3 text-2xl font-bold text-white font-display mb-6">
        <Settings className="w-6 h-6 text-violet-300" /> Configuración
      </h1>

      <div className="space-y-7">
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
          <RepairAppButton />
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
