// Transmitir videos de YouTube a una TV con Chromecast / Google TV sin salir de la app.
// El teléfono abre en la TV la app de YouTube (receptor oficial) y obtiene su "screenId";
// con él, el servidor usa la API "Lounge" de YouTube (la misma que usa la app de YouTube del
// teléfono al transmitir) para decirle a la TV qué video poner.
import { randomUUID } from 'crypto'

const BASE = process.env.YT_LOUNGE_BASE || 'https://www.youtube.com'
const BIND = `${BASE}/api/lounge/bc/bind`
const TOKEN = `${BASE}/api/lounge/pairing/get_lounge_token_batch`
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'

async function post(url: string, body: Record<string, string | number>, headers: Record<string, string> = {}) {
  const form = new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]))
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, ...headers },
    body: form,
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`YouTube ${res.status}`)
  return text
}

/** Pone un video en la TV (que ya tiene abierto YouTube con ese screenId). */
export async function playOnScreen(screenId: string, videoId: string, currentTime = 0): Promise<void> {
  // 1) Token de la "sala" de esa pantalla
  const tokenRes = JSON.parse(await post(TOKEN, { screen_ids: screenId })) as { screens?: { loungeToken?: string }[] }
  const lounge = tokenRes.screens?.[0]?.loungeToken
  if (!lounge) throw new Error('La TV no respondió')
  const h = { 'X-YouTube-LoungeId-Token': lounge }

  // 2) Conectarse como control remoto
  const device = { device: 'REMOTE_CONTROL', id: randomUUID(), name: 'Carlos P. Nauto Interactive', 'mdx-version': 3, pairing_type: 'cast', app: 'android-phone-13.14.55' }
  const bind = await post(`${BIND}?${new URLSearchParams({ RID: '0', VER: '8', CVER: '1' })}`, device, h)
  const sid = bind.match(/"c","(.*?)","/)?.[1]
  const gsession = bind.match(/"S","(.*?)"]/)?.[1]
  if (!sid || !gsession) throw new Error('No se pudo conectar con la TV')

  // 3) Poner el video (desde el segundo en que iba)
  await post(
    `${BIND}?${new URLSearchParams({ SID: sid, gsessionid: gsession, RID: '1', VER: '8', CVER: '1' })}`,
    {
      count: 1,
      req0__sc: 'setPlaylist',
      req0_videoId: videoId,
      req0_currentTime: Math.max(0, Math.floor(currentTime)),
      req0_currentIndex: -1,
      req0_listId: '',
      req0_audioOnly: 'false',
      req0_prioritizeMobileSenderPlaybackStateOnConnection: 'true',
    },
    h
  )
}
