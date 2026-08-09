import { useEffect, useId, useMemo, useRef } from 'react'
import { AlertTriangle, Building2, CheckCircle2, ExternalLink, FileCheck2, GitMerge, Link2, LoaderCircle, MapPin, Scale, ShieldCheck, X } from 'lucide-react'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { MarketMemoryAnchor, MarketMemoryLegalIdentity } from '@/lib/currentProjectsMarketMemory'

type Props = {
  anchor: MarketMemoryAnchor
  onClose: () => void
  onReview?: () => void
  onQuickApprove?: () => void
  onCompareDuplicates?: () => void
  onWorkProspect?: () => void
  isActionPending?: boolean
}

function cleanDate(value: string | null) {
  if (!value) return 'date unavailable'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }).format(date)
}

function identityLabel(identity: MarketMemoryLegalIdentity) {
  return identity.titleNumber ? `Title ${identity.titleNumber}` : identity.linc ? `LINC ${identity.linc}` : identity.titleIdentity
}

function storyMeta(anchor: MarketMemoryAnchor) {
  if (anchor.persistence?.state === 'pending') {
    if (anchor.previewLayer === 'review') {
      return { label: 'Needs review', className: 'border-amber-200 bg-amber-50 text-amber-800', Icon: AlertTriangle }
    }
    return { label: 'Ready', className: 'border-blue-200 bg-blue-50 text-blue-800', Icon: FileCheck2 }
  }
  if (anchor.previewLayer === 'existing') {
    return { label: 'Existing match', className: 'border-teal-200 bg-teal-50 text-teal-800', Icon: Link2 }
  }
  if (anchor.previewLayer === 'review') {
    return { label: 'Needs review', className: 'border-amber-200 bg-amber-50 text-amber-800', Icon: AlertTriangle }
  }
  if (anchor.persistence?.state === 'local_preview') {
    return { label: 'Preview', className: 'border-slate-200 bg-slate-50 text-slate-700', Icon: MapPin }
  }
  return { label: 'Verified', className: 'border-blue-200 bg-blue-50 text-blue-800', Icon: ShieldCheck }
}

function evidenceTimestamp(identity: MarketMemoryLegalIdentity) {
  const value = identity.titlePulledDate || identity.transferRegistrationDate
  if (!value) return Number.NEGATIVE_INFINITY
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY
}

function actionAriaLabel(label: string, address: string) {
  if (label === 'Accept') return `Accept verified property evidence for ${address}`
  if (label === 'Review') return `Review property evidence for ${address}`
  if (label === 'Compare') return `Compare duplicate map records for ${address}`
  return `Open prospect for ${address}`
}

