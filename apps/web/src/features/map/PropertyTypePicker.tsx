import { useMutation } from '@tanstack/react-query'
import { INVENTORY_CLASSES, INVENTORY_CLASS_META, getBrokerClassification, getPropertyClassification, getPropertyInventory, type PropertyClassificationType } from '@level-cre/shared'
import type { Prospect } from '@level-cre/shared/schema'
import { apiRequest } from '@/lib/queryClient'
import { isDemoModeRequested } from '@/lib/demoApi'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function PropertyTypePicker({prospect, disabled, onSaved}: {prospect: Prospect; disabled?: boolean; onSaved: (saved: Prospect) => void}) {
  const current = getPropertyClassification(prospect)
  const broker = getBrokerClassification(prospect)
  const imported = getPropertyInventory(prospect)
  const mutation = useMutation({
    mutationFn: async (propertyClassification: PropertyClassificationType | null) => {
      if (isDemoModeRequested()) {
        const aiMetadata = {...(prospect.aiMetadata || {})} as Record<string, unknown>
        if (propertyClassification === null) delete aiMetadata.propertyClassification
        else aiMetadata.propertyClassification = {classification: propertyClassification, source:'broker', reviewedAt:new Date().toISOString(), reviewedBy:'demo-user'}
        return {...prospect, aiMetadata}
      }
      const response = await apiRequest('PATCH', `/api/prospects/${prospect.id}`, {propertyClassification})
      const saved = await response.json() as Prospect
      if (saved.id !== prospect.id) throw new Error('Unexpected save response')
      return saved
    },
    onSuccess: onSaved,
  })
  const busy = disabled || mutation.isPending
  const options = [...INVENTORY_CLASSES.map(type => ({type, ...INVENTORY_CLASS_META[type]})), {type:'unknown' as const, marker:'?', label:'Other / unknown', color:'#64748B'}]
  return <section aria-label="Property type" className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-xs font-semibold text-slate-800">Property type</h3>
      <span className="text-[11px] text-slate-500">{broker ? 'Broker classified' : imported ? 'Research classification' : 'Not classified'}</span>
    </div>
    <div className="flex items-center gap-1.5">
      {options.map(option => <Tooltip key={option.type}>
        <TooltipTrigger asChild>
          <button type="button" disabled={busy} aria-label={option.label} aria-pressed={current === option.type}
            onClick={() => mutation.mutate(option.type)}
            style={{color:current === option.type ? '#FFFFFF' : option.color, backgroundColor:current === option.type ? option.color : undefined, borderColor:current === option.type ? option.color : undefined}}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-bold hover:border-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:opacity-50">
            {option.marker}
          </button>
        </TooltipTrigger>
        <TooltipContent className="z-[120]" side="bottom">{option.label}</TooltipContent>
      </Tooltip>)}
    </div>
    {broker && <button type="button" disabled={busy} onClick={() => mutation.mutate(null)} className="text-[11px] text-blue-700 disabled:opacity-50">{imported ? 'Use imported type' : 'Clear correction'}</button>}
    <p role="status" aria-live="polite" className={`text-[11px] ${mutation.isError ? 'text-red-700' : 'text-slate-500'}`}>
      {mutation.isPending ? 'Saving…' : mutation.isError ? 'Not saved. Select again to retry.' : mutation.isSuccess ? 'Type saved.' : 'Select to save · Hover for type'}
    </p>
  </section>
}
