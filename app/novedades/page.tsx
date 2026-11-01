import type { Metadata } from 'next'
import Link from 'next/link'
import { Sparkles, Music2, Radio, Clapperboard, Smartphone, Download, SlidersHorizontal, Rocket } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Cómo ha crecido la app',
  description: 'La historia de Carlos P. Nauto Interactive: cada etapa, lo nuevo y las mejoras.',
}

// Historia de la app: etapas con lo que se agregó y lo que se mejoró (de la más nueva a la primera)
interface Stage {
  date: string
  title: string
  Icon: typeof Sparkles
  color: string
  items: string[]
}

const STAGES: Stage[] = [
  {
    date: '1 nov 2026',
    title: 'Radios infinitas de Internet Archive',
    Icon: Radio,
    color: 'from-orange-500 to-rose-500',
    items: [
      '14 radios por género (Latina, Rock, Pop, Electrónica, Jazz, Blues, Clásica, Hip hop, Reggae, Folk, Metal, Relajo, 78 rpm y Conciertos en vivo)',
      'Nunca se detienen: antes de terminar se suman canciones de otros discos, sin repetir',
      'Solo música que se puede compartir: sellos independientes, discos antiguos digitalizados y conciertos autorizados',
      'Las radios suman canciones de tu biblioteca (♥ de YouTube y discos guardados) del mismo género',
      'Artistas conocidos en las radios: rock and roll de los 50, conciertos de Grateful Dead o Smashing Pumpkins, Pedro Infante, Duke Ellington…',
      'En la sección Música y en En vivo',
      'Menú ⋮ con Ir al álbum, al artista y discografía también en archive.org y las radios',
      'Sobre el artista en el reproductor, la biblioteca y archive.org: biografía (Wikipedia) y país, años y géneros (MusicBrainz)',
    ],
  },
  {
    date: '1 nov 2026',
    title: 'Películas gratis en español y audio más estable',
    Icon: Clapperboard,
    color: 'from-violet-500 to-fuchsia-500',
    items: [
      'Películas en español y clásicos de dominio público (Internet Archive y Wikimedia Commons): cine latino e hispano restaurado',
      'Géneros, orden y búsqueda por título, director o actor',
      'Seguir viendo: cada película sigue donde quedaste',
      'Subtítulos en español automáticos cuando la película los trae',
      'Descargar películas para verlas sin internet (por partes, se retoma si se corta)',
      'Sin "click" ni cortes de audio al salir o volver a la app',
      'Ecualizador sin chisporroteo: ya no satura (limitador) y usa un búfer de audio más grande',
      'archive.org suena directo y la app de Android queda solo como respaldo (ya no salta canciones)',
    ],
  },
  {
    date: '31 oct – 1 nov 2026',
    title: 'Sin conexión, cuenta y descargas',
    Icon: Download,
    color: 'from-emerald-500 to-teal-500',
    items: [
      'Modo sin conexión: la app abre sin internet y suena lo descargado',
      'Descargar canciones, discos, artistas y playlists, con su estado en la biblioteca',
      'Las descargas siguen al salir de la app (notificación) y se retoman solas',
      'Cuenta opcional con tu correo (código de verificación) y respaldo de la biblioteca',
      'La app de Android avisa, descarga e instala sus actualizaciones',
    ],
  },
  {
    date: '31 oct 2026',
    title: 'Ecualizador, playlists y compartir',
    Icon: SlidersHorizontal,
    color: 'from-amber-500 to-orange-500',
    items: [
      'Ecualizador de 5 bandas con preajustes y nivelador de volumen',
      'Playlists propias y vista Lista / Mosaico en todas las secciones',
      'Compartir canciones y playlists (quien las abre las puede guardar)',
      'Traducir descripciones, biografías y sinopsis',
      'La siguiente canción se prepara mientras suena la actual',
      'Botón para volver arriba, versión junto al logo y app para iPhone',
    ],
  },
  {
    date: '30 oct 2026',
    title: 'App de Android e Internet Archive',
    Icon: Smartphone,
    color: 'from-sky-500 to-cyan-500',
    items: [
      'App de Android (APK): música con la pantalla bloqueada y controles en la notificación',
      'Videos en ventana flotante al salir de la app (imagen en imagen)',
      'Buscador de Internet Archive: discos, artistas y conciertos para escuchar y guardar',
      'Discos desde enlaces ordenados por álbum, con carátula e información',
      'Música libre (Jamendo y Free Music Archive desde archive.org)',
      'Menú ⋮ del reproductor: ir al álbum, al artista y a la discografía',
    ],
  },
  {
    date: '28 – 29 oct 2026',
    title: 'Películas, TV en la tele y audio propio',
    Icon: Rocket,
    color: 'from-rose-500 to-pink-500',
    items: [
      'Películas gratis (Pluto TV a la carta y clásicos) y "Dónde ver" cada película',
      'Transmitir a la TV y control remoto con canales ▲▼',
      'Pantalla de inicio animada con la marca',
      'Audio propio de la app para seguir sonando con la pantalla bloqueada',
      'Música se reanuda sola después de un audio de WhatsApp o una llamada',
      'Información de discos y artistas, y página de diagnóstico /estado',
    ],
  },
  {
    date: '26 – 27 oct 2026',
    title: 'Radio y TV en vivo, la app instalable',
    Icon: Radio,
    color: 'from-indigo-500 to-violet-500',
    items: [
      'Radio y TV en vivo por país, ciudad y región, con favoritos y "Radios cerca de mí"',
      'App instalable (PWA) con navegación inferior y reproductor completo',
      'Sección "Para ti", radio automática al terminar la cola y tendencias por país',
      'Álbumes completos, discografía de artistas y seguir artistas',
      'Sugerencias al buscar y "Volver" regresa a donde estabas',
      'Diseño Obsidian Sonic y logo de Carlos P. Nauto Interactive',
    ],
  },
  {
    date: '21 abr 2026',
    title: 'El comienzo',
    Icon: Music2,
    color: 'from-slate-500 to-slate-400',
    items: [
      'Primera versión: películas, videos y música en un solo lugar',
      'Guardar canciones y biblioteca con filtros por artista y álbum',
      'Historial de lo escuchado y reproducción que se recuerda',
    ],
  },
]

