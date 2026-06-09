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
  const buttonClass = 'grid h-10 w-10 shrink-0 place-items-center rounded text-[15px] active:scale-95 sm:h-7 sm:w-7';
  const inactiveClass = 'text-gray-700 hover:bg-gray-100';
  const activeClass = 'bg-gray-100 text-gray-900';

  // Wire these to your actual handlers as props or context
  return (
    <div className="flex w-fit max-w-full items-center gap-1.5 overflow-x-auto rounded-md border border-gray-200 bg-white/95 px-2 py-1.5 shadow-sm sm:py-1">
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
