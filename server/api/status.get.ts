export default defineEventHandler(async () => {
  const [meta, activities, health] = await Promise.all([getMeta(), getActivities(), getHealth()])
  const all = Object.values(activities)
  const cfg = useRuntimeConfig()
  const dir = importDir()
  return {
    passwordProtected: !!dashboardPassword(),
    activityCount: all.length,
    healthDays: Object.keys(health).length,
    sports: [...new Set(all.map(a => a.sport_type))].sort(),
    years: [...new Set(all.map(a => a.start_date_local.slice(0, 4)))].sort().reverse(),
    devices: [...new Set(all.map(a => a.device_name).filter(Boolean))],
    garmin: {
      available: garminAvailable(),
      loggedIn: garminTokensExist(),
      ...meta.garmin,
    },
    importDir: dir,
    sync: {
      lastSync: meta.lastSync,
      lastSyncError: meta.lastSyncError,
      lastImport: meta.lastImport,
      lastImportSummary: meta.lastImportSummary,
      ...syncState,
    },
    syncIntervalMinutes: Number(cfg.syncIntervalMinutes) || 0,
  }
})
