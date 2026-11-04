// Esqueletos de carga: al tocar un artista o un disco la pantalla cambia al instante (mientras
// llegan los datos) en vez de quedarse quieta en la anterior.
const pulse = 'bg-white/[0.06] animate-pulse'

export function ArtistSkeleton() {
  return (
    <div className="min-h-screen pt-24 pb-32 px-4 max-w-6xl mx-auto" aria-busy="true" aria-label="Cargando">
      <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 mb-10">
        <div className={`w-40 h-40 sm:w-52 sm:h-52 rounded-full ${pulse}`} />
        <div className="space-y-3 w-full max-w-sm">
          <div className={`h-3 w-16 rounded ${pulse}`} />
          <div className={`h-9 w-3/4 rounded ${pulse}`} />
          <div className={`h-10 w-48 rounded-full ${pulse}`} />
        </div>
      </div>
      <GridSkeleton />
    </div>
  )
}

export function AlbumSkeleton() {
  return (
    <div className="min-h-screen pt-24 pb-32 px-4 max-w-5xl mx-auto" aria-busy="true" aria-label="Cargando">
      <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 mb-8">
        <div className={`w-56 h-56 rounded-2xl ${pulse}`} />
        <div className="space-y-3 w-full max-w-sm">
          <div className={`h-3 w-14 rounded ${pulse}`} />
          <div className={`h-9 w-4/5 rounded ${pulse}`} />
          <div className={`h-4 w-1/2 rounded ${pulse}`} />
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={`h-12 rounded-xl ${pulse}`} />
        ))}
      </div>
    </div>
  )
}

export function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i}>
          <div className={`aspect-square rounded-xl ${pulse}`} />
          <div className={`h-3 w-3/4 rounded mt-2 ${pulse}`} />
        </div>
      ))}
    </div>
  )
}

export function MusicSkeleton() {
  return (
    <div className="min-h-screen pt-24 pb-32 px-4 max-w-6xl mx-auto space-y-8" aria-busy="true" aria-label="Cargando">
      <div className={`h-8 w-48 rounded ${pulse}`} />
      <GridSkeleton />
    </div>
  )
}
