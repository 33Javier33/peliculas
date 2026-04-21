import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <div className="text-8xl font-black text-[#2d3748] mb-4">404</div>
      <h2 className="text-3xl font-bold text-white mb-3">Página no encontrada</h2>
      <p className="text-slate-400 mb-8 max-w-md">
        La página que buscas no existe o fue movida.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-[#0f172a] font-bold px-6 py-3 rounded-full transition-all duration-200 hover:scale-105"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Volver al inicio
      </Link>
    </div>
  )
}
