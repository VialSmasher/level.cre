import type { ReactNode } from 'react'
import { AlertTriangle, Building2, Database, ExternalLink, FileCheck2, Link2, MapPin, Scale, ShieldCheck, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { MarketMemoryAnchor, MarketMemoryLegalIdentity } from '@/lib/currentProjectsMarketMemory'

type Props = {
  anchor: MarketMemoryAnchor
  onClose: () => void
  onReview?: () => void
  onWorkProspect?: () => void
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
  if (anchor.previewLayer === 'existing') {
    return { label: 'Matches existing record', className: 'border-teal-200 bg-teal-50 text-teal-800', Icon: Link2 }
  }
  if (anchor.previewLayer === 'review') {
    return { label: 'Review before merge', className: 'border-amber-200 bg-amber-50 text-amber-800', Icon: AlertTriangle }
  }
  return { label: 'Verified market memory', className: 'border-blue-200 bg-blue-50 text-blue-800', Icon: ShieldCheck }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-200 px-4 py-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

export function MarketMemoryStoryPanel({ anchor, onClose, onReview, onWorkProspect }: Props) {
  const meta = storyMeta(anchor)
  const candidate = anchor.resolution?.topCandidate
  const persistenceState = anchor.persistence?.state || 'local_preview'
  const persistenceMeta = persistenceState === 'approved'
    ? {
        badge: 'Saved brokerage memory',
        title: 'Approved property memory',
        description: 'These source-backed facts are durable in Level CRE. Linked prospect notes, status, follow-ups and manual geometry remain separate.',
      }
    : persistenceState === 'pending'
      ? {
          badge: 'Awaiting broker approval',
          title: 'Saved to Today → Review',
          description: 'This proposal is durable, but the canonical property record has not changed. Approve or reject it from Review.',
        }
      : {
          badge: 'Local preview',
          title: 'No data has been saved',
          description: 'This read-only preview has not changed Level CRE.',
        }

  return (
    <aside className="absolute bottom-2 left-2 right-2 z-[80] flex max-h-[78dvh] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-full md:max-h-none md:w-[380px] md:rounded-none md:border-y-0 md:border-r-0 md:border-l">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={meta.className}>
                <meta.Icon className="mr-1 h-3 w-3" />
                {meta.label}
              </Badge>
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">{persistenceMeta.badge}</Badge>
            </div>
            <h2 className="mt-2 text-base font-semibold leading-5 text-slate-950">{anchor.address}</h2>
            <p className="mt-1 text-xs text-slate-500">{anchor.latitude.toFixed(6)}, {anchor.longitude.toFixed(6)}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0" onClick={onClose} aria-label="Close property story">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="bg-slate-950 px-4 py-3 text-xs leading-5 text-slate-100">
          <div className="flex items-center gap-2 font-semibold text-white"><Database className="h-4 w-4" />{persistenceMeta.title}</div>
          <p className="mt-1 text-slate-300">{persistenceMeta.description}</p>
        </div>

        {candidate ? (
          <Section title="Existing Level CRE match">
            <div className="rounded-md border border-teal-200 bg-teal-50 p-3 text-xs text-teal-950">
              <p className="font-semibold">{candidate.label}</p>
              <p className="mt-1">{Math.round(candidate.confidence)}% confidence · {candidate.signals.join(', ') || 'matching signals available'}</p>
              {candidate.conflicts.length ? <p className="mt-1 text-amber-800">Conflicts: {candidate.conflicts.join(', ')}</p> : null}
            </div>
          </Section>
        ) : null}

        {anchor.reviewReasons.length ? (
          <Section title="Why this needs review">
            <ul className="space-y-2 text-xs leading-5 text-amber-900">
              {anchor.reviewReasons.map((reason) => <li key={reason} className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{reason}</li>)}
            </ul>
          </Section>
        ) : null}

        <Section title="Brokerage context">
          <div className="space-y-3 text-xs text-slate-700">
            <div className="flex gap-2"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><div><span className="font-semibold text-slate-900">Projects touched</span><p className="mt-0.5">{anchor.projects.join(', ') || 'Not recorded'}</p></div></div>
            {anchor.suggestedUses.length ? <div><span className="font-semibold text-slate-900">Suggested use</span><p className="mt-0.5">{anchor.suggestedUses.join(', ')}</p></div> : null}
            {anchor.alternateAddresses.length ? <div><span className="font-semibold text-slate-900">Other civic identities</span><p className="mt-0.5">{anchor.alternateAddresses.join(', ')}</p></div> : null}
          </div>
        </Section>

        <Section title="Parcel and municipal facts">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <div><dt className="text-slate-500">Parcel size</dt><dd className="mt-0.5 font-semibold text-slate-900">{anchor.parcelAreaAcres == null ? 'Unavailable' : `${anchor.parcelAreaAcres.toFixed(2)} acres`}</dd></div>
            <div><dt className="text-slate-500">Zoning</dt><dd className="mt-0.5 font-semibold text-slate-900">{anchor.zoning.join(' / ') || 'Unavailable'}</dd></div>
            <div><dt className="text-slate-500">Neighbourhood</dt><dd className="mt-0.5 font-semibold text-slate-900">{anchor.neighbourhood || 'Unavailable'}</dd></div>
            <div><dt className="text-slate-500">Municipality</dt><dd className="mt-0.5 font-semibold text-slate-900">{anchor.municipality || 'Unavailable'}</dd></div>
            <div className="col-span-2"><dt className="text-slate-500">Municipal account</dt><dd className="mt-0.5 font-semibold text-slate-900">{anchor.accountNumbers.join(', ') || 'Unavailable'}</dd></div>
          </dl>
        </Section>

        <Section title={`Dated ownership and legal evidence (${anchor.legalIdentities.length})`}>
          <div className="space-y-3">
            {anchor.legalIdentities.map((identity) => (
              <div key={identity.titleIdentity} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                <div className="flex items-center gap-2 font-semibold text-slate-950"><Scale className="h-3.5 w-3.5 text-slate-500" />{identityLabel(identity)}</div>
                <p className="mt-1"><span className="text-slate-500">Owner shown on title:</span> {identity.registeredOwner || 'Unavailable'}</p>
                <p><span className="text-slate-500">Title pulled:</span> {cleanDate(identity.titlePulledDate)}{identity.transferRegistrationDate ? ` · transfer registered ${cleanDate(identity.transferRegistrationDate)}` : ''}</p>
                <p><span className="text-slate-500">Legal:</span> {identity.legalDescription || [identity.plan && `Plan ${identity.plan}`, identity.block && `Block ${identity.block}`, identity.lot && `Lot ${identity.lot}`].filter(Boolean).join(' ') || 'Unavailable'}</p>
                {identity.linc ? <p><span className="text-slate-500">LINC:</span> {identity.linc}</p> : null}
                <p><span className="text-slate-500">Extraction confidence:</span> {identity.extractionConfidence}%</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Source and provenance">
          <div className="space-y-3 text-xs text-slate-700">
            {anchor.legalIdentities.map((identity) => (
              <div key={`${identity.titleIdentity}:source`} className="flex gap-2">
                <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <p className="break-words font-medium text-slate-900">{identity.sourcePath}</p>
                  <p className="mt-0.5 break-all font-mono text-[10px] text-slate-500">SHA-256 {identity.sourceHash}</p>
                </div>
              </div>
            ))}
            {anchor.sourceUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 break-all text-blue-700 hover:underline">
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />Municipal source
              </a>
            ))}
            <div className="flex gap-2 text-slate-500"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />Municipal evidence captured {cleanDate(anchor.capturedAt)}</div>
          </div>
        </Section>
      </ScrollArea>

      {onReview || onWorkProspect ? (
        <div className="flex gap-2 border-t border-slate-200 bg-white px-4 py-3">
          {onReview ? <Button type="button" variant="outline" className="flex-1" onClick={onReview}>Review changes</Button> : null}
          {onWorkProspect ? <Button type="button" className="flex-1" onClick={onWorkProspect}>Work this prospect</Button> : null}
        </div>
      ) : null}
    </aside>
  )
}
