import { NextRequest, NextResponse } from 'next/server'
import { translateText, LANGUAGES } from '@/lib/translate'

// POST /api/translate { text, to } → { text, from }
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { text?: string; to?: string }
  const text = (body.text || '').slice(0, 6000)
  const to = LANGUAGES.some((l) => l.code === body.to) ? body.to! : 'es'
  if (!text.trim()) return NextResponse.json({ text: '' })
  try {
    return NextResponse.json(await translateText(text, to))
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }
}
