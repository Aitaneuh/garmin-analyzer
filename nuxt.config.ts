// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  devtools: { enabled: false },
  ssr: false, // pure client dashboard; the Nitro server handles imports, Garmin sync and stats
  css: ['~/assets/main.css', 'leaflet/dist/leaflet.css'],
  app: {
    head: {
      title: 'Garmin Analyzer',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'robots', content: 'noindex, nofollow' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  // Every value below can be overridden at runtime with an env var (NUXT_ + SCREAMING_SNAKE_CASE):
  // NUXT_DASHBOARD_PASSWORD, NUXT_DATA_DIR, NUXT_IMPORT_DIR, NUXT_SYNC_INTERVAL_MINUTES,
  // NUXT_GARMIN_HEALTH_DAYS, NUXT_GARMIN_MAX_DOWNLOADS, NUXT_GARMIN_HEALTH_BUDGET
  runtimeConfig: {
    dashboardPassword: '',
    dataDir: './data',
    importDir: '', // e.g. /import — a folder that is scanned for new .fit/.zip files
    syncIntervalMinutes: 60,
    garminHealthDays: 365, // how much health history to keep in sync
    garminMaxDownloads: 150, // activity files downloaded per sync (the first sync of a long history takes a few runs)
    garminHealthBudget: 45, // days of health history fetched per sync while back-filling
  },
})
