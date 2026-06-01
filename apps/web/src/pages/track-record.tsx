import { useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TRACK_RECORD_STORAGE_KEY, parseTrackRecordNumber } from '@/lib/trackRecordMetrics'
import {
  Building2,
  CalendarClock,
  Copy,
  Download,
  EyeOff,
  FileSpreadsheet,
  ImagePlus,
  Linkedin,
  Plus,
  Printer,
  Search,
  Share2,
  ShieldCheck,
  SquarePen,
  Trash2,
  Trophy,
  Upload,
} from 'lucide-react'

type TrackDeal = {
  id: string
  sourceId?: string
  title: string
  address: string
  clientName?: string
  dealType: 'lease' | 'sale' | 'renewal' | 'unknown'
  role: 'tenant_rep' | 'landlord_rep' | 'buyer_rep' | 'seller_rep' | 'advisor'
  assetType: 'Industrial' | 'Office' | 'Retail' | 'Land' | 'Other'
  sizeSf?: string
  acres?: string
  submarket?: string
  closedDate?: string
  leaseExpiryDate?: string
  renewalNoticeDate?: string
  value?: string
  summary?: string
  imageUrls: string[]
  isFeatured: boolean
  createdAt: string
  updatedAt: string
}

type DealImportResult = {
  deals: TrackDeal[]
  skippedRows: number
}

