import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GoogleMap, Marker, Polygon, DrawingManager, useJsApiLoader } from '@react-google-maps/api';
import { Button } from '@/components/ui/button';
// Drawer controls not used in workspace; edit panel opens directly
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { MapControls } from '@/features/map/MapControls';
import { apiRequest } from '@/lib/queryClient';
import type { Prospect } from '@level-cre/shared/schema';
import { useProfile } from '@/hooks/useProfile';
import { uniqueSubmarketNames } from '@/lib/submarkets';
import { Save, X, Edit3, Trash2, Share2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
// Using Google DrawingManager (not Terra) to match main map behavior
import { ShareWorkspaceDialog } from '@/components/ShareWorkspaceDialog';
import { useAuth } from '@/contexts/AuthContext';
import { STATUS_META, type ProspectStatusType } from '@level-cre/shared/schema';
import { StatusLegend } from '@/features/map/StatusLegend';
import { nsKey, readJSON, writeJSON } from '@/lib/storage';

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

export default function Workspace() {
  const [, params] = useRoute('/app/workspaces/:id');
  const listingId = params?.id as string;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isDemoMode } = useAuth();

  const { data: listing } = useQuery<Listing>({ queryKey: ['/api/listings', listingId], enabled: !!listingId });
  const { data: linkedProspects = [], refetch: refetchLinked } = useQuery<Prospect[]>({ queryKey: ['/api/listings', listingId, 'prospects'], enabled: !!listingId });
  const { data: allProspects = [] } = useQuery<Prospect[]>({ queryKey: ['/api/prospects'] });
  const { data: members = [] } = useQuery<{ userId: string; role: 'owner'|'editor'|'viewer'; email?: string|null }[]>({ queryKey: ['/api/listings', listingId, 'members'], enabled: !!listingId });

  const isOwner = !!(listing && user && listing.userId === user.id);
  const myRole = isOwner ? 'owner' : (members.find((m) => m.userId === user?.id)?.role || null);
  const can = {
    view: (isDemoMode && !!listingId) || isOwner || !!myRole,
    edit: (isDemoMode && !!listingId) || isOwner || myRole === 'editor',
    share: isOwner,
  };
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    // Remember last opened workspace
    if (listingId) {
      try {
        localStorage.setItem('lastWorkspaceId', listingId);
        localStorage.setItem('lastWorkspacesLocation', `/app/workspaces/${listingId}`);
        // Backwards-compat for older nav state
        localStorage.setItem('lastListingsLocation', `/app/listings/${listingId}`);
      } catch {}
    }
  }, [listingId]);

  // Demo: seed listing detail from localStorage if cache empty
  useEffect(() => {
    if (!isDemoMode || !listingId) return;
    try {
      const cache = queryClient.getQueryData<Listing>(['/api/listings', listingId]);
      if (!cache) {
        const all = readJSON<any[]>(nsKey(user?.id, 'listings'), []);
        const found = all.find((l) => l.id === listingId);
        if (found) {
          queryClient.setQueryData(['/api/listings', listingId], found);
        }
      }
    } catch {}
  }, [isDemoMode, listingId, user?.id, queryClient]);

  useEffect(() => {
    // fetch linked prospects (use apiRequest for consistent auth/demo headers)
    if (!listingId) return;
    if (isDemoMode) {
      try {
        const ids = getWorkspaceProspectIds(listingId);
        const global = readJSON<any>(nsKey(user?.id, 'mapData'), null);
        const all: Prospect[] = global?.prospects || [];
        const linked = ids.map((id) => all.find((p: Prospect) => p.id === id)).filter(Boolean) as Prospect[];
        if (linked.length > 0) {
          queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], linked);
        }
      } catch {}
      return;
    }
    apiRequest('GET', `/api/listings/${listingId}/prospects`)
      .then(r => r.json())
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/listings', listingId, 'prospects'] });
      })
      .catch(() => {});
  }, [listingId, isDemoMode, user?.id]);

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

  // Demo helpers: id generation, building & persisting local prospects (shared conventions with main map)
  const genId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const buildLocalProspect = (
    data: Pick<Prospect, 'name' | 'status' | 'notes' | 'geometry'> & Partial<Prospect>
  ): Prospect => ({
    id: genId(),
    createdDate: new Date().toISOString(),
    // carry-through optional fields when present
    submarketId: data.submarketId,
    lastContactDate: data.lastContactDate,
    followUpTimeframe: data.followUpTimeframe,
    contactName: data.contactName,
    contactEmail: data.contactEmail,
    contactPhone: data.contactPhone,
    contactCompany: data.contactCompany,
    size: data.size,
    acres: data.acres,
    businessName: (data as any).businessName,
    websiteUrl: (data as any).websiteUrl,
    // required
    name: data.name,
    status: data.status,
    notes: data.notes,
    geometry: data.geometry,
  });

  const persistProspectsGlobal = (next: Prospect[]) => {
    try {
      const saved = readJSON<any>(nsKey(user?.id, 'mapData'), null);
      const touches = saved?.touches || [];
      const submarkets = saved?.submarkets || [];
      writeJSON(nsKey(user?.id, 'mapData'), { prospects: next, submarkets, touches });
    } catch {}
  };

  // Demo helpers: persist workspace membership (listing -> prospect ids)
  const getWorkspaceProspectIds = (wid: string): string[] => {
    try {
      // Merge shared + user-scoped sets for device-wide demo consistency
      const shared = readJSON<string[]>(nsKey(null, `workspace:${wid}:prospectIds`), []);
      const userScoped = readJSON<string[]>(nsKey(user?.id, `workspace:${wid}:prospectIds`), []);
      return Array.from(new Set([...(shared || []), ...(userScoped || [])]));
    } catch { return []; }
  };
  const setWorkspaceProspectIds = (wid: string, ids: string[]) => {
    try { writeJSON(nsKey(user?.id, `workspace:${wid}:prospectIds`), Array.from(new Set(ids))); } catch {}
    try { writeJSON(nsKey(null, `workspace:${wid}:prospectIds`), Array.from(new Set(ids))); } catch {}
  };
  const addProspectToWorkspace = (wid: string, pid: string) => {
    const ids = getWorkspaceProspectIds(wid);
    if (!ids.includes(pid)) setWorkspaceProspectIds(wid, [...ids, pid]);
  };
  const removeProspectFromWorkspace = (wid: string, pid: string) => {
    const ids = getWorkspaceProspectIds(wid);
    setWorkspaceProspectIds(wid, ids.filter(x => x !== pid));
  };
  
  // Pan to search selection and highlight
  useEffect(() => {
    if (searchPin && map) {
      try {
        map.panTo({ lat: searchPin.lat, lng: searchPin.lng });
        map.setZoom(17);
      } catch {}
    }
  }, [searchPin, map]);
  
  // Status filter UI: default to all statuses visible
  type StatusKey = ProspectStatusType;
  const [statusFilters, setStatusFilters] = useState<Set<StatusKey>>(() => {
    return new Set(Object.keys(STATUS_META) as StatusKey[]);
  });
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
    if (!can.edit) return;
    const id = lastEditedIdRef.current || selectedProspect?.id || null;
    if (!id) return;
    const patch = pendingPatchRef.current;
    pendingPatchRef.current = {};
    if (!patch || Object.keys(patch).length === 0) return;
    try {
      if (isDemoMode) {
        // Update caches locally
        queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) =>
          Array.isArray(prev) ? prev.map((p) => (p.id === id ? { ...p, ...patch } as Prospect : p)) : prev
        );
        queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) =>
          Array.isArray(prev) ? prev.map((p) => (p.id === id ? { ...p, ...patch } as Prospect : p)) : prev
        );
        const nextSel = selectedProspect && selectedProspect.id === id ? ({ ...selectedProspect, ...patch } as Prospect) : selectedProspect;
        setSelectedProspect(nextSel || null);
        // Persist globals
        const all = (queryClient.getQueryData<Prospect[] | undefined>(['/api/prospects']) || []) as Prospect[];
        persistProspectsGlobal(all);
        return;
      }
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
  }, [queryClient, listingId, selectedProspect, can.edit, isDemoMode]);

  const queueUpdate = useCallback((field: keyof Prospect, value: any, opts?: { flush?: boolean }) => {
    if (!can.edit) return;
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
  }, [listingId, queryClient, flushQueuedSave, selectedProspect, can.edit]);

  const updateSelectedProspect = useCallback((field: keyof Prospect, value: any) => {
    queueUpdate(field, value);
  }, [queueUpdate]);

  const deleteSelectedProspect = useCallback(async () => {
    if (!can.edit) return;
    if (!selectedProspect) return;
    try {
      if (isDemoMode) {
        // Remove from caches
        const id = selectedProspect.id;
        queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) => Array.isArray(prev) ? prev.filter(p => p.id !== id) : prev);
        queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) => Array.isArray(prev) ? prev.filter(p => p.id !== id) : prev);
        // Persist globals
        const all = (queryClient.getQueryData<Prospect[] | undefined>(['/api/prospects']) || []) as Prospect[];
        persistProspectsGlobal(all);
        // Update workspace membership
        if (listingId) removeProspectFromWorkspace(listingId, id);
        setSelectedProspect(null); setIsEditPanelOpen(false);
        toast({ title: 'Prospect Deleted (demo)' });
      } else {
        await apiRequest('DELETE', `/api/prospects/${selectedProspect.id}`);
        setSelectedProspect(null); setIsEditPanelOpen(false);
        queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
        queryClient.invalidateQueries({ queryKey: ['/api/listings', listingId, 'prospects'] });
        toast({ title: 'Prospect Deleted' });
      }
    } catch {}
  }, [selectedProspect, listingId, can.edit, isDemoMode]);

  const enablePolygonEditing = useCallback((prospectId: string) => {
    if (!can.edit) return;
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
          try {
            if (isDemoMode) {
              // Local update in demo mode
              const patch: Partial<Prospect> = { geometry: newGeom, acres: acres ? acres.toString() : undefined };
              queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) => Array.isArray(prev) ? prev.map((p) => (p.id === prospectId ? { ...p, ...patch } as Prospect : p)) : prev);
              queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) => Array.isArray(prev) ? prev.map((p) => (p.id === prospectId ? { ...p, ...patch } as Prospect : p)) : prev);
              const all = (queryClient.getQueryData<Prospect[] | undefined>(['/api/prospects']) || []) as Prospect[];
              persistProspectsGlobal(all);
              setSelectedProspect(prev => (prev && prev.id === prospectId) ? ({ ...prev, ...patch } as Prospect) : prev);
            } else {
              const r = await apiRequest('PATCH', `/api/prospects/${prospectId}`, { geometry: newGeom, acres: acres ? acres.toString() : undefined });
              const saved = await r.json();
              setSelectedProspect(prev => prev && prev.id === saved.id ? saved : prev);
              queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) => Array.isArray(prev) ? prev.map((p) => (p.id === saved.id ? saved : p)) : prev);
              queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) => Array.isArray(prev) ? prev.map((p) => (p.id === saved.id ? saved : p)) : prev);
            }
          } catch {}
        }, 500); };
        path.addListener('set_at', scheduleSave); path.addListener('insert_at', scheduleSave); path.addListener('remove_at', scheduleSave);
      }
    }, 100);
  }, [linkedProspects, listingId, can.edit]);

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
        status: 'prospect' as ProspectStatusType,
        notes: '',
        businessName: searchPin.businessName || undefined,
        websiteUrl: searchPin.websiteUrl || undefined,
        contactCompany: searchPin.businessName || undefined,
      };

      if (isDemoMode) {
        // Demo-mode: create locally and return
        const p = buildLocalProspect(payload as any);
        return p;
      }

      // Real API flow
      const res = await apiRequest('POST', '/api/prospects', payload);
      const p = await res.json();
      await apiRequest('POST', `/api/listings/${listingId}/prospects`, { prospectId: p.id });
      return p;
    },
    onSuccess: (p: Prospect) => {
      // Keep caches in sync for both listing and global prospects
      queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) =>
        Array.isArray(prev) ? [...prev, p] : [p]
      );
      queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) =>
        Array.isArray(prev) ? [...prev, p] : [p]
      );
      if (!isDemoMode) {
        queryClient.invalidateQueries({ queryKey: ['/api/listings', listingId, 'prospects'] });
      } else {
        // Persist globally for demo mode so main map sees it too
        const all = queryClient.getQueryData<Prospect[] | undefined>(['/api/prospects']) || [];
        persistProspectsGlobal(all);
        if (listingId) addProspectToWorkspace(listingId, p.id);
      }
      if (!isDemoMode) {
        refetchLinked();
      }
      setSearchPin(null);
      setSelectedProspect(p);
      setIsEditPanelOpen(true);
      toast({ title: isDemoMode ? 'Prospect added (demo)' : 'Prospect added', description: `${p.name} linked to workspace` });
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
            {/* Floating Share button (top-right) */}
            <div
              className="absolute top-4 z-[1000] pointer-events-auto"
              style={{ right: isEditPanelOpen ? 352 : 16 }}
            >
              <Button
                size="sm"
                onClick={() => setShareOpen(true)}
                className="h-9 px-3 rounded-xl bg-neutral-900/90 text-white border border-neutral-800 shadow-lg hover:bg-neutral-800/90 focus:ring-2 focus:ring-white/20"
                aria-label="Share workspace"
                title="Share workspace"
              >
                <Share2 className="h-4 w-4 mr-1.5" />
                Share
              </Button>
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
                  if (isDemoMode) {
                    const saved = buildLocalProspect({ name: 'New Prospect', status: 'prospect' as ProspectStatusType, notes: '', geometry });
                    // Update caches for both listing and global
                    queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) => Array.isArray(prev) ? [...prev, saved] : [saved]);
                    queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) => Array.isArray(prev) ? [...prev, saved] : [saved]);
                    // Persist globally so the main map sees it in demo mode
                    const all = queryClient.getQueryData<Prospect[] | undefined>(['/api/prospects']) || [];
                    persistProspectsGlobal(all);
                    if (listingId) addProspectToWorkspace(listingId, saved.id);
                    toast({ title: 'Prospect created (demo)', description: 'Linked to workspace locally' });
                    // reset to select
                    drawingManagerRef.current?.setDrawingMode(null);
                    setDrawMode('select');
                    map?.setOptions({ draggable: true, disableDoubleClickZoom: false });
                    // Open the edit panel for the new prospect
                    setSelectedProspect(saved);
                    setIsEditPanelOpen(true);
                    return;
                  }
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
              const color = STATUS_META[p.status as ProspectStatusType]?.color || '#3B82F6';
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
                  <Button size="sm" onClick={() => createAndLink.mutate()} disabled={createAndLink.isPending || !can.edit}>{createAndLink.isPending ? 'Adding...' : 'Add as Prospect'}</Button>
                </div>
              </div>
            )}
            </GoogleMap>
          </div>
        )}
      </div>

      {/* Status Legend / Filters (bottom-left) */}
      <div className="absolute bottom-4 left-4 z-20" style={{ pointerEvents: 'auto' }}>
        <StatusLegend
          selected={statusFilters}
          onToggle={(key) => {
            const k = key as StatusKey;
            const next = new Set(statusFilters);
            if (next.has(k)) next.delete(k); else next.add(k);
            setStatusFilters(next);
          }}
        />
      </div>

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
                        {Object.entries(STATUS_META).map(([k, meta]) => (
                          <SelectItem key={k} value={k}>
                            <span className="inline-flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                              {meta.label}
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
                    <Button onClick={savePolygonChanges} className="bg-green-600 hover:bg-green-700 flex-1 h-8 text-xs" disabled={!can.edit}><Save className="h-3.5 w-3.5 mr-1" />Save Changes</Button>
                    <Button onClick={discardPolygonChanges} variant="outline" className="flex-1 h-8 text-xs hover:bg-red-50 hover:text-red-600 hover:border-red-200" disabled={!can.edit}><X className="h-3.5 w-3.5 mr-1" />Discard</Button>
                  </div>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        onClick={() => enablePolygonEditing(selectedProspect.id)} 
                        variant="outline" 
                        className="h-8 w-8 p-0"
                        disabled={!can.edit}
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
                      disabled={!can.edit}
                      aria-label="Draw area"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Draw area</TooltipContent>
                </Tooltip>
              )}
              <Button onClick={deleteSelectedProspect} variant="destructive" className="h-8 px-3 text-xs" disabled={!can.edit}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </div>
      )}
      <ShareWorkspaceDialog listingId={listingId} open={shareOpen} onOpenChange={setShareOpen} canManage={can.share} />
    </div>
  );
}
