import ShareAppButton from '@/components/ShareAppButton'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Sparkles, Music2, Radio, Clapperboard, Smartphone, Download, SlidersHorizontal, Rocket, Watch, Users } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Cómo ha crecido la app',
  description: 'La historia de PulsoMedia (antes Carlos P. Nauto Interactive): cada etapa, lo nuevo y las mejoras.',
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
    date: '7 nov 2026',
    title: 'Los videos siguen sonando con el teléfono bloqueado',
    Icon: Clapperboard,
    color: 'from-violet-500 to-cyan-500',
    items: [
      'Videos: al bloquear el teléfono el video pasa a audio desde el mismo segundo; al desbloquear vuelve el video desde donde iba',
      'El audio del video se deja listo al empezar, para que el cambio sea al instante',
      'Nueva app PulsoMusic 1.0.1 (aparte de PulsoMedia): solo música, radios y videos musicales, con su propio reloj. Se descarga en «App para Android» y se puede tener junto a PulsoMedia',
      'Transmitir a la TV desde la app (Android 1.0.53): videos, música y radios van a tu Chromecast / Google TV eligiendo la TV en la propia app (sin duplicar pantalla); la música sigue la cola en la TV. Para otras TV, un botón abre directo «Transmitir / Smart View» del teléfono',
      'Web como la app: el audio de los videos queda guardado en el dispositivo y, al minimizar o bloquear el teléfono, sigue sonando desde esa copia; en el computador el video sigue sonando al cambiar de pestaña o minimizar',
      'Biblioteca: basurero en cada canción para quitarla (toca dos veces para confirmar), también dentro de un álbum; se borra su descarga',
      'Quitar un álbum: en Biblioteca → Álbumes, el basurero de cada disco (o «Quitar álbum» al abrirlo) lo saca de tu biblioteca y borra su descarga del teléfono; o solo borra la descarga y lo deja en la biblioteca',
      'Play desde la notificación, el widget, la pantalla bloqueada o los audífonos tras un rato sin usar el teléfono (app de Android 1.0.52): si el audio no arranca en 3 s se vuelve a pedir; si la página no responde (el teléfono la congeló o la cerró) se recupera sola y suena, sin tener que entrar',
      'Widget (app de Android 1.0.51): con la app cerrada, el play abre la app, empieza a sonar y la app vuelve sola al fondo (antes había que entrar)',
      'Descargas que se quedaban detenidas todo el día: una canción sin avance en 2 minutos se da por fallida y el teléfono la suelta; si fallan 4 seguidas se pausa y se reintenta más tarde; «Descargar toda mi biblioteca» se puede detener tocándolo y muestra disco, canción, % y fallidas',
      'Discos de Internet Archive que no cargaban con «Audio en alta calidad»: para escuchar en línea se usa el MP3 de alto bitrate en vez del FLAC pesado (30-100 MB por canción) y, si la versión de alta calidad no arranca en 8 s, suena la de siempre (antes se esperaban 40 s)',
      'Descargas con barra que se va llenando (y un brillo mientras avanza) en canciones, álbumes, videos y «Descargar toda mi biblioteca»; al tocar se ve al instante «En cola…» y luego «preparando», los MB o el % (app de Android 1.0.50: el avance llega varias veces por segundo, antes saltaba de 0 a 100 %)',
      '«Canción» en el reproductor se respeta: deja de mostrar el video (también en los que venían de Videos) y apaga «Ver siempre el video» para las que siguen. Para ver un video: «Video»',
      'Música en modo video: al salir de la app ya no se detiene (YouTube se pausaba solo y se tomaba como una pausa tuya); si el teléfono no abre la ventanita, pasa al audio y sigue sonando',
      'Video de una canción: al terminar sigue la próxima canción con su video (o solo audio si no tiene). Si mientras el teléfono estaba bloqueado la música pasó a otra canción, al volver se ve el video de esa (antes volvía al video anterior)',
      'Videos: al terminar uno de música sigue otro solo; películas y otros videos de YouTube tienen «Auto sí/no» (reproducción automática) y si está apagado se ofrece «Ver siguiente»',
      'Películas gratis (Pluto TV, Internet Archive…): al terminar se ofrece la siguiente y empieza sola a los 10 s (se puede cancelar)',
      'Canción/Video sin cortes: al tocar «Video» la canción sigue sonando hasta que el video arranca; si la canción ya está descargada, al bloquear el teléfono el audio sigue al instante (sin volver a cargarla); «Canción» también apaga el video cuando se ve en el reproductor',
      'Cuenta (ícono de persona) en todas las pantallas, también en el computador',
      'Ayudas «?»: un signo pequeño junto a lo importante explica cómo funciona (se pueden ocultar en Configuración)',
      'En pantallas medianas el menú de arriba muestra solo íconos (el logo ya no se corta)',
      'Respaldo automático de tu biblioteca (app de Android 1.0.49): playlists, Me gusta, álbumes y artistas se guardan solos en Descargas/PulsoMedia/PulsoMedia-respaldo.json, que queda aunque desinstales la app; «Recuperar respaldo» los trae de vuelta',
      'Como en Spotify: en el reproductor eliges «Canción» o «Video». También en las canciones convertidas a audio o descargadas (su video se ve desde el mismo segundo y al volver a «Canción» sigue desde ahí)',
      'Ventana flotante (app de Android 1.0.48): al salir de la app con un video, la ventanita muestra el video (antes quedaba en negro porque pasaba al audio); al bloquear la pantalla sigue el audio',
      'Reproductor ⋮ «Ir al álbum»: ahora abre el disco (antes quedaba escondido en la Biblioteca); también los álbumes guardados con ♥',
      'Ecualizador sin chisporroteo (app de Android 1.0.47): usa el ecualizador liviano del teléfono y solo baja bandas, así nunca satura; ya no se reinicia en cada pausa ni al mover las barras',
      '«Descargar toda mi biblioteca» ahora baja también los álbumes guardados con ♥ desde una carátula (busca sus canciones primero) y muestra en qué disco y canción va',
      'Nuevo botón «Descargar toda mi biblioteca» (en Canciones descargadas): baja discos, álbumes guardados y Me gusta, uno tras otro y en segundo plano',
      'Descargas más resistentes: si se corta la conexión (pantalla bloqueada, cambio de Wi-Fi a datos) esperan y siguen desde donde quedaron',
      'Las descargas que fallan se reintentan solas (al volver la conexión, al abrir la app y cada 10 minutos)',
      'Cambio más fluido: al bloquear el audio empieza al instante y al desbloquear el video vuelve sin silencios',
      'Nueva opción «Ver siempre el video» (Configuración): las canciones que tienen video se ven como video y al bloquear siguen sonando',
    ],
  },
  {
    date: '7 nov 2026',
    title: 'Tus descargas ya no se pierden',
    Icon: Download,
    color: 'from-emerald-500 to-cyan-500',
    items: [
      'App de Android: las descargas se guardan como música del teléfono (Música/PulsoMedia): no se borran al desinstalar la app',
      'Al reinstalar, «Recuperar mis descargas» las vuelve a usar sin descargar nada (y aparecen en la biblioteca)',
      'Lo que ya tenías descargado dentro de la app se pasa solo a la música del teléfono',
      'Configuración → «Reparar la app»: si algo se traba, se arregla sin desinstalar ni perder nada',
      'Descargar el audio de cualquier video: botón ⬇ en cada video de la sección Videos, en los videos del artista y en Me gusta / Ver más tarde',
      'Videos que el teléfono no logra sacar: se escuchan y descargan desde otras fuentes públicas (plan B)',
      'Las descargas que fallan se muestran con su motivo y el botón «Reintentar»',
      'Las canciones de YouTube empiezan mucho más rápido: el teléfono busca cada audio una sola vez y con prioridad la que vas a escuchar',
      'Arreglo: al bajar el audio de varios videos seguidos ya no se pierde ninguno (se suman a la descarga en curso)',
    ],
  },
  {
    date: '7 nov 2026',
    title: 'Arreglo urgente del sonido',
    Icon: Music2,
    color: 'from-rose-500 to-violet-500',
    items: [
      'Arreglo: las canciones de YouTube vuelven a sonar en todos los teléfonos (audio AAC de 128 kbps)',
      'Las canciones descargadas en las últimas versiones se arreglan solas (se vuelven a bajar en un formato que suena siempre)',
      'Al cerrar la cola abierta desde el reproductor, vuelves al reproductor',
      'En la Biblioteca, un artista o álbum se abre como su propia página, arriba del todo; «atrás» vuelve a la Biblioteca',
    ],
  },
  {
    date: '7 nov 2026',
    title: 'Enlaces cortos y buscadores en todas partes',
    Icon: Users,
    color: 'from-cyan-500 to-fuchsia-500',
    items: [
      'Abrir un enlace con la app abierta ya no detiene lo que suena ni recarga la app (se abre al instante)',
      'Enlaces cortos para compartir canciones de archive.org (…/a/disco/código) y las convertidas de YouTube (…/play/ID)',
      'Los enlaces compartidos muestran «Abrir en la app PulsoMedia» si se abren en el navegador del teléfono',
      'El buscador de la Biblioteca busca en tu biblioteca y también en Internet Archive, música libre, el catálogo y YouTube',
      'Buscador en Comunidad: filtra playlists y mezclas y encuentra canciones en todo lo compartido',
      'Reloj: la versión instalada aparece al final de la pantalla de inicio',
    ],
  },
  {
    date: '7 nov 2026',
    title: 'Descargas de YouTube que siguen sonando',
    Icon: Download,
    color: 'from-emerald-500 to-violet-500',
    items: [
      'Al salir de la app la música sigue sonando: si la canción iba por el video, pasa al audio desde donde iba',
      'Si el audio del teléfono falla un momento, se reintenta antes de pasar al video',
      'Las canciones de YouTube ya descargadas suenan desde tu teléfono: siguen con la pantalla apagada y sin internet',
      'En la página de un álbum, las canciones descargadas tienen un ✓ verde',
      '«Descargar audio» en el reproductor de Videos: el audio de cualquier video (menos películas)',
      'El ⬇ de las listas también descarga canciones de YouTube',
      'El audio del teléfono tiene más tiempo para empezar mientras se descargan otras canciones (antes pasaba al video y se cortaba al salir)',
    ],
  },
  {
    date: '6 nov 2026',
    title: 'Audio en calidad premium',
    Icon: SlidersHorizontal,
    color: 'from-violet-500 to-amber-500',
    items: [
      'YouTube: siempre la mejor pista de audio (Opus 160 kbps o AAC 128 kbps); antes a veces quedaba la de 48 kbps',
      'Internet Archive: las descargas usan el archivo original (FLAC o MP3 320) en vez de la copia comprimida',
      'Con «Audio en alta calidad», los discos de archive.org también suenan desde el original',
      'Nuevo botón «Mejorar la calidad» en Canciones descargadas: vuelve a bajar en la mejor calidad lo que ya tenías',
      'Configuración: «Descargas en calidad máxima» (o normal, para ocupar menos espacio)',
      'Ecualizador: elige si lo aplica el teléfono o la app, y ya no queda apagado tras un fallo',
    ],
  },
  {
    date: '6 nov 2026',
    title: 'Sin internet de verdad',
    Icon: Download,
    color: 'from-emerald-500 to-cyan-500',
    items: [
      'Las carátulas de tu música se guardan en el teléfono: se ven aunque estés sin internet (también las de YouTube)',
      'Al reabrir la app (o tras una actualización) la canción vuelve a sonar sola si se había quedado detenida',
      'Tus me gusta: toca «Ver las canciones» para ver la lista completa, elegir cualquiera o quitarle el ♥',
      'Canciones descargadas: muestra cuántas tienes y cada disco se despliega para tocar sus canciones sin internet',
    ],
  },
  {
    date: '5 nov 2026',
    title: 'Convertir YouTube a audio',
    Icon: Download,
    color: 'from-cyan-500 to-fuchsia-500',
    items: [
      'Nueva sección Convertir a audio: pega un enlace de YouTube y se guarda solo el sonido (sin video) en tu biblioteca',
      'Las canciones convertidas se escuchan sin internet y se pueden bajar como archivo de audio (.m4a)',
      'El botón Descargar del reproductor ahora también funciona con canciones de YouTube («Descargar audio»)',
      'En Android: comparte un video desde la app de YouTube con PulsoMedia y se convierte al tiro',
      'Descargar álbumes completos: en la página de un álbum («Descargar álbum») o con ⬇ sobre su carátula en el perfil del artista y la búsqueda',
      'Arreglo: «Sobre el artista» siempre se ve (también en canciones de YouTube descargadas), e «Ir al artista» funciona aunque el catálogo no tenga la canción',
      'Arreglo: sin conexión (modo avión) la app ya no queda en negro: guarda todas sus partes y, si una falla, solo esa se oculta',
      'Arreglo: en la app de Android la conversión se hace desde tu teléfono (YouTube estaba bloqueando al servidor y no se descargaba)',
    ],
  },
  {
    date: '5 nov 2026',
    title: 'Ahora somos PulsoMedia',
    Icon: Sparkles,
    color: 'from-cyan-400 to-pink-500',
    items: [
      'Nuevo nombre y logo: PulsoMedia, de Carlos P. Nauto Interactive',
      'La pantalla de inicio pasa de la animación de Carlos P. Nauto Interactive al nuevo logo',
      'En Música, en lugar de Tendencias: artistas similares a los de tu biblioteca («Porque escuchas…»)',
      'El ecualizador, la cola y las demás ventanas se cierran deslizando hacia abajo',
      'Reloj: los botones de la cola y de la biblioteca ya tienen íconos distintos',
      'Buscar en Música: Internet Archive, música libre y artistas y álbumes; los videos de YouTube quedan en la sección Videos',
      'El buscador de arriba busca en la sección en la que estás: en la Biblioteca busca en tu biblioteca sin sacarte de ahí',
      'En Videos y Películas, al buscar aparecen primero las películas gratis de Internet Archive',
      'Buscador en tu biblioteca: encuentra tus artistas, álbumes, canciones y playlists guardados (sin importar tildes)',
    ],
  },
  {
    date: '4 nov 2026',
    title: 'Cola de reproducción, artistas ordenados y enlaces que abren la app',
    Icon: Music2,
    color: 'from-violet-500 to-emerald-500',
    items: [
      'Agregar a la cola: «Reproducir a continuación» o «Al final» para canciones y álbumes completos',
      'En tu biblioteca, al abrir un artista se ven primero sus álbumes; al tocar uno, sus canciones (los recopilatorios quedan separados por artista)',
      'Artistas similares al final del perfil de cada artista',
      'Crear la playlist de un artista desde su biografía con un toque',
      'Guardar o quitar un álbum con ♥ desde el perfil del artista y la búsqueda',
      'Los enlaces compartidos (WhatsApp…) abren la app de Android si está instalada',
      'Más rápida: pantallas de carga al instante y biografías y discos guardados en el teléfono',
      'Reloj: lista de lo que está sonando para elegir cualquier canción, y el ícono de barritas de la esfera abre la app del reloj',
    ],
  },
  {
    date: '4 nov 2026',
    title: 'La música no se detiene y el reloj más completo',
    Icon: Rocket,
    color: 'from-fuchsia-500 to-violet-500',
    items: [
      'Al terminar un álbum o una playlist sigue sonando música de artistas parecidos (también con discos de archive.org y enlaces)',
      'En Videos, al terminar un video musical empieza el siguiente solo, y hay botón «Siguiente»; las películas siguen igual',
      'Descargar un álbum mientras suena ya no hace empezar de nuevo la canción',
      'Reloj: pantalla de volumen con botones − y + (para relojes sin corona giratoria) y el nivel del teléfono',
      'Reloj: al sonar música aparece el ícono de la app en la esfera; al tocarlo se abre la app del reloj',
    ],
  },
  {
    date: '3 nov 2026',
    title: 'Comunidad de playlists, app para el reloj y buscar canciones',
    Icon: Users,
    color: 'from-violet-500 to-sky-500',
    items: [
      '♥ en una canción es Me gusta y ♥ en un álbum lo guarda sin marcar todas sus canciones; nueva lista Tus me gusta solo con tus ♥',
      'Las mezclas de tu biblioteca muestran barritas y «Sonando» en la que se está escuchando',
      'Comunidad de playlists: comparte tus playlists y mezclas con un nombre público (nunca el correo), escucha y guarda las de otros',
      'Mezclas de la comunidad por género, hechas con lo que comparten todos y sin canciones repetidas',
      'Mezclas de tu biblioteca: una playlist por género que se arma sola (Tu Rock, Tu Latina…)',
      'App para relojes Wear OS al estilo Spotify: Tus me gusta, playlists, artistas, álbumes, mezclas, radios y NTS con carátulas; buscar dictando; volumen con el bisel o la corona',
      'Buscar por canción en Internet Archive: encuentra el disco que la tiene y empieza en esa canción',
      'Autocompletar en todos los buscadores: Internet Archive, música libre, películas, TV y tu biblioteca',
      'Los enlaces de una canción suelta de archive.org (por ejemplo un WAV) abren el disco completo',
      'Configuración muestra tu cuenta activa y tu último respaldo',
    ],
  },
  {
    date: '2 nov 2026',
    title: 'NTS Radio, configuración y música sin cortes',
    Icon: Watch,
    color: 'from-emerald-500 to-teal-500',
    items: [
      'NTS Radio: los dos canales en vivo desde Londres y 16 mixtapes que suenan las 24 horas',
      'Nueva sección Configuración (⚙️): ecualizador, alta calidad, radio automática, vista, idioma, cuenta y apps',
      'Ecualizador hecho por el propio teléfono en la app de Android: sin chisporroteo',
      'Widget para la pantalla de inicio con 4 diseños que se ajustan al tamaño, y notificación con barra de avance y ♥ Me gusta',
      'Radio sin espera entre canciones: las próximas se descargan antes de su turno',
      'Las actualizaciones y los cambios de sección ya no cortan la música',
      'Aleatorio de verdad repartido: suenan todas las canciones sin el mismo disco o artista seguidos',
      'La radio de Internet Archive mezcla las canciones de tu biblioteca desde el comienzo',
      'Películas gratis completas en el inicio, y lo gratis de Plex y Runtime en tu país',
      'Botones activos con color, botón para bajar por secciones y una biblioteca más liviana con tarjetas que se expanden',
    ],
  },
  {
    date: '2 nov 2026',
    title: 'Letras karaoke y compartir la app',
    Icon: Music2,
    color: 'from-fuchsia-500 to-violet-500',
    items: [
      'Letra de la canción que sigue la música como karaoke (toca una línea para ir a ese momento)',
      'Si la letra no está en español, se puede ver traducida bajo cada línea',
      'Botón para compartir la app: la descarga de Android, la instalación en iPhone o la web, según el teléfono',
      'Más fácil de encontrar en Google (mapa del sitio y descripción de la app)',
    ],
  },
  {
    date: '1 nov 2026',
    title: 'Radios infinitas de Internet Archive',
    Icon: Radio,
    color: 'from-orange-500 to-rose-500',
    items: [
      '14 radios por género (Latina, Rock, Pop, Electrónica, Jazz, Blues, Clásica, Hip hop, Reggae, Folk, Metal, Relajo, 78 rpm y Conciertos en vivo)',
      'Nunca se detienen: antes de terminar se suman canciones de otros discos, sin repetir',
      'Solo música que se puede compartir: sellos independientes, discos antiguos digitalizados y conciertos autorizados',
      'Las radios suman canciones de tu biblioteca del mismo género: ♥ de YouTube, discos guardados y todo lo descargado',
      'Biblioteca clasificada por género (MusicBrainz): filtros por género y el género junto a cada canción y descarga',
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
      'Menos trabajo mientras suena: la posición se guarda sin reescribir la biblioteca (antes ~500 KB por segundo) y la app no redibuja de más',
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
          PulsoMedia, de Carlos P. Nauto Interactive: películas, videos, música, radio y TV. Versión actual v{process.env.NEXT_PUBLIC_APP_VERSION}.
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
          <ShareAppButton />
        </div>
      </div>
    </div>
  )
}