export function MarketMemoryStoryPanel({
  anchor,
  onClose,
  onReview,
  onQuickApprove,
  onCompareDuplicates,
  onWorkProspect,
  isActionPending = false,
}: Props) {
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const meta = storyMeta(anchor)
  const candidate = anchor.resolution?.topCandidate
  const prospectCandidates = (anchor.resolution?.candidates || []).filter((item) => item.entityType === 'prospect')
  const reviewReasons = Array.from(new Set([...anchor.reviewReasons, ...(candidate?.conflicts || [])]))
  const latestOwnership = useMemo(() => (
    [...anchor.legalIdentities]
      .filter((identity) => Boolean(identity.registeredOwner))
      .sort((left, right) => evidenceTimestamp(right) - evidenceTimestamp(left))[0]
  ), [anchor.legalIdentities])

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true })
  }, [anchor.id, anchor.persistence?.state])

  const primaryAction = onCompareDuplicates
    ? { label: 'Compare', Icon: GitMerge, onClick: onCompareDuplicates }
    : onQuickApprove
      ? { label: 'Accept', Icon: CheckCircle2, onClick: onQuickApprove }
      : onReview
        ? { label: 'Review', Icon: FileCheck2, onClick: onReview }
        : onWorkProspect
          ? { label: 'Open prospect', Icon: Building2, onClick: onWorkProspect }
          : null

  const secondaryAction = onCompareDuplicates && onReview
    ? { label: 'Review', Icon: FileCheck2, onClick: onReview }
    : onCompareDuplicates && onWorkProspect
      ? { label: 'Open prospect', Icon: Building2, onClick: onWorkProspect }
    : onQuickApprove && onReview
      ? { label: 'Review', Icon: FileCheck2, onClick: onReview }
      : onReview && onWorkProspect
        ? { label: 'Open prospect', Icon: Building2, onClick: onWorkProspect }
        : null

  return (
    <aside
      aria-labelledby={titleId}
      className="absolute bottom-2 left-2 right-2 z-[80] flex max-h-[78dvh] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-full md:max-h-none md:w-[380px] md:rounded-none md:border-y-0 md:border-r-0 md:border-l"
    >
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge variant="outline" className={meta.className}>
              <meta.Icon className="mr-1 h-3 w-3" aria-hidden />
              {meta.label}
            </Badge>
            <h2 ref={titleRef} id={titleId} tabIndex={-1} className="mt-2 text-base font-semibold leading-5 text-slate-950 outline-none">{anchor.address}</h2>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-11 w-11 shrink-0 p-0" onClick={onClose} aria-label="Close property story">
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <section aria-label="Property summary" className="px-4 py-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <div className="col-span-2">
              <dt className="text-slate-500">Owner on latest title</dt>
              <dd className="mt-0.5 font-semibold text-slate-950">{latestOwnership?.registeredOwner || 'Unavailable'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Parcel</dt>
              <dd className="mt-0.5 font-semibold text-slate-950">{anchor.parcelAreaAcres == null ? 'Unavailable' : `${anchor.parcelAreaAcres.toFixed(2)} acres`}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Zoning</dt>
              <dd className="mt-0.5 font-semibold text-slate-950">{anchor.zoning.join(' / ') || 'Unavailable'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500">Neighbourhood</dt>
              <dd className="mt-0.5 font-semibold text-slate-950">{anchor.neighbourhood || 'Unavailable'}</dd>
            </div>
          </dl>
        </section>

        {candidate || reviewReasons.length ? (
          <section aria-label="Review summary" className="border-t border-slate-200 px-4 py-3">
            <div className={candidate && !reviewReasons.length
              ? 'rounded-md border border-teal-200 bg-teal-50 p-3 text-xs text-teal-950'
              : 'rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950'}>
              {candidate ? (
                <p className="font-semibold">
                  {candidate.label} · {Math.round(candidate.confidence)}% match
                </p>
              ) : null}
              {reviewReasons.length ? (
                <p className={candidate ? 'mt-1 leading-5' : 'font-semibold leading-5'}>
                  {reviewReasons[0]}
                  {reviewReasons.length > 1 ? ` · ${reviewReasons.length - 1} more` : ''}
                </p>
              ) : null}
              {prospectCandidates.length > 1 ? <p className="mt-1">{prospectCandidates.length} plausible map records.</p> : null}
            </div>
          </section>
        ) : null}

        <Accordion type="multiple" className="border-t border-slate-200 px-4">
          <AccordionItem value="context">
            <AccordionTrigger className="min-h-11 py-3 text-left text-sm">Brokerage context</AccordionTrigger>
            <AccordionContent className="space-y-3 text-xs leading-5 text-slate-700">
              <div><span className="font-semibold text-slate-900">Projects touched</span><p>{anchor.projects.join(', ') || 'Not recorded'}</p></div>
              {anchor.suggestedUses.length ? <div><span className="font-semibold text-slate-900">Suggested use</span><p>{anchor.suggestedUses.join(', ')}</p></div> : null}
              {anchor.alternateAddresses.length ? <div><span className="font-semibold text-slate-900">Other civic identities</span><p>{anchor.alternateAddresses.join(', ')}</p></div> : null}
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-slate-500">Municipality</span><p className="font-semibold text-slate-900">{anchor.municipality || 'Unavailable'}</p></div>
                <div><span className="text-slate-500">Account</span><p className="font-semibold text-slate-900">{anchor.accountNumbers.join(', ') || 'Unavailable'}</p></div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="legal">
            <AccordionTrigger className="min-h-11 py-3 text-left text-sm">History &amp; legal ({anchor.legalIdentities.length})</AccordionTrigger>
            <AccordionContent className="space-y-3">
              {anchor.legalIdentities.map((identity) => (
                <div key={identity.titleIdentity} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                  <div className="flex items-center gap-2 font-semibold text-slate-950"><Scale className="h-3.5 w-3.5 text-slate-500" aria-hidden />{identityLabel(identity)}</div>
                  <p className="mt-1"><span className="text-slate-500">Owner:</span> {identity.registeredOwner || 'Unavailable'}</p>
                  <p><span className="text-slate-500">Pulled:</span> {cleanDate(identity.titlePulledDate)}{identity.transferRegistrationDate ? ` · transfer ${cleanDate(identity.transferRegistrationDate)}` : ''}</p>
                  <p><span className="text-slate-500">Legal:</span> {identity.legalDescription || [identity.plan && `Plan ${identity.plan}`, identity.block && `Block ${identity.block}`, identity.lot && `Lot ${identity.lot}`].filter(Boolean).join(' ') || 'Unavailable'}</p>
                  {identity.linc ? <p><span className="text-slate-500">LINC:</span> {identity.linc}</p> : null}
                  <p><span className="text-slate-500">Confidence:</span> {identity.extractionConfidence}%</p>
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="sources" className="border-b-0">
            <AccordionTrigger className="min-h-11 py-3 text-left text-sm">Sources</AccordionTrigger>
            <AccordionContent className="space-y-3 text-xs text-slate-700">
              {anchor.legalIdentities.map((identity) => (
                <div key={`${identity.titleIdentity}:source`} className="flex gap-2">
                  <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <div className="min-w-0">
                    <p className="break-words font-medium text-slate-900">{identity.sourcePath}</p>
                    <p className="mt-0.5 break-all font-mono text-[10px] text-slate-500">SHA-256 {identity.sourceHash}</p>
                  </div>
                </div>
              ))}
              {anchor.sourceUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-2 break-all text-blue-700 hover:underline">
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />Municipal source
                </a>
              ))}
              <div className="flex gap-2 text-slate-500"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Captured {cleanDate(anchor.capturedAt)}</div>
              <div className="text-slate-500">Coordinates {anchor.latitude.toFixed(6)}, {anchor.longitude.toFixed(6)}</div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </ScrollArea>

      {primaryAction ? (
        <div className={`grid grid-cols-1 gap-2 border-t border-slate-200 bg-white px-4 py-3 ${secondaryAction ? 'sm:grid-cols-2' : ''}`}>
          <Button type="button" className="min-h-11" onClick={primaryAction.onClick} disabled={isActionPending} aria-label={actionAriaLabel(primaryAction.label, anchor.address)}>
            {isActionPending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <primaryAction.Icon className="h-4 w-4" aria-hidden />}
            {isActionPending && primaryAction.label === 'Accept' ? 'Saving…' : primaryAction.label}
          </Button>
          {secondaryAction ? (
            <Button type="button" variant="outline" className="min-h-11" onClick={secondaryAction.onClick} disabled={isActionPending} aria-label={actionAriaLabel(secondaryAction.label, anchor.address)}>
              <secondaryAction.Icon className="h-4 w-4" aria-hidden />
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </aside>
  )
}
