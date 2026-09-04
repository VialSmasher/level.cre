import { INVENTORY_CLASSES, INVENTORY_CLASS_META, type PropertyClassificationType } from '@level-cre/shared'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export const PROPERTY_TYPE_OPTIONS = [
  ...INVENTORY_CLASSES.map(type => ({type, ...INVENTORY_CLASS_META[type]})),
  {type:'unknown' as const, marker:'?', label:'Unclassified / other', color:'#64748B'},
]

type Props = {
  value: PropertyClassificationType
  sourceLabel: string
  onChange: (value: PropertyClassificationType | null) => void
  busy?: boolean
  disabled?: boolean
  status?: 'idle' | 'pending' | 'success' | 'error'
  resetLabel?: string
  unavailableReason?: string
}

/** One selector and automation contract regardless of the asset's storage model. */
export function PropertyClassificationControl({value, sourceLabel, onChange, busy, disabled, status = 'idle', resetLabel, unavailableReason}: Props) {
  const selected = PROPERTY_TYPE_OPTIONS.find(option => option.type === value)!
  return <section aria-label="Property type" data-testid="asset-classification" data-classification={value} className="space-y-2">
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-xs font-semibold text-slate-800">Property type</h3>
      <span data-testid="asset-type-label" className="text-right text-xs font-medium text-slate-700">{selected.label}</span>
    </div>
    <div className="flex items-center gap-1.5" role="group" aria-label="Set property type">
      {PROPERTY_TYPE_OPTIONS.map(option => <Tooltip key={option.type}>
        <TooltipTrigger asChild>
          <button type="button" disabled={busy || disabled} aria-label={`Set property type: ${option.label}`} aria-pressed={value === option.type}
            data-testid={`asset-type-${option.type}`} data-classification-value={option.type}
            onClick={() => { if (option.type !== value) onChange(option.type) }}
            style={{color:value === option.type ? '#FFFFFF' : option.color, backgroundColor:value === option.type ? option.color : undefined, borderColor:value === option.type ? option.color : undefined}}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-bold hover:border-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:opacity-50">
            {option.marker}
          </button>
        </TooltipTrigger>
        <TooltipContent className="z-[120]" side="bottom">{option.label}</TooltipContent>
      </Tooltip>)}
    </div>
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-slate-500">{sourceLabel}</span>
      {resetLabel && <button type="button" data-testid="asset-type-reset" disabled={busy || disabled} onClick={() => onChange(null)} className="text-blue-700 disabled:opacity-50">{resetLabel}</button>}
    </div>
    <p role="status" aria-live="polite" data-testid="asset-type-save-status" data-save-state={status}
      className={`text-[11px] ${status === 'error' ? 'text-red-700' : 'text-slate-500'}`}>
      {status === 'pending' ? 'Saving type…' : status === 'error' ? 'Not saved. Select a type to retry.' : status === 'success' ? 'Type saved.' : unavailableReason || 'Select to save · Hover for type'}
    </p>
  </section>
}
import React from 'react'
