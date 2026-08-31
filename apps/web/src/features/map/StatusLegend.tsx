import { useState } from 'react';
import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { STATUS_META, type ProspectStatusType } from '@level-cre/shared/schema';
import {
  MAP_STATUS_KEYS,
  STATUS_FILTER_PRESETS,
  createAllStatusFilterSet,
  type StatusCounts,
} from './statusFilters';
import {
  MAP_PROSPECT_TYPE_KEYS,
  PROSPECT_TYPE_FILTER_META,
  createAllProspectTypeFilterSet,
  type ProspectTypeCounts,
  type ProspectTypeFilterKey,
} from './prospectTypeFilters';

interface StatusLegendProps {
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

export function StatusLegend({
  selected,
  onToggle,
  onChange,
  counts,
  selectedProspectTypes,
  onProspectTypeToggle,
  onProspectTypesChange,
  prospectTypeCounts,
  defaultOpen = false,
}: StatusLegendProps) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultOpen;
    return window.matchMedia('(min-width: 640px)').matches ? defaultOpen : false;
  });

  const selectedSet = selected ?? createAllStatusFilterSet();
  const selectedCount = selectedSet.size;
  const totalCount = MAP_STATUS_KEYS.length;
  const canSetPreset = Boolean(onChange);
  const selectedProspectTypeSet = selectedProspectTypes ?? createAllProspectTypeFilterSet();
  const selectedProspectTypeCount = selectedProspectTypeSet.size;

  const handlePreset = (statuses: ProspectStatusType[]) => {
    onChange?.(new Set(statuses));
  };

  const handleClear = () => {
    onChange?.(new Set());
  };

  return (
    <div
      className={`z-[90] select-none rounded-md border border-slate-300 bg-white text-slate-900 shadow-[0_10px_28px_rgba(15,23,42,0.14)] ${
        open
          ? 'fixed inset-x-3 bottom-20 max-h-[72dvh] overflow-hidden sm:static sm:inset-auto sm:w-72'
          : 'w-fit'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 hover:bg-slate-50"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800">
          <SlidersHorizontal className="h-4 w-4 text-blue-600" aria-hidden />
          <span>Map filters</span>
          <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {selectedCount}/{totalCount} · {selectedProspectTypeCount}/{MAP_PROSPECT_TYPE_KEYS.length}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden />
      </button>
      {open && (
        <div className="max-h-[calc(72dvh-2.5rem)] overflow-y-auto px-3 pb-3">
          <div className="border-t border-slate-200 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Lifecycle status
          </div>
          {canSetPreset && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {STATUS_FILTER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePreset(preset.statuses)}
                  className="min-h-8 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-left text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 space-y-1">
            {MAP_STATUS_KEYS.map((key) => {
              const meta = STATUS_META[key];
              const active = selected ? selected.has(key as ProspectStatusType) : true;
              const rowClasses = `flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1 text-left ${
                onToggle ? 'cursor-pointer' : ''
              } ${active ? 'bg-blue-50 text-slate-950' : 'text-slate-400 hover:bg-slate-50'}`;
              return (
                <button
                  key={key}
                  type="button"
                  className={rowClasses}
                  onClick={onToggle ? () => onToggle(key as ProspectStatusType) : undefined}
                  aria-pressed={active}
                >
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full border border-black/10"
                    style={{ backgroundColor: meta.color }}
                  />
                  <span className="min-w-0 flex-1 text-sm">{meta.label}</span>
                  <span className="rounded-sm border border-slate-200 bg-white px-2 py-0.5 text-xs tabular-nums text-slate-600">
                    {counts?.[key] ?? 0}
                  </span>
                  {active && <Check className="h-4 w-4 text-blue-600" aria-hidden />}
                </button>
              );
            })}
          </div>

          {canSetPreset && (
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2">
              <button
                type="button"
                onClick={() => handlePreset(MAP_STATUS_KEYS)}
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Clear
              </button>
            </div>
          )}

          <div className="mt-3 border-t border-slate-200 pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Prospect type</div>
            <p className="mt-1 text-xs leading-4 text-slate-500">Independent from lifecycle status.</p>
            <div className="mt-2 space-y-1">
              {MAP_PROSPECT_TYPE_KEYS.map((key) => {
                const meta = PROSPECT_TYPE_FILTER_META[key];
                const active = selectedProspectTypeSet.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1 text-left ${
                      onProspectTypeToggle ? 'cursor-pointer' : ''
                    } ${active ? 'bg-teal-50 text-slate-950' : 'text-slate-400 hover:bg-slate-50'}`}
                    onClick={onProspectTypeToggle ? () => onProspectTypeToggle(key) : undefined}
                    aria-pressed={active}
                  >
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full border border-black/10"
                      style={{ backgroundColor: meta.color }}
                    />
                    <span className="min-w-0 flex-1 text-sm">{meta.label}</span>
                    <span className="rounded-sm border border-slate-200 bg-white px-2 py-0.5 text-xs tabular-nums text-slate-600">
                      {prospectTypeCounts?.[key] ?? 0}
                    </span>
                    {active && <Check className="h-4 w-4 text-teal-700" aria-hidden />}
                  </button>
                );
              })}
            </div>
            {onProspectTypesChange && (
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2">
                <button
                  type="button"
                  onClick={() => onProspectTypesChange(createAllProspectTypeFilterSet())}
                  className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => onProspectTypesChange(new Set())}
                  className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
