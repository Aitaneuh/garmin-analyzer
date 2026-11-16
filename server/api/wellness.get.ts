// Daily health data from Garmin Connect (sleep, HRV, resting HR, steps, stress, body battery, VO2 max).
export default defineEventHandler(async (event) => {
  const days = Math.min(3650, Math.max(7, Number(getQuery(event).days) || 365))
  const [health, meta] = await Promise.all([getHealth(), getMeta()])
  return computeWellness(health, days, meta.racePredictions)
})
