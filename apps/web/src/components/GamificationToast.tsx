import React, { useEffect, useState } from 'react';

interface GamificationToastProps {
  xp: number;
  label?: string;
  onDone?: () => void;
}

export function GamificationToast({ xp, label, onDone }: GamificationToastProps) {
  const [visible, setVisible] = useState(false);

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
      className={`pointer-events-none absolute bottom-11 left-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 shadow transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
      role="status"
      aria-live="polite"
    >
      {label ? `${label} ` : ''}+{xp} XP
    </div>
  );
}
