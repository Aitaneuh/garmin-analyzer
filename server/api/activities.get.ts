// Compact activity list (no polylines) for the activities table.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const all = await activityList()
  return filterActivities(all, { sport: String(q.sport || 'all'), year: String(q.year || 'all') })
    .map(({ polyline, start_latlng, fit_sport, fit_sub_sport, imported_at, ...a }) => a)
})
