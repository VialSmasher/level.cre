import { createPortal } from 'react-dom';
import { PlusCircle, Copy, ExternalLink } from 'lucide-react';

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
  if (typeof document === 'undefined') return null;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = 256;
  const headerHeight = 48;
  const buttonHeight = 40;
  const buttonCount = 3; // Copy, Open, Create (Create may be disabled but still rendered)
  const height = headerHeight + buttonCount * buttonHeight;
  const left = Math.min(anchor.x, viewportWidth - width - 8);
  const top = Math.min(anchor.y, viewportHeight - height - 8);
  const coordsLabel = `${latLng.lat.toFixed(6)}, ${latLng.lng.toFixed(6)}`;
  const itemBase = 'w-full px-3 py-2 text-left text-sm focus:outline-none transition-colors';

  const menu = (
    <div
      role="menu"
      aria-label="Map actions"
      className="fixed z-[2000] rounded-lg border border-gray-200 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.15)] focus:outline-none overflow-hidden"
      style={{ top, left, width }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <button
        type="button"
        className="w-full px-3 py-2 text-left text-sm font-medium text-gray-800 border-b border-gray-100 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none flex items-center justify-between"
        onClick={async () => {
          try {
            await onCopy();
          } finally {
            onClose();
          }
        }}
        title="Copy coordinates"
        aria-label={`Copy ${coordsLabel}`}
      >
        <span className="font-mono tracking-tight">{coordsLabel}</span>
        <Copy className="h-4 w-4 text-gray-500" aria-hidden />
      </button>
      <a
        href={`https://www.google.com/maps?q=${latLng.lat},${latLng.lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`${itemBase} text-gray-700 hover:bg-gray-100 focus:bg-gray-100 flex items-center justify-between`}
        onClick={() => {
          try { onOpenMaps?.(); } catch {}
          // Delay closing slightly so the browser can complete the default navigation.
          requestAnimationFrame(() => onClose());
        }}
      >
        <span>Open in Google Maps</span>
        <ExternalLink className="h-4 w-4 text-gray-500" aria-hidden />
      </a>
      <button
        type="button"
        className={`${itemBase} ${canCreate ? 'text-blue-600 hover:bg-blue-50 focus:bg-blue-50' : 'text-gray-300 cursor-not-allowed'}`}
        onClick={() => {
          if (!canCreate) return;
          onCreateProspect();
          onClose();
        }}
        disabled={!canCreate}
        aria-label="Create prospect here"
        title="Create prospect here"
      >
        <PlusCircle className="h-4 w-4 mx-auto" />
        <span className="sr-only">Create prospect here</span>
      </button>
    </div>
  );

  return createPortal(menu, document.body);
}
