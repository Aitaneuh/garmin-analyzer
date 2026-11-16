import type { Activity } from './store'

/**
 * Sync strategy (fits Strava's 100 req / 15 min, 1000 req / day read limits):
 *  1. Summary sync: page through /athlete/activities (200 per page). The first run fetches
 *     the full history; later runs only fetch activities newer than the newest stored one,
 *     plus a refresh of the last 30 days so edits/kudos stay up to date.
 *  2. Detail sync: gradually fetch /activities/{id} (best efforts, calories, device) for
 *     activities that have no detail yet, using whatever rate-limit budget is left.
 */

export const syncState = {
  running: false,
  phase: '' as '' | 'summary' | 'details',
  fetched: 0,
  startedAt: 0,
}

export async function runSync(opts: { full?: boolean } = {}) {
  if (syncState.running) return { started: false, reason: 'already running' }
  if (!(await getTokens())) return { started: false, reason: 'not connected' }
  syncState.running = true
  syncState.fetched = 0
  syncState.startedAt = Date.now()
  try {
    syncState.phase = 'summary'
    const added = await syncSummaries(opts.full)
    await syncProfile()
    await updateMeta({ lastSync: Date.now(), lastSyncError: undefined, rateLimit: getRateLimit() })
    if (useRuntimeConfig().detailSync !== false && String(useRuntimeConfig().detailSync) !== 'false') {
      syncState.phase = 'details'
      await syncDetails()
      await updateMeta({ lastDetailSync: Date.now(), rateLimit: getRateLimit() })
    }
    return { started: true, added }
  } catch (err: any) {
    const msg = err instanceof RateLimitError ? err.message : (err?.statusMessage || err?.message || String(err))
    console.error('[sync]', msg)
    await updateMeta({ lastSyncError: msg, rateLimit: getRateLimit() })
    return { started: true, error: msg }
  } finally {
    syncState.running = false
    syncState.phase = ''
  }
}

async function syncSummaries(full = false) {
  const store = await getActivities()
  const existing = Object.values(store)
  let after: number | undefined
  if (!full && existing.length) {
    const newest = existing.reduce((m, a) => (a.start_date > m ? a.start_date : m), '')
    // Re-fetch the last 30 days to pick up edits, new kudos, renamed activities...
    after = Math.floor(new Date(newest).getTime() / 1000) - 30 * 86400
  }

  const seen = new Set<number>()
  let added = 0
  for (let page = 1; ; page++) {
    const batch = await stravaGet<any[]>('/athlete/activities', { per_page: 200, page, ...(after ? { after } : {}) })
    for (const raw of batch) {
      const a: Activity = toActivity(raw)
      if (!store[a.id]) added++
      store[a.id] = a
      seen.add(a.id)
    }
    syncState.fetched += batch.length
    if (batch.length < 200) break
    if (page % 5 === 0) await saveActivities(store) // checkpoint on long histories
  }

  // On a full sync, drop activities that were deleted on Strava.
  if (full) {
    for (const id of Object.keys(store)) if (!seen.has(Number(id))) delete store[id]
  }
  await saveActivities(store)
  return added
}

async function syncProfile() {
  const tokens = await getTokens()
  if (!tokens) return
  const athlete = await stravaGet('/athlete')
  await writeJson('athlete.json', athlete)
  const stats = await stravaGet(`/athletes/${athlete.id}/stats`)
  await writeJson('athlete_stats.json', stats)
  try {
    await writeJson('zones.json', await stravaGet('/athlete/zones'))
  } catch {
    /* zones need profile:read_all; ignore if missing */
  }
}

export async function syncDetails(maxRequests?: number) {
  const activities = await activityList()
  const details = await getDetails()
  // Runs first (they carry best efforts), newest first.
  const pending = activities
    .filter(a => !details[a.id] && !a.manual)
    .sort((a, b) => Number(isRun(b.sport_type)) - Number(isRun(a.sport_type)) || b.start_date.localeCompare(a.start_date))

  let budget = Math.min(maxRequests ?? Infinity, remainingShortRequests())
  let done = 0
  for (const a of pending) {
    if (budget-- <= 0) break
    try {
      const raw = await stravaGet(`/activities/${a.id}`)
      details[a.id] = toDetail(raw)
      done++
      if (done % 10 === 0) await saveDetails(details)
    } catch (err) {
      if (err instanceof RateLimitError) break
      const status = (err as any)?.statusCode
      if (status === 404) details[a.id] = { fetched_at: Date.now() } // deleted/hidden
      else throw err
    }
    budget = Math.min(budget, remainingShortRequests())
  }
  await saveDetails(details)
  return done
}

export function isRun(sport: string) {
  return sport === 'Run' || sport === 'TrailRun' || sport === 'VirtualRun'
}
