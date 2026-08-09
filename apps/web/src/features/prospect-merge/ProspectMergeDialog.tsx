import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, GitMerge, LoaderCircle, RotateCcw, ShieldCheck } from 'lucide-react'

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
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToastAction } from '@/components/ui/toast'
import { useToast } from '@/hooks/use-toast'

import {
  type ProspectMergeFieldChoice,
  type ProspectMergeFieldKey,
  type ProspectMergeApplyResponse,
  useApplyProspectMerge,
  useProspectMergePreview,
  useUndoProspectMerge,
} from './api'

export type ProspectMergeDialogCandidate = {
  id: string
  label: string
  description?: string | null
}

type Props = {
  open: boolean
  candidates: ProspectMergeDialogCandidate[]
  recommendedCanonicalId?: string | null
  onOpenChange: (open: boolean) => void
  onMerged?: (result: ProspectMergeApplyResponse) => void | Promise<void>
}

const FIELD_GROUP_LABELS = {
  property: 'Property identity',
  brokerage: 'Broker workflow',
  contact: 'Company and contact',
  map: 'Map geometry',
  system: 'Provenance and enrichment',
} as const

const RELATIONSHIP_LABELS: Record<string, string> = {
  contactInteractions: 'Interactions',
  listingProspects: 'Listing links',
  opportunities: 'Opportunities',
  activityEvents: 'Activity events',
  salesActivityImports: 'Sales imports',
  emailProspectMatches: 'Email matches',
  propertyDossiers: 'Property dossiers',
  brokerageMemoryItems: 'Memory evidence',
  touches: 'Touches',
  activityEventLinks: 'Activity links',
  dossierEntityLinks: 'Dossier links',
  skillActivities: 'XP history',
}

function valueLabel(value: unknown): string {
  if (value == null || value === '') return 'Empty'
  if (typeof value === 'number') return new Intl.NumberFormat('en-CA', { maximumFractionDigits: 2 }).format(value)
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.length ? value.map(valueLabel).join(', ') : 'Empty'
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested != null && nested !== '' && !(Array.isArray(nested) && nested.length === 0))
    if (!entries.length) return 'Empty'
    return entries.map(([key, nested]) => `${key}: ${valueLabel(nested)}`).join(' / ')
  }
  return String(value)
}

function candidateLabel(candidates: ProspectMergeDialogCandidate[], id: string | null) {
  return candidates.find((candidate) => candidate.id === id)?.label || 'Prospect record'
}

function candidateDescription(candidates: ProspectMergeDialogCandidate[], id: string | null) {
  return candidates.find((candidate) => candidate.id === id)?.description || null
}

