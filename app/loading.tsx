export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 animate-spin rounded-full border-4 border-[#2d3748] border-t-amber-400" />
        <p className="text-slate-400 text-sm">Cargando...</p>
      </div>
    </div>
  )
}
