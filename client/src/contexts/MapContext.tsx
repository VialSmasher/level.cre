import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Map state interface
interface MapState {
  center: {
    lat: number;
    lng: number;
  };
  zoom: number;
  mapTypeId: string; // Use string instead of google.maps.MapTypeId to avoid dependency
}

// Context interface
interface MapContextType {
  mapState: MapState;
  updateCenter: (center: { lat: number; lng: number }) => void;
  updateZoom: (zoom: number) => void;
  updateMapType: (mapTypeId: string) => void;
  updateMapState: (state: Partial<MapState>) => void;
}

// Default map state - Edmonton area
const defaultMapState: MapState = {
  center: {
    lat: 53.5461,
    lng: -113.4938
  },
  zoom: 11,
  mapTypeId: 'roadmap' // Use string constant
};

// Create context
const MapContext = createContext<MapContextType | undefined>(undefined);

// Provider component
interface MapProviderProps {
  children: ReactNode;
}

export function MapProvider({ children }: MapProviderProps) {
  const [mapState, setMapState] = useState<MapState>(() => {
    // Try to load from localStorage on initialization
    const savedState = localStorage.getItem('mapViewState');
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        // Validate the parsed state has required properties
        if (parsed.center && parsed.zoom && parsed.mapTypeId) {
          return {
            center: parsed.center,
            zoom: parsed.zoom,
            mapTypeId: parsed.mapTypeId
          };
        }
      } catch (error) {
        console.warn('Failed to parse saved map state:', error);
      }
    }
    return defaultMapState;
  });

  // Save to localStorage whenever map state changes
  useEffect(() => {
    localStorage.setItem('mapViewState', JSON.stringify(mapState));
  }, [mapState]);

  const updateCenter = (center: { lat: number; lng: number }) => {
    setMapState(prev => ({ ...prev, center }));
  };

  const updateZoom = (zoom: number) => {
    setMapState(prev => ({ ...prev, zoom }));
  };

  const updateMapType = (mapTypeId: string) => {
    setMapState(prev => ({ ...prev, mapTypeId }));
  };

  const updateMapState = (state: Partial<MapState>) => {
    setMapState(prev => ({ ...prev, ...state }));
  };

  const value: MapContextType = {
    mapState,
    updateCenter,
    updateZoom,
    updateMapType,
    updateMapState
  };

  return (
    <MapContext.Provider value={value}>
      {children}
    </MapContext.Provider>
  );
}

// Custom hook to use map context
export function useMapContext(): MapContextType {
  const context = useContext(MapContext);
  if (context === undefined) {
    throw new Error('useMapContext must be used within a MapProvider');
  }
  return context;
}