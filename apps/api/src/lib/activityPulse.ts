export type ActivityPulseInput = {
  date?: unknown
  createdAt?: unknown
  type?: unknown
  sourceProvider?: unknown
}

export type ActivityPulseDay = {
  date: string
  label: string
  email: number
  call: number
  meeting: number
  other: number
  total: number
}

export type ActivityPulse = {
  days: number
  total: number
  activeDays: number
  streakDays: number
  automated: number
  manual: number
  currentPeriodTotal: number
  previousPeriodTotal: number
  trendPercent: number
  series: ActivityPulseDay[]
}

type ActivityCategory = 'email' | 'call' | 'meeting' | 'other'

function datePartsInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const part = (type: 'year' | 'month' | 'day') => parts.find((item) => item.type === type)?.value || '00'
  return { year: part('year'), month: part('month'), day: part('day') }
}

function dateKeyInTimeZone(value: Date, timeZone: string) {
  const { year, month, day } = datePartsInTimeZone(value, timeZone)
  return `${year}-${month}-${day}`
}

function dayKeysEndingAt(now: Date, days: number, timeZone: string) {
  const { year, month, day } = datePartsInTimeZone(now, timeZone)
  const localTodayAsUtc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(localTodayAsUtc)
    date.setUTCDate(date.getUTCDate() - (days - index - 1))
    return date.toISOString().slice(0, 10)
  })
}

function activityCategory(value: unknown): ActivityCategory {
  const type = String(value || '').trim().toLowerCase()
  if (type.includes('email') || type.includes('mail')) return 'email'
  if (type.includes('call') || type.includes('phone')) return 'call'
  if (type.includes('meeting') || type.includes('tour') || type.includes('showing')) return 'meeting'
  return 'other'
}

function dayLabel(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  return new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date)
}

function parseActivityDate(row: ActivityPulseInput) {
  const value = row.date || row.createdAt
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isFinite(date.getTime()) ? date : null
}

export function buildActivityPulse(
  rows: ActivityPulseInput[],
  options: { days?: number; now?: Date; timeZone?: string } = {},
): ActivityPulse {
  const days = Math.min(Math.max(Math.trunc(options.days || 28), 14), 90)
  const now = options.now || new Date()
  const timeZone = options.timeZone || 'America/Edmonton'
  const keys = dayKeysEndingAt(now, days, timeZone)
  const keySet = new Set(keys)
  const byDate = new Map<string, ActivityPulseDay>(keys.map((date) => [date, {
    date,
    label: dayLabel(date),
    email: 0,
    call: 0,
    meeting: 0,
    other: 0,
    total: 0,
  }]))

  let automated = 0
  let manual = 0
  for (const row of rows) {
    const activityDate = parseActivityDate(row)
    if (!activityDate) continue
    const key = dateKeyInTimeZone(activityDate, timeZone)
    if (!keySet.has(key)) continue
    const day = byDate.get(key)
    if (!day) continue
    const category = activityCategory(row.type)
    day[category] += 1
    day.total += 1
    const provider = String(row.sourceProvider || '').trim().toLowerCase()
    if (provider && provider !== 'manual') automated += 1
    else manual += 1
  }

  const series = keys.map((key) => byDate.get(key)!)
  const total = series.reduce((sum, day) => sum + day.total, 0)
  const activeDays = series.filter((day) => day.total > 0).length
  let streakIndex = series.length - 1
  if (series[streakIndex]?.total === 0) streakIndex -= 1
  let streakDays = 0
  while (streakIndex >= 0 && series[streakIndex].total > 0) {
    streakDays += 1
    streakIndex -= 1
  }

  const periodDays = Math.floor(days / 2)
  const currentPeriod = series.slice(-periodDays)
  const previousPeriod = series.slice(-(periodDays * 2), -periodDays)
  const currentPeriodTotal = currentPeriod.reduce((sum, day) => sum + day.total, 0)
  const previousPeriodTotal = previousPeriod.reduce((sum, day) => sum + day.total, 0)
  const trendPercent = previousPeriodTotal === 0
    ? (currentPeriodTotal > 0 ? 100 : 0)
    : Math.round(((currentPeriodTotal - previousPeriodTotal) / previousPeriodTotal) * 100)

  return {
    days,
    total,
    activeDays,
    streakDays,
    automated,
    manual,
    currentPeriodTotal,
    previousPeriodTotal,
    trendPercent,
    series,
  }
}
