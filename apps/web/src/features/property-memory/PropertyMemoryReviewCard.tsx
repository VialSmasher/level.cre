import { useMemo, useState } from 'react'
import { AlertTriangle, Archive, CheckCircle2, FileCheck2, GitMerge, Link2, MapPin } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
  if (item.suggestedLayer === 'existing') return 'Enrich existing property'
  if (item.suggestedLayer === 'review') return 'Resolve before approval'
  return 'Create market memory'
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
  return (
    <div className={cn('rounded-md border p-3', checked ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200 bg-slate-50')}>
      <div className="flex items-start gap-3">
        <Checkbox
          id={inputId}
          checked={checked}
          disabled={required}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          aria-describedby={`${inputId}-description`}
        />
        <div className="min-w-0 flex-1">
          <Label htmlFor={inputId} className="text-sm font-semibold text-slate-950">
            {definition.label}{required ? ' (required)' : ''}
          </Label>
          <p id={`${inputId}-description`} className="mt-0.5 text-xs text-slate-500">
            {definition.description}
          </p>
          <div className={cn('mt-3 grid gap-3 text-xs', currentValues.length ? 'sm:grid-cols-2' : '')}>
            {currentValues.length ? (
              <div>
                <p className="font-semibold uppercase tracking-wide text-slate-500">Current</p>
                <p className="mt-1 whitespace-pre-line leading-5 text-slate-700">{currentValues.join('\n')}</p>
              </div>
            ) : null}
            <div>
              <p className="font-semibold uppercase tracking-wide text-slate-500">Proposed evidence</p>
              <p className="mt-1 whitespace-pre-line leading-5 text-slate-800">{proposed.join('\n') || 'No value supplied'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PropertyMemoryReviewCard({
  item,
  targetOptions,
  isPending = false,
  onApprove,
  onReject,
  onCompareDuplicates,
}: Props) {
  const [fieldDecisions, setFieldDecisions] = useState<PropertyMemoryFieldDecisions>(() => ({
    ...DEFAULT_PROPERTY_MEMORY_FIELD_DECISIONS,
  }))
  const [selectedTarget, setSelectedTarget] = useState(() => defaultTarget(item))
  const [confirmConflicts, setConfirmConflicts] = useState(false)
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

  return (
    <article className="border-b border-slate-200 px-4 py-5 sm:px-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
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
            <span className="text-xs font-medium text-slate-500">{Math.round(item.matchConfidence)}% match confidence</span>
          </div>
          <h3 className="mt-2 text-base font-semibold text-slate-950">{item.anchor.address}</h3>
          <p className="mt-1 text-xs text-slate-500">
            {item.anchor.legalIdentities.length} title identit{item.anchor.legalIdentities.length === 1 ? 'y' : 'ies'} · {item.anchor.projects.length} project context source{item.anchor.projects.length === 1 ? '' : 's'}
          </p>
          {item.sourceFileName ? (
            <p className="mt-2 flex items-center gap-2 break-words text-xs text-slate-500">
              <FileCheck2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {item.sourceFileName}
            </p>
          ) : null}
        </div>

        <div className="w-full xl:w-80">
          <Label htmlFor={`property-memory-target-${item.id}`}>Approval target</Label>
          <Select value={selectedTarget} onValueChange={setSelectedTarget} disabled={isPending}>
            <SelectTrigger id={`property-memory-target-${item.id}`} className="mt-2 bg-white">
              <SelectValue placeholder="Choose a property target" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">Create a separate property dossier</SelectItem>
              {availableTargets.map((option) => (
                <SelectItem key={targetValue(option)} value={targetValue(option)}>
                  {option.label}{option.description ? ` / ${option.description}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {displayedConflicts.length ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden />Conflicts and ambiguity to review</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 leading-5">
            {displayedConflicts.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          {duplicateProspectIds.length > 1 && onCompareDuplicates ? (
            <Button type="button" variant="outline" size="sm" className="mt-3 border-amber-300 bg-white text-amber-950" onClick={() => onCompareDuplicates(duplicateProspectIds)}>
              <GitMerge className="h-4 w-4" />Compare duplicate map records
            </Button>
          ) : null}
        </div>
      ) : null}

      <fieldset className="mt-4 space-y-3" disabled={isPending}>
        <legend className="text-sm font-semibold text-slate-950">Choose evidence groups to approve</legend>
        <p className="text-xs text-slate-500">Approval adds dossier facts. It does not replace prospect notes, status, follow-ups or manual map geometry.</p>
        <div className="grid gap-3 lg:grid-cols-2">
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
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-amber-200 bg-white p-3 text-sm text-slate-800">
          <Checkbox
            className="mt-0.5"
            checked={confirmConflicts}
            disabled={isPending}
            onCheckedChange={(value) => setConfirmConflicts(value === true)}
            aria-label="Confirm reviewed property conflicts"
          />
          <span><span className="font-semibold">I reviewed these conflicts.</span> Approve the selected evidence without moving or replacing any linked prospect pin.</span>
        </label>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {item.matchedProspectId || item.matchedDossierId || item.matchedListingId ? <Link2 className="h-4 w-4" aria-hidden /> : <MapPin className="h-4 w-4" aria-hidden />}
          {item.matchedProspectId || item.matchedDossierId || item.matchedListingId ? 'Existing target suggested' : 'New market-memory property'}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" disabled={isPending} onClick={() => onReject(buildDecision('reject'))}>
            <Archive className="h-4 w-4" aria-hidden />
            Reject
          </Button>
          <Button type="button" disabled={approveDisabled} onClick={() => onApprove(buildDecision('approve'))}>
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {isPending ? 'Saving…' : 'Approve selected evidence'}
          </Button>
        </div>
      </div>
    </article>
  )
}
