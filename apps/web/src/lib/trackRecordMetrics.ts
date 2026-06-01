export const TRACK_RECORD_STORAGE_KEY = 'level-cre.track-record.v1'

type TrackRecordMetricDeal = {
  dealType?: string
  sizeSf?: string
  closedDate?: string
}

export type TrackRecordMetrics = {
  totalDeals: number
  totalSf: number
  leasedDeals: number
  leasedSf: number
  saleDeals: number
  saleSf: number
  renewalDeals: number
  reviewDeals: number
}

export function parseTrackRecordNumber(value?: string | number) {
  const n = Number(String(value || '').replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function emptyTrackRecordMetrics(): TrackRecordMetrics {
  return {
    totalDeals: 0,
    totalSf: 0,
    leasedDeals: 0,
    leasedSf: 0,
    saleDeals: 0,
    saleSf: 0,
    renewalDeals: 0,
    reviewDeals: 0,
  }
}

export function calculateTrackRecordMetrics(deals: TrackRecordMetricDeal[]): TrackRecordMetrics {
  return deals.reduce((metrics, deal) => {
    const size = parseTrackRecordNumber(deal.sizeSf)
    const dealType = deal.dealType || 'unknown'

    metrics.totalDeals += 1
    metrics.totalSf += size

    if (dealType === 'lease') {
      metrics.leasedDeals += 1
      metrics.leasedSf += size
    } else if (dealType === 'sale') {
      metrics.saleDeals += 1
      metrics.saleSf += size
    } else if (dealType === 'renewal') {
      metrics.renewalDeals += 1
      metrics.leasedSf += size
    } else {
      metrics.reviewDeals += 1
    }

    return metrics
  }, emptyTrackRecordMetrics())
}

export function readTrackRecordMetrics(): TrackRecordMetrics {
  if (typeof window === 'undefined') return emptyTrackRecordMetrics()

  try {
    const raw = window.localStorage.getItem(TRACK_RECORD_STORAGE_KEY)
    const deals = raw ? JSON.parse(raw) : []
    return calculateTrackRecordMetrics(Array.isArray(deals) ? deals : [])
  } catch {
    return emptyTrackRecordMetrics()
  }
}
