import { MousePointer, MapPin, Shapes } from 'lucide-react';

interface MapToolsProps {
  onPolygon?: () => void;
  onPin?: () => void;
  onPan?: () => void;
}

export function MapTools({
  onPolygon,
  onPin,
  onPan,
}: MapToolsProps) {
  // Wire these to your actual handlers as props or context
  return (
    <div className="flex items-center gap-1.5 bg-white/95 shadow-sm border border-gray-200 px-2 py-1 w-fit">
      <button aria-label="Drop Pin" className="h-7 w-7 grid place-items-center text-gray-700 hover:bg-gray-100 active:scale-95 text-[15px]" onClick={onPin}>
        <MapPin className="w-4 h-4" strokeWidth={1.5} />
      </button>
      <button aria-label="Draw Polygon" className="h-7 w-7 grid place-items-center text-gray-700 hover:bg-gray-100 active:scale-95 text-[15px]" onClick={onPolygon}>
        <Shapes className="w-4 h-4" strokeWidth={1.5} />
      </button>
      <button aria-label="Pan/Hand" className="h-7 w-7 grid place-items-center text-gray-700 hover:bg-gray-100 active:scale-95 text-[15px]" onClick={onPan}>
        <MousePointer className="w-4 h-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
