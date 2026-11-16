/**
 * Chart colors are read from CSS custom properties so light/dark themes stay in one place.
 * Categorical slots follow a fixed order (validated for color-vision deficiency); colors follow
 * the sport (entity), never its rank, so filtering never repaints a sport.
 */
export function cssVar(name: string) {
  if (import.meta.server) return '#888'
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'
}

export const series = (slot: number) => cssVar(`--s${slot}`)

// Fixed sport -> slot assignments; everything else folds into "Other".
const SPORT_SLOT: Record<string, number> = {
  Ride: 1,
  VirtualRide: 1,
  Run: 2,
  TrailRun: 2,
  VirtualRun: 2,
  Swim: 3,
  Walk: 4,
  Hike: 6,
  WeightTraining: 7,
  Workout: 7,
  MountainBikeRide: 5,
  GravelRide: 5,
  AlpineSki: 8,
  NordicSki: 8,
  BackcountrySki: 8,
  Snowboard: 8,
}

export function sportColor(sport: string) {
  const slot = SPORT_SLOT[sport]
  return slot ? series(slot) : cssVar('--other')
}

/** Group key used when charts fold rare sports together. */
export function sportGroup(sport: string) {
  if (['Ride', 'VirtualRide'].includes(sport)) return 'Ride'
  if (['Run', 'TrailRun', 'VirtualRun'].includes(sport)) return 'Run'
  if (['MountainBikeRide', 'GravelRide'].includes(sport)) return 'MTB / Gravel'
  if (['WeightTraining', 'Workout'].includes(sport)) return 'Workout'
  if (['AlpineSki', 'NordicSki', 'BackcountrySki', 'Snowboard'].includes(sport)) return 'Snow'
  if (['Swim', 'Walk', 'Hike'].includes(sport)) return sport
  return 'Other'
}
export const GROUP_ORDER = ['Ride', 'Run', 'Swim', 'Walk', 'MTB / Gravel', 'Hike', 'Workout', 'Snow', 'Other']
export function groupColor(g: string) {
  const map: Record<string, string> = { Ride: 'Ride', Run: 'Run', Swim: 'Swim', Walk: 'Walk', 'MTB / Gravel': 'MountainBikeRide', Hike: 'Hike', Workout: 'Workout', Snow: 'AlpineSki' }
  return map[g] ? sportColor(map[g]) : cssVar('--other')
}

/** 6-step sequential ramp (one hue, light -> dark), index 0 = empty. */
export function seq(i: number) {
  return cssVar(`--seq-${Math.max(0, Math.min(5, i))}`)
}
