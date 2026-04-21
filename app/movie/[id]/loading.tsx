export default function MovieDetailLoading() {
  return (
    <div className="min-h-screen">
      <div className="relative w-full h-[60vh] bg-[#1e293b] animate-pulse" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-32 relative z-10 pb-20">
        <div className="flex flex-col md:flex-row gap-8">
          <div className="shrink-0 w-48 sm:w-56 md:w-64 mx-auto md:mx-0">
            <div className="aspect-[2/3] rounded-2xl bg-[#1e293b] animate-pulse" />
          </div>

          <div className="flex-1 pt-2 space-y-4">
            <div className="h-10 bg-[#1e293b] rounded-lg animate-pulse w-3/4" />
            <div className="h-5 bg-[#1e293b] rounded-lg animate-pulse w-1/3" />
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-7 w-20 bg-[#1e293b] rounded-full animate-pulse" />
              ))}
            </div>
            <div className="space-y-2">
              <div className="h-4 bg-[#1e293b] rounded animate-pulse" />
              <div className="h-4 bg-[#1e293b] rounded animate-pulse w-5/6" />
              <div className="h-4 bg-[#1e293b] rounded animate-pulse w-4/6" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
