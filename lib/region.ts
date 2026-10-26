import type { NextRequest } from 'next/server'

/**
 * País del usuario (código ISO de 2 letras, p. ej. "CL").
 * En Vercel viene en la cabecera x-vercel-ip-country (según la IP); si no,
 * se usa la región del idioma del navegador (es-CL → CL) y por último México.
 */
export function getRequestRegion(request: NextRequest, fallback = 'MX'): string {
  const fromParam = request.nextUrl.searchParams.get('region')
  const fromIp = request.headers.get('x-vercel-ip-country')
  const fromLang = request.headers.get('accept-language')?.match(/[a-z]{2}-([A-Z]{2})/)?.[1]
  const region = (fromParam || fromIp || fromLang || fallback).toUpperCase()
  return /^[A-Z]{2}$/.test(region) ? region : fallback
}
