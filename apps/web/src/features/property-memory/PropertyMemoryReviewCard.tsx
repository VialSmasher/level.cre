import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Archive, CheckCircle2, ChevronDown, GitMerge } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

import {
  DEFAULT_PROPERTY_MEMORY_FIELD_DECISIONS,
  type PropertyMemoryDecision,
  type PropertyMemoryFieldDecisions,
  type PropertyMemoryFieldGroup,
  type PropertyMemoryReviewItem,
} from './api'
import { propertyMemoryTargetFromValue } from './reviewDecision'

export type PropertyMemoryTargetOption = {
  kind: 'dossier' | 'prospect' | 'listing'
  id: string
  label: string
  description?: string | null
}

type Props = {
  item: PropertyMemoryReviewItem
  targetOptions?: PropertyMemoryTargetOption[]
  isPending?: boolean
  onApprove: (decision: PropertyMemoryDecision) => void
  onReject: (decision: PropertyMemoryDecision) => void
  onCompareDuplicates?: (prospectIds: string[]) => void
  showReject?: boolean
}

type FieldGroupDefinition = {
  key: PropertyMemoryFieldGroup
  label: string
  description: string
}

const FIELD_GROUPS: FieldGroupDefinition[] = [
  { key: 'location', label: 'Civic location', description: 'Address and verified coordinates' },
  { key: 'municipal', label: 'Municipal facts', description: 'Parcel size, zoning, neighbourhood and account' },
  { key: 'legal', label: 'Legal identity', description: 'Title, LINC, plan, block, lot and legal description' },
  { key: 'ownership', label: 'Dated ownership', description: 'Registered owner shown on each title snapshot' },
  { key: 'context', label: 'Brokerage context', description: 'Projects touched, review status and suggested use' },
]

const EMPTY_TARGET_OPTIONS: PropertyMemoryTargetOption[] = []

function targetValue(option: PropertyMemoryTargetOption) {
  return `${option.kind}:${option.id}`
}

function defaultTarget(item: PropertyMemoryReviewItem) {
  if (item.matchedDossierId) return `dossier:${item.matchedDossierId}`
  if (item.matchedProspectId) return `prospect:${item.matchedProspectId}`
  if (item.matchedListingId) return `listing:${item.matchedListingId}`
  return 'new'
}

function proposedValues(item: PropertyMemoryReviewItem, group: PropertyMemoryFieldGroup) {
  const anchor = item.anchor
  if (group === 'location') {
    return [anchor.address, `${anchor.latitude.toFixed(6)}, ${anchor.longitude.toFixed(6)}`]
  }
  if (group === 'municipal') {
    return [
      anchor.parcelAreaAcres == null ? null : `${anchor.parcelAreaAcres.toFixed(2)} acres`,
      anchor.zoning.join(' / '),
      anchor.neighbourhood,
      anchor.accountNumbers.length ? `Account ${anchor.accountNumbers.join(', ')}` : null,
    ].filter((value): value is string => Boolean(value))
  }
  if (group === 'legal') {
    return anchor.legalIdentities.flatMap((identity) => [
      identity.titleNumber ? `Title ${identity.titleNumber}` : null,
      identity.linc ? `LINC ${identity.linc}` : null,
      identity.legalDescription,
    ]).filter((value): value is string => Boolean(value))
  }
  if (group === 'ownership') {
    return anchor.legalIdentities.map((identity) => identity.registeredOwner).filter((value): value is string => Boolean(value))
  }
  return [
    anchor.projects.join(' / '),
    anchor.suggestedUses.join(' / '),
  ].filter(Boolean)
}

function reviewLabel(item: PropertyMemoryReviewItem) {
  if (item.suggestedLayer === 'existing') return 'Update property'
  if (item.suggestedLayer === 'review') return 'Needs review'
  return 'New property'
}