const NUMBERS = [
  { n: '6', label: 'secciones: Inicio, Videos, Música, En vivo, Películas y Biblioteca' },
  { n: '120+', label: 'mejoras publicadas' },
  { n: '3', label: 'formas de usarla: web, Android (APK) e iPhone' },
]

export default function NovedadesPage() {
  return (
    <div className="pt-20 min-h-screen bg-obsidian pb-32">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white font-display">
          <Sparkles className="w-7 h-7 text-fuchsia-300" /> Cómo ha crecido la app
        </h1>
        <p className="text-slate-400 text-sm mt-2">
          Carlos P. Nauto Interactive: películas, videos, música, radio y TV. Versión actual v{process.env.NEXT_PUBLIC_APP_VERSION}.
        </p>

        <div className="grid grid-cols-3 gap-2 mt-6">
          {NUMBERS.map((x) => (
            <div key={x.n} className="rounded-2xl bg-surface-1 border border-white/8 p-3">
              <p className="text-2xl font-bold text-white font-display">{x.n}</p>
              <p className="text-[11px] leading-snug text-slate-400 mt-1">{x.label}</p>
            </div>
          ))}
        </div>

        <ol className="relative mt-10 border-l border-white/10 ml-4 space-y-10">
          {STAGES.map(({ date, title, Icon, color, items }) => (
            <li key={title} className="pl-8 relative">
              <span className={`absolute -left-[18px] top-0 w-9 h-9 rounded-full bg-gradient-to-br ${color} flex items-center justify-center shadow-lg`}>
                <Icon className="w-[18px] h-[18px] text-white" />
              </span>
              <p className="text-xs uppercase tracking-wider text-slate-500">{date}</p>
              <h2 className="text-white font-bold text-lg font-display mt-0.5">{title}</h2>
              <ul className="mt-3 space-y-1.5">
                {items.map((it) => (
                  <li key={it} className="flex gap-2 text-sm text-slate-300">
                    <span className="text-violet-400">•</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        <div className="mt-12 flex flex-wrap gap-2">
          <Link href="/peliculas" className="rounded-full bg-violet-500 px-4 py-2 text-sm font-semibold text-white">
            Ver películas gratis
          </Link>
          <Link href="/app-android" className="rounded-full bg-surface-2 border border-white/10 px-4 py-2 text-sm text-white">
            App de Android
          </Link>
          <Link href="/app-iphone" className="rounded-full bg-surface-2 border border-white/10 px-4 py-2 text-sm text-white">
            App para iPhone
          </Link>
        </div>
      </div>
    </div>
  )
}
