import { Map as MapIcon, Satellite } from 'lucide-react';

interface MapTypeToggleProps {
  mapType: 'roadmap' | 'hybrid';
  onChange?: (type: 'roadmap' | 'hybrid') => void;
}

export function MapTypeToggle({ mapType, onChange }: MapTypeToggleProps) {
  const nextType: 'roadmap' | 'hybrid' = mapType === 'roadmap' ? 'hybrid' : 'roadmap';
  const isHybrid = mapType === 'hybrid';

  return (
    <div className="bg-white/95 shadow-sm border border-gray-200 w-fit">
      <button
        type="button"
        aria-label={isHybrid ? 'Switch to default map' : 'Switch to hybrid map'}
        title={isHybrid ? 'Map' : 'Hybrid'}
        className={`h-7 w-7 grid place-items-center ${isHybrid ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'text-gray-700 hover:bg-gray-100'}`}
        onClick={() => onChange?.(nextType)}
      >
        {isHybrid ? <MapIcon className="w-4 h-4" /> : <Satellite className="w-4 h-4" />}
      </button>
    </div>
  );
}
