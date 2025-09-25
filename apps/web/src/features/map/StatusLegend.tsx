import { useState } from 'react';
import { STATUS_META, type ProspectStatusType } from '@level-cre/shared/schema';

interface StatusLegendProps {
  selected?: Set<ProspectStatusType>;
  onToggle?: (key: ProspectStatusType) => void;
  defaultOpen?: boolean;
}

export function StatusLegend({ selected, onToggle, defaultOpen = true }: StatusLegendProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen);

  return (
    <div className="rounded-xl bg-neutral-900/90 text-white shadow-lg w-56 select-none">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2"
      >
        <span className="text-sm font-semibold opacity-90">Status</span>
        <span className={`transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden>▾</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1">
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
