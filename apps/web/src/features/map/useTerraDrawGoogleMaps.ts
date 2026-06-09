import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TerraDraw,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawRectangleMode,
  TerraDrawSelectMode,
  type GeoJSONStoreFeatures,
} from 'terra-draw';
import { TerraDrawGoogleMapsAdapter } from 'terra-draw-google-maps-adapter';
import type { ProspectGeometryType } from '@level-cre/shared/schema';

export type MapDrawMode = 'select' | 'point' | 'polygon' | 'rectangle';

export type TerraDrawFinishPayload = {
  id: string | number;
  mode: Exclude<MapDrawMode, 'select'>;
  feature: GeoJSONStoreFeatures;
  geometry: ProspectGeometryType;
};

type UseTerraDrawGoogleMapsOptions = {
  map: google.maps.Map | null;
  enabled?: boolean;
  onFinish: (payload: TerraDrawFinishPayload) => void | Promise<void>;
  onUnavailable?: () => void;
  onError?: (error: unknown) => void;
};

const isLngLat = (coordinate: unknown): coordinate is [number, number] => {
  return (
    Array.isArray(coordinate) &&
    coordinate.length >= 2 &&
    Number.isFinite(Number(coordinate[0])) &&
    Number.isFinite(Number(coordinate[1]))
  );
};

const closeRing = (ring: [number, number][]) => {
  if (ring.length === 0) return ring;
  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];
  if (firstLng === lastLng && firstLat === lastLat) return ring;
  return [...ring, [firstLng, firstLat] as [number, number]];
};

export function prospectGeometryFromTerraFeature(feature: GeoJSONStoreFeatures): ProspectGeometryType | null {
  if (feature.geometry.type === 'Point') {
    const coordinate = feature.geometry.coordinates;
    if (!isLngLat(coordinate)) return null;
    return {
      type: 'Point',
      coordinates: [Number(coordinate[0]), Number(coordinate[1])],
    };
  }

  if (feature.geometry.type === 'Polygon') {
    const rings = feature.geometry.coordinates
      .map((ring) => ring.filter(isLngLat).map(([lng, lat]) => [Number(lng), Number(lat)] as [number, number]))
      .filter((ring) => ring.length >= 3)
      .map(closeRing);

    if (rings.length === 0) return null;

    return {
      type: 'Polygon',
      coordinates: rings,
    };
  }

  return null;
}

function createTerraDraw(adapter: TerraDrawGoogleMapsAdapter) {
  return new TerraDraw({
    adapter,
    modes: [
      new TerraDrawSelectMode(),
      new TerraDrawPointMode({
        styles: {
          pointColor: '#7C3AED',
          pointWidth: 8,
          pointOutlineColor: '#ffffff',
          pointOutlineWidth: 2,
          editedPointColor: '#10B981',
          editedPointWidth: 8,
          editedPointOutlineColor: '#ffffff',
          editedPointOutlineWidth: 2,
        },
      }),
      new TerraDrawPolygonMode({
        styles: {
          fillColor: '#3B82F6',
          fillOpacity: 0.15,
          outlineColor: '#3B82F6',
          outlineWidth: 2,
          closingPointColor: '#3B82F6',
          closingPointOutlineColor: '#ffffff',
          closingPointOutlineWidth: 2,
          closingPointWidth: 6,
          editedPointColor: '#10B981',
          editedPointOutlineColor: '#ffffff',
          editedPointOutlineWidth: 2,
          editedPointWidth: 6,
          coordinatePointColor: '#3B82F6',
          coordinatePointOutlineColor: '#ffffff',
          coordinatePointOutlineWidth: 2,
          coordinatePointWidth: 5,
          snappingPointColor: '#F59E0B',
          snappingPointOutlineColor: '#ffffff',
          snappingPointOutlineWidth: 2,
          snappingPointWidth: 6,
        },
      }),
      new TerraDrawRectangleMode({
        styles: {
          fillColor: '#059669',
          fillOpacity: 0.15,
          outlineColor: '#059669',
          outlineWidth: 2,
        },
      }),
    ],
  });
}

export function useTerraDrawGoogleMaps({
  map,
  enabled = true,
  onFinish,
  onUnavailable,
  onError,
}: UseTerraDrawGoogleMapsOptions) {
  const drawRef = useRef<TerraDraw | null>(null);
  const onFinishRef = useRef(onFinish);
  const onUnavailableRef = useRef(onUnavailable);
  const onErrorRef = useRef(onError);
  const [isReady, setIsReady] = useState(false);
  const [mode, setModeState] = useState<MapDrawMode>('select');

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!map || !enabled || typeof window === 'undefined' || !window.google?.maps) {
      return;
    }

    let disposed = false;
    let idleListener: google.maps.MapsEventListener | null = null;

    const resetMapInteraction = () => {
      try {
        map.setOptions({ draggable: true, disableDoubleClickZoom: false, clickableIcons: false });
      } catch {}
    };

    const initialise = () => {
      if (disposed || drawRef.current) return;

      try {
        const adapter = new TerraDrawGoogleMapsAdapter({ lib: window.google.maps, map });
        const getMapEventElement = adapter.getMapEventElement.bind(adapter);
        (adapter as unknown as { getMapEventElement: () => HTMLDivElement }).getMapEventElement = () => {
          return getMapEventElement() || (map.getDiv() as HTMLDivElement);
        };

        const draw = createTerraDraw(adapter);
        draw.on('ready', () => {
          if (disposed) return;
          setIsReady(true);
          setModeState('select');
        });
        draw.on('finish', async (id) => {
          const feature = draw.getSnapshotFeature(id);
          if (!feature) return;

          const geometry = prospectGeometryFromTerraFeature(feature);
          const featureMode = feature.properties?.mode;
          const nextMode =
            featureMode === 'point' || featureMode === 'polygon' || featureMode === 'rectangle'
              ? featureMode
              : feature.geometry.type === 'Point'
                ? 'point'
                : 'polygon';

          try {
            if (geometry) {
              await onFinishRef.current({ id, mode: nextMode, feature, geometry });
            }
          } catch (error) {
            onErrorRef.current?.(error);
          } finally {
            try { draw.removeFeatures([id]); } catch {}
            try { draw.setMode('select'); } catch {}
            resetMapInteraction();
            setModeState('select');
          }
        });

        draw.start();
        draw.setMode('select');
        drawRef.current = draw;
      } catch (error) {
        setIsReady(false);
        onErrorRef.current?.(error);
      }
    };

    if (map.getBounds()) {
      initialise();
    } else {
      idleListener = window.google.maps.event.addListenerOnce(map, 'idle', initialise);
    }

    return () => {
      disposed = true;
      idleListener?.remove();
      setIsReady(false);
      setModeState('select');
      try { drawRef.current?.stop(); } catch {}
      drawRef.current = null;
      resetMapInteraction();
    };
  }, [enabled, map]);

  const setMode = useCallback((nextMode: MapDrawMode) => {
    const draw = drawRef.current;
    if (!draw || !isReady) {
      onUnavailableRef.current?.();
      return false;
    }

    try {
      draw.setMode(nextMode);
      setModeState(nextMode);
      map?.setOptions({
        draggable: nextMode === 'select',
        disableDoubleClickZoom: nextMode !== 'select',
        clickableIcons: false,
      });
      return true;
    } catch (error) {
      onErrorRef.current?.(error);
      return false;
    }
  }, [isReady, map]);

  const clear = useCallback(() => {
    try {
      drawRef.current?.clear();
    } catch (error) {
      onErrorRef.current?.(error);
    }
  }, []);

  return {
    clear,
    isReady,
    mode,
    setMode,
  };
}
