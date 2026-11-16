// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  devtools: { enabled: false },
  ssr: false, // pure client dashboard; the Nitro server handles Strava + data
  css: ['~/assets/main.css', 'leaflet/dist/leaflet.css'],
  app: {
    head: {
      title: 'Strava Analyzer',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'robots', content: 'noindex, nofollow' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  // Every value below can be overridden at runtime with an env var:
  // NUXT_STRAVA_CLIENT_ID, NUXT_STRAVA_CLIENT_SECRET, NUXT_APP_URL,
  // NUXT_DASHBOARD_PASSWORD, NUXT_DATA_DIR, NUXT_SYNC_INTERVAL_MINUTES, NUXT_DETAIL_SYNC
  runtimeConfig: {
    stravaClientId: '',
    stravaClientSecret: '',
    appUrl: '',
    dashboardPassword: '',
    dataDir: './data',
    syncIntervalMinutes: 60,
    detailSync: true,
  },
})
