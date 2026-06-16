import React, { useEffect, useState } from 'react';

interface GamificationToastProps {
  xp: number;
  label?: string;
  onDone?: () => void;
}

export function GamificationToast({ xp, label, onDone }: GamificationToastProps) {
  const [visible, setVisible] = useState(false);
  const message = label || 'Activity saved';

  useEffect(() => {
    const inTimer = window.setTimeout(() => setVisible(true), 10);
    const outTimer = window.setTimeout(() => setVisible(false), 900);
    const doneTimer = window.setTimeout(() => onDone?.(), 1250);
    return () => {
      window.clearTimeout(inTimer);
      window.clearTimeout(outTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div
      className={`pointer-events-none absolute bottom-11 left-2 rounded-md border border-border bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
      role="status"
      aria-live="polite"
      data-activity-value={xp}
    >
      {message}
    </div>
  );
}
