const flagValue = (value: unknown) => String(value ?? '').trim().toLowerCase()

export const isEnabledFlag = (value: unknown) => {
  const normalized = flagValue(value)
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

const env = (import.meta as any).env ?? {}

export const INDUSTRIAL_INTEL_ENABLED = isEnabledFlag(env.VITE_ENABLE_INDUSTRIAL_INTEL)
export const TRACK_RECORD_ENABLED = isEnabledFlag(env.VITE_ENABLE_TRACK_RECORD)
export const LEADERBOARD_ENABLED = isEnabledFlag(env.VITE_ENABLE_LEADERBOARD)

