import { yeast } from '../yeast.js'

interface WinamaxEntity {
  id?: number
}

export interface WinamaxSport extends WinamaxEntity {
  sportName: string
  categories?: number[]
}

export interface WinamaxCategory extends WinamaxEntity {
  categoryName: string
  flag?: string
  sportId?: number
  tournaments?: number[]
}

export interface WinamaxTournament extends WinamaxEntity {
  tournamentName: string
  categoryId?: number
  srTournamentId?: string
  srSeasonId?: string
}

export interface WinamaxMatch extends WinamaxEntity {
  sportId: number
  categoryId: number
  tournamentId: number
  title: string
  status: string
  matchStart: number
  competitor1Id: number
  competitor1Name: string
  competitor2Id: number
  competitor2Name: string
  mainBetId?: number
  score?: string
}

export interface WinamaxBet extends WinamaxEntity {
  matchId: number
  betTitle: string
  betTypeCategoryId: number
  marketId: number
}

export interface WinamaxOutcome extends WinamaxEntity {
  betId: number
  label: string
  code?: string
}

export interface WinamaxFilter extends WinamaxEntity {
  betFilterName: string
  betFilterParentId?: number
  betFilterIsDefault?: boolean
  displayOrder: number
}

export interface WinamaxBetCategory extends WinamaxEntity {
  name: string
  displayOrder: number
}

export interface WinamaxLiveData {
  sports: Record<string, WinamaxSport | null>
  categories: Record<string, WinamaxCategory | null>
  tournaments: Record<string, WinamaxTournament | null>
  filters: Record<string, WinamaxFilter | null>
  betCategories: Record<string, WinamaxBetCategory | null>
  matches: Record<string, WinamaxMatch | null>
  bets: Record<string, WinamaxBet | null>
  outcomes: Record<string, WinamaxOutcome | null>
  odds: Record<string, number | null>
}

export type WinamaxLiveTarget = 'live' | 'calendar'

const BASE_URL = 'https://sports-eu-west-3.winamax.fr/uof-sports-server/socket.io/'

const PARAMS = {
  language: 'FR',
  version: '3.39.1',
  embed: 'false',
  EIO: '3',
  transport: 'polling'
}

const DEFAULT_HEADERS = {
  'Accept': '*/*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Ch-Ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'Origin': 'https://www.winamax.fr',
  'Referer': 'https://www.winamax.fr/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
}

function parseEngineIOPackets(data: string): string[] {
  const packets: string[] = []
  let offset = 0

  while (offset < data.length) {
    const colonIndex = data.indexOf(':', offset)
    if (colonIndex === -1) break

    const lengthStr = data.substring(offset, colonIndex)
    const length = parseInt(lengthStr, 10)
    if (isNaN(length)) break

    const payload = data.substring(colonIndex + 1, colonIndex + 1 + length)
    packets.push(payload)
    offset = colonIndex + 1 + length
  }

  return packets
}

/**
 * Manages cookies across requests
 */
class CookieJar {
  private cookies: Map<string, string> = new Map()

  update(setCookieHeaders: string[] | string | null | undefined) {
    if (!setCookieHeaders) return
    const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]

    for (const header of headers) {
      const parts = header.split(';')[0]?.split('=')
      if (parts && parts.length >= 2) {
        const key = parts[0]?.trim()
        const value = parts.slice(1).join('=').trim()
        if (key) {
          this.cookies.set(key, value)
        }
      }
    }
  }

  getCookieString(): string {
    return Array.from(this.cookies.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join('; ')
  }
}

/**
 * Performs a request to the Winamax socket.io server, updating cookies and parsing packets.
 */
async function performRequest(method: 'GET' | 'POST', url: string, jar: CookieJar, payload?: string) {
  const cookieString = jar.getCookieString()
  const response = await fetch(url, {
    method,
    body: payload,
    headers: {
      ...DEFAULT_HEADERS,
      ...(cookieString ? { Cookie: cookieString } : {})
    }
  })

  jar.update(response.headers.get('set-cookie'))
  const text = await response.text()

  return {
    status: response.status,
    text,
    packets: parseEngineIOPackets(text)
  }
}

function getRoutePayload(target: WinamaxLiveTarget): string {
  if (target === 'live') {
    return '24:42["m",{"route":"live"}]'
  }

  return '31:42["m",{"route":"calendar:24"}]'
}

export async function fetchWinamaxLiveData(target: WinamaxLiveTarget): Promise<WinamaxLiveData> {
  const liveData: WinamaxLiveData = {
    sports: {},
    categories: {},
    tournaments: {},
    filters: {},
    betCategories: {},
    matches: {},
    bets: {},
    outcomes: {},
    odds: {}
  }

  const jar = new CookieJar()
  const commonParams = new URLSearchParams(PARAMS)
  let sid = ''

  // 1. Handshake
  const handshakeUrl = `${BASE_URL}?${commonParams.toString()}&t=${yeast()}`
  const handshake = await performRequest('GET', handshakeUrl, jar)

  if (handshake.packets.length > 0 && handshake.packets[0]!.startsWith('0')) {
    const handshakeData = JSON.parse(handshake.packets[0]!.substring(1))
    sid = handshakeData.sid
  }

  if (!sid) {
    throw new Error('Failed to obtain sid from Winamax')
  }

  const pollUrl = `${BASE_URL}?${commonParams.toString()}&t=${yeast()}&sid=${sid}`

  await performRequest('GET', pollUrl, jar)

  await performRequest('POST', pollUrl, jar, getRoutePayload(target))

  const calendar = await performRequest('GET', pollUrl, jar)

  for (const packet of calendar.packets) {
    const eventData = JSON.parse(packet.substring(2))
    if (Array.isArray(eventData) && eventData[0] === 'm') {
      const payload = eventData[1]
      if (payload.sports) Object.assign(liveData.sports, payload.sports)
      if (payload.categories) Object.assign(liveData.categories, payload.categories)
      if (payload.tournaments) Object.assign(liveData.tournaments, payload.tournaments)
      if (payload.filters) Object.assign(liveData.filters, payload.filters)
      if (payload.betCategories) Object.assign(liveData.betCategories, payload.betCategories)
      if (payload.matches) Object.assign(liveData.matches, payload.matches)
      if (payload.bets) Object.assign(liveData.bets, payload.bets)
      if (payload.outcomes) Object.assign(liveData.outcomes, payload.outcomes)
      if (payload.odds) Object.assign(liveData.odds, payload.odds)
    }
  }

  return liveData
}
