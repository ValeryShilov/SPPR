export const PACE_TYPES = new Set(['run', 'ski', 'skiroll', 'bike'])

export function calcPaceSpeed(
  durMin: number | string,
  distKm: number | string,
  workoutType: string,
): string | null {
  const d = Number(durMin)
  const km = Number(distKm)
  if (!d || !km || d <= 0 || km <= 0) return null
  if (workoutType === 'run') {
    const pace = d / km
    const mins = Math.floor(pace)
    const secs = Math.round((pace - mins) * 60)
    return `${mins}:${String(secs).padStart(2, '0')} мин/км`
  }
  return `${(km / (d / 60)).toFixed(1)} км/ч`
}
