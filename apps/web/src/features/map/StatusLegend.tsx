import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { STATUS_META, type ProspectStatusType } from '@level-cre/shared/schema';

interface StatusLegendProps {
  selected?: Set<ProspectStatusType>;
  onToggle?: (key: ProspectStatusType) => void;
  defaultOpen?: boolean;
}

export function StatusLegend({ selected, onToggle, defaultOpen = true }: StatusLegendProps) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultOpen;
    return window.matchMedia('(min-width: 640px)').matches ? defaultOpen : false;
  });

  return (
    <div className="w-48 select-none rounded-lg bg-neutral-900/90 text-white shadow-lg sm:w-56">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-3 py-2"
      >
        <span className="text-sm font-semibold opacity-90">Status</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden />
      </button>
      {open && (
        <div className="space-y-1 px-3 pb-3">
          {Object.entries(STATUS_META).map(([key, meta]) => {
            const active = selected ? selected.has(key as ProspectStatusType) : true;
            const rowClasses = `flex items-center gap-2 rounded-md bg-neutral-800 px-2 py-1 ${
              onToggle ? 'cursor-pointer' : ''
            } ${active ? '' : 'opacity-50'}`;
            return (
              <div
                key={key}
                className={rowClasses}
                onClick={onToggle ? () => onToggle(key as ProspectStatusType) : undefined}
              >
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
                <span className="text-sm">{meta.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
