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
  // Wire these to your actual handlers as props or context
  return (
    <div className="flex items-center gap-1.5 bg-white/95 shadow-sm border border-gray-200 px-2 py-1 w-fit">
      <button
        aria-label="Toggle Map Type"
        title={mapType === 'hybrid' ? 'Map' : 'Hybrid'}
        className="h-7 w-7 grid place-items-center text-gray-700 hover:bg-gray-100 active:scale-95 text-[15px]"
        onClick={() => onMapTypeChange?.(mapType === 'roadmap' ? 'hybrid' : 'roadmap')}
      >
        {mapType === 'hybrid' ? (
          <MapIcon className="w-4 h-4" strokeWidth={1.5} />
        ) : (
          <Satellite className="w-4 h-4" strokeWidth={1.5} />
        )}
      </button>
      <button aria-label="Pan" title="Pan" className={`h-7 w-7 grid place-items-center ${activeTerraMode === 'select' ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100'} active:scale-95 text-[15px]`} onClick={onSelect}>
        <MousePointer className="w-4 h-4" strokeWidth={1.5} />
      </button>
      <button aria-label="Drop Pin" title="Point" className={`h-7 w-7 grid place-items-center ${activeTerraMode === 'point' ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100'} active:scale-95 text-[15px]`} onClick={onPin}>
        <MapPin className="w-4 h-4" strokeWidth={1.5} />
      </button>
      <button aria-label="Draw Polygon" title="Polygon" className={`h-7 w-7 grid place-items-center ${activeTerraMode === 'polygon' ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100'} active:scale-95 text-[15px]`} onClick={onPolygon}>
        <Shapes className="w-4 h-4" strokeWidth={1.5} />
      </button>
      <button aria-label="Draw Rectangle" title="Rectangle" className={`h-7 w-7 grid place-items-center ${activeTerraMode === 'rectangle' ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100'} active:scale-95 text-[15px]`} onClick={onRectangle}>
        <Square className="w-4 h-4" strokeWidth={1.5} />
      </button>      <button aria-label="My Location" title="My Location" className="h-7 w-7 grid place-items-center text-gray-700 hover:bg-gray-100 active:scale-95 text-[15px]" onClick={onMyLocation}>
        <LocateFixed className="w-4 h-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