const emptyDeal = (): TrackDeal => ({
  id: crypto.randomUUID(),
  title: '',
  address: '',
  clientName: '',
  dealType: 'lease',
  role: 'tenant_rep',
  assetType: 'Industrial',
  sizeSf: '',
  acres: '',
  submarket: '',
  closedDate: '',
  leaseExpiryDate: '',
  renewalNoticeDate: '',
  value: '',
  summary: '',
  imageUrls: [],
  isFeatured: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

function parseNumber(value?: string) {
  return parseTrackRecordNumber(value)
}

function formatNumber(value?: string | number) {
  const n = typeof value === 'number' ? value : parseNumber(value)
  return n > 0 ? n.toLocaleString() : '0'
}

function roleLabel(role: TrackDeal['role']) {
  return {
    tenant_rep: 'Tenant Rep',
    landlord_rep: 'Landlord Rep',
    buyer_rep: 'Buyer Rep',
    seller_rep: 'Seller Rep',
    advisor: 'Advisor',
  }[role]
}

function dateSoon(value?: string) {
  if (!value) return false
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return false
  const diffDays = (time - Date.now()) / 86400000
  return diffDays >= 0 && diffDays <= 180
}

function dealTypeLabel(dealType: TrackDeal['dealType']) {
  return {
    lease: 'Lease',
    sale: 'Sale',
    renewal: 'Renewal',
    unknown: 'Needs Review',
  }[dealType]
}

function clean(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeHeader(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function normalizeCsvRow(row: unknown[]) {
  return row.map((value) => clean(value))
}

function findHeaderRow(rows: unknown[][]) {
  return rows.findIndex((row) => {
    const headers = row.map(normalizeHeader)
    return headers.includes('dealname') || headers.includes('lotplan') || headers.includes('squarefeet')
  })
}

function fieldValue(row: string[], headers: string[], aliases: string[]) {
  const aliasSet = new Set(aliases.map(normalizeHeader))
  const index = headers.findIndex((header) => aliasSet.has(header))
  return index >= 0 ? clean(row[index]) : ''
}

function toIsoDate(value: string) {
  if (!value) return ''
  const excelSerial = Number(value)
  if (Number.isFinite(excelSerial) && excelSerial > 25000 && excelSerial < 60000) {
    const utcDays = Math.floor(excelSerial - 25569)
    const date = new Date(utcDays * 86400000)
    return date.toISOString().slice(0, 10)
  }
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : ''
}

function inferDealType(rowText: string): TrackDeal['dealType'] {
  const text = rowText.toLowerCase()
  if (text.includes('renew') || text.includes('extension')) return 'renewal'
  if (text.includes('sublease') || text.includes('sub-lease') || text.includes('lease')) return 'lease'
  if (text.includes('sale') || text.includes('sold') || text.includes('purchase') || text.includes('acquisition') || text.includes('disposition')) return 'sale'
  return 'unknown'
}

function inferRole(rowText: string): TrackDeal['role'] {
  const text = rowText.toLowerCase()
  if (text.includes('buyer')) return 'buyer_rep'
  if (text.includes('seller')) return 'seller_rep'
  if (text.includes('landlord')) return 'landlord_rep'
  if (text.includes('tenant')) return 'tenant_rep'
  return 'advisor'
}

function inferAssetType(value: string): TrackDeal['assetType'] {
  const text = value.toLowerCase()
  if (text.includes('office')) return 'Office'
  if (text.includes('retail')) return 'Retail'
  if (text.includes('land')) return 'Land'
  if (text.includes('industrial')) return 'Industrial'
  return 'Other'
}

function parseTrackRecordRows(rows: unknown[][]): DealImportResult {
  const rawRows = rows.filter((row) => Array.isArray(row) && row.some((cell) => clean(cell)))
  const headerRowIndex = findHeaderRow(rawRows)
  if (headerRowIndex < 0) {
    throw new Error('Could not find a header row. Expected columns like Deal Name, Lot & Plan, Square Feet, or Close Date.')
  }

  const headers = normalizeCsvRow(rawRows[headerRowIndex]).map(normalizeHeader)
  const dataRows = rawRows.slice(headerRowIndex + 1).map(normalizeCsvRow)
  const now = new Date().toISOString()
  let skippedRows = 0

  const deals = dataRows.flatMap((row) => {
    const tradeNumber = fieldValue(row, headers, ['Trade #', 'Trade Number', 'Deal #', 'Transaction ID'])
    const dealName = fieldValue(row, headers, ['Deal Name', 'Name', 'Project', 'Client'])
    const lotPlan = fieldValue(row, headers, ['Lot & Plan', 'Address', 'Property', 'Property Address', 'Location'])
    const city = fieldValue(row, headers, ['City', 'Municipality', 'Market'])
    const closeDate = toIsoDate(fieldValue(row, headers, ['Close Date', 'Closed Date', 'Date', 'Completion Date']))
    const sellingPrice = fieldValue(row, headers, ['Selling Price', 'Sale Price', 'Price', 'Value', 'Deal Value'])
    const squareFeet = fieldValue(row, headers, ['Square Feet', 'Square Footage', 'SF', 'Size SF', 'Size'])
    const acres = fieldValue(row, headers, ['Acres', 'Land Acres'])
    const propertyType = fieldValue(row, headers, ['Property Type', 'Asset Type', 'Type'])
    const division = fieldValue(row, headers, ['Division Report', 'Division', 'Report'])
    const rowText = row.join(' ')
    const title = dealName || lotPlan
    const address = [lotPlan, city].filter(Boolean).join(', ')

    if (!title || !address) {
      skippedRows += 1
      return []
    }

    return [{
      ...emptyDeal(),
      id: crypto.randomUUID(),
      sourceId: tradeNumber ? `trade-${tradeNumber}` : undefined,
      title,
      address,
      clientName: dealName && lotPlan ? dealName.replace(/^PL\s*-\s*/i, '') : '',
      dealType: inferDealType(rowText),
      role: inferRole(rowText),
      assetType: inferAssetType(propertyType || division),
      sizeSf: squareFeet,
      acres,
      submarket: city,
      closedDate: closeDate,
      value: sellingPrice ? `$${formatNumber(sellingPrice)}` : '',
      summary: propertyType ? `${propertyType.trim()} transaction${city ? ` in ${city}` : ''}.` : '',
      imageUrls: [],
      isFeatured: true,
      createdAt: now,
      updatedAt: now,
    } satisfies TrackDeal]
  })

  return { deals, skippedRows }
}

function parseTrackRecordCsv(file: File): Promise<DealImportResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: 'greedy',
      complete: (result) => {
        try {
          resolve(parseTrackRecordRows(result.data || []))
        } catch (error) {
          reject(error)
        }
      },
      error: (error) => reject(error),
    })
  })
}

