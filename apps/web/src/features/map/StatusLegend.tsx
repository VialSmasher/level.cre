import { useState } from 'react';
import { Check, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { STATUS_META, type ProspectStatusType } from '@level-cre/shared/schema';
import {
  MAP_STATUS_KEYS,
  STATUS_FILTER_PRESETS,
  createAllStatusFilterSet,
  type StatusCounts,
} from './statusFilters';

interface StatusLegendProps {
  selected?: Set<ProspectStatusType>;
  onToggle?: (key: ProspectStatusType) => void;
  onChange?: (next: Set<ProspectStatusType>) => void;
  counts?: Partial<StatusCounts>;
  defaultOpen?: boolean;
}

export function StatusLegend({ selected, onToggle, onChange, counts, defaultOpen = true }: StatusLegendProps) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultOpen;
    return window.matchMedia('(min-width: 640px)').matches ? defaultOpen : false;
  });

  const selectedSet = selected ?? createAllStatusFilterSet();
  const selectedCount = selectedSet.size;
  const totalCount = MAP_STATUS_KEYS.length;
  const canSetPreset = Boolean(onChange);

  const handlePreset = (statuses: ProspectStatusType[]) => {
    onChange?.(new Set(statuses));
  };

  const handleClear = () => {
    onChange?.(new Set());
  };

  return (
    <div
      className={`z-[90] select-none rounded-lg bg-neutral-950/90 text-white shadow-xl backdrop-blur ${
        open
          ? 'fixed inset-x-3 bottom-3 max-h-[78dvh] overflow-hidden sm:static sm:inset-auto sm:w-72'
          : 'w-fit sm:w-72'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold opacity-90">
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          <span>Status</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium">
            {selectedCount}/{totalCount}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden />
      </button>
      {open && (
        <div className="max-h-[calc(78dvh-2.5rem)] overflow-y-auto px-3 pb-3">
          {canSetPreset && (
            <div className="grid grid-cols-2 gap-1.5 border-t border-white/10 pt-3 sm:grid-cols-3">
              {STATUS_FILTER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePreset(preset.statuses)}
                  className="min-h-8 rounded-md bg-white/10 px-2 py-1 text-left text-xs font-medium text-white/90 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/40"
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
              } ${active ? 'bg-white/15 text-white' : 'bg-white/5 text-white/55'}`;
              return (
                <button
                  key={key}
                  type="button"
                  className={rowClasses}
                  onClick={onToggle ? () => onToggle(key as ProspectStatusType) : undefined}
                  aria-pressed={active}
                >
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: meta.color }}
                  />
                  <span className="min-w-0 flex-1 text-sm">{meta.label}</span>
                  <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs tabular-nums text-white/80">
                    {counts?.[key] ?? 0}
                  </span>
                  {active && <Check className="h-4 w-4 text-white/80" aria-hidden />}
                </button>
              );
            })}
          </div>

          {canSetPreset && (
            <div className="mt-2 flex justify-between border-t border-white/10 pt-2">
              <button
                type="button"
                onClick={() => handlePreset(MAP_STATUS_KEYS)}
                className="rounded-md px-2 py-1 text-xs font-medium text-white/75 hover:bg-white/10"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="rounded-md px-2 py-1 text-xs font-medium text-white/75 hover:bg-white/10"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
