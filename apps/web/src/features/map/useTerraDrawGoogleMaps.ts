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

const TERRA_DRAW_EVENT_LAYER_CLASS = 'level-cre-terra-draw-event-layer';
const RECTANGLE_DRAG_THRESHOLD_PX = 8;
const DRAW_LAYER_WHEEL_ZOOM_INTERVAL_MS = 80;

type LngLat = { lng: number; lat: number };

type DragRectangleState = {
  start: LngLat;
  startClientX: number;
  startClientY: number;
  isDragging: boolean;
  preview: google.maps.Polygon | null;
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

function buildRectangleGeometry(start: LngLat, end: LngLat): Extract<ProspectGeometryType, { type: 'Polygon' }> {
  const west = Math.min(start.lng, end.lng);
  const east = Math.max(start.lng, end.lng);
  const south = Math.min(start.lat, end.lat);
  const north = Math.max(start.lat, end.lat);
  const ring: [number, number][] = [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
    [west, north],
  ];
  return {
    type: 'Polygon',
    coordinates: [ring],
  };
}

function rectanglePathFromGeometry(geometry: Extract<ProspectGeometryType, { type: 'Polygon' }>) {
  return geometry.coordinates[0].map(([lng, lat]) => ({ lng, lat }));
}

export function createTerraDrawEventLayer(mapDiv: HTMLDivElement) {
  const existing = mapDiv.querySelector<HTMLDivElement>(`.${TERRA_DRAW_EVENT_LAYER_CLASS}`);
  if (existing) return existing;

  const layer = document.createElement('div');
  layer.className = TERRA_DRAW_EVENT_LAYER_CLASS;
  layer.tabIndex = -1;
  layer.setAttribute('aria-label', 'Map drawing surface');
  Object.assign(layer.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    zIndex: '1000000',
    pointerEvents: 'none',
    touchAction: 'none',
    outline: 'none',
    background: 'transparent',
  });
  mapDiv.appendChild(layer);
  return layer;
}