export function ProspectMergeDialog({ open, candidates, recommendedCanonicalId, onOpenChange, onMerged }: Props) {
  const { toast } = useToast()
  const [canonicalId, setCanonicalId] = useState<string | null>(null)
  const [duplicateId, setDuplicateId] = useState<string | null>(null)
  const [fieldChoices, setFieldChoices] = useState<Partial<Record<ProspectMergeFieldKey, ProspectMergeFieldChoice>>>({})
  const [confirmed, setConfirmed] = useState(false)
  const idempotencyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open || candidates.length < 2) return
    const nextCanonical = candidates.some((candidate) => candidate.id === recommendedCanonicalId)
      ? recommendedCanonicalId as string
      : candidates[0].id
    setCanonicalId(nextCanonical)
    setDuplicateId(candidates.find((candidate) => candidate.id !== nextCanonical)?.id || null)
    setFieldChoices({})
    setConfirmed(false)
    idempotencyRef.current = null
  }, [candidates, open, recommendedCanonicalId])

  const pairIsCurrent = Boolean(
    canonicalId
    && duplicateId
    && canonicalId !== duplicateId
    && candidates.some((candidate) => candidate.id === canonicalId)
    && candidates.some((candidate) => candidate.id === duplicateId),
  )
  const previewQuery = useProspectMergePreview(canonicalId, duplicateId, { enabled: open && pairIsCurrent })
  const preview = open && pairIsCurrent ? previewQuery.data : undefined

  useEffect(() => {
    if (!preview?.previewHash) return
    setFieldChoices(preview.defaultFieldChoices)
    setConfirmed(false)
    idempotencyRef.current = null
  }, [preview?.previewHash])

  const undoMerge = useUndoProspectMerge({
    onSuccess: () => {
      toast({
        title: 'Merge undone',
        description: 'Both prospect records and their pre-merge links were restored.',
      })
    },
    onError: (error) => toast({
      title: 'Could not undo the merge',
      description: error.message,
      variant: 'destructive',
    }),
  })

  const applyMerge = useApplyProspectMerge({
    onSuccess: async (result) => {
      toast({
        title: result.alreadyApplied ? 'Merge already saved' : 'Duplicate consolidated',
        description: 'The surviving prospect now owns the related history. The duplicate remains available as an audit redirect.',
        action: result.alreadyApplied ? undefined : (
          <ToastAction
            altText="Undo merge"
            onClick={() => undoMerge.mutate({ mergeEventId: result.mergeEventId, confirmUndo: true })}
          >
            Undo merge
          </ToastAction>
        ),
      })
      await onMerged?.(result)
      onOpenChange(false)
    },
    onError: (error) => toast({
      title: 'Could not consolidate prospects',
      description: error.message,
      variant: 'destructive',
    }),
  })

  const fieldsNeedingAttention = useMemo(() => (
    (preview?.fieldComparisons || []).filter((field) => field.conflict || field.defaultChoice !== 'canonical')
  ), [preview?.fieldComparisons])

  const matchingFields = useMemo(() => (
    (preview?.fieldComparisons || []).filter((field) => !field.conflict && field.defaultChoice === 'canonical')
  ), [preview?.fieldComparisons])

  const groupedFields = useMemo(() => {
    const result = new Map<string, NonNullable<typeof preview>['fieldComparisons']>()
    for (const field of fieldsNeedingAttention) {
      result.set(field.group, [...(result.get(field.group) || []), field])
    }
    return Array.from(result.entries())
  }, [fieldsNeedingAttention, preview])

  const relationshipTotals = useMemo(() => {
    let canonical = 0
    let duplicate = 0
    for (const counts of Object.values(preview?.relationshipCounts || {})) {
      canonical += counts.canonical
      duplicate += counts.duplicate
    }
    return { canonical, duplicate }
  }, [preview?.relationshipCounts])

  const relationshipRows = useMemo(() => Object.entries(preview?.relationshipCounts || {})
    .filter(([, counts]) => counts.canonical > 0 || counts.duplicate > 0)
    .map(([key, counts]) => ({
      key,
      label: RELATIONSHIP_LABELS[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2'),
      ...counts,
    })), [preview?.relationshipCounts])

  const selectCanonical = (nextCanonicalId: string) => {
    setCanonicalId(nextCanonicalId)
    if (duplicateId === nextCanonicalId) {
      setDuplicateId(candidates.find((candidate) => candidate.id !== nextCanonicalId)?.id || null)
    }
  }

  const submit = () => {
    if (!preview || !canonicalId || !duplicateId || !confirmed || !preview.canApply) return
    const completeChoices = { ...preview.defaultFieldChoices, ...fieldChoices }
    if (!idempotencyRef.current) idempotencyRef.current = crypto.randomUUID()
    applyMerge.mutate({
      canonicalProspectId: canonicalId,
      duplicateProspectId: duplicateId,
      previewHash: preview.previewHash,
      idempotencyKey: idempotencyRef.current,
      confirmConflicts: true,
      fieldChoices: completeChoices,
    })
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && applyMerge.isPending) return
    onOpenChange(nextOpen)
  }

  const conflictCount = preview?.fieldComparisons.filter((field) => field.conflict).length || 0
  const canonicalName = candidateLabel(candidates, canonicalId)
  const duplicateName = candidateLabel(candidates, duplicateId)
  const actionLabel = `Merge ${duplicateName} into ${canonicalName}`

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="grid max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-4xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 lg:left-[calc(50%+7rem)] lg:w-[calc(100vw-16rem)]"
        onEscapeKeyDown={(event) => { if (applyMerge.isPending) event.preventDefault() }}
        onPointerDownOutside={(event) => { if (applyMerge.isPending) event.preventDefault() }}
      >
        <DialogHeader className="border-b border-slate-200 px-6 py-5 pr-12">
          <DialogTitle className="flex items-center gap-2"><GitMerge className="h-5 w-5 text-blue-700" />Consolidate duplicate prospects</DialogTitle>
          <DialogDescription>
            Choose the surviving record and resolve its conflicting fields. Related history moves in one transaction; the duplicate is retained as a redirect, never deleted.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0">
          <div className="space-y-5 px-6 py-5">
            <section className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="merge-canonical">Surviving record</label>
                <Select value={canonicalId || undefined} onValueChange={selectCanonical} disabled={applyMerge.isPending}>
                  <SelectTrigger id="merge-canonical" className="mt-2 bg-white"><SelectValue placeholder="Choose survivor" /></SelectTrigger>
                  <SelectContent>
                    {candidates.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>{candidate.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {candidateDescription(candidates, canonicalId) ? <p className="mt-2 text-xs font-medium text-slate-700">{candidateDescription(candidates, canonicalId)}</p> : null}
                <p className="mt-2 text-xs text-slate-500">This ID and its map pin survive.</p>
              </div>
              <ArrowRight className="hidden h-5 w-5 text-slate-400 lg:block" aria-hidden />
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="merge-duplicate">Duplicate to archive</label>
                <Select value={duplicateId || undefined} onValueChange={setDuplicateId} disabled={applyMerge.isPending}>
                  <SelectTrigger id="merge-duplicate" className="mt-2 bg-white"><SelectValue placeholder="Choose duplicate" /></SelectTrigger>
                  <SelectContent>
                    {candidates.filter((candidate) => candidate.id !== canonicalId).map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>{candidate.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {candidateDescription(candidates, duplicateId) ? <p className="mt-2 text-xs font-medium text-slate-700">{candidateDescription(candidates, duplicateId)}</p> : null}
                <p className="mt-2 text-xs text-slate-500">Its source fields remain in the immutable audit snapshot.</p>
              </div>
            </section>

            {previewQuery.isLoading ? (
              <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900" role="status" aria-live="polite">
                <LoaderCircle className="h-4 w-4 animate-spin" />Tracing both records and their relationships
              </div>
            ) : null}

            {previewQuery.error ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{previewQuery.error.message}</div>
            ) : null}

            {preview ? (
              <>
                <section className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended survivor</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{candidateLabel(candidates, preview.recommendation.prospectId)}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{preview.recommendation.reasons.join(' / ')}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Relationships retained</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{relationshipTotals.canonical + relationshipTotals.duplicate} total</p>
                    <p className="mt-1 text-xs text-slate-500">{relationshipTotals.duplicate} will move from the duplicate.</p>
                  </div>
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Merge behavior</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-950"><ShieldCheck className="h-4 w-4 text-teal-700" />No deletion and no XP</p>
                    <p className="mt-1 text-xs text-slate-500">A stale preview or partial relationship move rolls back.</p>
                  </div>
                </section>

                {relationshipRows.length ? (
                  <details className="rounded-md border border-slate-200">
                    <summary className="cursor-pointer px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      History by relationship ({relationshipRows.length})
                    </summary>
                    <div className="grid gap-2 border-t border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-3">
                      {relationshipRows.map((relationship) => (
                        <div key={relationship.key} className="flex items-center justify-between gap-3 rounded border border-slate-100 bg-slate-50 px-2.5 py-2 text-xs">
                          <span className="font-medium text-slate-700">{relationship.label}</span>
                          <span className="shrink-0 text-slate-500">
                            {relationship.canonical + relationship.duplicate} retained
                            {relationship.duplicate ? ` · ${relationship.duplicate} moving` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}

                {preview.blockers.length ? (
                  <section className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-950" role="alert">
                    <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Merge blocked</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
                      {preview.blockers.map((blocker) => <li key={blocker.code}>{blocker.message}</li>)}
                    </ul>
                  </section>
                ) : null}

                <section>
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-950">Field-by-field survivor</h3>
                      <p className="mt-0.5 text-xs text-slate-500">Conflicting values default to the surviving record. Empty survivor fields may safely inherit the duplicate value.</p>
                    </div>
                    <Badge variant="outline" className="rounded bg-slate-50 text-slate-700">
                      {fieldsNeedingAttention.length} field{fieldsNeedingAttention.length === 1 ? '' : 's'} to review
                    </Badge>
                  </div>

                  <div className="mt-3 space-y-5">
                    {fieldsNeedingAttention.length === 0 ? (
                      <div className="rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950">
                        The records match across the compared fields. Confirm the survivor and relationship history below.
                      </div>
                    ) : null}
                    {groupedFields.map(([group, fields]) => (
                      <fieldset key={group} className="rounded-lg border border-slate-200">
                        <legend className="ml-3 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {FIELD_GROUP_LABELS[group as keyof typeof FIELD_GROUP_LABELS]}
                        </legend>
                        <div className="divide-y divide-slate-200">
                          {fields.map((field) => (
                            <div key={field.key} className={field.conflict ? 'bg-amber-50/50 p-3' : 'p-3'}>
                              <div className="grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)_210px] lg:items-start">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">{field.label}</p>
                                  {field.conflict ? <Badge variant="outline" className="mt-1 rounded border-amber-200 bg-amber-50 text-[10px] text-amber-800">Conflict</Badge> : null}
                                </div>
                                <div className="grid gap-2 text-xs sm:grid-cols-2">
                                  <div className="rounded border border-slate-200 bg-white p-2">
                                    <p className="font-semibold text-slate-500">Survivor value</p>
                                    <p className="mt-1 break-words leading-5 text-slate-800">{valueLabel(field.canonicalValue)}</p>
                                  </div>
                                  <div className="rounded border border-slate-200 bg-white p-2">
                                    <p className="font-semibold text-slate-500">Duplicate value</p>
                                    <p className="mt-1 break-words leading-5 text-slate-800">{valueLabel(field.duplicateValue)}</p>
                                  </div>
                                </div>
                                <Select
                                  value={fieldChoices[field.key] || field.defaultChoice}
                                  onValueChange={(value) => setFieldChoices((current) => ({
                                    ...current,
                                    [field.key]: value as ProspectMergeFieldChoice,
                                  }))}
                                  disabled={applyMerge.isPending}
                                >
                                  <SelectTrigger aria-label={`Choose ${field.label}`} className="bg-white"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="canonical">Keep survivor value</SelectItem>
                                    <SelectItem value="duplicate">Use duplicate value</SelectItem>
                                    {field.allowCombine ? <SelectItem value="combine">Combine unique notes</SelectItem> : null}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                    {matchingFields.length ? (
                      <details className="rounded-md border border-slate-200 bg-slate-50">
                        <summary className="cursor-pointer px-3 py-3 text-sm font-semibold text-slate-800">
                          No decision needed ({matchingFields.length}) · survivor values will be kept
                        </summary>
                        <div className="grid gap-2 border-t border-slate-200 px-3 py-3 text-xs text-slate-600 sm:grid-cols-2">
                          {matchingFields.map((field) => <span key={field.key}>{field.label}</span>)}
                        </div>
                      </details>
                    ) : null}
                  </div>
                </section>

                <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                  <Checkbox
                    id="confirm-prospect-merge"
                    checked={confirmed}
                    onCheckedChange={(value) => setConfirmed(value === true)}
                    disabled={!preview.canApply || applyMerge.isPending}
                    className="mt-0.5"
                  />
                  <Label htmlFor="confirm-prospect-merge" className="cursor-pointer font-normal leading-5 text-blue-950">
                    <span className="font-semibold">
                      {conflictCount
                        ? `I reviewed ${conflictCount} conflict${conflictCount === 1 ? '' : 's'} and the surviving record.`
                        : 'I reviewed both records and the surviving values.'}
                    </span>{' '}
                    Consolidate the duplicate in one transaction and retain its original record as an audit redirect.
                  </Label>
                </div>
              </>
            ) : null}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col gap-2 border-t border-slate-200 px-6 py-4 sm:flex-row sm:gap-0">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)} disabled={applyMerge.isPending}>Cancel</Button>
          {previewQuery.error ? (
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void previewQuery.refetch()}>
              <RotateCcw className="h-4 w-4" />Refresh preview
            </Button>
          ) : null}
          <Button
            type="button"
            className="h-auto min-h-10 w-full min-w-0 py-2 sm:w-auto"
            onClick={submit}
            disabled={!preview?.canApply || !confirmed || applyMerge.isPending}
            aria-busy={applyMerge.isPending}
            aria-label={applyMerge.isPending ? 'Consolidating duplicate map records' : actionLabel}
          >
            {applyMerge.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            <span className="max-w-[min(62vw,32rem)] whitespace-normal text-center leading-4">{applyMerge.isPending ? 'Consolidating…' : actionLabel}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
