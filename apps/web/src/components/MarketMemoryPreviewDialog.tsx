import { useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Database, FileJson2, Layers3, Search, ShieldCheck, Upload } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  usePreviewPropertyMemoryImport,
  useStagePropertyMemoryImport,
  type PropertyMemoryPreviewResponse,
} from '@/features/property-memory/api'
import { parseCurrentProjectsMarketMemory, type CurrentProjectsMarketMemoryPreview, type MarketMemoryAnchor } from '@/lib/currentProjectsMarketMemory'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPreviewReady: (preview: CurrentProjectsMarketMemoryPreview) => void
}

function layerLabel(anchor: MarketMemoryAnchor) {
  if (anchor.previewLayer === 'existing') return 'Existing map record'
  if (anchor.previewLayer === 'review') return 'Needs review'
  return 'Market memory'
}

function layerBadgeClass(anchor: MarketMemoryAnchor) {
  if (anchor.previewLayer === 'existing') return 'border-teal-200 bg-teal-50 text-teal-800'
  if (anchor.previewLayer === 'review') return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-blue-200 bg-blue-50 text-blue-800'
}

export function MarketMemoryPreviewDialog({ open, onOpenChange, onPreviewReady }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null)
  const [serverPreview, setServerPreview] = useState<PropertyMemoryPreviewResponse | null>(null)
  const [search, setSearch] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  const previewMutation = usePreviewPropertyMemoryImport({
    onSuccess: (result) => setServerPreview(result),
    onError: (error) => setParseError(error.message),
  })
  const stageMutation = useStagePropertyMemoryImport({
    onSuccess: (result) => {
      onPreviewReady(result.preview)
      onOpenChange(false)
    },
    onError: (error) => setParseError(error.message),
  })

  const preview = serverPreview?.preview || null
  const visibleAnchors = useMemo(() => {
    if (!preview) return []
    const needle = search.trim().toLowerCase()
    if (!needle) return preview.anchors
    return preview.anchors.filter((anchor) => [
      anchor.address,
      ...anchor.alternateAddresses,
      ...anchor.projects,
      anchor.neighbourhood,
      ...anchor.zoning,
      ...anchor.accountNumbers,
      ...anchor.legalIdentities.flatMap((identity) => [
        identity.registeredOwner,
        identity.legalDescription,
        identity.linc,
        identity.titleNumber,
      ]),
    ].filter(Boolean).join(' ').toLowerCase().includes(needle))
  }, [preview, search])

  const counts = serverPreview?.summary || {
    identities: 0,
    anchors: 0,
    existing: 0,
    marketMemory: 0,
    review: 0,
    pending: 0,
  }

  const reset = () => {
    setFileName('')
    setPayload(null)
    setServerPreview(null)
    setSearch('')
    setParseError(null)
    previewMutation.reset()
    stageMutation.reset()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  const loadFile = async (file: File | null) => {
    if (!file) return
    setParseError(null)
    setServerPreview(null)
    stageMutation.reset()
    try {
      const text = await file.text()
      const parsedPayload = JSON.parse(text) as Record<string, unknown>
      const localCheck = parseCurrentProjectsMarketMemory(text)
      if (localCheck.anchors.length !== localCheck.expectedAnchors) {
        throw new Error(`The file expects ${localCheck.expectedAnchors} property anchors, but ${localCheck.anchors.length} were resolved.`)
      }
      setFileName(file.name)
      setPayload(parsedPayload)
      await previewMutation.mutateAsync({ sourceFileName: file.name, payload: parsedPayload })
    } catch (error) {
      setPayload(null)
      setParseError(error instanceof Error ? error.message : 'Could not preview that market-memory file.')
    }
  }

  const saveToReview = () => {
    if (!payload || !serverPreview?.sourceHash) return
    setParseError(null)
    stageMutation.mutate({
      sourceFileName: fileName,
      payload,
      previewHash: serverPreview.sourceHash,
    })
  }

  const isBusy = previewMutation.isPending || stageMutation.isPending

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-5 pr-12">
          <DialogTitle>Preview brokerage memory</DialogTitle>
          <DialogDescription>
            Validate and match the enriched title file first. Saving puts one proposal per canonical property in Today → Review; it does not change canonical property or prospect records.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-5 overflow-y-auto px-6 py-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(event) => void loadFile(event.target.files?.[0] || null)}
            />
            <Button type="button" variant="outline" className="w-full justify-start" disabled={isBusy} onClick={() => fileInputRef.current?.click()}>
              {isBusy ? <Database className="h-4 w-4 animate-pulse" /> : <Upload className="h-4 w-4" />}
              {previewMutation.isPending ? 'Checking live records…' : 'Choose enriched JSON'}
            </Button>

            {fileName ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start gap-2">
                  <FileJson2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900">{fileName}</p>
                    <p className="mt-1 text-xs text-slate-600">{counts.identities} title identities → {counts.anchors} property anchors</p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-950">
              <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" />Preview is read-only</div>
              <p className="mt-1">The server compares parcel, legal, address and coordinate evidence without writing. The separate save action creates review proposals only.</p>
            </div>

            {preview ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border border-teal-200 bg-teal-50 p-2"><div className="text-lg font-semibold text-teal-900">{counts.existing}</div><div className="text-[10px] font-medium uppercase tracking-wide text-teal-700">Existing</div></div>
                <div className="rounded-md border border-blue-200 bg-blue-50 p-2"><div className="text-lg font-semibold text-blue-900">{counts.marketMemory}</div><div className="text-[10px] font-medium uppercase tracking-wide text-blue-700">Memory</div></div>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2"><div className="text-lg font-semibold text-amber-900">{counts.review}</div><div className="text-[10px] font-medium uppercase tracking-wide text-amber-700">Review</div></div>
              </div>
            ) : null}

            {parseError ? (
              <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>{stageMutation.isError ? 'Needs retry' : 'File not ready'}</AlertTitle><AlertDescription>{parseError}</AlertDescription></Alert>
            ) : null}
            {stageMutation.isSuccess ? (
              <Alert><CheckCircle2 className="h-4 w-4" /><AlertTitle>Saved</AlertTitle><AlertDescription>The property proposals are durable in Review.</AlertDescription></Alert>
            ) : null}
          </div>

          <div className="min-w-0">
            {preview ? (
              <>
                <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search address, owner, legal, zoning, project, or neighbourhood" className="pl-9" /></div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-600"><span>{visibleAnchors.length} visible</span><span>{preview.sourceIdentities} identities collapsed to {preview.anchors.length} anchors</span></div>
                <ScrollArea className="mt-3 h-[430px] rounded-md border border-slate-200">
                  <div className="divide-y divide-slate-200">
                    {visibleAnchors.map((anchor) => (
                      <div key={anchor.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-950">{anchor.address}</p><p className="mt-1 text-xs text-slate-600">{[anchor.neighbourhood, anchor.zoning.join(' / '), anchor.parcelAreaAcres == null ? null : `${anchor.parcelAreaAcres.toFixed(2)} ac`].filter(Boolean).join(' · ') || 'Parcel details available in story'}</p></div>
                          <Badge variant="outline" className={layerBadgeClass(anchor)}>{layerLabel(anchor)}</Badge>
                        </div>
                        <p className="mt-2 text-[11px] leading-4 text-slate-500">{anchor.projects.join(' · ')} / {anchor.legalIdentities.length} title identit{anchor.legalIdentities.length === 1 ? 'y' : 'ies'}</p>
                        {anchor.resolution?.topCandidate ? <p className="mt-1 text-[11px] leading-4 text-teal-700">Candidate: {anchor.resolution.topCandidate.label} ({Math.round(anchor.resolution.topCandidate.confidence)}% confidence)</p> : null}
                      </div>
                    ))}
                    {visibleAnchors.length === 0 ? <div className="px-4 py-10 text-center text-sm text-slate-500">No property anchors match that search.</div> : null}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex min-h-[430px] flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-8 text-center">
                <Layers3 className="h-8 w-8 text-slate-400" />
                <h3 className="mt-3 text-sm font-semibold text-slate-900">Choose the Current Projects Edmonton JSON</h3>
                <p className="mt-1 max-w-md text-xs leading-5 text-slate-600">Level CRE will validate 60 title identities, resolve roughly 55 canonical parcel anchors, and compare them with the live database before anything can be saved.</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-slate-200 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={stageMutation.isPending}>Cancel</Button>
          <Button type="button" disabled={!preview || !payload || stageMutation.isPending} onClick={saveToReview}>
            <Layers3 className="h-4 w-4" />
            {stageMutation.isPending ? 'Saving…' : preview ? `Save ${preview.anchors.length} properties to Review` : 'Save to Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
