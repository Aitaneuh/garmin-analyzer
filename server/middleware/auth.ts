// Optional password gate (set NUXT_DASHBOARD_PASSWORD). Protects pages and API.
const PUBLIC = [/^\/login\/?$/, /^\/api\/login$/, /^\/api\/health$/, /^\/_nuxt\//, /^\/favicon/, /^\/__nuxt/]

export default defineEventHandler((event) => {
  if (!dashboardPassword()) return
  const path = event.path.split('?')[0]!
  if (PUBLIC.some(r => r.test(path))) return
  if (isAuthenticated(event)) return
  if (path.startsWith('/api/')) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return sendRedirect(event, '/login', 302)
})
