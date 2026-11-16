export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const [all, details] = await Promise.all([activityList(), getDetails()])
  return computeStats(all, details, { sport: String(q.sport || 'all'), year: String(q.year || 'all') })
})