export function setTerraDrawEventLayerActive(layer: HTMLDivElement | null, active: boolean) {
  if (!layer) return;
  layer.style.pointerEvents = active ? 'auto' : 'none';
  if (active) {
    try { layer.focus({ preventScroll: true }); } catch {}
  }
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
  const eventLayerRef = useRef<HTMLDivElement | null>(null);
  const activeModeRef = useRef<MapDrawMode>('select');
  const dragRectangleRef = useRef<DragRectangleState | null>(null);
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
    let removeDrawLayerListeners: (() => void) | null = null;
    let lastWheelZoomAt = 0;

    const resetMapInteraction = () => {
      try {
        map.setOptions({ draggable: true, disableDoubleClickZoom: false, clickableIcons: false });
      } catch {}
      setTerraDrawEventLayerActive(eventLayerRef.current, false);
      activeModeRef.current = 'select';
      dragRectangleRef.current?.preview?.setMap(null);
      dragRectangleRef.current = null;
    };

    const initialise = () => {
      if (disposed || drawRef.current) return;

      try {
        const adapter = new TerraDrawGoogleMapsAdapter({ lib: window.google.maps, map });
        const eventLayer = createTerraDrawEventLayer(map.getDiv() as HTMLDivElement);
        eventLayerRef.current = eventLayer;
        (adapter as unknown as { getMapEventElement: () => HTMLDivElement }).getMapEventElement = () => {
          return eventLayer;
        };
        const setCursor = adapter.setCursor.bind(adapter);
        (adapter as unknown as { setCursor: TerraDrawGoogleMapsAdapter['setCursor'] }).setCursor = (cursor) => {
          eventLayer.style.cursor = cursor === 'unset' ? '' : cursor;
          setCursor(cursor);
        };

        const draw = createTerraDraw(adapter);
        draw.on('ready', () => {
          if (disposed) return;
          setIsReady(true);
          activeModeRef.current = 'select';
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

        const getDragEventLngLat = (event: PointerEvent) => {
          try {
            return adapter.getLngLatFromEvent(event);
          } catch {
            return null;
          }
        };

        const handleRectanglePointerDown = (event: PointerEvent) => {
          if (activeModeRef.current !== 'rectangle' || event.button !== 0 || !event.isPrimary) return;
          const start = getDragEventLngLat(event);
          if (!start) return;
          dragRectangleRef.current = {
            start,
            startClientX: event.clientX,
            startClientY: event.clientY,
            isDragging: false,
            preview: null,
          };
        };

        const handleRectanglePointerMove = (event: PointerEvent) => {
          const state = dragRectangleRef.current;
          if (activeModeRef.current !== 'rectangle' || !state || !event.isPrimary) return;
          const distance = Math.hypot(event.clientX - state.startClientX, event.clientY - state.startClientY);
          if (!state.isDragging && distance < RECTANGLE_DRAG_THRESHOLD_PX) return;
          const end = getDragEventLngLat(event);
          if (!end) return;

          state.isDragging = true;
          const geometry = buildRectangleGeometry(state.start, end);
          const path = rectanglePathFromGeometry(geometry);
          if (!state.preview) {
            state.preview = new window.google.maps.Polygon({
              map,
              paths: path,
              clickable: false,
              fillColor: '#059669',
              fillOpacity: 0.15,
              strokeColor: '#059669',
              strokeOpacity: 0.9,
              strokeWeight: 2,
              zIndex: 1000,
            });
          } else {
            state.preview.setPath(path);
          }
        };

        const handleRectanglePointerUp = (event: PointerEvent) => {
          const state = dragRectangleRef.current;
          dragRectangleRef.current = null;
          if (activeModeRef.current !== 'rectangle' || !state || !state.isDragging || !event.isPrimary) {
            state?.preview?.setMap(null);
            return;
          }

          event.preventDefault();
          const end = getDragEventLngLat(event);
          state.preview?.setMap(null);
          if (!end) return;

          const geometry = buildRectangleGeometry(state.start, end);
          const id = `drag-rectangle-${Date.now()}`;
          const feature = {
            id,
            type: 'Feature',
            properties: { mode: 'rectangle' },
            geometry,
          } as GeoJSONStoreFeatures;

          void (async () => {
            try {
              await onFinishRef.current({ id, mode: 'rectangle', feature, geometry });
            } catch (error) {
              onErrorRef.current?.(error);
            } finally {
              try { draw.setMode('select'); } catch {}
              resetMapInteraction();
              setModeState('select');
            }
          })();
        };

        const handleWheel = (event: WheelEvent) => {
          if (activeModeRef.current === 'select') return;

          event.preventDefault();
          event.stopPropagation();

          const now = performance.now();
          if (now - lastWheelZoomAt < DRAW_LAYER_WHEEL_ZOOM_INTERVAL_MS) return;
          lastWheelZoomAt = now;

          const currentZoom = map.getZoom() ?? 11;
          const rawMinZoom = Number(map.get('minZoom'));
          const rawMaxZoom = Number(map.get('maxZoom'));
          const minZoom = Number.isFinite(rawMinZoom) ? rawMinZoom : 0;
          const maxZoom = Number.isFinite(rawMaxZoom) ? rawMaxZoom : 22;
          const direction = event.deltaY < 0 ? 1 : -1;
          const nextZoom = Math.max(minZoom, Math.min(maxZoom, currentZoom + direction));
          if (nextZoom !== currentZoom) {
            map.setZoom(nextZoom);
          }
        };

        eventLayer.addEventListener('pointerdown', handleRectanglePointerDown);
        eventLayer.addEventListener('pointermove', handleRectanglePointerMove);
        eventLayer.addEventListener('pointerup', handleRectanglePointerUp);
        eventLayer.addEventListener('wheel', handleWheel, { passive: false });
        removeDrawLayerListeners = () => {
          eventLayer.removeEventListener('pointerdown', handleRectanglePointerDown);
          eventLayer.removeEventListener('pointermove', handleRectanglePointerMove);
          eventLayer.removeEventListener('pointerup', handleRectanglePointerUp);
          eventLayer.removeEventListener('wheel', handleWheel);
        };
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
      removeDrawLayerListeners?.();
      setIsReady(false);
      setModeState('select');
      try { drawRef.current?.stop(); } catch {}
      drawRef.current = null;
      resetMapInteraction();
      eventLayerRef.current?.remove();
      eventLayerRef.current = null;
    };
  }, [enabled, map]);

  const setMode = useCallback((nextMode: MapDrawMode) => {
    const draw = drawRef.current;
    if (!draw || !isReady) {
      onUnavailableRef.current?.();
      return false;
    }

    try {
      setTerraDrawEventLayerActive(eventLayerRef.current, nextMode !== 'select');
      draw.setMode(nextMode);
      activeModeRef.current = nextMode;
      setModeState(nextMode);
      map?.setOptions({
        draggable: nextMode === 'select',
        disableDoubleClickZoom: nextMode !== 'select',
        clickableIcons: false,
      });
      return true;
    } catch (error) {
      setTerraDrawEventLayerActive(eventLayerRef.current, false);
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
