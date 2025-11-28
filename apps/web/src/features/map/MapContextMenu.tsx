import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type MapContextMenuProps = {
  anchor: { x: number; y: number };
  latLng: { lat: number; lng: number };
  onCopy: () => void;
  onOpenMaps?: () => void | Promise<void>;
  onCreateProspect: () => void;
  onClose: () => void;
  canCreate?: boolean;
};

export function MapContextMenu({
  anchor,
  latLng,
  onCopy,
  onOpenMaps,
  onCreateProspect,
  onClose,
  canCreate = true,
}: MapContextMenuProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  if (typeof document === 'undefined') return null;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = 240;
  const rowHeight = 42;
  const dividerHeight = 2; // approx margin w/ divider
  const buttonCount = 3;
  const height = rowHeight * buttonCount + dividerHeight;
  const left = Math.min(anchor.x, viewportWidth - width - 8);
  const top = Math.min(anchor.y, viewportHeight - height - 8);
  const coordsLabel = `${latLng.lat.toFixed(6)}, ${latLng.lng.toFixed(6)}`;

  const handleCopyClick = async () => {
    try {
      await Promise.resolve(onCopy());
      setCopied(true);
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const menu = (
    <div
      role="menu"
      aria-label="Map actions"
      className="fixed bg-white min-w-[200px] shadow-xl rounded-md py-1 z-50 focus:outline-none"
      style={{ top, left, width }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <button
        type="button"
        className={`flex w-full items-center justify-center px-4 py-1.5 text-sm font-medium tracking-wide hover:bg-gray-100 cursor-pointer transition-colors ${copied ? 'text-green-600' : 'text-gray-800'}`}
        onClick={handleCopyClick}
        title="Copy coordinates"
        aria-label={`Copy ${coordsLabel}`}
      >
        <span className="font-mono text-center">{coordsLabel}</span>
      </button>
      <a
        href={`https://maps.google.com/search/?api=1&query=${latLng.lat},${latLng.lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block px-4 py-1.5 hover:bg-gray-100 cursor-pointer text-gray-700 text-sm"
        aria-label="Open in Google Maps"
        title="Open in Google Maps"
        onClick={(e) => {
          e.stopPropagation();
          try { onOpenMaps?.(); } catch {}
          requestAnimationFrame(() => onClose());
        }}
      >
        Open in Google Maps
      </a>
      <div className="h-px bg-gray-200 my-0.5" />
      <button
        type="button"
        className={`w-full text-left px-4 py-1.5 text-sm ${canCreate ? 'text-gray-700 hover:bg-gray-100 cursor-pointer' : 'text-gray-400 cursor-not-allowed'}`}
        onClick={() => {
          if (!canCreate) return;
          onCreateProspect();
          onClose();
        }}
        disabled={!canCreate}
        aria-label="Add new asset here"
        title="Add new asset here"
      >
        Add new asset here
      </button>
    </div>
  );

  return createPortal(menu, document.body);
}
