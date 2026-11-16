// Strava's own official totals (recent / ytd / all-time for run, ride, swim) + HR/power zones
export default defineEventHandler(async () => {
  const [stats, zones] = await Promise.all([getAthleteStats(), getZones()])
  return { stats, zones }
})
