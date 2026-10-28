'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

// Portada de una radio en vivo. Si la emisora no tiene logo (o no carga), se muestra la
// animación de la marca en bucle en vez del ícono fijo.

const DEFAULT_ICON = '/icons/icon-192.png'

export default function LiveArtwork({ src, alt, sizes, imageClassName }: { src?: string; alt: string; sizes: string; imageClassName: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])

  if (!src || src === DEFAULT_ICON || failed) {
    return (
      <video
        src="/brand/splash.mp4"
        poster="/brand/splash-poster.webp"
        autoPlay
        muted
        loop
        playsInline
        aria-label={alt}
        className="absolute inset-0 w-full h-full object-cover"
      />
    )
  }
  return <Image src={src} alt={alt} fill sizes={sizes} className={imageClassName} unoptimized onError={() => setFailed(true)} />
}
