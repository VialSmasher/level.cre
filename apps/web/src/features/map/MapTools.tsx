import { MousePointer, MapPin, Shapes, LocateFixed, Map as MapIcon, Satellite, Square } from 'lucide-react';

interface MapToolsProps {
  onPolygon?: () => void;
  onPin?: () => void;
  onPan?: () => void;
  onMyLocation?: () => void;
  mapType?: 'roadmap' | 'hybrid';
  onMapTypeChange?: (type: 'roadmap' | 'hybrid') => void;
  onRectangle?: () => void;
  onSelect?: () => void;
  activeTerraMode?: 'select' | 'point' | 'polygon' | 'rectangle' | null;
}

export function MapTools({
  onPolygon,
  onPin,
  onPan,
  onMyLocation,
  mapType = 'roadmap',
  onMapTypeChange,
  onRectangle,
  onSelect,
  activeTerraMode = null,
}: MapToolsProps) {
  const buttonClass = 'grid h-9 w-9 shrink-0 place-items-center rounded-md text-[15px] transition-colors active:scale-95';
  const inactiveClass = 'text-slate-600 hover:bg-slate-100 hover:text-slate-950';
  const activeClass = 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200';

  // Wire these to your actual handlers as props or context
  return (
    <div className="flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-slate-300 bg-white p-1 shadow-[0_4px_14px_rgba(15,23,42,0.10)]">
      <button
        aria-label="Toggle Map Type"
        title={mapType === 'hybrid' ? 'Map' : 'Hybrid'}
        className={`${buttonClass} ${inactiveClass}`}
        onClick={() => onMapTypeChange?.(mapType === 'roadmap' ? 'hybrid' : 'roadmap')}
      >
        {mapType === 'hybrid' ? (
          <MapIcon className="w-4 h-4" strokeWidth={1.5} />
        ) : (
          <Satellite className="w-4 h-4" strokeWidth={1.5} />
        )}
      </button>
      <button aria-label="Pan" title="Pan" className={`${buttonClass} ${activeTerraMode === 'select' ? activeClass : inactiveClass}`} onClick={onSelect}>
        <MousePointer className="w-4 h-4" strokeWidth={1.5} />
      </button>
      <button aria-label="Drop Pin" title="Point" className={`${buttonClass} ${activeTerraMode === 'point' ? activeClass : inactiveClass}`} onClick={onPin}>
        <MapPin className="w-4 h-4" strokeWidth={1.5} />
      </button>
      <button aria-label="Draw Polygon" title="Polygon" className={`${buttonClass} ${activeTerraMode === 'polygon' ? activeClass : inactiveClass}`} onClick={onPolygon}>
        <Shapes className="w-4 h-4" strokeWidth={1.5} />
      </button>
      <button aria-label="Draw Rectangle" title="Rectangle" className={`${buttonClass} ${activeTerraMode === 'rectangle' ? activeClass : inactiveClass}`} onClick={onRectangle}>
        <Square className="w-4 h-4" strokeWidth={1.5} />
      </button>
      <button aria-label="My Location" title="My Location" className={`${buttonClass} ${inactiveClass}`} onClick={onMyLocation}>
        <LocateFixed className="w-4 h-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
