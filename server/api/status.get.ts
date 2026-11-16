export default defineEventHandler(async (event) => {
  const [tokens, athlete, meta, activities, details] = await Promise.all([getTokens(), getAthlete(), getMeta(), getActivities(), getDetails()])
  const all = Object.values(activities)
  const base = appBaseUrl(event)
  return {
    configured: isConfigured(),
    connected: !!tokens,
    passwordProtected: !!dashboardPassword(),
    redirectUri: `${base}/api/auth/callback`,
    callbackDomain: new URL(base).hostname,
    athlete: athlete && {
      id: athlete.id,
      firstname: athlete.firstname,
      lastname: athlete.lastname,
      city: athlete.city,
      country: athlete.country,
      profile: athlete.profile_medium || athlete.profile,
      measurement_preference: athlete.measurement_preference,
      weight: athlete.weight,
      ftp: athlete.ftp,
      created_at: athlete.created_at,
      premium: athlete.premium ?? athlete.summit,
      follower_count: athlete.follower_count,
      friend_count: athlete.friend_count,
    },
    activityCount: all.length,
    detailCount: Object.keys(details).length,
    pendingDetails: all.filter(a => !details[a.id] && !a.manual).length,
    sports: [...new Set(all.map(a => a.sport_type))].sort(),
    years: [...new Set(all.map(a => a.start_date_local.slice(0, 4)))].sort().reverse(),
    sync: { ...meta, ...syncState, rateLimit: getRateLimit() ?? meta.rateLimit },
    syncIntervalMinutes: Number(useRuntimeConfig().syncIntervalMinutes) || 0,
  }
})
