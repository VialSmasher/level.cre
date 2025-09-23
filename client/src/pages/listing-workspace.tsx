import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GoogleMap, Marker, Polygon, DrawingManager, useJsApiLoader } from '@react-google-maps/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
// Drawer controls not used in workspace; edit panel opens directly
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { MapControls } from '@/features/map/MapControls';
import { apiRequest } from '@/lib/queryClient';
import type { Prospect } from '@shared/schema';
import { useProfile } from '@/hooks/useProfile';
import { uniqueSubmarketNames } from '@/lib/submarkets';
import { Save, X, Edit3, Trash2, ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
// Using Google DrawingManager (not Terra) to match main map behavior

type Listing = {
  id: string;
  userId: string;
  title: string;
  address: string;
  lat: string;
  lng: string;
  submarket?: string | null;
};

const libraries: any = ['drawing', 'geometry', 'places'];

export default function ListingWorkspace() {
  const [, params] = useRoute('/app/listings/:id');
  const listingId = params?.id as string;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: listing } = useQuery<Listing>({ queryKey: ['/api/listings', listingId], enabled: !!listingId });
  const { data: linkedProspects = [], refetch: refetchLinked } = useQuery<Prospect[]>({ queryKey: ['/api/listings', listingId, 'prospects'], enabled: !!listingId });
  const { data: allProspects = [] } = useQuery<Prospect[]>({ queryKey: ['/api/prospects'] });

  useEffect(() => {
    // Remember last opened workspace
    if (listingId) {
      try {
        localStorage.setItem('lastWorkspaceId', listingId);
        localStorage.setItem('lastListingsLocation', `/app/listings/${listingId}`);
      } catch {}
    }
  }, [listingId]);

  useEffect(() => {
    // fetch linked prospects (use apiRequest for consistent auth/demo headers)
    if (listingId) {
      apiRequest('GET', `/api/listings/${listingId}/prospects`)
        .then(r => r.json())
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['/api/listings', listingId, 'prospects'] });
        })
        .catch(() => {});
    }
  }, [listingId]);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '') as string,
    libraries,
  });

  // DrawingManager state
  type DrawMode = 'select' | 'point' | 'polygon' | 'rectangle';
  const [drawMode, setDrawMode] = useState<DrawMode>('select');
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);

  const DEFAULT_CENTER = { lat: 53.5461, lng: -113.4938 }; // Edmonton
  const subjectPosition = useMemo(() => {
    if (!listing) return null;
    const latStr = (listing.lat as any) ?? '';
    const lngStr = (listing.lng as any) ?? '';
    if (typeof latStr !== 'string' || typeof lngStr !== 'string') return null;
    if (latStr.trim() === '' || lngStr.trim() === '') return null;
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }, [listing]);

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const onMapLoad = useCallback((m: google.maps.Map) => {
    // Keep a reference to the map instance; initial center/zoom are set via defaultCenter/defaultZoom
    setMap(m);
  }, []);

  // Ensure tiles render by forcing a recenter once loaded
  useEffect(() => {
    if (!map || !isLoaded) return;
    const center = (subjectPosition || DEFAULT_CENTER) as google.maps.LatLngLiteral;
    try {
      map.setCenter(center);
      map.setZoom(subjectPosition ? 15 : 11);
      // Trigger resize to ensure tiles paint if container changed
      // @ts-ignore - event may be undefined in types
      window.google?.maps?.event?.trigger(map, 'resize');
    } catch {}
  }, [map, isLoaded, subjectPosition]);

  const [searchPin, setSearchPin] = useState<{ lat: number; lng: number; address: string; businessName?: string | null; websiteUrl?: string | null } | null>(null);
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [bounds, setBounds] = useState<google.maps.LatLngBoundsLiteral | null>(null);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const [editingProspectId, setEditingProspectId] = useState<string | null>(null);
  const polygonRefs = useRef<Map<string, google.maps.Polygon>>(new Map());
  const [originalPolygonCoordinates, setOriginalPolygonCoordinates] = useState<[number, number][] | null>(null);
  
  // Pan to search selection and highlight
  useEffect(() => {
    if (searchPin && map) {
      try {
        map.panTo({ lat: searchPin.lat, lng: searchPin.lng });
        map.setZoom(17);
      } catch {}
    }
  }, [searchPin, map]);
  
  // Status colors (match /app)
  const STATUS_COLORS: Record<'prospect'|'contacted'|'listing'|'client'|'no_go', string> = {
    prospect: '#FBBF24',
    contacted: '#3B82F6',
    listing: '#10B981',
    client: '#8B5CF6',
    no_go: '#EF4444'
  };
  
  // Status filter UI (match /app behavior): default to all statuses visible
  type StatusKey = 'prospect'|'contacted'|'listing'|'client'|'no_go';
  const [statusFilters, setStatusFilters] = useState<Set<StatusKey>>(() => {
    return new Set(Object.keys(STATUS_COLORS) as StatusKey[]);
  });
  const [isLegendOpen, setIsLegendOpen] = useState(true);
  const filteredLinkedProspects = useMemo(() => {
    return linkedProspects.filter((p) => statusFilters.has(p.status as StatusKey));
  }, [linkedProspects, statusFilters]);

  // Persist status filters per workspace id
  useEffect(() => {
    if (!listingId) return;
    try {
      const raw = localStorage.getItem(`workspaceStatusFilters:${listingId}`);
      if (raw) {
        const arr = JSON.parse(raw) as StatusKey[];
        if (Array.isArray(arr) && arr.length > 0) {
          setStatusFilters(new Set(arr));
        }
      }
    } catch {}
  }, [listingId]);
  useEffect(() => {
    if (!listingId) return;
    try { localStorage.setItem(`workspaceStatusFilters:${listingId}`, JSON.stringify(Array.from(statusFilters))); } catch {}
  }, [statusFilters, listingId]);

  // Reuse profile submarkets for dropdowns (normalized + de-duped)
  const { profile } = useProfile();
  const submarketOptions = uniqueSubmarketNames(profile?.submarkets || []);

  const STANDARD_SIZE_OPTIONS = [
    '< 5,000 SF',
    '5,000 - 10,000 SF',
    '10,000 - 25,000 SF',
    '25,000 - 50,000 SF',
    '50,000 - 100,000 SF',
    '100,000+ SF'
  ] as const;
  const FOLLOW_UP_LABELS: Record<'1_month'|'3_month'|'6_month'|'1_year', string> = {
    '1_month': '1 Month', '3_month': '3 Months', '6_month': '6 Months', '1_year': '1 Year'
  };

  // Helpers from /app
  const calculatePolygonAcres = (geometry: any): number | null => {
    if (!geometry || geometry.type !== 'Polygon') return null;
    try {
      let coordinates = geometry.coordinates;
      if (Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0])) coordinates = coordinates[0];
      if (!coordinates || coordinates.length < 3) return null;
      const path = coordinates.map((coord: [number, number]) => ({ lat: coord[1], lng: coord[0] }));
      if (window.google?.maps?.geometry?.spherical) {
        const areaInSquareMeters = window.google.maps.geometry.spherical.computeArea(path);
        const areaInSquareFeet = areaInSquareMeters * 10.764; return areaInSquareFeet / 43560;
      }
      let area = 0; for (let i = 0; i < path.length; i++) { const j = (i + 1) % path.length; area += path[i].lng * path[j].lat; area -= path[j].lng * path[i].lat; }
      area = Math.abs(area) / 2; const metersPerDegree = 111320; const areaInSquareMeters = area * metersPerDegree * metersPerDegree; return (areaInSquareMeters * 10.764) / 43560;
    } catch { return null; }
  };

  // Debounced, optimistic field updates to avoid flicker while typing
  const saveTimerRef = useRef<number | null>(null);
  const pendingPatchRef = useRef<Partial<Prospect>>({});
  const lastEditedIdRef = useRef<string | null>(null);

  const flushQueuedSave = useCallback(async () => {
    const id = lastEditedIdRef.current || selectedProspect?.id || null;
    if (!id) return;
    const patch = pendingPatchRef.current;
    pendingPatchRef.current = {};
    if (!patch || Object.keys(patch).length === 0) return;
    try {
      const res = await apiRequest('PATCH', `/api/prospects/${id}`, patch);
      const saved = await res.json();
      setSelectedProspect((prev) => (prev && prev.id === saved.id ? saved : prev));
      // Keep caches in sync without forcing re-fetches
      queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) =>
        Array.isArray(prev) ? prev.map((p) => (p.id === saved.id ? saved : p)) : prev
      );
      queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) =>
        Array.isArray(prev) ? prev.map((p) => (p.id === saved.id ? saved : p)) : prev
      );
    } catch {}
  }, [queryClient, listingId, selectedProspect]);

  const queueUpdate = useCallback((field: keyof Prospect, value: any, opts?: { flush?: boolean }) => {
    if (!selectedProspect) return;
    const id = selectedProspect.id;
    // Reset timer if switching prospects while typing
    if (lastEditedIdRef.current && lastEditedIdRef.current !== id && saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      pendingPatchRef.current = {};
    }
    lastEditedIdRef.current = id;

    // Optimistic UI
    const updated = { ...selectedProspect, [field]: value } as Prospect;
    setSelectedProspect(updated);
    queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) =>
      Array.isArray(prev) ? prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)) : prev
    );
    queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) =>
      Array.isArray(prev) ? prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)) : prev
    );

    // Queue patch with debounce
    pendingPatchRef.current = { ...pendingPatchRef.current, [field]: value };
    if (opts?.flush) {
      if (saveTimerRef.current) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      void flushQueuedSave();
    } else {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => { saveTimerRef.current = null; void flushQueuedSave(); }, 450);
    }
  }, [listingId, queryClient, flushQueuedSave, selectedProspect]);

  const updateSelectedProspect = useCallback((field: keyof Prospect, value: any) => {
    queueUpdate(field, value);
  }, [queueUpdate]);

  const deleteSelectedProspect = useCallback(async () => {
    if (!selectedProspect) return;
    try {
      await apiRequest('DELETE', `/api/prospects/${selectedProspect.id}`);
      setSelectedProspect(null); setIsEditPanelOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/listings', listingId, 'prospects'] });
      toast({ title: 'Prospect Deleted' });
    } catch {}
  }, [selectedProspect, listingId]);

  const enablePolygonEditing = useCallback((prospectId: string) => {
    const prospect = linkedProspects.find(p => p.id === prospectId);
    if (!prospect || prospect.geometry.type !== 'Polygon') return;
    const original = (prospect.geometry.coordinates[0] as [number, number][]);
    setOriginalPolygonCoordinates(original); setEditingProspectId(prospectId);
    setTimeout(() => {
      const polygon = polygonRefs.current.get(prospectId);
      if (polygon) {
        polygon.setEditable(true); polygon.setDraggable(true);
        const path = polygon.getPath(); let timer: any = null;
        const scheduleSave = () => { if (timer) clearTimeout(timer); timer = setTimeout(async () => {
          const coords: [number, number][] = []; for (let i = 0; i < path.getLength(); i++) { const pt = path.getAt(i); coords.push([pt.lng(), pt.lat()]); }
          if (coords.length > 0) coords.push(coords[0]);
          const newGeom = { type: 'Polygon' as const, coordinates: [coords] };
          const acres = calculatePolygonAcres(newGeom);
          try { const r = await apiRequest('PATCH', `/api/prospects/${prospectId}`, { geometry: newGeom, acres: acres ? acres.toString() : undefined }); const saved = await r.json(); setSelectedProspect(prev => prev && prev.id === saved.id ? saved : prev); queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) => Array.isArray(prev) ? prev.map((p) => (p.id === saved.id ? saved : p)) : prev); queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) => Array.isArray(prev) ? prev.map((p) => (p.id === saved.id ? saved : p)) : prev); } catch {}
        }, 500); };
        path.addListener('set_at', scheduleSave); path.addListener('insert_at', scheduleSave); path.addListener('remove_at', scheduleSave);
      }
    }, 100);
  }, [linkedProspects, listingId]);

  const savePolygonChanges = useCallback(() => {
    setEditingProspectId(null); const polygon = selectedProspect ? polygonRefs.current.get(selectedProspect.id) : null; if (polygon) { polygon.setEditable(false); polygon.setDraggable(false); }
  }, [selectedProspect]);

  const discardPolygonChanges = useCallback(() => {
    if (!editingProspectId || !originalPolygonCoordinates) return;
    const polygon = polygonRefs.current.get(editingProspectId);
    if (polygon) { const path = polygon.getPath(); path.clear(); originalPolygonCoordinates.forEach(([lng, lat]) => path.push(new google.maps.LatLng(lat, lng))); polygon.setEditable(false); polygon.setDraggable(false); }
    setEditingProspectId(null); setOriginalPolygonCoordinates(null);
  }, [editingProspectId, originalPolygonCoordinates]);

  // Linking existing prospects via drawer removed

  const createAndLink = useMutation({
    mutationFn: async () => {
      if (!searchPin) throw new Error('No selection');
      const payload = {
        name: searchPin.address,
        geometry: { type: 'Point' as const, coordinates: [searchPin.lng, searchPin.lat] as [number, number] },
        status: 'prospect',
        notes: '',
        // Persist business metadata similar to main /app map
        businessName: searchPin.businessName || undefined,
        websiteUrl: searchPin.websiteUrl || undefined,
        // Map business name to Contact tab's company field
        contactCompany: searchPin.businessName || undefined,
      };
      const res = await apiRequest('POST', '/api/prospects', payload);
      const p = await res.json();
      await apiRequest('POST', `/api/listings/${listingId}/prospects`, { prospectId: p.id });
      return p;
    },
    onSuccess: (p: any) => {
      // Optimistically add to cache to show immediately
      queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) =>
        Array.isArray(prev) ? [...prev, p] : [p]
      );
      queryClient.invalidateQueries({ queryKey: ['/api/listings', listingId, 'prospects'] });
      refetchLinked();
      setSearchPin(null);
      setSelectedProspect(p);
      setIsEditPanelOpen(true);
      toast({ title: 'Prospect added', description: `${p.name} linked to workspace` });
    }
  });

  // Activity logging UI removed in workspace

  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '') as string;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Map container fills remaining height without causing page scroll */}
      <div className="relative flex-1 min-h-0 w-full overflow-hidden">
        {!apiKey && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            Missing VITE_GOOGLE_MAPS_API_KEY
          </div>
        )}
        {!isLoaded && apiKey && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            Loading map...
          </div>
        )}
        {isLoaded && apiKey && (
          <div style={{ position: 'absolute', inset: 0 }}>
            {/* Overlay: back button and workspace name (top-right) */}
            <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8 shadow"
                    onClick={() => setLocation('/app/listings')}
                    aria-label="Exit workspace"
                    title="Exit workspace"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Exit workspace</p>
                </TooltipContent>
              </Tooltip>
              <Badge variant="secondary" className="shadow">{listing?.title || listing?.address}</Badge>
            </div>
            <GoogleMap
              onLoad={onMapLoad}
              mapContainerStyle={{ width: '100%', height: '100%' }}
              defaultCenter={subjectPosition || DEFAULT_CENTER}
              defaultZoom={subjectPosition ? 15 : 11}
              options={{
                disableDefaultUI: true,
                zoomControl: true,
                mapTypeControl: false,
                scaleControl: true,
                streetViewControl: false,
                rotateControl: false,
                fullscreenControl: false,
                gestureHandling: 'greedy',
                mapTypeId: mapType
              }}
              onIdle={() => {
                if (!map) return;
                const b = map.getBounds?.();
                if (b) {
                  const ne = b.getNorthEast();
                  const sw = b.getSouthWest();
                  setBounds({ north: ne.lat(), east: ne.lng(), south: sw.lat(), west: sw.lng() });
                }
              }}
            >
            <DrawingManager
              onLoad={(dm) => { drawingManagerRef.current = dm; }}
              onOverlayComplete={async (e: google.maps.drawing.OverlayCompleteEvent) => {
                try {
                  const type = e.type?.toString().toLowerCase();
                  let geometry: any = null;
                  if (type === 'marker' && (e as any).overlay?.getPosition) {
                    const pos = (e as any).overlay.getPosition();
                    geometry = { type: 'Point', coordinates: [pos.lng(), pos.lat()] as [number, number] };
                  } else if (type === 'polygon' && (e as any).overlay?.getPath) {
                    const path = (e as any).overlay.getPath();
                    const coords: [number, number][] = [];
                    for (let i = 0; i < path.getLength(); i++) {
                      const pt = path.getAt(i);
                      coords.push([pt.lng(), pt.lat()]);
                    }
                    if (coords.length > 0) coords.push(coords[0]);
                    geometry = { type: 'Polygon', coordinates: [coords] };
                  } else if (type === 'rectangle' && (e as any).overlay?.getBounds) {
                    const bounds = (e as any).overlay.getBounds();
                    const ne = bounds.getNorthEast();
                    const sw = bounds.getSouthWest();
                    const nw = new google.maps.LatLng(ne.lat(), sw.lng());
                    const se = new google.maps.LatLng(sw.lat(), ne.lng());
                    const ring: [number, number][] = [
                      [nw.lng(), nw.lat()],
                      [ne.lng(), ne.lat()],
                      [se.lng(), se.lat()],
                      [sw.lng(), sw.lat()],
                      [nw.lng(), nw.lat()],
                    ];
                    geometry = { type: 'Polygon', coordinates: [ring] };
                  }
                  // remove the temp overlay
                  try { (e as any).overlay?.setMap(null); } catch {}

                  if (!geometry) return;
                  const res = await apiRequest('POST', '/api/prospects', { name: 'New Prospect', status: 'prospect', notes: '', geometry });
                  const saved = await res.json();
                  await apiRequest('POST', `/api/listings/${listingId}/prospects`, { prospectId: saved.id });
                  queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) => Array.isArray(prev) ? [...prev, saved] : [saved]);
                  queryClient.invalidateQueries({ queryKey: ['/api/listings', listingId, 'prospects'], refetchType: 'active' });
                  refetchLinked();
                  toast({ title: 'Prospect created', description: 'Linked to workspace' });
                  // reset to select
                  drawingManagerRef.current?.setDrawingMode(null);
                  setDrawMode('select');
                  map?.setOptions({ draggable: true, disableDoubleClickZoom: false });
                  // Open the edit panel for the new prospect
                  setSelectedProspect(saved);
                  setIsEditPanelOpen(true);
                } catch (err) {
                  console.error('overlay complete error', err);
                  toast({ title: 'Error', description: 'Failed to save prospect', variant: 'destructive' });
                }
              }}
              options={{
                drawingControl: false,
                markerOptions: { draggable: false },
                polygonOptions: { fillColor: '#3B82F6', fillOpacity: 0.15, strokeColor: '#3B82F6', strokeWeight: 2 },
                rectangleOptions: { fillColor: '#059669', fillOpacity: 0.15, strokeColor: '#059669', strokeWeight: 2 },
              }}
            />
            {/* Subject pin */}
            {subjectPosition && (
              <Marker position={subjectPosition} icon={{ path: window.google?.maps?.SymbolPath?.CIRCLE, fillColor: '#ef4444', fillOpacity: 1, strokeWeight: 2, strokeColor: '#ffffff', scale: 10 }} />
            )}
            {/* Search selection pin */}
            {searchPin && (
              <Marker
                position={{ lat: searchPin.lat, lng: searchPin.lng }}
                icon={{
                  path: window.google?.maps?.SymbolPath?.CIRCLE,
                  fillColor: '#7C3AED',
                  fillOpacity: 1,
                  strokeWeight: 2,
                  strokeColor: '#ffffff',
                  scale: 8,
                }}
                title={searchPin.address}
              />
            )}
            {/* Linked prospects (filtered by status) */}
            {filteredLinkedProspects.map((p) => {
              const color = STATUS_COLORS[p.status as keyof typeof STATUS_COLORS] || '#3B82F6';
              if (p.geometry.type === 'Point') {
                const [lng, lat] = p.geometry.coordinates as [number, number];
                return (
                  <Marker
                    key={p.id}
                    position={{ lat, lng }}
                    onClick={() => { setSelectedProspect(p); setIsEditPanelOpen(true); }}
                    icon={{
                      path: window.google?.maps?.SymbolPath?.CIRCLE,
                      fillColor: color,
                      fillOpacity: 1,
                      strokeWeight: 2,
                      strokeColor: '#ffffff',
                      scale: 8,
                    }}
                  />
                );
              } else if (p.geometry.type === 'Polygon') {
                const coords = p.geometry.coordinates as [number, number][][] | [number, number][];
                const ring = Array.isArray(coords[0]) && Array.isArray((coords as any)[0][0])
                  ? (coords as [number, number][][])[0]
                  : (coords as [number, number][]);
                return (
                  <Polygon
                    key={p.id}
                    paths={ring.map(([lng, lat]) => ({ lat, lng }))}
                    onClick={() => { setSelectedProspect(p); setIsEditPanelOpen(true); }}
                    onLoad={(poly) => { polygonRefs.current.set(p.id, poly); }}
                    options={{
                      fillColor: color,
                      fillOpacity: 0.15,
                      strokeColor: color,
                      strokeOpacity: 0.8,
                      strokeWeight: 2,
                    }}
                  />
                );
              }
              return null;
            })}

            {/* Tools + search overlay */}
            <MapControls
              onSearch={(loc) => setSearchPin(loc)}
              bounds={bounds}
              defaultCenter={DEFAULT_CENTER}
              onPolygon={() => { try { drawingManagerRef.current?.setDrawingMode(window.google.maps.drawing.OverlayType.POLYGON); setDrawMode('polygon'); map?.setOptions({ draggable: false, disableDoubleClickZoom: true }); } catch {} }}
              onRectangle={() => { try { drawingManagerRef.current?.setDrawingMode(window.google.maps.drawing.OverlayType.RECTANGLE); setDrawMode('rectangle'); map?.setOptions({ draggable: false, disableDoubleClickZoom: true }); } catch {} }}
              onPin={() => { try { drawingManagerRef.current?.setDrawingMode(window.google.maps.drawing.OverlayType.MARKER); setDrawMode('point'); map?.setOptions({ draggable: false, disableDoubleClickZoom: true }); } catch {} }}
              onSelect={() => { try { drawingManagerRef.current?.setDrawingMode(null); setDrawMode('select'); map?.setOptions({ draggable: true, disableDoubleClickZoom: false }); } catch {} }}
              onPan={() => { try { drawingManagerRef.current?.setDrawingMode(null); setDrawMode('select'); map?.setOptions({ draggable: true, disableDoubleClickZoom: false }); } catch {} }}
              onMyLocation={() => {
                if (!map || !navigator.geolocation) return;
                navigator.geolocation.getCurrentPosition((pos) => {
                  const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                  map.setCenter(c); map.setZoom(15);
                });
              }}
              mapType={mapType}
              onMapTypeChange={(t) => { setMapType(t); try { map?.setMapTypeId(t); } catch {} }}
              activeTerraMode={drawMode}
            />

            {/* Confirm search selection */}
            {searchPin && (
              <div style={{ position: 'absolute', top: 76, left: 16, zIndex: 50 }}>
                <div className="bg-white p-2 rounded shadow border">
                  <div className="text-sm mb-2">{searchPin.address}</div>
                  <Button size="sm" onClick={() => createAndLink.mutate()} disabled={createAndLink.isPending}>{createAndLink.isPending ? 'Adding...' : 'Add as Prospect'}</Button>
                </div>
              </div>
            )}
            </GoogleMap>
          </div>
        )}
      </div>

      {/* Status Legend / Filters (bottom-left) */}
      <Button
        onClick={() => setIsLegendOpen(!isLegendOpen)}
        className="absolute bottom-4 left-4 z-20 bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
        variant="outline"
        size="sm"
      >
        {isLegendOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </Button>
      {isLegendOpen && (
        <div className="absolute bottom-4 left-16 bg-white/95 backdrop-blur-sm shadow-lg border border-gray-200 z-10 p-3 rounded">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Status Filters</h3>
          <div className="space-y-1">
            {Object.entries(STATUS_COLORS).map(([status, color]) => {
              const key = status as 'prospect'|'contacted'|'listing'|'client'|'no_go';
              const isActive = statusFilters.has(key);
              return (
                <div
                  key={status}
                  className={`flex items-center text-xs cursor-pointer p-1 rounded transition-colors ${isActive ? 'bg-gray-100' : 'hover:bg-gray-50 opacity-50'}`}
                  onClick={() => {
                    const next = new Set(statusFilters);
                    if (isActive) next.delete(key); else next.add(key);
                    setStatusFilters(next);
                  }}
                >
                  <div className="w-3 h-3 rounded mr-2" style={{ backgroundColor: color }} />
                  <span className="text-gray-700">{status.replace('_',' ')}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Removed legacy Drawer UI */}
      {isEditPanelOpen && selectedProspect && (
        <div className="absolute top-0 right-0 w-80 max-h-[90vh] flex flex-col bg-white shadow-xl border-l border-gray-200 z-50 overflow-y-auto" style={{ pointerEvents: 'auto' }}>
          <div className="sticky top-0 z-10 bg-white border-b px-4 pt-3 pb-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">Edit Prospect</h2>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { void flushQueuedSave(); setIsEditPanelOpen(false); }}
                    className="text-gray-400 hover:text-gray-600 h-6 w-6 p-0"
                    aria-label="Save and close"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Save and close</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="px-4 py-3 space-y-4">
            <p className="text-[11px] text-gray-500">Changes save automatically</p>
            <Tabs defaultValue="property" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="property" className="text-xs">Property</TabsTrigger>
                <TabsTrigger value="contact" className="text-xs">Contact</TabsTrigger>
              </TabsList>
              <TabsContent value="property" className="space-y-4">
                <div>
                  <Label className="text-xs font-medium text-gray-700">Address</Label>
                  <Input value={selectedProspect.name} onChange={(e) => updateSelectedProspect('name', e.target.value)} placeholder="Property address" className="h-8 text-sm" />
                </div>
                {/* Business information (shown when available) */}
                {(selectedProspect.businessName || selectedProspect.websiteUrl) && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-medium text-gray-700">Business Name</Label>
                      <Input
                        value={selectedProspect.businessName || ''}
                        onChange={(e) => updateSelectedProspect('businessName', e.target.value || undefined)}
                        placeholder="Business name"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-gray-700">Website</Label>
                      <Input
                        type="url"
                        value={selectedProspect.websiteUrl || ''}
                        onChange={(e) => updateSelectedProspect('websiteUrl', e.target.value || undefined)}
                        placeholder="Website URL"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Status</Label>
                    <Select value={selectedProspect.status} onValueChange={(v) => updateSelectedProspect('status', v)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.keys(STATUS_COLORS).map((s) => (
                          <SelectItem key={s} value={s}>
                            <span className="inline-flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[s as keyof typeof STATUS_COLORS] }} />
                              {s.replace('_',' ')}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Follow Up</Label>
                    <Select value={(selectedProspect as any).followUpTimeframe || 'none'} onValueChange={(v) => updateSelectedProspect('followUpTimeframe' as any, v === 'none' ? undefined : v)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {Object.entries(FOLLOW_UP_LABELS).map(([v,l]) => (<SelectItem key={v} value={v}>{l}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Size</Label>
                    <Select value={selectedProspect.size || ''} onValueChange={(v) => updateSelectedProspect('size', v === 'none' ? '' : v)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select size" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {['< 5,000 SF','5,000 - 10,000 SF','10,000 - 25,000 SF','25,000 - 50,000 SF','50,000 - 100,000 SF','100,000+ SF'].map((x) => (<SelectItem key={x} value={x}>{x}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Acres</Label>
                    <Input value={selectedProspect.acres || ''} placeholder="Auto-calculated" className="h-8 text-sm bg-gray-50" disabled />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-700">Submarket</Label>
                  {submarketOptions.length === 0 ? (
                    <Select disabled><SelectTrigger className="h-8 text-sm"><SelectValue placeholder="No submarkets" /></SelectTrigger></Select>
                  ) : (
                    <Select value={(selectedProspect as any).submarketId || ''} onValueChange={(v) => updateSelectedProspect('submarketId' as any, v === 'none' ? undefined : v)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select submarket" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {submarketOptions.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-700">Notes</Label>
                  <Textarea value={selectedProspect.notes} onChange={(e) => updateSelectedProspect('notes', e.target.value)} rows={3} className="resize-none text-sm" />
                </div>
              </TabsContent>
              <TabsContent value="contact" className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Contact Name</Label>
                    <Input value={selectedProspect.contactName || ''} onChange={(e) => updateSelectedProspect('contactName', e.target.value || undefined)} placeholder="Contact name" className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Company</Label>
                    <Input value={selectedProspect.contactCompany || ''} onChange={(e) => updateSelectedProspect('contactCompany', e.target.value || undefined)} placeholder="Company" className="h-8 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Email</Label>
                    <Input type="email" value={selectedProspect.contactEmail || ''} onChange={(e) => updateSelectedProspect('contactEmail', e.target.value || undefined)} placeholder="name@company.com" className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Phone</Label>
                    <Input value={selectedProspect.contactPhone || ''} onChange={(e) => updateSelectedProspect('contactPhone', e.target.value || undefined)} placeholder="(000) 000-0000" className="h-8 text-sm" />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            <div className="flex items-center gap-2 pt-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => { void flushQueuedSave(); setIsEditPanelOpen(false); }}
                    variant="outline"
                    className="h-8 w-8 p-0 text-xs"
                    aria-label="Save and close"
                  >
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save and close</TooltipContent>
              </Tooltip>
              {selectedProspect.geometry.type === 'Polygon' ? (
                editingProspectId === selectedProspect.id ? (
                  <div className="flex gap-2 flex-1">
                    <Button onClick={savePolygonChanges} className="bg-green-600 hover:bg-green-700 flex-1 h-8 text-xs"><Save className="h-3.5 w-3.5 mr-1" />Save Changes</Button>
                    <Button onClick={discardPolygonChanges} variant="outline" className="flex-1 h-8 text-xs hover:bg-red-50 hover:text-red-600 hover:border-red-200"><X className="h-3.5 w-3.5 mr-1" />Discard</Button>
                  </div>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        onClick={() => enablePolygonEditing(selectedProspect.id)} 
                        variant="outline" 
                        className="h-8 w-8 p-0"
                        aria-label="Edit shape"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit shape</TooltipContent>
                  </Tooltip>
                )
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      onClick={() => { drawingManagerRef.current?.setDrawingMode(window.google.maps.drawing.OverlayType.POLYGON); }} 
                      variant="outline" 
                      className="h-8 w-8 p-0"
                      aria-label="Draw area"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Draw area</TooltipContent>
                </Tooltip>
              )}
              <Button onClick={deleteSelectedProspect} variant="destructive" className="h-8 px-3 text-xs"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
