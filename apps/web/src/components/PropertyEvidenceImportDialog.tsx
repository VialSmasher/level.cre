import { useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, FileJson2, Loader2, Search, ShieldCheck, Upload } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { useToast } from '@/hooks/use-toast'
import {
  buildPropertyEvidenceBatch,
  parsePropertyEvidenceDryRun,
  type PropertyEvidenceDryRun,
} from '@/lib/propertyEvidenceImport'
import { apiRequest } from '@/lib/queryClient'

type ImportSummary = {
  imported: number
  inserted: number
  duplicates: number
  errors: number
  results: Array<{ eventId?: string; externalEventId?: string; inserted?: boolean; error?: string }>
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}

const MAX_REVIEW_CASES = 10

function eventTypeLabel(value: string) {
  if (value === 'title_pulled') return 'title'
  if (value === 'owner_identified') return 'owner'
  return 'note'
}

export function PropertyEvidenceImportDialog({ open, onOpenChange, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const [fileName, setFileName] = useState('')
  const [dryRun, setDryRun] = useState<PropertyEvidenceDryRun | null>(null)
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(() => new Set())
  const [search, setSearch] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)

  const visibleCases = useMemo(() => {
    if (!dryRun) return []
    const needle = search.trim().toLowerCase()
    if (!needle) return dryRun.cases
    return dryRun.cases.filter((item) => [
      item.caseId,
      item.folderName,
      item.verifiedAddress,
      item.groupLabel,
      ...item.candidateIds,
    ].filter(Boolean).join(' ').toLowerCase().includes(needle))
  }, [dryRun, search])

  const selectedEventCount = useMemo(() => {
    if (!dryRun) return 0
    return dryRun.cases.reduce((total, item) => (
      selectedCaseIds.has(item.caseId) ? total + item.eventDrafts.length : total
    ), 0)
  }, [dryRun, selectedCaseIds])

  const reset = () => {
    setFileName('')
    setDryRun(null)
    setSelectedCaseIds(new Set())
    setSearch('')
    setParseError(null)
    setIsParsing(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && importMutation.isPending) return
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  const loadFile = async (file: File | null) => {
    if (!file) return
    setIsParsing(true)
    setParseError(null)
    setDryRun(null)
    setSelectedCaseIds(new Set())
    try {
      const parsed = parsePropertyEvidenceDryRun(await file.text())
      setFileName(file.name)
      setDryRun(parsed)
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Could not read that evidence file.')
    } finally {
      setIsParsing(false)
    }
  }

  const toggleCase = (caseId: string, checked: boolean) => {
    setSelectedCaseIds((current) => {
      const next = new Set(current)
      if (checked) {
        if (next.has(caseId) || next.size < MAX_REVIEW_CASES) next.add(caseId)
      } else {
        next.delete(caseId)
      }
      return next
    })
  }

  const selectVisible = () => {
    setSelectedCaseIds((current) => {
      const next = new Set(current)
      for (const item of visibleCases) {
        if (next.size >= MAX_REVIEW_CASES) break
        if (item.eventDrafts.length > 0) next.add(item.caseId)
      }
      return next
    })
  }

  const importMutation = useMutation<ImportSummary, Error>({
    mutationFn: async () => {
      if (!dryRun) throw new Error('Choose an evidence dry-run file first.')
      const payload = buildPropertyEvidenceBatch(dryRun, selectedCaseIds)
      const response = await apiRequest('POST', '/api/agent/activity-events/batch', payload)
      return response.json()
    },
    onSuccess: (result) => {
      if (result.errors > 0) {
        onImported()
        toast({
          title: 'Some evidence needs retry',
          description: `${result.inserted} saved, ${result.duplicates} already present, ${result.errors} failed.`,
          variant: 'destructive',
        })
        return
      }
      toast({
        title: result.inserted > 0 ? 'Property evidence saved' : 'Evidence already up to date',
        description: `${result.inserted} saved and ${result.duplicates} duplicate${result.duplicates === 1 ? '' : 's'} safely skipped.`,
      })
      onImported()
      reset()
      onOpenChange(false)
    },
    onError: (error) => {
      const pendingApiRelease = /^404:/.test(error.message)
      toast({
        title: 'Evidence was not saved',
        description: pendingApiRelease
          ? 'The Level CRE API release that receives enrichment files is not deployed yet. Nothing was written.'
          : error.message,
        variant: 'destructive',
      })
    },
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-5 pr-12">
          <DialogTitle>Import property-title enrichment</DialogTitle>
          <DialogDescription>
            Load a Codex dry-run, choose the cases you want, and send only their evidence to Review.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-5 overflow-y-auto px-6 py-5 lg:grid-cols-[240px_minmax(0,1fr)]">
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
              disabled={isParsing || importMutation.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {isParsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Choose dry-run JSON
            </Button>
            {fileName ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start gap-2">
                  <FileJson2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900">{fileName}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {dryRun?.summary.cases || 0} cases / {dryRun?.summary.eventDrafts || 0} evidence events
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="h-4 w-4" />
                Review-first by design
              </div>
              <p className="mt-1">This step records evidence only, in batches of up to {MAX_REVIEW_CASES} cases. It cannot create a map pin, opportunity, activity credit, or XP.</p>
            </div>
            {parseError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>File not loaded</AlertTitle>
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <div className="min-w-0">
            {dryRun ? (
              <>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search property, address, case, or candidate"
                      className="pl-9"
                    />
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={selectVisible} disabled={!search.trim() || visibleCases.length === 0}>
                    Select filtered (max {MAX_REVIEW_CASES})
                  </Button>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                  <span>{visibleCases.length} visible</span>
                  <span>{selectedCaseIds.size} selected / {selectedEventCount} evidence events</span>
                </div>
                <ScrollArea className="mt-3 h-[420px] rounded-md border border-slate-200">
                  <div className="divide-y divide-slate-200">
                    {visibleCases.map((item) => {
                      const selected = selectedCaseIds.has(item.caseId)
                      const eventLabels = Array.from(new Set(item.eventDrafts.map((event) => eventTypeLabel(event.eventType))))
                      return (
                        <label key={item.caseId} className="flex cursor-pointer gap-3 px-4 py-3 hover:bg-slate-50">
                          <Checkbox
                            className="mt-1"
                            checked={selected}
                            disabled={item.eventDrafts.length === 0 || importMutation.isPending || (!selected && selectedCaseIds.size >= MAX_REVIEW_CASES)}
                            onCheckedChange={(checked) => toggleCase(item.caseId, checked === true)}
                            aria-label={`Select ${item.folderName}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-slate-950">{item.folderName}</span>
                              <Badge variant="outline" className="rounded text-[10px]">{item.groupLabel}</Badge>
                            </span>
                            <span className="mt-1 block text-xs text-slate-600">
                              {item.verifiedAddress || 'Property address is not yet verified'}
                            </span>
                            <span className="mt-1 block text-[11px] text-slate-500">
                              {item.eventDrafts.length} event{item.eventDrafts.length === 1 ? '' : 's'}: {eventLabels.join(', ') || 'none'}
                              {item.candidateIds.length ? ` / ${item.candidateIds.length} existing candidate${item.candidateIds.length === 1 ? '' : 's'}` : ' / no existing candidate'}
                            </span>
                            {item.noMapMutationReason ? (
                              <span className="mt-1 block text-[11px] leading-4 text-amber-700">{item.noMapMutationReason}</span>
                            ) : null}
                          </span>
                        </label>
                      )
                    })}
                    {visibleCases.length === 0 ? (
                      <div className="px-4 py-10 text-center text-sm text-slate-500">No cases match that search.</div>
                    ) : null}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-8 text-center">
                <FileJson2 className="h-8 w-8 text-slate-400" />
                <h3 className="mt-3 text-sm font-semibold text-slate-900">Choose the Codex dry-run JSON</h3>
                <p className="mt-1 max-w-sm text-xs leading-5 text-slate-600">
                  Level CRE validates the file locally first. No data is sent until you explicitly select cases and confirm the import.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-slate-200 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={importMutation.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!dryRun || selectedEventCount === 0 || importMutation.isPending}
            onClick={() => importMutation.mutate()}
          >
            {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {importMutation.isPending ? 'Saving evidence…' : `Send ${selectedEventCount} to Review`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
