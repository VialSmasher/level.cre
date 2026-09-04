import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { INVENTORY_CLASSES, INVENTORY_CLASS_META } from '@level-cre/shared';
import { STATUS_META, type ProspectStatusType } from '@level-cre/shared/schema';
import { MAP_STATUS_KEYS, RELATIONSHIP_DESCRIPTIONS, createDefaultStatusFilterSet, type StatusCounts } from './statusFilters';
import { MAP_PROSPECT_TYPE_KEYS, PROSPECT_TYPE_FILTER_META, createAllProspectTypeFilterSet, type ProspectTypeCounts, type ProspectTypeFilterKey } from './prospectTypeFilters';
import { UNCLASSIFIED_PROPERTY_META } from './propertyPresentation';

interface StatusLegendProps {
  inventoryControls?: ReactNode;
  selected?: Set<ProspectStatusType>;
  onToggle?: (key: ProspectStatusType) => void;
  onChange?: (next: Set<ProspectStatusType>) => void;
  counts?: Partial<StatusCounts>;
  selectedProspectTypes?: Set<ProspectTypeFilterKey>;
  onProspectTypeToggle?: (key: ProspectTypeFilterKey) => void;
  onProspectTypesChange?: (next: Set<ProspectTypeFilterKey>) => void;
  prospectTypeCounts?: Partial<ProspectTypeCounts>;
  defaultOpen?: boolean;
}

export function StatusLegend({ inventoryControls, selected, onToggle, onChange, counts, selectedProspectTypes, onProspectTypeToggle, onProspectTypesChange, prospectTypeCounts, defaultOpen = false }: StatusLegendProps) {
  const [open, setOpen] = useState(defaultOpen);
  const selectedSet = selected ?? createDefaultStatusFilterSet();
  const typeSet = selectedProspectTypes ?? createAllProspectTypeFilterSet();
  const toggleStatus = (key: ProspectStatusType) => {
    if (onToggle) return onToggle(key);
    const next = new Set(selectedSet);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange?.(next);
  };
  const propertyKey = [...INVENTORY_CLASSES.map(key => INVENTORY_CLASS_META[key]), UNCLASSIFIED_PROPERTY_META];
  return <div className={`z-[90] select-none rounded-md border border-slate-300 bg-white text-slate-900 shadow-lg ${open ? 'fixed inset-x-3 bottom-20 max-h-[72dvh] overflow-hidden sm:static sm:inset-auto sm:w-72' : 'w-fit'}`}>
    <button type="button" data-testid="map-filters-toggle" onClick={() => setOpen(value => !value)} className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2.5 hover:bg-slate-50" aria-expanded={open}>
      <span className="flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="h-4 w-4" aria-hidden />Map filters<span className="text-xs font-normal text-slate-500">{selectedSet.size}/{MAP_STATUS_KEYS.length} · {typeSet.size}/{MAP_PROSPECT_TYPE_KEYS.length}</span></span>
      <ChevronDown className={`h-4 w-4 ${open ? '' : '-rotate-90'}`} aria-hidden />
    </button>
    {open && <div className="max-h-[calc(72dvh-2.75rem)] overflow-y-auto px-3 pb-3">
      <section aria-label="Property type color key" className="border-t py-3">
        <p className="text-xs font-semibold">Map colors show property type</p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-2">{propertyKey.map(meta => <span key={meta.label} className="flex items-center gap-1.5 text-[11px]"><span className="flex h-5 w-5 items-center justify-center rounded-full font-bold text-white" style={{backgroundColor:meta.color}}>{meta.marker}</span>{meta.label}</span>)}</div>
        <p className="mt-2 text-[11px] text-slate-500">Colored rings show mixed property types. Gray is unclassified. R marks research.</p></section>
      {inventoryControls}
      <details className="border-t border-slate-200 py-3" aria-label="Relationship and pipeline filters">
        <summary className="cursor-pointer text-xs font-semibold">Relationship &amp; pipeline <span className="font-normal text-slate-500">{selectedSet.size}/{MAP_STATUS_KEYS.length}</span></summary>
        <p className="mt-2 text-xs leading-4 text-slate-500">Filter brokerage relationships. Due work is in Today.</p>
        <div className="mt-2 space-y-1">{MAP_STATUS_KEYS.filter(key => key !== 'no_go').map(key => <button key={key} type="button" onClick={() => toggleStatus(key)} aria-pressed={selectedSet.has(key)} title={RELATIONSHIP_DESCRIPTIONS[key]} className={`flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-xs ${selectedSet.has(key) ? 'bg-slate-100 text-slate-950' : 'text-slate-500'}`}>
          <span className="flex-1">{STATUS_META[key].label}{key === 'development' ? ' · review' : ''}</span><span className="tabular-nums">{counts?.[key] ?? 0}</span>{selectedSet.has(key) && <Check className="h-4 w-4" aria-hidden />}
        </button>)}</div>
        <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-xs"><input type="checkbox" checked={selectedSet.has('no_go')} onChange={() => toggleStatus('no_go')} />Include No Go <span className="ml-auto tabular-nums">{counts?.no_go ?? 0}</span></label>
        <p className="text-[11px] leading-4 text-slate-500">No Go history is retained. Development remains unchanged pending review.</p>
        {onChange && <button type="button" onClick={() => onChange(createDefaultStatusFilterSet())} className="mt-2 min-h-9 text-xs font-medium text-blue-700">Reset relationships</button>}
      </details>
      {onProspectTypeToggle && <details className="border-t border-slate-200 pt-3" aria-label="Pursuit type filters">
        <summary className="cursor-pointer text-xs font-semibold">Pursuit type</summary>
        <div className="mt-2 space-y-1">{MAP_PROSPECT_TYPE_KEYS.map(key => <button key={key} type="button" aria-pressed={typeSet.has(key)} onClick={() => onProspectTypeToggle?.(key)} className={`flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-xs ${typeSet.has(key) ? 'bg-slate-100' : 'text-slate-500'}`}><span className="flex-1">{PROSPECT_TYPE_FILTER_META[key].label}</span><span>{prospectTypeCounts?.[key] ?? 0}</span>{typeSet.has(key) && <Check className="h-4 w-4" aria-hidden />}</button>)}</div>
        {onProspectTypesChange && <button type="button" onClick={() => onProspectTypesChange(createAllProspectTypeFilterSet())} className="mt-2 min-h-9 text-xs font-medium text-blue-700">Show all pursuit types</button>}
      </details>}
    </div>}
  </div>;
}

