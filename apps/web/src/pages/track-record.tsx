import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Building2,
  CalendarClock,
  Download,
  ImagePlus,
  Plus,
  Printer,
  Search,
  Share2,
  SquarePen,
  Trash2,
  Trophy,
  Upload,
} from 'lucide-react'

type TrackDeal = {
  id: string
  title: string
  address: string
  clientName?: string
  dealType: 'lease' | 'sale' | 'renewal'
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

const STORAGE_KEY = 'level-cre.track-record.v1'

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
  const n = Number(String(value || '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
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

export default function TrackRecordPage() {
  const [deals, setDeals] = useState<TrackDeal[]>([])
  const [form, setForm] = useState<TrackDeal>(() => emptyDeal())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'manage' | 'presentation'>('manage')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setDeals(JSON.parse(raw))
    } catch {
      setDeals([])
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deals))
  }, [deals])

  const totals = useMemo(() => {
    const totalSf = deals.reduce((sum, deal) => sum + parseNumber(deal.sizeSf), 0)
    const leaseCount = deals.filter((deal) => deal.dealType === 'lease' || deal.dealType === 'renewal').length
    const expiries = deals.filter((deal) => dateSoon(deal.leaseExpiryDate) || dateSoon(deal.renewalNoticeDate)).length
    return { totalSf, leaseCount, expiries }
  }, [deals])

  const filteredDeals = useMemo(() => {
    const q = query.trim().toLowerCase()
    return deals
      .filter((deal) => !q || [deal.title, deal.address, deal.clientName, deal.submarket, deal.summary].some((value) => String(value || '').toLowerCase().includes(q)))
      .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || String(b.closedDate || '').localeCompare(String(a.closedDate || '')))
  }, [deals, query])

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

  const addImages = async (files: FileList | null) => {
    if (!files?.length) return
    const readers = Array.from(files).slice(0, 4).map((file) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(file)
    }))
    const urls = await Promise.all(readers)
    setForm((current) => ({ ...current, imageUrls: [...current.imageUrls, ...urls].slice(0, 8) }))
  }

  const share = async () => {
    const text = `Track record: ${deals.length} deals, ${formatNumber(totals.totalSf)} SF tracked.`
    if (navigator.share) {
      await navigator.share({ title: 'Broker Track Record', text })
    } else {
      await navigator.clipboard?.writeText(text)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 print:bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm print:border-0 print:shadow-none md:flex-row md:items-end md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
              <Trophy className="h-4 w-4" />
              Tool C
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Broker Track Record</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Capture closed deals, track lease expiries, and keep a client-facing brag sheet ready.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <ToggleGroup type="single" value={mode} onValueChange={(value) => value && setMode(value as 'manage' | 'presentation')}>
              <ToggleGroupItem value="manage" className="h-9 px-3 text-xs">Manage</ToggleGroupItem>
              <ToggleGroupItem value="presentation" className="h-9 px-3 text-xs">Presentation</ToggleGroupItem>
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
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Total SF</CardTitle></CardHeader>
            <CardContent className="text-3xl font-semibold text-slate-950">{formatNumber(totals.totalSf)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Lease Deals</CardTitle></CardHeader>
            <CardContent className="text-3xl font-semibold text-slate-950">{totals.leaseCount}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Expiry Watch</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-2 text-3xl font-semibold text-slate-950">
              {totals.expiries}
              <CalendarClock className="h-5 w-5 text-amber-600" />
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
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
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
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input className="pl-9" placeholder="Search track record" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <DealGrid deals={filteredDeals} onEdit={edit} onDelete={remove} />
            </div>
          </section>
        )}

        {mode === 'presentation' && (
          <section className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-950">Selected Track Record</h2>
                  <p className="text-sm text-slate-600">A concise client-facing view of representative deal experience.</p>
                </div>
                <div className="text-sm font-semibold text-slate-700">{formatNumber(totals.totalSf)} SF represented</div>
              </div>
            </div>
            <DealGrid deals={filteredDeals.filter((deal) => deal.isFeatured)} presentation />
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
  presentation = false,
}: {
  deals: TrackDeal[]
  onEdit?: (deal: TrackDeal) => void
  onDelete?: (id: string) => void
  presentation?: boolean
}) {
  if (deals.length === 0) {
    return <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No track record deals yet.</div>
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {deals.map((deal) => (
        <Card key={deal.id} className="overflow-hidden">
          {deal.imageUrls[0] ? (
            <img src={deal.imageUrls[0]} alt="" className="h-44 w-full object-cover" />
          ) : (
            <div className="flex h-44 items-center justify-center bg-slate-200 text-slate-500">
              <Building2 className="h-10 w-10" />
            </div>
          )}
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg leading-tight">{deal.title}</CardTitle>
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
              <Badge variant="secondary">{deal.dealType}</Badge>
              <Badge variant="outline">{roleLabel(deal.role)}</Badge>
              <Badge variant="outline">{deal.assetType}</Badge>
              {deal.isFeatured && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Featured</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-slate-500">Size</span><br />{formatNumber(deal.sizeSf)} SF</div>
              <div><span className="text-slate-500">Closed</span><br />{deal.closedDate || 'TBD'}</div>
            </div>
            {deal.clientName && <div><span className="text-slate-500">Client</span><br />{deal.clientName}</div>}
            {deal.value && <div><span className="text-slate-500">Value</span><br />{deal.value}</div>}
            {(deal.leaseExpiryDate || deal.renewalNoticeDate) && (
              <div className={dateSoon(deal.leaseExpiryDate) || dateSoon(deal.renewalNoticeDate) ? 'rounded-md bg-amber-50 p-2 text-amber-900' : ''}>
                Expiry: {deal.leaseExpiryDate || 'n/a'}{deal.renewalNoticeDate ? ` | Notice: ${deal.renewalNoticeDate}` : ''}
              </div>
            )}
            {deal.summary && <p className="leading-6 text-slate-600">{deal.summary}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
