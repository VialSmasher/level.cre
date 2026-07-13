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
  const buttonClass = 'grid h-9 w-9 shrink-0 place-items-center rounded-md text-[15px] transition-colors active:translate-y-px';
  const inactiveClass = 'text-slate-600 hover:bg-slate-100 hover:text-slate-950';
  const activeClass = 'bg-blue-600 text-white shadow-sm';

  // Wire these to your actual handlers as props or context
  return (
    <div className="flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-md border border-slate-300 bg-white p-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
      <button
        aria-label={mapType === 'hybrid' ? 'Show road map' : 'Show aerial map'}
        title={mapType === 'hybrid' ? 'Road map' : 'Aerial map'}
        className={`${buttonClass} ${inactiveClass}`}
        onClick={() => onMapTypeChange?.(mapType === 'roadmap' ? 'hybrid' : 'roadmap')}
      >
        {mapType === 'hybrid' ? (
          <MapIcon className="w-4 h-4" strokeWidth={1.5} />
        ) : (
          <Satellite className="w-4 h-4" strokeWidth={1.5} />
        )}
      </button>
      <span className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" aria-hidden />
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
      <span className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" aria-hidden />
      <button aria-label="My Location" title="My Location" className={`${buttonClass} ${inactiveClass}`} onClick={onMyLocation}>
        <LocateFixed className="w-4 h-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