async function parseTrackRecordWorkbook(file: File): Promise<DealImportResult> {
  const data = await file.arrayBuffer()
  const workbook = XLSX.read(data, { type: 'array', cellDates: true })

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' })
    if (findHeaderRow(rows) >= 0) {
      return parseTrackRecordRows(rows)
    }
  }

  throw new Error('Could not find a usable deal sheet in this workbook.')
}

function isImportableDealFile(file: File) {
  const name = file.name.toLowerCase()
  return name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')
}

function readImageDataUrls(files: FileList | File[], limit = 4): Promise<string[]> {
  return Promise.all(
    Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, limit)
      .map((file) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = reject
        reader.readAsDataURL(file)
      })),
  )
}

function normalizeStoredDeal(deal: TrackDeal): TrackDeal {
  const isImportedReportDeal = deal.sourceId?.startsWith('trade-')
  const hasLeaseTiming = Boolean(deal.leaseExpiryDate || deal.renewalNoticeDate)
  const dealValue = parseNumber(deal.value)
  const looksManuallyReviewed = Boolean(deal.updatedAt && deal.createdAt && deal.updatedAt !== deal.createdAt)
  const textEvidence = [deal.title, deal.address, deal.summary].join(' ').toLowerCase()
  const hasLeaseEvidence = textEvidence.includes('lease') || textEvidence.includes('sublease') || textEvidence.includes('sub-lease')
  const hasRenewalEvidence = textEvidence.includes('renew') || textEvidence.includes('extension')
  const hasSaleEvidence = ['sale', 'sold', 'purchase', 'acquisition', 'disposition'].some((value) => textEvidence.includes(value))

  const looksLikeImportedUnknown =
    isImportedReportDeal &&
    deal.dealType === 'lease' &&
    dealValue <= 0 &&
    !hasLeaseTiming

  const looksLikeLegacyValueBasedLease =
    isImportedReportDeal &&
    deal.dealType === 'lease' &&
    !hasLeaseTiming &&
    !hasLeaseEvidence &&
    !looksManuallyReviewed

  const looksLikeLegacyValueBasedSale =
    isImportedReportDeal &&
    deal.dealType === 'sale' &&
    !hasSaleEvidence &&
    !hasLeaseEvidence &&
    !hasRenewalEvidence &&
    !hasLeaseTiming &&
    !looksManuallyReviewed

  if (isImportedReportDeal && deal.dealType === 'sale' && hasLeaseEvidence && !looksManuallyReviewed) return { ...deal, dealType: 'lease' }
  if (isImportedReportDeal && hasRenewalEvidence && !looksManuallyReviewed) return { ...deal, dealType: 'renewal' }
  if (looksLikeImportedUnknown) return { ...deal, dealType: 'unknown' }
  if (looksLikeLegacyValueBasedLease) return { ...deal, dealType: 'unknown' }
  if (looksLikeLegacyValueBasedSale) return { ...deal, dealType: 'unknown' }
  return deal
}

function buildLinkedInSummary(dealCount: number, totalSf: number) {
  return `Representative industrial transaction experience: ${dealCount} completed assignments totaling ${formatNumber(totalSf)} SF across sale, lease, and renewal mandates.`
}

