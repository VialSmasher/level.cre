import { useMemo, useRef, useState } from 'react'
import { AlertCircle, Database, FileJson2, Layers3, Search, ShieldCheck, Upload } from 'lucide-react'

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
  parseCurrentProjectsMarketMemory,
  resolveMarketMemoryAgainstProspects,
  type CurrentProjectsMarketMemoryPreview,
  type MarketMemoryAnchor,
} from '@/lib/currentProjectsMarketMemory'
import type { Prospect } from '@level-cre/shared/schema'

type Props = {
  open: boolean
  prospects: Prospect[]
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

export function MarketMemoryPreviewDialog({
  open,
  prospects,
  onOpenChange,
  onPreviewReady,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<CurrentProjectsMarketMemoryPreview | null>(null)
  const [search, setSearch] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)

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

  const counts = useMemo(() => {
    const anchors = preview?.anchors || []
    return {
      existing: anchors.filter((anchor) => anchor.previewLayer === 'existing').length,
      memory: anchors.filter((anchor) => anchor.previewLayer === 'market_memory').length,
      review: anchors.filter((anchor) => anchor.previewLayer === 'review').length,
    }
  }, [preview])

  const reset = () => {
    setFileName('')
    setPreview(null)
    setSearch('')
    setParseError(null)
    setIsParsing(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  const loadFile = async (file: File | null) => {
    if (!file) return
    setIsParsing(true)
    setParseError(null)
    setPreview(null)
    try {
      const parsed = parseCurrentProjectsMarketMemory(await file.text())
      const resolved = {
        ...parsed,
        anchors: resolveMarketMemoryAgainstProspects(parsed.anchors, prospects),
      }
      if (resolved.anchors.length !== resolved.expectedAnchors) {
        throw new Error(`The file expects ${resolved.expectedAnchors} property anchors, but ${resolved.anchors.length} were resolved. Nothing was loaded.`)
      }
      setFileName(file.name)
      setPreview(resolved)
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Could not read that market-memory file.')
    } finally {
      setIsParsing(false)
    }
  }

  const showOnMap = () => {
    if (!preview) return
    onPreviewReady(preview)
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-5 pr-12">
          <DialogTitle>Preview brokerage memory on the map</DialogTitle>
          <DialogDescription>
            Collapse title identities into canonical property anchors, compare them with existing records, and inspect the result without writing to Level CRE.
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
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              disabled={isParsing}
              onClick={() => fileInputRef.current?.click()}
            >
              {isParsing ? <Database className="h-4 w-4 animate-pulse" /> : <Upload className="h-4 w-4" />}
              Choose enriched JSON
            </Button>

            {fileName ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start gap-2">
                  <FileJson2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900">{fileName}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {preview?.sourceIdentities || 0} title identities → {preview?.anchors.length || 0} property anchors
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-950">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="h-4 w-4" />
                No-write preview
              </div>
              <p className="mt-1">The file stays in this browser tab. Existing prospects are matched, not duplicated, and no database record changes until a later merge is approved.</p>
            </div>

            {preview ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border border-teal-200 bg-teal-50 p-2">
                  <div className="text-lg font-semibold text-teal-900">{counts.existing}</div>
                  <div className="text-[10px] font-medium uppercase tracking-wide text-teal-700">Existing</div>
                </div>
                <div className="rounded-md border border-blue-200 bg-blue-50 p-2">
                  <div className="text-lg font-semibold text-blue-900">{counts.memory}</div>
                  <div className="text-[10px] font-medium uppercase tracking-wide text-blue-700">Memory</div>
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
                  <div className="text-lg font-semibold text-amber-900">{counts.review}</div>
                  <div className="text-[10px] font-medium uppercase tracking-wide text-amber-700">Review</div>
                </div>
              </div>
            ) : null}

            {parseError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>File not loaded</AlertTitle>
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <div className="min-w-0">
            {preview ? (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search address, owner, legal, zoning, project, or neighbourhood"
                    className="pl-9"
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                  <span>{visibleAnchors.length} visible</span>
                  <span>{preview.sourceIdentities} identities collapsed to {preview.anchors.length} anchors</span>
                </div>
                <ScrollArea className="mt-3 h-[430px] rounded-md border border-slate-200">
                  <div className="divide-y divide-slate-200">
                    {visibleAnchors.map((anchor) => (
                      <div key={anchor.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-950">{anchor.address}</p>
                            <p className="mt-1 text-xs text-slate-600">
                              {[anchor.neighbourhood, anchor.zoning.join(' / '), anchor.parcelAreaAcres == null ? null : `${anchor.parcelAreaAcres.toFixed(2)} ac`].filter(Boolean).join(' · ') || 'Parcel details available in story'}
                            </p>
                          </div>
                          <Badge variant="outline" className={layerBadgeClass(anchor)}>{layerLabel(anchor)}</Badge>
                        </div>
                        <p className="mt-2 text-[11px] leading-4 text-slate-500">
                          {anchor.projects.join(' · ')} / {anchor.legalIdentities.length} title identit{anchor.legalIdentities.length === 1 ? 'y' : 'ies'}
                        </p>
                        {anchor.resolution?.topCandidate ? (
                          <p className="mt-1 text-[11px] leading-4 text-teal-700">
                            Candidate: {anchor.resolution.topCandidate.label} ({Math.round(anchor.resolution.topCandidate.confidence)}% confidence)
                          </p>
                        ) : null}
                      </div>
                    ))}
                    {visibleAnchors.length === 0 ? (
                      <div className="px-4 py-10 text-center text-sm text-slate-500">No property anchors match that search.</div>
                    ) : null}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex min-h-[430px] flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-8 text-center">
                <Layers3 className="h-8 w-8 text-slate-400" />
                <h3 className="mt-3 text-sm font-semibold text-slate-900">Choose the Current Projects Edmonton JSON</h3>
                <p className="mt-1 max-w-md text-xs leading-5 text-slate-600">
                  Level CRE will validate the source, collapse shared coordinates into one property anchor, and compare all anchors with the live map before displaying anything.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-slate-200 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={!preview} onClick={showOnMap}>
            <Layers3 className="h-4 w-4" />
            {preview ? `Show ${preview.anchors.length} on map — no writes` : 'Show on map'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
