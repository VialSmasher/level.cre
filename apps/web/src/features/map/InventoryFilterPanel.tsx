import { useMemo } from 'react'
import { INVENTORY_CLASSES, INVENTORY_CLASS_META, INVENTORY_CONFIDENCE } from '@level-cre/shared'
import { INVENTORY_SIGNAL_GROUPS, defaultInventoryFilters, propertyFilterFacts, matchesPropertyFilters, type InventoryFilters, type PropertyFilterSource } from './inventoryFilters'

export function InventoryFilterPanel({prospects, filters, onChange, onFocus}: {
  prospects: PropertyFilterSource[]; filters: InventoryFilters; onChange: (filters: InventoryFilters)=>void; onFocus:(filters:InventoryFilters)=>void
}) {
  const inventories=useMemo(()=>prospects.map(propertyFilterFacts),[prospects])
  const toggle=(field:'classes'|'confidence'|'tags',key:string)=>onChange({...filters,[field]:filters[field].includes(key)?filters[field].filter(value=>value!==key):[...filters[field],key]})
  const counts=new Map<string,number>()
  for(const inventory of inventories)for(const tag of Array.from(inventory.signals))counts.set(tag,(counts.get(tag)||0)+1)
  const selected=prospects.filter(prospect=>matchesPropertyFilters(prospect,filters)).length
  const preset=(priority:boolean)=>{
    const next={...defaultInventoryFilters(),includeOther:false,classes:priority?['multi_tenant']:[...INVENTORY_CLASSES]}
    onChange(next);onFocus(next)
  }
  return <section className="border-t border-slate-200 py-3" aria-label="Property inventory filters" data-testid="property-filters">
    <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Property inventory</h3><span className="text-xs tabular-nums text-slate-500">{selected}/{inventories.length}</span></div>
    <div className="mt-2 grid gap-2">
      <button type="button" data-testid="property-filter-multi-priority" onClick={()=>preset(true)} className="min-h-10 rounded-md bg-violet-700 px-3 py-2 text-left text-xs font-semibold text-white hover:bg-violet-800">Isolate multi-tenant priority</button>
      <button type="button" data-testid="property-filter-long-hold" onClick={()=>{const next={...defaultInventoryFilters(),includeOther:false,tags:['long_hold']};onChange(next);onFocus(next)}} className="min-h-10 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-semibold text-amber-950">15+ year registrations <span className="float-right tabular-nums">{counts.get('long_hold')||0}</span></button>
      <div className="grid grid-cols-2 gap-2"><button type="button" data-testid="property-filter-all-classified" onClick={()=>preset(false)} className="min-h-9 rounded-md border px-2 text-xs font-medium">All classified assets</button><button type="button" data-testid="property-filter-fit" onClick={()=>onFocus(filters)} className="min-h-9 rounded-md border px-2 text-xs font-medium">Fit selected assets</button></div>
    </div>
    <div className="mt-3 space-y-1">{INVENTORY_CLASSES.map(key=><button type="button" key={key} data-testid={`property-filter-class-${key}`} aria-pressed={filters.classes.includes(key)} onClick={()=>toggle('classes',key)} className={`flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs ${filters.classes.includes(key)?'bg-slate-100 text-slate-950':'text-slate-400'}`}>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{backgroundColor:INVENTORY_CLASS_META[key].color}}>{INVENTORY_CLASS_META[key].marker}</span><span className="flex-1">{INVENTORY_CLASS_META[key].label}</span><span>{inventories.filter(row=>row.classification===key).length}</span>
    </button>)}</div>
    <label className="mt-2 flex min-h-9 cursor-pointer items-center gap-2 text-xs"><input type="checkbox" data-testid="property-filter-unknown" checked={filters.includeOther} onChange={event=>onChange({...filters,includeOther:event.target.checked})}/>Show unclassified / other records</label>
    <div className="mt-3 border-t pt-3"><p className="text-xs font-semibold text-slate-700">Research confidence</p><p className="mt-1 text-[11px] leading-4 text-slate-500">All confidence levels are shown by default.</p><div className="mt-2 flex flex-wrap gap-1.5">{INVENTORY_CONFIDENCE.map(key=><button key={key} type="button" data-testid={`property-filter-confidence-${key}`} aria-pressed={filters.confidence.includes(key)} onClick={()=>toggle('confidence',key)} className={`min-h-8 rounded-md border px-2 text-xs ${filters.confidence.includes(key)?'border-blue-300 bg-blue-50 text-blue-900':'border-slate-200 text-slate-500'}`}>{key==='unrated'?'Unrated':key==='med'?'Medium':key==='low'?'Low confidence':'High'} <span className="tabular-nums">{inventories.filter(row=>row.confidence===key).length}</span></button>)}</div></div>
    <details className="mt-3 border-t pt-3 text-xs"><summary className="cursor-pointer font-semibold text-slate-700">Signals and completeness{filters.tags.length?` · ${filters.tags.length} selected`:''}</summary><p className="mt-2 text-[11px] leading-4 text-slate-500">Any selected signal within a group; all selected groups must match. Research signals do not confirm ownership, tenancy or a current listing.</p>
      {INVENTORY_SIGNAL_GROUPS.map(group=><fieldset key={group.label} className="mt-3"><legend className="mb-1.5 text-[11px] font-semibold text-slate-600">{group.label}</legend><div className="flex flex-wrap gap-1.5">{group.tags.map(([key,label])=><button key={key} type="button" data-testid={`property-filter-signal-${key}`} aria-pressed={filters.tags.includes(key)} onClick={()=>toggle('tags',key)} className={`min-h-8 rounded-md border px-2 py-1 text-left text-[11px] ${filters.tags.includes(key)?'border-violet-300 bg-violet-50 text-violet-900':'border-slate-200 text-slate-600'}`}>{label} <span className="tabular-nums">{counts.get(key)||0}</span></button>)}</div></fieldset>)}
    </details>
    <button type="button" data-testid="property-filter-reset" onClick={()=>onChange(defaultInventoryFilters())} className="mt-3 rounded px-1 py-1 text-xs font-medium text-blue-700">Reset inventory filters</button>
  </section>
}
