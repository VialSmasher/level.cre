// Calendar windows match the map's Edmonton day labels, including DST changes.
export function reportingWindowStart(now: Date, days: number): Date {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  const parts = (date: Date) => Object.fromEntries(format.formatToParts(date).map(part => [part.type, part.value]))
  const today = parts(now)
  const midnight = Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day) - days + 1)
  let candidate = midnight
  for (let attempt = 0; attempt < 3; attempt++) {
    const local = parts(new Date(candidate))
    const represented = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day), Number(local.hour), Number(local.minute), Number(local.second))
    candidate += midnight - represented
  }
  return new Date(candidate)
}
