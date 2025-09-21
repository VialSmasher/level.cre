import { SearchBar } from './SearchBar';
import { MapTools } from './MapTools';

interface MapControlsProps {
  className?: string;
  onSearch: (location: { lat: number; lng: number; address: string; businessName?: string | null; websiteUrl?: string | null }) => void;
  onPolygon?: () => void;
  onPin?: () => void;
  onPan?: () => void;
}

export function MapControls({
  className = '',
  onSearch,
  onPolygon,
  onPin,
  onPan,
}: MapControlsProps) {
  return (
    <div className={`absolute top-4 left-4 z-50 flex flex-col gap-3 ${className}`}>
      <SearchBar onSearch={onSearch} />
      <MapTools
        onPolygon={onPolygon}
        onPin={onPin}
        onPan={onPan}
      />
    </div>
  );
}