function FieldGroupRow({
  idPrefix,
  definition,
  checked,
  currentValues,
  proposed,
  onCheckedChange,
}: {
  idPrefix: string
  definition: FieldGroupDefinition
  checked: boolean
  currentValues: string[]
  proposed: string[]
  onCheckedChange: (checked: boolean) => void
}) {
  const required = definition.key === 'location'
  const inputId = `${idPrefix}-${definition.key}`
  const [open, setOpen] = useState(false)
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn('rounded-md border', checked ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200 bg-slate-50')}
    >
      <div className="flex min-h-12 items-center gap-2 px-3">
        <Checkbox
          id={inputId}
          checked={checked}
          disabled={required}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          aria-describedby={`${inputId}-description`}
        />
        <Label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer text-sm font-semibold text-slate-950">
          {definition.label}{required ? <span className="ml-1 font-normal text-slate-500">Required</span> : null}
        </Label>
        <span id={`${inputId}-description`} className="sr-only">{definition.description}</span>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 w-11 shrink-0 p-0"
            aria-label={`${open ? 'Hide' : 'Show'} ${definition.label.toLowerCase()} values`}
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="border-t border-slate-200 px-3 py-3">
          <p className="text-xs text-slate-500">{definition.description}</p>
          <div className={cn('mt-2 grid gap-3 text-xs', currentValues.length ? 'sm:grid-cols-2' : '')}>
            {currentValues.length ? (
              <div>
                <p className="font-semibold text-slate-500">Current</p>
                <p className="mt-1 whitespace-pre-line leading-5 text-slate-700">{currentValues.join('\n')}</p>
              </div>
            ) : null}
            <div>
              <p className="font-semibold text-slate-500">New</p>
              <p className="mt-1 whitespace-pre-line leading-5 text-slate-800">{proposed.join('\n') || 'No value supplied'}</p>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function PropertyMemoryReviewCard({
  item,
  targetOptions,
  isPending = false,
  onApprove,
  onReject,
  onCompareDuplicates,
  showReject = true,
}: Props) {
  const [fieldDecisions, setFieldDecisions] = useState<PropertyMemoryFieldDecisions>(() => ({
    ...DEFAULT_PROPERTY_MEMORY_FIELD_DECISIONS,
  }))
  const [selectedTarget, setSelectedTarget] = useState(() => defaultTarget(item))
  const [confirmConflicts, setConfirmConflicts] = useState(false)
  const [showTargetPicker, setShowTargetPicker] = useState(false)

  useEffect(() => {
    setFieldDecisions({ ...DEFAULT_PROPERTY_MEMORY_FIELD_DECISIONS })
    setSelectedTarget(defaultTarget(item))
    setConfirmConflicts(false)
    setShowTargetPicker(false)
  }, [item.id, item.matchedDossierId, item.matchedListingId, item.matchedProspectId])
  const displayedConflicts = useMemo(() => {
    const candidateConflicts = (item.resolution as {
      topCandidate?: { conflicts?: unknown }
    }).topCandidate?.conflicts
    const explicitConflicts = Array.isArray(candidateConflicts)
      ? candidateConflicts.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      : []
    const conflicts = Array.from(new Set([...item.reviewReasons, ...explicitConflicts]))
    if (item.suggestedLayer === 'review' && conflicts.length === 0) {
      conflicts.push('The existing-record match is ambiguous; compare the proposed evidence with the selected target before approval.')
    }
    return conflicts
  }, [item.resolution, item.reviewReasons, item.suggestedLayer])
  const requiresConflictConfirmation = displayedConflicts.length > 0
  const targets = targetOptions || EMPTY_TARGET_OPTIONS
  const duplicateProspectIds = useMemo(() => {
    const candidates = Array.isArray((item.resolution as { candidates?: unknown[] }).candidates)
      ? (item.resolution as { candidates: Array<Record<string, unknown>> }).candidates
      : []
    return Array.from(new Set(candidates.flatMap((candidate) => (
      candidate.entityType === 'prospect' && typeof candidate.id === 'string' ? [candidate.id] : []
    ))))
  }, [item.resolution])

  const availableTargets = useMemo(() => {
    const byValue = new Map<string, PropertyMemoryTargetOption>()
    for (const option of targets) byValue.set(targetValue(option), option)
    const candidates = Array.isArray((item.resolution as { candidates?: unknown[] }).candidates)
      ? (item.resolution as { candidates: Array<Record<string, unknown>> }).candidates
      : []
    for (const candidate of candidates) {
      const kind = candidate.entityType
      const id = candidate.id
      const label = candidate.label
      if ((kind === 'dossier' || kind === 'prospect' || kind === 'listing') && typeof id === 'string' && typeof label === 'string') {
        const option: PropertyMemoryTargetOption = {
          kind,
          id,
          label,
          description: typeof candidate.address === 'string' ? candidate.address : null,
        }
        byValue.set(targetValue(option), option)
      }
    }
    const addFallback = (kind: PropertyMemoryTargetOption['kind'], id: string | null, label: string) => {
      if (!id) return
      const value = `${kind}:${id}`
      if (!byValue.has(value)) byValue.set(value, { kind, id, label })
    }
    addFallback('dossier', item.matchedDossierId, 'Matched property dossier')
    addFallback('prospect', item.matchedProspectId, 'Matched map record')
    addFallback('listing', item.matchedListingId, 'Matched listing')
    return Array.from(byValue.values())
  }, [item.matchedDossierId, item.matchedListingId, item.matchedProspectId, targets])

  const buildDecision = (action: PropertyMemoryDecision['action']): PropertyMemoryDecision => ({
    action,
    ...propertyMemoryTargetFromValue(selectedTarget),
    confirmConflicts,
    coordinateDecision: 'keep_existing',
    fieldDecisions,
  })

  const approveDisabled = isPending || (requiresConflictConfirmation && !confirmConflicts)
  const selectedTargetOption = availableTargets.find((option) => targetValue(option) === selectedTarget)
  const selectedTargetLabel = selectedTarget === 'new'
    ? 'New property record'
    : selectedTargetOption?.label || 'Selected property record'
  const targetNeedsChoice = item.suggestedLayer === 'review' && availableTargets.length > 1

  return (
    <article className="border-b border-slate-200 px-4 py-4 sm:px-5">
      <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn(
              'rounded',
              item.suggestedLayer === 'review'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : item.suggestedLayer === 'existing'
                  ? 'border-teal-200 bg-teal-50 text-teal-800'
                  : 'border-blue-200 bg-blue-50 text-blue-800',
            )}>
              {reviewLabel(item)}
            </Badge>
            {item.suggestedLayer === 'review' || item.matchConfidence < 95 ? (
              <span className="text-xs font-medium text-slate-500">{Math.round(item.matchConfidence)}% match</span>
            ) : null}
          </div>
          <h3 className="mt-2 text-base font-semibold text-slate-950">{item.anchor.address}</h3>
      </div>

      {showTargetPicker || targetNeedsChoice ? (
        <div className="mt-4">
          <Label htmlFor={`property-memory-target-${item.id}`}>Save to</Label>
          <Select value={selectedTarget} onValueChange={setSelectedTarget} disabled={isPending}>
            <SelectTrigger id={`property-memory-target-${item.id}`} className="mt-2 bg-white">
              <SelectValue placeholder="Choose a property record" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New property record</SelectItem>
              {availableTargets.map((option) => (
                <SelectItem key={targetValue(option)} value={targetValue(option)}>
                  {option.label}{option.description ? ` / ${option.description}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="mt-4 flex min-h-11 items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <p className="min-w-0 text-slate-600">Save to <span className="font-semibold text-slate-950">{selectedTargetLabel}</span></p>
          {availableTargets.length ? (
            <Button type="button" variant="ghost" size="sm" className="h-11 shrink-0 px-2" onClick={() => setShowTargetPicker(true)} disabled={isPending}>Change</Button>
          ) : null}
        </div>
      )}

      {displayedConflicts.length ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden />Needs attention</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 leading-5">
            {displayedConflicts.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          {duplicateProspectIds.length > 1 && onCompareDuplicates ? (
            <Button type="button" variant="outline" size="sm" className="mt-3 min-h-11 border-amber-300 bg-white text-amber-950" onClick={() => onCompareDuplicates(duplicateProspectIds)}>
              <GitMerge className="h-4 w-4" aria-hidden />Compare records
            </Button>
          ) : null}
        </div>
      ) : null}

      <fieldset className="mt-4 space-y-3" disabled={isPending}>
        <legend className="text-sm font-semibold text-slate-950">Changes</legend>
        <p className="text-xs text-slate-500">Checked groups will be saved. Expand a row to compare values.</p>
        <div className="grid gap-2 lg:grid-cols-2">
          {FIELD_GROUPS.map((definition) => (
            <FieldGroupRow
              key={definition.key}
              idPrefix={`property-memory-${item.id}`}
              definition={definition}
              checked={fieldDecisions[definition.key]}
              currentValues={item.currentValues?.[definition.key] || []}
              proposed={proposedValues(item, definition.key)}
              onCheckedChange={(checked) => setFieldDecisions((current) => ({ ...current, [definition.key]: checked }))}
            />
          ))}
        </div>
      </fieldset>

      {requiresConflictConfirmation ? (
        <div className="mt-4 flex items-start gap-3 rounded-md border border-amber-200 bg-white p-3 text-sm text-slate-800">
          <Checkbox
            id={`property-memory-${item.id}-confirm-conflicts`}
            className="mt-0.5"
            checked={confirmConflicts}
            disabled={isPending}
            onCheckedChange={(value) => setConfirmConflicts(value === true)}
          />
          <Label
            htmlFor={`property-memory-${item.id}-confirm-conflicts`}
            className="cursor-pointer font-normal leading-5 text-slate-800"
          >
            I reviewed the conflicts.
          </Label>
        </div>
      ) : null}

      <p className="mt-4 text-xs leading-5 text-slate-500">Prospect notes, follow-ups and pin stay unchanged.</p>

      <div className="mt-3 flex justify-end border-t border-slate-200 pt-4">
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {showReject ? (
            <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" disabled={isPending} onClick={() => onReject(buildDecision('reject'))}>
              <Archive className="h-4 w-4" aria-hidden />
              Dismiss
            </Button>
          ) : null}
          <Button type="button" className="min-h-11 w-full sm:w-auto" disabled={approveDisabled} onClick={() => onApprove(buildDecision('approve'))} aria-label={`Accept property evidence for ${item.anchor.address}`}>
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {isPending ? 'Saving…' : 'Accept'}
          </Button>
        </div>
      </div>
    </article>
  )
}
