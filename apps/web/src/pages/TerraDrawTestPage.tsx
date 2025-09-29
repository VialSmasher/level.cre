import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import {
  TerraDraw,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
} from 'terra-draw';
import { TerraDrawGoogleMapsAdapter } from 'terra-draw-google-maps-adapter';

// Simple, standalone test page for Terra Draw + Google Maps
// Assumes `terra-draw` and `terra-draw-google-maps-adapter` are installed.

const DEFAULT_CENTER = { lat: 53.5461, lng: -113.4938 }; // Edmonton, Canada
// Important: keep libraries as a stable, module-scoped constant to avoid reloading the Maps script on re-renders
const GOOGLE_MAPS_LIBRARIES: ["drawing", "geometry", "places"] = ["drawing", "geometry", "places"];

export default function TerraDrawTestPage() {
  const { isLoaded } = useJsApiLoader({
    id: 'terra-draw-test',
    googleMapsApiKey: (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '') as string,
    // No special libraries required for Terra Draw adapter
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const terraDrawRef = useRef<TerraDraw | null>(null);
  const terraStartedRef = useRef<boolean>(false);
  const overlayRef = useRef<google.maps.OverlayView | null>(null);
  const interactiveElRef = useRef<HTMLElement | null>(null);
  const [activeMode, setActiveMode] = useState<'select' | 'polygon' | 'point'>('select');
  const polygonModeRef = useRef<any | null>(null);
  const pointModeRef = useRef<any | null>(null);

  // Initialize Terra Draw after map is ready
  useEffect(() => {
    if (!isLoaded || !map || terraDrawRef.current) return;

    const adapter = new TerraDrawGoogleMapsAdapter({ lib: google.maps, map });

    // Instrument Terra modes to log low-level handler calls
    const instrumentMode = (mode: any, label: string) => {
      const wrap = (key: string) => {
        if (typeof mode[key] === 'function') {
          const orig = mode[key].bind(mode);
          mode[key] = (...args: any[]) => {
            // eslint-disable-next-line no-console
            console.log(`[TerraDraw][${label}] ${key}`, ...args);
            try { return orig(...args); } catch (e) { console.warn(`[TerraDraw][${label}] ${key} error`, e); }
          };
        }
      };
      // Common handler names across Terra versions
      ['onClick', 'onMouseMove', 'onMouseDown', 'onMouseUp', 'onPointerDown', 'onPointerMove', 'onPointerUp', 'onKeyDown', 'onKeyUp', 'onDrag', 'onDragStart', 'onDragEnd', 'onStart', 'onStop'].forEach(wrap);
      return mode;
    };

    const polygonMode = instrumentMode(new TerraDrawPolygonMode() as any, 'polygon');
    const pointMode = instrumentMode(new TerraDrawPointMode() as any, 'point');
    polygonModeRef.current = polygonMode;
    pointModeRef.current = pointMode;
    try {
      // @ts-ignore
      (window as any).__terraModes = { polygon: polygonMode, point: pointMode };
    } catch {}

    const draw = new TerraDraw({
      adapter,
      modes: [
        polygonMode as any,
        pointMode as any,
        new TerraDrawSelectMode(),
      ],
    });

    // Expose for quick debugging in console
    // @ts-ignore
    (window as any).__terra = draw;
    // @ts-ignore
    (window as any).__terraAdapter = adapter;

    // Create a lightweight OverlayView to access Google's panes (overlayMouseTarget)
    try {
      const ov = new google.maps.OverlayView();
      ov.onAdd = function () {
        try {
          // STRICT: bind to the interactive pane only
          const panes = (this as any).getPanes?.();
          const mousePane: HTMLElement | null = panes?.overlayMouseTarget ?? null;
          if (!mousePane) {
            // eslint-disable-next-line no-console
            console.warn('[TerraDraw] overlayMouseTarget not available; Terra will not receive mouse events');
          }
          interactiveElRef.current = mousePane;
          // Force adapter to use overlayMouseTarget for event listeners
          // @ts-ignore - adapter internal hook
          (adapter as any).getMapEventElement = () => interactiveElRef.current as HTMLElement;
          // eslint-disable-next-line no-console
          console.log('[TerraDraw] overlay onAdd -> binding to overlayMouseTarget:', interactiveElRef.current);

          // Attach raw DOM listeners to confirm events reach the pane
          try {
            const el = interactiveElRef.current;
            if (el) {
              const log = (name: string) => (evt: Event) => {
                // eslint-disable-next-line no-console
                console.log(`[DOM][overlayMouseTarget] ${name}`, evt);
              };
              el.addEventListener('pointerdown', log('pointerdown'), true);
              el.addEventListener('pointermove', log('pointermove'), true);
              el.addEventListener('pointerup', log('pointerup'), true);
              el.addEventListener('mousedown', log('mousedown'), true);
              el.addEventListener('mousemove', log('mousemove'), true);
              el.addEventListener('mouseup', log('mouseup'), true);
              el.addEventListener('click', log('click'), true);
              // Store a teardown function on the overlay instance for cleanup
              (this as any).__terraPaneTeardown = () => {
                try {
                  el.removeEventListener('pointerdown', log('pointerdown'), true);
                  el.removeEventListener('pointermove', log('pointermove'), true);
                  el.removeEventListener('pointerup', log('pointerup'), true);
                  el.removeEventListener('mousedown', log('mousedown'), true);
                  el.removeEventListener('mousemove', log('mousemove'), true);
                  el.removeEventListener('mouseup', log('mouseup'), true);
                  el.removeEventListener('click', log('click'), true);
                } catch {}
              };
            }
          } catch {}
        } catch (e) {
          // Keep ref null to avoid binding to wrong pane
          interactiveElRef.current = null;
          // @ts-ignore
          (adapter as any).getMapEventElement = () => interactiveElRef.current as HTMLElement;
        }
      } as any;
      ov.draw = function () {} as any;
      ov.onRemove = function () {
        try { ((this as any).__terraPaneTeardown as any)?.(); } catch {}
        interactiveElRef.current = null;
      } as any;
      ov.setMap(map);
      overlayRef.current = ov;
    } catch (e) {
      // If OverlayView creation fails, leave adapter element undefined (Terra will noop)
    }

    // Provide feedback when a feature drawing finishes
    draw.on('finish', (id: string) => {
      // eslint-disable-next-line no-console
      console.log('[TerraDraw] finish id:', id);
      // eslint-disable-next-line no-console
      console.log('[TerraDraw] feature:', draw.getSnapshotFeature(id as any));
      // eslint-disable-next-line no-console
      console.log('[TerraDraw] snapshot:', draw.getSnapshot());
    });
    draw.on('change', () => {
      // eslint-disable-next-line no-console
      console.log('[TerraDraw] change snapshot:', draw.getSnapshot());
    });

    // Ensure the adapter re-binds to overlayMouseTarget when Terra signals ready
    draw.on('ready', () => {
      try {
        let mousePane: HTMLElement | null = null;
        try {
          const panes = (overlayRef.current as any)?.getPanes?.();
          mousePane = panes?.overlayMouseTarget ?? null;
        } catch {}
        if (!mousePane) {
          // Try to query from map DOM as a last resort; many builds use this class
          const root = map.getDiv() as HTMLElement;
          mousePane = (root.querySelector('.gm-style > div[style*="pointer-events: auto"]') as HTMLElement) || null;
        }
        if (!mousePane) {
          console.warn('[TerraDraw] ready: overlayMouseTarget not found; skipping rebind');
        }
        interactiveElRef.current = mousePane;
        // @ts-ignore - override event element getter for stability
        (adapter as any).getMapEventElement = () => interactiveElRef.current as HTMLElement;
        if (terraStartedRef.current) {
          draw.stop();
          draw.start();
          draw.setMode('select');
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[TerraDraw] ready handler failed to bind element', e);
      }
    });

    // Defer starting until map fires first idle to ensure projection/bounds
    
    terraDrawRef.current = draw;

    return () => {
      try { draw.stop(); } catch {}
      terraDrawRef.current = null;
      terraStartedRef.current = false;
      try { overlayRef.current?.setMap(null as any); } catch {}
      overlayRef.current = null;
    };
  }, [isLoaded, map]);

  const onMapLoad = useCallback((m: google.maps.Map) => {
    setMap(m);
    try {
      // Expose map for quick debugging if needed
      // @ts-ignore
      (window as any).__MAP = m;
    } catch {}
  }, []);

  const onMapUnmount = useCallback(() => {
    try { terraDrawRef.current?.stop(); } catch {}
    terraDrawRef.current = null;
    terraStartedRef.current = false;
    setMap(null);
  }, []);

  // Visual feedback: change cursor when in drawing modes
  useEffect(() => {
    const el = (interactiveElRef.current as HTMLElement) || (map?.getDiv() as HTMLElement | undefined);
    if (!el) return;
    const prev = el.style.cursor;
    el.style.cursor = (activeMode === 'polygon' || activeMode === 'point') ? 'crosshair' : '';
    return () => {
      try { el.style.cursor = prev; } catch {}
    };
  }, [activeMode, map]);

  // Global pointer event forwarding as a fallback if map panes don't deliver events
  useEffect(() => {
    if (!map) return;
    const draw = terraDrawRef.current;
    if (!draw) return;

    let forwardingEnabled = true;

    const getCurrentModeInstance = (): any | null => {
      const modeName = draw.getMode?.() || activeMode;
      if (modeName === 'polygon') return polygonModeRef.current;
      if (modeName === 'point') return pointModeRef.current;
      return null; // do not forward in select mode
    };

    const isEventInsideMap = (evt: PointerEvent | MouseEvent) => {
      const root = map.getDiv();
      const rect = root.getBoundingClientRect();
      const x = (evt as PointerEvent).clientX;
      const y = (evt as PointerEvent).clientY;
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };

    const buildTerraPointer = (evt: PointerEvent | MouseEvent) => {
      const root = map.getDiv();
      const rect = root.getBoundingClientRect();
      const x = (evt as PointerEvent).clientX - rect.left;
      const y = (evt as PointerEvent).clientY - rect.top;
      let lat = 0, lng = 0;
      try {
        const proj = overlayRef.current?.getProjection?.();
        if (proj && typeof (proj as any).fromContainerPixelToLatLng === 'function') {
          const ll = (proj as any).fromContainerPixelToLatLng(new google.maps.Point(x, y));
          lat = ll.lat();
          lng = ll.lng();
        }
      } catch {}
      return {
        lng,
        lat,
        containerX: x,
        containerY: y,
        button: (evt as MouseEvent).button ?? 0,
        altKey: (evt as MouseEvent).altKey,
        ctrlKey: (evt as MouseEvent).ctrlKey,
        shiftKey: (evt as MouseEvent).shiftKey,
        metaKey: (evt as MouseEvent).metaKey,
        originalEvent: evt,
        preventDefault: () => {
          try { evt.preventDefault(); } catch {}
        },
        stopPropagation: () => {
          try { evt.stopPropagation(); } catch {}
        },
      };
    };

    const handlePointerDown = (evt: PointerEvent) => {
      if (!forwardingEnabled) return;
      if (!terraStartedRef.current) return;
      if (!isEventInsideMap(evt)) return;
      const mode = getCurrentModeInstance();
      if (!mode) return;
      const e = buildTerraPointer(evt);
      // eslint-disable-next-line no-console
      console.log('[GlobalForward] pointerdown -> mode', draw.getMode?.(), e);
      try {
        if (typeof mode.onPointerDown === 'function') mode.onPointerDown(e);
        else if (typeof mode.onMouseDown === 'function') mode.onMouseDown(e);
      } catch (err) {
        console.warn('[GlobalForward] onPointerDown error', err);
      }
    };

    const handlePointerMove = (evt: PointerEvent) => {
      if (!forwardingEnabled) return;
      if (!terraStartedRef.current) return;
      if (!isEventInsideMap(evt)) return;
      const mode = getCurrentModeInstance();
      if (!mode) return;
      const e = buildTerraPointer(evt);
      try {
        if (typeof mode.onPointerMove === 'function') mode.onPointerMove(e);
        else if (typeof mode.onMouseMove === 'function') mode.onMouseMove(e);
      } catch (err) {
        console.warn('[GlobalForward] onPointerMove error', err);
      }
    };

    const handlePointerUp = (evt: PointerEvent) => {
      if (!forwardingEnabled) return;
      if (!terraStartedRef.current) return;
      if (!isEventInsideMap(evt)) return;
      const mode = getCurrentModeInstance();
      if (!mode) return;
      const e = buildTerraPointer(evt);
      try {
        if (typeof mode.onPointerUp === 'function') mode.onPointerUp(e);
        else if (typeof mode.onMouseUp === 'function') mode.onMouseUp(e);
      } catch (err) {
        console.warn('[GlobalForward] onPointerUp error', err);
      }
    };

    const handleClick = (evt: MouseEvent) => {
      if (!forwardingEnabled) return;
      if (!terraStartedRef.current) return;
      if (!isEventInsideMap(evt)) return;
      const mode = getCurrentModeInstance();
      if (!mode) return;
      const e = buildTerraPointer(evt);
      // eslint-disable-next-line no-console
      console.log('[GlobalForward] click -> mode', draw.getMode?.(), e);
      try {
        if (typeof mode.onClick === 'function') mode.onClick(e);
      } catch (err) {
        console.warn('[GlobalForward] onClick error', err);
      }
    };

    const handleDblClick = (evt: MouseEvent) => {
      if (!forwardingEnabled) return;
      if (!terraStartedRef.current) return;
      if (!isEventInsideMap(evt)) return;
      const mode = getCurrentModeInstance();
      if (!mode) return;
      const e = buildTerraPointer(evt);
      try {
        if (typeof (mode as any).onDoubleClick === 'function') (mode as any).onDoubleClick(e);
      } catch (err) {
        console.warn('[GlobalForward] onDoubleClick error', err);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('click', handleClick, true);
    window.addEventListener('dblclick', handleDblClick, true);

    return () => {
      forwardingEnabled = false;
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('click', handleClick, true);
      window.removeEventListener('dblclick', handleDblClick, true);
    };
  }, [map, activeMode]);

  if (!isLoaded) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <div>Loading Google Maps…</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      {/* Map Canvas */}
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={DEFAULT_CENTER}
        zoom={12}
        onLoad={onMapLoad}
        onUnmount={onMapUnmount}
        onIdle={() => {
          if (!terraStartedRef.current && terraDrawRef.current) {
            try {
              terraDrawRef.current.start();
              terraDrawRef.current.setMode('select');
              terraStartedRef.current = true;
              setActiveMode('select');

              // Optional: basic styles to enhance visibility
              try {
                terraDrawRef.current.updateModeOptions('polygon', {
                  styles: {
                    fillColor: '#2563EB',
                    fillOpacity: 0.2,
                    outlineColor: '#2563EB',
                    outlineWidth: 2,
                  },
                } as any);
                terraDrawRef.current.updateModeOptions('point', {
                  styles: {
                    pointColor: '#059669',
                    pointWidth: 8,
                    outlineColor: '#ffffff',
                    outlineWidth: 2,
                  },
                } as any);
              } catch (styleErr) {
                // eslint-disable-next-line no-console
                console.warn('[TerraDraw] style update failed', styleErr);
              }
              // eslint-disable-next-line no-console
              console.log('[TerraDraw] started on idle');
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn('[TerraDraw] failed to start on idle', e);
            }
          }
        }}
        options={{
          disableDefaultUI: false,
          zoomControl: true,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: 'greedy',
          mapTypeId: 'roadmap',
        }}
      />

      {/* Overlay Controls */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          display: 'flex',
          gap: 8,
          zIndex: 2,
          background: 'rgba(255,255,255,0.9)',
          borderRadius: 8,
          padding: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        <button
          onClick={() => {
            // disable map drag while drawing
            if (map) map.setOptions({ draggable: false, disableDoubleClickZoom: true } as google.maps.MapOptions);
            try { terraDrawRef.current?.setMode('polygon'); setActiveMode('polygon'); } catch {}
          }}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            background: activeMode === 'polygon' ? '#2563eb' : 'white',
            color: activeMode === 'polygon' ? 'white' : '#111827',
            cursor: 'pointer',
          }}
        >
          Draw Polygon
        </button>
        <button
          onClick={() => {
            if (map) map.setOptions({ draggable: false, disableDoubleClickZoom: true } as google.maps.MapOptions);
            try { terraDrawRef.current?.setMode('point'); setActiveMode('point'); } catch {}
          }}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            background: activeMode === 'point' ? '#059669' : 'white',
            color: activeMode === 'point' ? 'white' : '#111827',
            cursor: 'pointer',
          }}
        >
          Draw Point
        </button>
        <button
          onClick={() => {
            if (map) map.setOptions({ draggable: true, disableDoubleClickZoom: false } as google.maps.MapOptions);
            try { terraDrawRef.current?.setMode('select'); setActiveMode('select'); } catch {}
          }}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            background: activeMode === 'select' ? '#111827' : 'white',
            color: activeMode === 'select' ? 'white' : '#111827',
            cursor: 'pointer',
          }}
        >
          Pointer
        </button>
      </div>
    </div>
  );
}
