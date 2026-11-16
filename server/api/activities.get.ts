// Compact activity list (no polylines) for the activities table.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const [all, details] = await Promise.all([activityList(), getDetails()])
  return filterActivities(all, { sport: String(q.sport || 'all'), year: String(q.year || 'all') }).map(({ polyline, start_latlng, ...a }) => ({
    ...a,
    calories: details[a.id]?.calories ?? null,
    device_name: details[a.id]?.device_name ?? null,
  }))
})
