// Encoded polylines for the heatmap page.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const all = await activityList()
  return filterActivities(all, { sport: String(q.sport || 'all'), year: String(q.year || 'all') })
    .filter(a => a.polyline)
    .map(a => ({ id: a.id, name: a.name, sport_type: a.sport_type, date: a.start_date_local, distance: a.distance, p: a.polyline }))
})