export default function TrackRecordPage() {
  const [deals, setDeals] = useState<TrackDeal[]>([])
  const [form, setForm] = useState<TrackDeal>(() => emptyDeal())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'manage' | 'presentation'>('manage')
  const [importMessage, setImportMessage] = useState('')
  const [isImportDragging, setIsImportDragging] = useState(false)
  const [showClientNames, setShowClientNames] = useState(false)
  const [showDealValues, setShowDealValues] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const csvInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TRACK_RECORD_STORAGE_KEY)
      if (raw) setDeals((JSON.parse(raw) as TrackDeal[]).map(normalizeStoredDeal))
    } catch {
      setDeals([])
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(TRACK_RECORD_STORAGE_KEY, JSON.stringify(deals))
  }, [deals])

  const totals = useMemo(() => {
    const totalSf = deals.reduce((sum, deal) => sum + parseNumber(deal.sizeSf), 0)
    const leaseCount = deals.filter((deal) => deal.dealType === 'lease').length
    const saleCount = deals.filter((deal) => deal.dealType === 'sale').length
    const renewalCount = deals.filter((deal) => deal.dealType === 'renewal').length
    const unknownCount = deals.filter((deal) => deal.dealType === 'unknown').length
    const expiries = deals.filter((deal) => dateSoon(deal.leaseExpiryDate) || dateSoon(deal.renewalNoticeDate)).length
    return { totalSf, leaseCount, saleCount, renewalCount, unknownCount, expiries }
  }, [deals])

  const filteredDeals = useMemo(() => {
    const q = query.trim().toLowerCase()
    return deals
      .filter((deal) => !q || [deal.title, deal.address, deal.clientName, deal.submarket, deal.summary].some((value) => String(value || '').toLowerCase().includes(q)))
      .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || String(b.closedDate || '').localeCompare(String(a.closedDate || '')))
  }, [deals, query])

  const featuredDeals = useMemo(() => filteredDeals.filter((deal) => deal.isFeatured), [filteredDeals])

  const reset = () => {
    setForm(emptyDeal())
    setEditingId(null)
  }

  const save = () => {
    if (!form.title.trim() || !form.address.trim()) return
    const payload = { ...form, updatedAt: new Date().toISOString() }
    setDeals((current) => editingId ? current.map((deal) => deal.id === editingId ? payload : deal) : [payload, ...current])
    reset()
  }

  const edit = (deal: TrackDeal) => {
    setForm(deal)
    setEditingId(deal.id)
    setMode('manage')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const remove = (id: string) => {
    if (confirm('Delete this track record deal?')) {
      setDeals((current) => current.filter((deal) => deal.id !== id))
      if (editingId === id) reset()
    }
  }

  const clearImportedDeals = () => {
    const importedCount = deals.filter((deal) => deal.sourceId?.startsWith('trade-')).length
    if (!importedCount) {
      setImportMessage('No imported report deals to clear.')
      return
    }
    if (confirm(`Remove ${importedCount} imported report deals? Manually added deals will stay.`)) {
      setDeals((current) => current.filter((deal) => !deal.sourceId?.startsWith('trade-')))
      setImportMessage(`Removed ${importedCount} imported report deals. You can re-upload the workbook now.`)
    }
  }

  const addImages = async (files: FileList | null) => {
    if (!files?.length) return
    const urls = await readImageDataUrls(files)
    setForm((current) => ({ ...current, imageUrls: [...current.imageUrls, ...urls].slice(0, 8) }))
  }

  const addImagesToDeal = async (dealId: string, files: FileList | null) => {
    if (!files?.length) return
    const urls = await readImageDataUrls(files)
    if (!urls.length) return
    setDeals((current) => current.map((deal) => (
      deal.id === dealId
        ? { ...deal, imageUrls: [...deal.imageUrls, ...urls].slice(0, 8), updatedAt: new Date().toISOString() }
        : deal
    )))
    setImportMessage(`Added ${urls.length} photo${urls.length === 1 ? '' : 's'} to the deal.`)
  }

  const removeDealImage = (dealId: string, imageIndex: number) => {
    setDeals((current) => current.map((deal) => (
      deal.id === dealId
        ? { ...deal, imageUrls: deal.imageUrls.filter((_, index) => index !== imageIndex), updatedAt: new Date().toISOString() }
        : deal
    )))
  }

  const importDealFile = async (file: File | undefined) => {
    if (!file) return
    if (!isImportableDealFile(file)) {
      setImportMessage('Drop a CSV or Excel workbook exported from your deal report.')
      return
    }

    try {
      const fileName = file.name.toLowerCase()
      const result = fileName.endsWith('.csv')
        ? await parseTrackRecordCsv(file)
        : await parseTrackRecordWorkbook(file)
      let duplicateCount = 0
      const seen = new Set(deals.map((deal) => deal.sourceId || `${deal.title}|${deal.address}|${deal.closedDate}`.toLowerCase()))
      const newDeals = result.deals.filter((deal) => {
        const key = deal.sourceId || `${deal.title}|${deal.address}|${deal.closedDate}`.toLowerCase()
        if (seen.has(key)) {
          duplicateCount += 1
          return false
        }
        seen.add(key)
        return true
      })
      setDeals([...newDeals, ...deals])
      setImportMessage(`Imported ${result.deals.length - duplicateCount} deals. Skipped ${duplicateCount + result.skippedRows} duplicate or incomplete rows.`)
    } catch (error: any) {
      setImportMessage(error?.message || 'CSV import failed.')
    } finally {
      if (csvInputRef.current) csvInputRef.current.value = ''
    }
  }

  const importDroppedDealFile = (files: FileList) => {
    const file = Array.from(files).find(isImportableDealFile) || files[0]
    importDealFile(file)
  }

  const share = async () => {
    const text = buildLinkedInSummary(featuredDeals.length || deals.length, totals.totalSf)
    if (navigator.share) {
      await navigator.share({ title: 'Broker Track Record', text })
    } else {
      await navigator.clipboard?.writeText(text)
      setImportMessage('Client-safe summary copied.')
    }
  }

  const copyLinkedInSummary = async () => {
    await navigator.clipboard?.writeText(buildLinkedInSummary(featuredDeals.length || deals.length, totals.totalSf))
    setImportMessage('LinkedIn-ready summary copied.')
  }

  return (
    <div
      className="min-h-screen bg-slate-100 px-4 py-6 print:bg-white"
      onDragEnter={(event) => {
        if (Array.from(event.dataTransfer.items || []).some((item) => item.kind === 'file')) {
          event.preventDefault()
          setIsImportDragging(true)
        }
      }}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.items || []).some((item) => item.kind === 'file')) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setIsImportDragging(true)
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsImportDragging(false)
        }
      }}
      onDrop={(event) => {
        event.preventDefault()
        setIsImportDragging(false)
        importDroppedDealFile(event.dataTransfer.files)
      }}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm print:border-0 print:shadow-none md:flex-row md:items-end md:justify-between">
          <div>
            {mode === 'presentation' ? (
              <>
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  <ShieldCheck className="h-4 w-4" />
                  Client-safe portfolio
                </p>
                <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">Representative Industrial Track Record</h1>
                <p className="mt-2 max-w-3xl text-base leading-7 text-slate-600">
                  A curated view of completed assignments, market coverage, and transaction experience for client conversations and public profile updates.
                </p>
              </>
            ) : (
              <>
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                  <Trophy className="h-4 w-4" />
                  Private deal ledger
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Broker Track Record</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                  Capture closed deals, track lease expiries, and decide what is polished enough for a client-facing brag sheet.
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <input ref={csvInputRef} type="file" accept=".csv,text/csv,.xlsx,.xls" className="hidden" onChange={(e) => importDealFile(e.target.files?.[0])} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="outline" onClick={() => csvInputRef.current?.click()} aria-label="Import CSV">
                  <FileSpreadsheet className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Import CSV</TooltipContent>
            </Tooltip>
            <ToggleGroup type="single" value={mode} onValueChange={(value) => value && setMode(value as 'manage' | 'presentation')}>
              <ToggleGroupItem value="manage" className="h-9 px-3 text-xs">Private Ledger</ToggleGroupItem>
              <ToggleGroupItem value="presentation" className="h-9 px-3 text-xs">Client Sheet</ToggleGroupItem>
            </ToggleGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="outline" onClick={share} aria-label="Share summary">
                  <Share2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Share summary</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="outline" onClick={() => window.print()} aria-label="Print track record">
                  <Printer className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Print</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className={mode === 'presentation' ? 'border-emerald-200 bg-white' : ''}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">{mode === 'presentation' ? 'SF Represented' : 'Total SF'}</CardTitle></CardHeader>
            <CardContent className="text-3xl font-semibold text-slate-950">{formatNumber(totals.totalSf)}</CardContent>
          </Card>
          <Card className={mode === 'presentation' ? 'border-emerald-200 bg-white' : ''}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">{mode === 'presentation' ? 'Representative Deals' : 'Deal Mix'}</CardTitle></CardHeader>
            <CardContent className={mode === 'presentation' ? 'text-3xl font-semibold text-slate-950' : 'space-y-2'}>
              {mode === 'presentation' ? (
                featuredDeals.length
              ) : (
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <div className="text-2xl font-semibold text-slate-950">{totals.saleCount}</div>
                    <div className="text-xs font-medium text-slate-500">Sales</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-slate-950">{totals.leaseCount}</div>
                    <div className="text-xs font-medium text-slate-500">Leases</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-slate-950">{totals.renewalCount}</div>
                    <div className="text-xs font-medium text-slate-500">Renewals</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-slate-950">{totals.unknownCount}</div>
                    <div className="text-xs font-medium text-slate-500">Review</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card className={mode === 'presentation' ? 'border-emerald-200 bg-white' : ''}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">{mode === 'presentation' ? 'Markets Covered' : 'Expiry Watch'}</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-2 text-3xl font-semibold text-slate-950">
              {mode === 'presentation' ? new Set(featuredDeals.map((deal) => deal.submarket).filter(Boolean)).size : totals.expiries}
              {mode === 'presentation' ? <Building2 className="h-5 w-5 text-emerald-600" /> : <CalendarClock className="h-5 w-5 text-amber-600" />}
            </CardContent>
          </Card>
        </div>

        {mode === 'manage' && (
          <section className="grid gap-5 lg:grid-cols-[420px_1fr] print:hidden">
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {editingId ? <SquarePen className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                  {editingId ? 'Edit deal' : 'Add deal'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <Label>Deal Name</Label>
                    <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Acme Logistics renewal" />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Address</Label>
                    <Input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder="123 Industrial Way" />
                  </div>
                  <div>
                    <Label>Client</Label>
                    <Input value={form.clientName || ''} onChange={(e) => setForm((p) => ({ ...p, clientName: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Submarket</Label>
                    <Input value={form.submarket || ''} onChange={(e) => setForm((p) => ({ ...p, submarket: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Deal Type</Label>
                    <Select value={form.dealType} onValueChange={(value) => setForm((p) => ({ ...p, dealType: value as TrackDeal['dealType'] }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lease">Lease</SelectItem>
                        <SelectItem value="sale">Sale</SelectItem>
                        <SelectItem value="renewal">Renewal</SelectItem>
                        <SelectItem value="unknown">Needs Review</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Role</Label>
                    <Select value={form.role} onValueChange={(value) => setForm((p) => ({ ...p, role: value as TrackDeal['role'] }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tenant_rep">Tenant Rep</SelectItem>
                        <SelectItem value="landlord_rep">Landlord Rep</SelectItem>
                        <SelectItem value="buyer_rep">Buyer Rep</SelectItem>
                        <SelectItem value="seller_rep">Seller Rep</SelectItem>
                        <SelectItem value="advisor">Advisor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Asset</Label>
                    <Select value={form.assetType} onValueChange={(value) => setForm((p) => ({ ...p, assetType: value as TrackDeal['assetType'] }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Industrial">Industrial</SelectItem>
                        <SelectItem value="Office">Office</SelectItem>
                        <SelectItem value="Retail">Retail</SelectItem>
                        <SelectItem value="Land">Land</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Size SF</Label>
                    <Input inputMode="numeric" value={form.sizeSf || ''} onChange={(e) => setForm((p) => ({ ...p, sizeSf: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Closed Date</Label>
                    <Input type="date" value={form.closedDate || ''} onChange={(e) => setForm((p) => ({ ...p, closedDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Lease Expiry</Label>
                    <Input type="date" value={form.leaseExpiryDate || ''} onChange={(e) => setForm((p) => ({ ...p, leaseExpiryDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Renewal Notice</Label>
                    <Input type="date" value={form.renewalNoticeDate || ''} onChange={(e) => setForm((p) => ({ ...p, renewalNoticeDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Deal Value</Label>
                    <Input value={form.value || ''} onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))} placeholder="$2.4M / $15.00 PSF" />
                  </div>
                </div>
                <div>
                  <Label>Client-Facing Summary</Label>
                  <Textarea rows={3} value={form.summary || ''} onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))} placeholder="Negotiated renewal and expansion for..." />
                </div>
                <div
                  className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center"
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    addImages(e.dataTransfer.files)
                  }}
                >
                  <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addImages(e.target.files)} />
                  <ImagePlus className="mx-auto h-6 w-6 text-slate-500" />
                  <p className="mt-2 text-sm font-medium text-slate-700">Drop property photos here</p>
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />
                    Add Images
                  </Button>
                </div>
                {form.imageUrls.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {form.imageUrls.map((url, index) => (
                      <button key={`${url}-${index}`} type="button" className="aspect-square overflow-hidden rounded-md border border-slate-200" onClick={() => setForm((p) => ({ ...p, imageUrls: p.imageUrls.filter((_, i) => i !== index) }))}>
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button onClick={save} disabled={!form.title.trim() || !form.address.trim()}>
                    <Download className="mr-2 h-4 w-4" />
                    {editingId ? 'Update' : 'Save'}
                  </Button>
                  <Button variant="outline" onClick={reset}>Reset</Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div
                className={`rounded-lg border border-dashed p-4 text-sm transition-colors ${
                  isImportDragging
                    ? 'border-emerald-500 bg-emerald-100 text-emerald-950'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-950'
                }`}
                onDragEnter={(event) => {
                  event.preventDefault()
                  setIsImportDragging(true)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'copy'
                  setIsImportDragging(true)
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setIsImportDragging(false)
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  setIsImportDragging(false)
                  importDroppedDealFile(event.dataTransfer.files)
                }}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold">Import a deal report</p>
                    <p className="mt-1 text-emerald-800">
                      Drag and drop a CSV or Excel workbook anywhere on this page. Rows without a clear sale, lease, sublease, renewal, or extension clue land in Needs Review instead of being guessed.
                    </p>
                    {importMessage && <p className="mt-2 font-medium">{importMessage}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="border-emerald-300 bg-white" onClick={() => csvInputRef.current?.click()}>
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Import File
                    </Button>
                    <Button variant="outline" className="border-red-200 bg-white text-red-700 hover:bg-red-50 hover:text-red-800" onClick={clearImportedDeals}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Clear Imported
                    </Button>
                  </div>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input className="pl-9" placeholder="Search track record" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <DealGrid deals={filteredDeals} onEdit={edit} onDelete={remove} onAddImages={addImagesToDeal} onRemoveImage={removeDealImage} />
            </div>
          </section>
        )}

        {mode === 'presentation' && (
          <section className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-white p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-950">Selected Track Record</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                    Featured deals only. Confidential details are hidden by default, so this is closer to what you would share with a client or adapt for LinkedIn.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
                    {!showClientNames && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1"><EyeOff className="h-3.5 w-3.5" />Client names hidden</span>}
                    {!showDealValues && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1"><EyeOff className="h-3.5 w-3.5" />Deal values hidden</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 print:hidden">
                  <Button variant="outline" size="sm" onClick={() => setShowClientNames((value) => !value)}>
                    {showClientNames ? 'Hide Clients' : 'Show Clients'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowDealValues((value) => !value)}>
                    {showDealValues ? 'Hide Values' : 'Show Values'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={copyLinkedInSummary}>
                    <Linkedin className="mr-2 h-4 w-4" />
                    LinkedIn Copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={copyLinkedInSummary}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Summary
                  </Button>
                </div>
              </div>
            </div>
            <DealGrid deals={featuredDeals} presentation showClientNames={showClientNames} showDealValues={showDealValues} />
          </section>
        )}
      </div>
    </div>
  )
}

function DealGrid({
  deals,
  onEdit,
  onDelete,
  onAddImages,
  onRemoveImage,
  presentation = false,
  showClientNames = true,
  showDealValues = true,
}: {
  deals: TrackDeal[]
  onEdit?: (deal: TrackDeal) => void
  onDelete?: (id: string) => void
  onAddImages?: (id: string, files: FileList | null) => void
  onRemoveImage?: (id: string, imageIndex: number) => void
  presentation?: boolean
  showClientNames?: boolean
  showDealValues?: boolean
}) {
  if (deals.length === 0) {
    return <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No track record deals yet.</div>
  }

  return (
    <div className={presentation ? 'grid gap-5 md:grid-cols-2 xl:grid-cols-3' : 'grid gap-4 md:grid-cols-2 xl:grid-cols-3'}>
      {deals.map((deal) => {
        const imageInputId = `deal-images-${deal.id}`

        return (
        <Card
          key={deal.id}
          className={presentation ? 'overflow-hidden border-emerald-100 bg-white shadow-sm' : 'overflow-hidden transition-colors hover:border-emerald-200'}
          onDragOver={(event) => {
            if (presentation || !onAddImages) return
            event.preventDefault()
            event.stopPropagation()
            event.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(event) => {
            if (presentation || !onAddImages) return
            event.preventDefault()
            event.stopPropagation()
            onAddImages(deal.id, event.dataTransfer.files)
          }}
        >
          {deal.imageUrls[0] ? (
            <div className="relative">
              <img src={deal.imageUrls[0]} alt="" className={presentation ? 'h-52 w-full object-cover' : 'h-44 w-full object-cover'} />
              {!presentation && onAddImages && (
                <label htmlFor={imageInputId} className="absolute bottom-3 right-3 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/70 bg-white/95 text-slate-700 shadow-sm hover:bg-emerald-50" aria-label="Add deal photos">
                  <ImagePlus className="h-4 w-4" />
                </label>
              )}
            </div>
          ) : (
            <div className={presentation ? 'flex h-52 items-center justify-center bg-emerald-50 text-emerald-700' : 'flex h-44 flex-col items-center justify-center gap-2 border-b border-dashed border-slate-300 bg-slate-50 text-slate-500'}>
              {presentation ? (
                <Building2 className="h-10 w-10" />
              ) : (
                <>
                  <ImagePlus className="h-8 w-8" />
                  <label htmlFor={imageInputId} className="cursor-pointer text-sm font-medium text-slate-700 hover:text-emerald-700">Drop photos or click to add</label>
                </>
              )}
            </div>
          )}
          {!presentation && onAddImages && (
            <input id={imageInputId} type="file" accept="image/*" multiple className="hidden" onChange={(event) => {
              onAddImages(deal.id, event.target.files)
              event.currentTarget.value = ''
            }} />
          )}
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className={presentation ? 'text-xl leading-tight text-slate-950' : 'text-lg leading-tight'}>{deal.title}</CardTitle>
                <p className="mt-1 text-sm text-slate-500">{deal.address}</p>
              </div>
              {!presentation && (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => onEdit?.(deal)} aria-label="Edit deal"><SquarePen className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-red-600" onClick={() => onDelete?.(deal.id)} aria-label="Delete deal"><Trash2 className="h-4 w-4" /></Button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{dealTypeLabel(deal.dealType)}</Badge>
              <Badge variant="outline">{roleLabel(deal.role)}</Badge>
              <Badge variant="outline">{deal.assetType}</Badge>
              {deal.isFeatured && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Featured</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            {!presentation && deal.imageUrls.length > 1 && (
              <div className="grid grid-cols-5 gap-1.5">
                {deal.imageUrls.slice(1).map((url, index) => (
                  <button
                    key={`${url}-${index}`}
                    type="button"
                    className="aspect-square overflow-hidden rounded border border-slate-200 hover:border-red-300"
                    title="Remove photo"
                    onClick={() => onRemoveImage?.(deal.id, index + 1)}
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-slate-500">Size</span><br />{formatNumber(deal.sizeSf)} SF</div>
              <div><span className="text-slate-500">Closed</span><br />{deal.closedDate || 'TBD'}</div>
            </div>
            {deal.clientName && showClientNames && <div><span className="text-slate-500">Client</span><br />{deal.clientName}</div>}
            {deal.value && showDealValues && <div><span className="text-slate-500">Value</span><br />{deal.value}</div>}
            {!showClientNames && presentation && <div className="rounded-md bg-slate-50 p-2 text-slate-500">Client confidential</div>}
            {presentation ? null : (deal.leaseExpiryDate || deal.renewalNoticeDate) && (
              <div className={dateSoon(deal.leaseExpiryDate) || dateSoon(deal.renewalNoticeDate) ? 'rounded-md bg-amber-50 p-2 text-amber-900' : ''}>
                Expiry: {deal.leaseExpiryDate || 'n/a'}{deal.renewalNoticeDate ? ` | Notice: ${deal.renewalNoticeDate}` : ''}
              </div>
            )}
            {deal.summary && <p className="leading-6 text-slate-600">{deal.summary}</p>}
          </CardContent>
        </Card>
        )
      })}
    </div>
  )
}
