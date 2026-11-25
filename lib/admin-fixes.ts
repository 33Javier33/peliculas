// Panel de administración: qué significa cada error que reportan las apps y cómo se soluciona.
// Se busca el primer patrón que calce con el mensaje (y con dónde ocurrió).

export type Fix = { causa: string; solucion: string; grave: boolean }

const RULES: { test: RegExp; where?: RegExp; fix: Fix }[] = [
  {
    test: /ChunkLoad|Loading chunk|Failed to fetch dynamically|importing a module script/i,
    fix: {
      causa: 'Se publicó una versión nueva de la web mientras la app estaba abierta y faltó una parte de la anterior.',
      solucion: 'Nada que hacer: la app se recarga sola una vez y queda con la versión nueva.',
      grave: false,
    },
  },
  {
    test: /Canción que no se pudo reproducir/i,
    fix: {
      causa: 'YouTube no entregó el audio de esa canción (video bloqueado fuera de YouTube, por región o borrado) o no había conexión.',
      solucion:
        'Si se repite con la misma canción (columna «dónde»), quitarla de las listas o buscar otra versión. Si pasa con muchas y en segundo plano, revisar que esos dispositivos tengan la app actualizada.',
      grave: false,
    },
  },
  {
    test: /Failed to fetch|NetworkError|Network request failed|ERR_INTERNET|ERR_NETWORK|timeout|timed out/i,
    fix: {
      causa: 'El dispositivo perdió la conexión (o el servidor tardó demasiado) justo en ese momento.',
      solucion: 'Normalmente nada: la app reintenta sola. Si aparece muchas veces con internet, revisar el servicio de esa página (Vercel o la API externa).',
      grave: false,
    },
  },
  {
    test: /QuotaExceeded|exceeded the quota|storage.*full/i,
    fix: {
      causa: 'El espacio del navegador o de la app se llenó (descargas o caché).',
      solucion: 'En ese dispositivo: Biblioteca → Descargadas, borrar algunas. Si es muy común, achicar lo que la app guarda.',
      grave: true,
    },
  },
  {
    test: /OutOfMemory|out of memory/i,
    fix: {
      causa: 'El teléfono se quedó sin memoria.',
      solucion: 'Pasa en teléfonos con poca memoria. Si se repite, revisar qué estaba haciendo la app (columna «dónde»).',
      grave: true,
    },
  },
  {
    test: /Minified React error #4(18|19|23|25)|Hydration|hydrat/i,
    fix: {
      causa: 'La página se dibujó distinta en el servidor y en el dispositivo (por ejemplo, la hora).',
      solucion: 'No afecta al usuario (React la corrige). Se arregla en el componente de esa página.',
      grave: false,
    },
  },
  {
    test: /PGRST|supabase|JWT/i,
    fix: {
      causa: 'Falló una consulta a Supabase (tabla que no existe, permisos o sesión vencida).',
      solucion: 'Revisar que el SQL de supabase-migrations.sql esté ejecutado y que la sesión del usuario siga válida.',
      grave: true,
    },
  },
  {
    test: /.*/,
    where: /^android$/,
    fix: {
      causa: 'La app de Android se cerró por un error (el mensaje dice dónde).',
      solucion: 'Revisar el archivo y la línea que indica el mensaje. Si solo pasa en versiones antiguas, se soluciona actualizando la app.',
      grave: true,
    },
  },
  {
    test: /is not a function|Cannot read propert|undefined is not|null is not|is not defined/i,
    fix: {
      causa: 'Un error en el código de la página: se usó algo que no estaba cargado.',
      solucion:
        'Revisar la página y la versión indicadas. Si solo aparece en versiones antiguas de la app, se soluciona actualizando; si aparece en la última, hay que corregir el código.',
      grave: true,
    },
  },
]

export function fixFor(mensaje: string, donde: string): Fix {
  for (const r of RULES) if (r.test.test(mensaje) && (!r.where || r.where.test(donde))) return r.fix
  return {
    causa: 'Error nuevo, sin diagnóstico conocido.',
    solucion: 'Revisar el detalle (dónde, página y versión). Si solo aparece en versiones antiguas de la app, se soluciona actualizando.',
    grave: true,
  }
}
