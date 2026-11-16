import type { H3Event } from 'h3'
import type { Activity, ActivityDetail } from './store'

const API = 'https://www.strava.com/api/v3'
export const STRAVA_SCOPES = 'read,profile:read_all,activity:read_all'

export class RateLimitError extends Error {}

export function stravaConfig() {
  const c = useRuntimeConfig()
  return {
    clientId: String(c.stravaClientId || ''),
    clientSecret: String(c.stravaClientSecret || ''),
  }
}

export function isConfigured() {
  const { clientId, clientSecret } = stravaConfig()
  return Boolean(clientId && clientSecret)
}

/** Public base URL of this app, used to build the OAuth redirect URI. */
export function appBaseUrl(event?: H3Event) {
  const configured = String(useRuntimeConfig().appUrl || '').replace(/\/+$/, '')
  if (configured) return configured
  if (event) return getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  return 'http://localhost:3000'
}

// Token handling --------------------------------------------------------------

export async function exchangeCode(code: string) {
  const { clientId, clientSecret } = stravaConfig()
  const res: any = await $fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    body: { client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code' },
  })
  await saveTokens({
    access_token: res.access_token,
    refresh_token: res.refresh_token,
    expires_at: res.expires_at,
    athlete_id: res.athlete?.id,
  })
  if (res.athlete) await writeJson('athlete.json', res.athlete)
  return res
}

let refreshing: Promise<string> | null = null

export async function getAccessToken(): Promise<string> {
  const tokens = await getTokens()
  if (!tokens) throw createError({ statusCode: 401, statusMessage: 'Strava not connected' })
  if (tokens.expires_at - 120 > Date.now() / 1000) return tokens.access_token

  refreshing ??= (async () => {
    const { clientId, clientSecret } = stravaConfig()
    const res: any = await $fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      body: {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
      },
    })
    await saveTokens({ ...tokens, access_token: res.access_token, refresh_token: res.refresh_token, expires_at: res.expires_at })
    return res.access_token as string
  })().finally(() => { refreshing = null })
  return refreshing
}

// API calls ------------------------------------------------------------------------

function parsePair(v: string | null): [number, number] {
  const [a, b] = (v || '').split(',').map(Number)
  return [a || 0, b || 0]
}

export async function stravaGet<T = any>(path: string, query?: Record<string, any>): Promise<T> {
  const token = await getAccessToken()
  const res = await $fetch.raw<T>(`${API}${path}`, {
    query,
    headers: { Authorization: `Bearer ${token}` },
    ignoreResponseError: true,
  })

  // Strava sends both overall and read-specific limits; prefer the read ones.
  const usage = res.headers.get('x-readratelimit-usage') ?? res.headers.get('x-ratelimit-usage')
  const limit = res.headers.get('x-readratelimit-limit') ?? res.headers.get('x-ratelimit-limit')
  if (usage && limit) {
    const [shortUsage, dailyUsage] = parsePair(usage)
    const [shortLimit, dailyLimit] = parsePair(limit)
    rateLimit = { shortUsage, dailyUsage, shortLimit, dailyLimit, at: Date.now() }
  }

  if (res.status === 429) throw new RateLimitError('Strava rate limit reached, will retry later')
  if (res.status >= 400) {
    throw createError({ statusCode: res.status, statusMessage: `Strava API ${path} failed: ${JSON.stringify(res._data)}` })
  }
  return res._data as T
}

let rateLimit: { shortUsage: number; shortLimit: number; dailyUsage: number; dailyLimit: number; at: number } | undefined
export const getRateLimit = () => rateLimit

/** Remaining safe requests in the current 15-minute window (keeps a small buffer). */
export function remainingShortRequests() {
  if (!rateLimit) return 80
  // Strava's short window resets at :00, :15, :30, :45; the daily one at midnight UTC.
  const now = Date.now()
  const shortReset = Math.floor(rateLimit.at / 900_000) !== Math.floor(now / 900_000)
  const dailyReset = new Date(rateLimit.at).toISOString().slice(0, 10) !== new Date(now).toISOString().slice(0, 10)
  const shortLeft = shortReset ? rateLimit.shortLimit : rateLimit.shortLimit - rateLimit.shortUsage
  const dailyLeft = dailyReset ? rateLimit.dailyLimit : rateLimit.dailyLimit - rateLimit.dailyUsage
  return Math.max(0, Math.min(shortLeft, dailyLeft) - 5)
}

// Normalisation ------------------------------------------------------------------

export function toActivity(a: any): Activity {
  return {
    id: a.id,
    name: a.name,
    sport_type: a.sport_type || a.type,
    type: a.type,
    start_date: a.start_date,
    start_date_local: a.start_date_local,
    distance: a.distance ?? 0,
    moving_time: a.moving_time ?? 0,
    elapsed_time: a.elapsed_time ?? 0,
    total_elevation_gain: a.total_elevation_gain ?? 0,
    elev_high: a.elev_high,
    elev_low: a.elev_low,
    average_speed: a.average_speed ?? 0,
    max_speed: a.max_speed ?? 0,
    average_heartrate: a.average_heartrate,
    max_heartrate: a.max_heartrate,
    average_cadence: a.average_cadence,
    average_watts: a.average_watts,
    weighted_average_watts: a.weighted_average_watts,
    max_watts: a.max_watts,
    kilojoules: a.kilojoules,
    device_watts: a.device_watts,
    suffer_score: a.suffer_score ?? undefined,
    kudos_count: a.kudos_count ?? 0,
    comment_count: a.comment_count ?? 0,
    achievement_count: a.achievement_count ?? 0,
    pr_count: a.pr_count ?? 0,
    athlete_count: a.athlete_count ?? 1,
    photo_count: a.total_photo_count ?? a.photo_count ?? 0,
    trainer: !!a.trainer,
    commute: !!a.commute,
    manual: !!a.manual,
    private: !!a.private,
    gear_id: a.gear_id ?? null,
    workout_type: a.workout_type ?? null,
    average_temp: a.average_temp,
    start_latlng: a.start_latlng ?? [],
    polyline: a.map?.summary_polyline || undefined,
  }
}

export function toDetail(a: any): ActivityDetail {
  return {
    calories: a.calories,
    device_name: a.device_name,
    best_efforts: (a.best_efforts || []).map((b: any) => ({
      name: b.name,
      distance: b.distance,
      elapsed_time: b.elapsed_time,
      moving_time: b.moving_time,
      start_date_local: b.start_date_local,
      pr_rank: b.pr_rank ?? null,
    })),
    fetched_at: Date.now(),
  }
}
