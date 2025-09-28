import { SearchBar } from './SearchBar';
import { MapTools } from './MapTools';

interface MapControlsProps {
  className?: string;
  onSearch: (location: { lat: number; lng: number; address: string; businessName?: string | null; websiteUrl?: string | null }) => void;
  bounds?: google.maps.LatLngBoundsLiteral | null;
  defaultCenter?: { lat: number; lng: number };
  clearSearchSignal?: number;
  onPolygon?: () => void;
  onPin?: () => void;
  onPan?: () => void;
  mapType?: 'roadmap' | 'hybrid';
  onMapTypeChange?: (type: 'roadmap' | 'hybrid') => void;
  onMyLocation?: () => void;
  children?: React.ReactNode;
  onRectangle?: () => void;
  onSelect?: () => void;
  activeTerraMode?: 'select' | 'point' | 'polygon' | 'rectangle' | null;
}

export function MapControls({
  className = '',
  onSearch,
  bounds,
  defaultCenter,
  clearSearchSignal,
  onPolygon,
  onPin,
  onPan,
  mapType = 'roadmap',
  onMapTypeChange,
  onMyLocation,
  children,
  onRectangle,
  onSelect,
  activeTerraMode = null,
}: MapControlsProps) {
  return (
    <div className={`absolute top-4 left-4 z-50 flex flex-col gap-3 ${className}`}>
      <SearchBar onSearch={onSearch} bounds={bounds ?? null} defaultCenter={defaultCenter} clearSignal={clearSearchSignal} />
      <MapTools
        onPolygon={onPolygon}
        onPin={onPin}
        onPan={onPan}
        onMyLocation={onMyLocation}
        mapType={mapType}
        onMapTypeChange={onMapTypeChange}
        onRectangle={onRectangle}
        onSelect={onSelect}
        activeTerraMode={activeTerraMode}
      />
      {children}
    </div>
  );
}
