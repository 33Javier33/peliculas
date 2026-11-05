/** Barrita para arrastrar hacia abajo y cerrar la ventana */
export default function SheetHandle({ className = '' }: { className?: string }) {
  return (
    <div className={`flex justify-center py-2 cursor-grab active:cursor-grabbing ${className}`} aria-hidden>
      <span className="w-10 h-1.5 rounded-full bg-white/25" />
    </div>
  )
}
