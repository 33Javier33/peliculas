import { NextResponse } from 'next/server'
import { getNtsLive, getNtsMixtapes } from '@/lib/nts'

// /api/nts → canales en vivo de NTS (con programación) y sus Infinite Mixtapes
export const dynamic = 'force-dynamic'

export async function GET() {
  const [live, mixtapes] = await Promise.allSettled([getNtsLive(), getNtsMixtapes()])
  const body = {
    live: live.status === 'fulfilled' ? live.value : [],
    mixtapes: mixtapes.status === 'fulfilled' ? mixtapes.value : [],
  }
  const failed = live.status === 'rejected' && mixtapes.status === 'rejected'
  return NextResponse.json(body, { status: failed ? 502 : 200, headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } })
}
