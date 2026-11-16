export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const [all, details, athlete] = await Promise.all([activityList(), getDetails(), getAthlete()])
  return computeStats(all, details, athlete, { sport: String(q.sport || 'all'), year: String(q.year || 'all') })
})
