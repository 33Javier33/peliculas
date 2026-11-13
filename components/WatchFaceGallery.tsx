'use client'

import { useRef, useState } from 'react'

// Galería de una esfera: se desliza con el dedo; abajo, miniaturas para saltar a cada imagen
export default function WatchFaceGallery({ id, name, count }: { id: string; name: string; count: number }) {
  const [i, setI] = useState(0)
  const strip = useRef<HTMLDivElement>(null)
  const srcs = Array.from({ length: count }, (_, k) => `/esferas/${id}/${k + 1}.webp`)

  const go = (k: number) => {
    const el = strip.current
    if (!el) return
    el.scrollTo({ left: k * el.clientWidth, behavior: 'smooth' })
    setI(k)
  }

  return (
    <div>
      <div
        ref={strip}
        onScroll={(e) => {
          const el = e.currentTarget
          setI(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
        }}
        className="flex overflow-x-auto snap-x snap-mandatory rounded-2xl bg-black [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {srcs.map((src, k) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={src} alt={`${name}, imagen ${k + 1}`} loading={k === 0 ? 'eager' : 'lazy'} className="w-full shrink-0 snap-center aspect-square object-contain" />
        ))}
      </div>
      {count > 1 && (
        <div className="mt-3 flex justify-center gap-2">
          {srcs.map((src, k) => (
            <button
              key={src}
              onClick={() => go(k)}
              aria-label={`Ver imagen ${k + 1}`}
              className={`w-14 h-14 rounded-xl overflow-hidden border-2 transition-colors ${k === i ? 'border-violet-400' : 'border-transparent opacity-60'}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="w-full h-full object-cover bg-black" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
