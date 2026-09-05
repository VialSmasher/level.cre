import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { getPropertyLink } from '@level-cre/shared'
import type { Prospect } from '@level-cre/shared/schema'
import { apiRequest } from '@/lib/queryClient'
import { getProspectMapPosition } from '../property-memory/composeMapItems'

const label = (p: Prospect) => p.businessName || p.contactCompany || p.name
const address = (p: Prospect) => p.address || p.name
function distance(a: Prospect, b: Prospect) {
  const left=getProspectMapPosition(a), right=getProspectMapPosition(b)
  if (!left || !right) return Infinity
  return (left.lat-right.lat)**2 + ((left.lng-right.lng)*0.6)**2
}

export function PropertyRecords({record,property,occupants,records,disabled,onSelect,onSaved}: {
  record: Prospect; property: Prospect; occupants: Prospect[]; records: Prospect[]; disabled: boolean;
  onSelect: (record: Prospect) => unknown; onSaved: (record: Pick<Prospect,'id'|'aiMetadata'>) => void;
}) {
  const [search,setSearch] = useState('')
  const [open,setOpen] = useState(false)
  const link = getPropertyLink(record)
  const candidates = useMemo(() => records
    .filter(p => p.id !== record.id && !getPropertyLink(p) && `${label(p)} ${address(p)}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => distance(record,a)-distance(record,b) || address(a).localeCompare(address(b)))
    .slice(0,6), [record,records,search])
  const mutation = useMutation({
    mutationFn: async (propertyProspectId: string | null) => {
      const response = await apiRequest('PATCH', `/api/prospects/${record.id}/property-link`, {
        propertyProspectId, expectedPropertyProspectId:link?.propertyProspectId || null,
      })
      const saved = await response.json()
      if (saved.id !== record.id) throw new Error('Unexpected building link response.')
      return saved
    },
    onSuccess: saved => { onSaved(saved); setOpen(false) },
  })
  const busy = disabled || mutation.isPending
  return <div className="space-y-2 text-xs" data-testid="property-records" data-property-id={property.id}>
    {occupants.length > 0 && <div className="space-y-1">
      <div className="flex items-center justify-between text-slate-500"><span>Building &amp; occupants</span>
        {link && <button type="button" data-testid="property-link-toggle" disabled={busy} onClick={() => setOpen(!open)} className="text-blue-700 hover:underline">Change link</button>}
      </div>
      <select aria-label="Building or occupant record" data-testid="property-record-select" value={record.id} disabled={busy}
        className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs"
        onChange={event => { const selected = [property,...occupants].find(p => p.id === event.target.value); if (selected) onSelect(selected) }}>
        <option value={property.id}>Building · {address(property)}</option>
        {occupants.map(p => <option key={p.id} value={p.id}>Occupant · {label(p)}</option>)}
      </select>
    </div>}
    {link && <p className="text-slate-500" data-testid="occupant-building-context">
      {property.id !== record.id ? 'Building type shared · occupant contacts retained' : 'Linked building is unavailable. This occupant remains visible.'}
    </p>}
    {!occupants.length ? <button type="button" data-testid="property-link-toggle" disabled={busy}
      onClick={() => setOpen(!open)} className="text-blue-700 hover:underline disabled:opacity-50">
      {link ? 'Change building link' : 'This is an occupant? Link to a building'}
    </button> : null}
    {open && <div className="space-y-2 rounded border border-slate-200 p-2">
      <p className="text-slate-500">Choose its building. Contacts and activity stay on this record.</p>
      <input aria-label="Find building by address or name" data-testid="property-link-search" value={search} onChange={event => setSearch(event.target.value)}
        placeholder="Find building by address" className="h-8 w-full rounded border px-2 text-xs" />
      {candidates.map(p => <button type="button" key={p.id} disabled={busy} data-testid={`property-link-target-${p.id}`}
        onClick={() => mutation.mutate(p.id)} className="block w-full rounded px-2 py-1.5 text-left hover:bg-blue-50 disabled:opacity-50"
        aria-label={`Link as occupant of ${address(p)}`}>
        <span className="block font-medium">{address(p)}</span>
        {label(p) !== address(p) && <span className="block text-slate-500">{label(p)}</span>}
      </button>)}
      {!candidates.length && <p className="text-slate-500">No matching building records.</p>}
      {link && <button type="button" disabled={busy} data-testid="property-link-remove" onClick={() => mutation.mutate(null)} className="text-blue-700">Unlink · show separately on map</button>}
    </div>}
    <div role="status" aria-live="polite" data-testid="property-link-save-status" data-save-state={mutation.status}>
      {mutation.isPending ? 'Saving building link…' : mutation.isError ? <span className="text-red-700">{mutation.error.message}</span> : mutation.isSuccess ? <span className="text-emerald-700">Building link saved.</span> : null}
    </div>
  </div>
}
