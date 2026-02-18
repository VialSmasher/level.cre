import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GoogleMap, Polygon, DrawingManager, useJsApiLoader } from '@react-google-maps/api';
import { Button } from '@/components/ui/button';
// Drawer controls not used in workspace; edit panel opens directly
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { MapControls } from '@/features/map/MapControls';
import { createCustomAssetMarker } from '@/features/map/createCustomAssetMarker';
import { apiRequest } from '@/lib/queryClient';
import type { Prospect, FollowUpTimeframeType, ProspectGeometryType } from '@level-cre/shared/schema';
import { useProfile } from '@/hooks/useProfile';
import { uniqueSubmarketNames } from '@/lib/submarkets';
import { Save, X, Edit3, Trash2, Share2 } from 'lucide-react';
import { Modal, ModalContent, ModalHeader, ModalFooter, ModalTitle, ModalDescription, ModalClose } from '@/components/primitives/Modal';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
// Using Google DrawingManager (not Terra) to match main map behavior
import { ShareWorkspaceDialog } from '@/components/ShareWorkspaceDialog';
import { useAuth } from '@/contexts/AuthContext';
import { STATUS_META, type ProspectStatusType } from '@level-cre/shared/schema';
import { StatusLegend } from '@/features/map/StatusLegend';
import { MapContextMenu } from '@/features/map/MapContextMenu';
import { useGeocode } from '@/hooks/useGeocode';
import { nsKey, readJSON, writeJSON } from '@/lib/storage';
// Note: Avoid importing AlertDialog to prevent a circular-import bundle bug

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
const FIELD_BUFFER_DELAY = 600;
const AUTO_NAME_REGEX = /^New\s+(polygon|rectangle|point|marker)/i;
const getDisplayAddressValue = (name?: string | null) => {
  if (!name) return '';
  return AUTO_NAME_REGEX.test(name) ? '' : name;
};

type CreateProspectVariables = {
  payload: {
    name: string;
    geometry: ProspectGeometryType;
    status?: ProspectStatusType;
    notes?: string;
    businessName?: string;
    websiteUrl?: string;
    contactCompany?: string;
  };
  source?: 'search' | 'context-menu';
};

type ContextMenuState = {
  lat: number;
  lng: number;
  viewportX: number;
  viewportY: number;
};

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
  const geocode = useGeocode();

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

  // Follow-up due date helpers
  const timeframeToMonths: Record<FollowUpTimeframeType, number> = {
    '1_month': 1,
    '3_month': 3,
    '6_month': 6,
    '1_year': 12,
  };
  const addMonthsSafe = (d: Date, months: number) => {
    const date = new Date(d);
    const day = date.getDate();
    date.setMonth(date.getMonth() + months);
    if (date.getDate() < day) date.setDate(0);
    return date;
  };
  const computeFollowUpDue = (anchorIso?: string, timeframe?: FollowUpTimeframeType) => {
    if (!timeframe) return undefined;
    const months = timeframeToMonths[timeframe] ?? 3;
    const anchor = anchorIso ? new Date(anchorIso) : new Date();
    return addMonthsSafe(anchor, months).toISOString();
  };

  // DrawingManager state
  type DrawMode = 'select' | 'point' | 'polygon' | 'rectangle';
  const [drawMode, setDrawMode] = useState<DrawMode>('select');
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);

  // Track when user is drawing a polygon to attach to an existing prospect (like /app)
  const [drawingForProspect, setDrawingForProspect] = useState<Prospect | null>(null);
  const drawingForProspectRef = useRef<Prospect | null>(null);
  useEffect(() => { drawingForProspectRef.current = drawingForProspect; }, [drawingForProspect]);

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

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const onMapLoad = useCallback((m: google.maps.Map) => {
    // Keep a reference to the map instance; initial center/zoom are set via defaultCenter/defaultZoom
    setMap(m);
  }, []);
  const customAssetMarkersRef = useRef<google.maps.Marker[]>([]);
  const subjectMarkerRef = useRef<google.maps.Marker | null>(null);
  const searchMarkerRef = useRef<google.maps.Marker | null>(null);

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

  useEffect(() => {
    if (!map) return;
    const listener = map.addListener('rightclick', (event: google.maps.MapMouseEvent) => {
      if (!mapContainerRef.current || !event.latLng) return;
      event.domEvent?.preventDefault?.();
      event.domEvent?.stopPropagation?.();
      const lat = event.latLng.lat();
      const lng = event.latLng.lng();
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const pixel = event.pixel;
      const rect = mapContainerRef.current.getBoundingClientRect();
      const viewportX = rect.left + (pixel?.x ?? 0);
      const viewportY = rect.top + (pixel?.y ?? 0);
      setContextMenu({ lat, lng, viewportX, viewportY });
    });
    return () => {
      listener.remove();
    };
  }, [map]);

  useEffect(() => {
    if (!contextMenu) return;
    const handlePointer = () => closeContextMenu();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeContextMenu();
      }
    };
    const timer = window.setTimeout(() => {
      window.addEventListener('mousedown', handlePointer);
      window.addEventListener('contextmenu', handlePointer);
      window.addEventListener('keydown', handleKey, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousedown', handlePointer);
      window.removeEventListener('contextmenu', handlePointer);
      window.removeEventListener('keydown', handleKey, true);
    };
  }, [contextMenu, closeContextMenu]);

  const [searchPin, setSearchPin] = useState<{ lat: number; lng: number; address: string; businessName?: string | null; websiteUrl?: string | null } | null>(null);
  // Signal to clear the SearchBar input when a prospect is added
  const [clearSearchSignal, setClearSearchSignal] = useState(0);
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [bounds, setBounds] = useState<google.maps.LatLngBoundsLiteral | null>(null);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [prospectDraft, setProspectDraft] = useState<Prospect | null>(null);
  const prospectDraftRef = useRef<Prospect | null>(null);
  const [localAddress, setLocalAddress] = useState('');
  const [localNotes, setLocalNotes] = useState('');
  const [localContactName, setLocalContactName] = useState('');
  const [localContactCompany, setLocalContactCompany] = useState('');
  const [localContactEmail, setLocalContactEmail] = useState('');
  const [localContactPhone, setLocalContactPhone] = useState('');
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const [editingProspectId, setEditingProspectId] = useState<string | null>(null);
  const polygonRefs = useRef<Map<string, google.maps.Polygon>>(new Map());
  const [originalPolygonCoordinates, setOriginalPolygonCoordinates] = useState<[number, number][] | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  useEffect(() => {
    if (isEditPanelOpen && selectedProspect) {
      setProspectDraft(selectedProspect);
    } else {
      setProspectDraft(null);
    }
  }, [isEditPanelOpen, selectedProspect]);
  useEffect(() => {
    prospectDraftRef.current = prospectDraft;
  }, [prospectDraft]);

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

  useEffect(() => {
    if (!map) return;

    customAssetMarkersRef.current.forEach((marker) => marker.setMap(null));
    customAssetMarkersRef.current = [];

    const nextMarkers: google.maps.Marker[] = [];

    filteredLinkedProspects.forEach((p) => {
      if (p.geometry.type !== 'Point') return;
      const [lng, lat] = p.geometry.coordinates as [number, number];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      try {
        const circlePath = window.google?.maps?.SymbolPath?.CIRCLE ?? google.maps.SymbolPath.CIRCLE;
        const color = STATUS_META[p.status as ProspectStatusType]?.color || '#3B82F6';
        const marker = createCustomAssetMarker(map, {
          lat,
          lng,
          title: p.name || 'Custom Asset',
          markerOptions: {
            icon: {
              path: circlePath,
              fillColor: color,
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: '#ffffff',
              scale: 8,
            } as google.maps.Symbol,
          },
        });
        nextMarkers.push(marker);
      } catch (err) {
        console.error('Failed to create custom asset marker', err);
      }
    });

    customAssetMarkersRef.current = nextMarkers;

    return () => {
      nextMarkers.forEach((marker) => marker.setMap(null));
      if (customAssetMarkersRef.current === nextMarkers) {
        customAssetMarkersRef.current = [];
      }
    };
  }, [map, filteredLinkedProspects]);

  useEffect(() => {
    if (!map) {
      if (subjectMarkerRef.current) {
        subjectMarkerRef.current.setMap(null);
        subjectMarkerRef.current = null;
      }
      return;
    }

    subjectMarkerRef.current?.setMap(null);
    subjectMarkerRef.current = null;

    if (!subjectPosition) return;

    let nextMarker: google.maps.Marker | null = null;
    try {
      const circlePath = window.google?.maps?.SymbolPath?.CIRCLE ?? google.maps.SymbolPath.CIRCLE;
      const subjectIcon = {
        path: circlePath,
        fillColor: '#ef4444',
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: '#ffffff',
        scale: 10,
      } as google.maps.Symbol;
      nextMarker = createCustomAssetMarker(map, {
        lat: subjectPosition.lat,
        lng: subjectPosition.lng,
        title: listing?.title || 'Subject Property',
        markerOptions: { icon: subjectIcon },
      });
      subjectMarkerRef.current = nextMarker;
    } catch (err) {
      console.error('Failed to create subject marker', err);
    }

    return () => {
      nextMarker?.setMap(null);
      if (subjectMarkerRef.current === nextMarker) {
        subjectMarkerRef.current = null;
      }
    };
  }, [map, subjectPosition, listing?.title]);

  useEffect(() => {
    if (!map) {
      if (searchMarkerRef.current) {
        searchMarkerRef.current.setMap(null);
        searchMarkerRef.current = null;
      }
      return;
    }

    searchMarkerRef.current?.setMap(null);
    searchMarkerRef.current = null;

    if (!searchPin) return;

    let nextMarker: google.maps.Marker | null = null;
    try {
      const circlePath = window.google?.maps?.SymbolPath?.CIRCLE ?? google.maps.SymbolPath.CIRCLE;
      const searchIcon = {
        path: circlePath,
        fillColor: '#7C3AED',
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: '#ffffff',
        scale: 8,
      } as google.maps.Symbol;
      nextMarker = createCustomAssetMarker(map, {
        lat: searchPin.lat,
        lng: searchPin.lng,
        title: searchPin.address || 'Search Pin',
        markerOptions: { icon: searchIcon },
      });
      searchMarkerRef.current = nextMarker;
    } catch (err) {
      console.error('Failed to create search marker', err);
    }

    return () => {
      nextMarker?.setMap(null);
      if (searchMarkerRef.current === nextMarker) {
        searchMarkerRef.current = null;
      }
    };
  }, [map, searchPin]);

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
  const pendingPatchRef = useRef<Partial<Prospect>>({});
  const lastEditedIdRef = useRef<string | null>(null);

  const flushQueuedSave = useCallback(async () => {
    if (!can.edit) return;
    const currentDraft = prospectDraftRef.current;
    const id = lastEditedIdRef.current || currentDraft?.id || null;
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
        setSelectedProspect((prev) => (prev && prev.id === id ? ({ ...prev, ...patch } as Prospect) : prev));
        setProspectDraft((prev) => (prev && prev.id === id ? ({ ...prev, ...patch } as Prospect) : prev));
        // Persist globals
        const all = (queryClient.getQueryData<Prospect[] | undefined>(['/api/prospects']) || []) as Prospect[];
        persistProspectsGlobal(all);
        return;
      }
      const res = await apiRequest('PATCH', `/api/prospects/${id}`, patch);
      const saved = await res.json();
      setSelectedProspect((prev) => (prev && prev.id === saved.id ? saved : prev));
      setProspectDraft((prev) => (prev && prev.id === saved.id ? saved : prev));
      // Keep caches in sync without forcing re-fetches
      queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) =>
        Array.isArray(prev) ? prev.map((p) => (p.id === saved.id ? saved : p)) : prev
      );
      queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) =>
        Array.isArray(prev) ? prev.map((p) => (p.id === saved.id ? saved : p)) : prev
      );
    } catch {}
  }, [can.edit, isDemoMode, listingId, queryClient]);

  const { debounced: scheduleAutoSave, flush: flushAutoSave, cancel: cancelAutoSave } =
    useDebouncedCallback(() => { void flushQueuedSave(); }, 500);

  useEffect(() => {
    cancelAutoSave();
    pendingPatchRef.current = {};
    lastEditedIdRef.current = selectedProspect?.id ?? null;
  }, [selectedProspect?.id, cancelAutoSave]);

  // Ensure this is defined before any hooks or callbacks reference it
  const savePolygonChanges = useCallback(() => {
    setEditingProspectId(null);
    const polygon = selectedProspect ? polygonRefs.current.get(selectedProspect.id) : null;
    if (polygon) {
      polygon.setEditable(false);
      polygon.setDraggable(false);
    }
  }, [selectedProspect]);

  // Close the edit panel, flush pending changes, and reset selection/draw state
  const closeEditPanel = useCallback(async () => {
    // If polygon editing is active, persist geometry before closing
    if (editingProspectId) {
      try { await savePolygonChanges(); } catch {}
    }
    // Flush any pending debounced save
    cancelAutoSave();
    flushAutoSave();
    // Close panel and clear selection
    setIsEditPanelOpen(false);
    setSelectedProspect(null);
    setProspectDraft(null);
    prospectDraftRef.current = null;
    pendingPatchRef.current = {};
    lastEditedIdRef.current = null;
    setDrawingForProspect(null);
    // Reset drawing mode and map interactions
    try { drawingManagerRef.current?.setDrawingMode(null); } catch {}
    try { setDrawMode('select'); } catch {}
    try { map?.setOptions({ draggable: true, disableDoubleClickZoom: false }); } catch {}
  }, [editingProspectId, savePolygonChanges, flushAutoSave, cancelAutoSave, map]);

  // Close Edit Panel on Escape key (flush + reset draw state). Works while editing.
  useEffect(() => {
    if (!isEditPanelOpen && !editingProspectId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        void closeEditPanel();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isEditPanelOpen, editingProspectId, closeEditPanel]);

  const queueUpdate = useCallback((field: keyof Prospect, value: any, opts?: { flush?: boolean }) => {
    if (!can.edit) return;
    let didUpdate = false;
    setProspectDraft((prev) => {
      if (!prev) return prev;
      const id = prev.id;
      if (!id) return prev;
      const currentValue = (prev as any)[field];
      if (currentValue === value) return prev;
      if (lastEditedIdRef.current && lastEditedIdRef.current !== id) {
        cancelAutoSave();
        pendingPatchRef.current = {};
      }
      lastEditedIdRef.current = id;
      pendingPatchRef.current = { ...pendingPatchRef.current, [field]: value };
      didUpdate = true;
      return { ...prev, [field]: value } as Prospect;
    });
    if (!didUpdate) return;
    if (opts?.flush) {
      cancelAutoSave();
      flushAutoSave();
    } else {
      scheduleAutoSave();
    }
  }, [can.edit, cancelAutoSave, flushAutoSave, scheduleAutoSave]);

  const updateSelectedProspect = useCallback((field: keyof Prospect, value: any) => {
    queueUpdate(field, value);
  }, [queueUpdate]);

  const { debounced: scheduleAddressSync, cancel: cancelAddressSync } = useDebouncedCallback(
    (payload: { id: string; value: string }) => {
      if (!payload?.id) return;
      if (prospectDraftRef.current?.id !== payload.id) return;
      queueUpdate('name', payload.value);
    },
    FIELD_BUFFER_DELAY
  );

  const { debounced: scheduleNotesSync, cancel: cancelNotesSync } = useDebouncedCallback(
    (payload: { id: string; value: string }) => {
      if (!payload?.id) return;
      if (prospectDraftRef.current?.id !== payload.id) return;
      queueUpdate('notes', payload.value);
    },
    FIELD_BUFFER_DELAY
  );

  const { debounced: scheduleContactNameSync, cancel: cancelContactNameSync } = useDebouncedCallback(
    (payload: { id: string; value: string }) => {
      if (!payload?.id) return;
      if (prospectDraftRef.current?.id !== payload.id) return;
      queueUpdate('contactName', payload.value || undefined);
    },
    FIELD_BUFFER_DELAY
  );

  const { debounced: scheduleContactCompanySync, cancel: cancelContactCompanySync } = useDebouncedCallback(
    (payload: { id: string; value: string }) => {
      if (!payload?.id) return;
      if (prospectDraftRef.current?.id !== payload.id) return;
      queueUpdate('contactCompany', payload.value || undefined);
    },
    FIELD_BUFFER_DELAY
  );

  const { debounced: scheduleContactEmailSync, cancel: cancelContactEmailSync } = useDebouncedCallback(
    (payload: { id: string; value: string }) => {
      if (!payload?.id) return;
      if (prospectDraftRef.current?.id !== payload.id) return;
      queueUpdate('contactEmail', payload.value || undefined);
    },
    FIELD_BUFFER_DELAY
  );

  const { debounced: scheduleContactPhoneSync, cancel: cancelContactPhoneSync } = useDebouncedCallback(
    (payload: { id: string; value: string }) => {
      if (!payload?.id) return;
      if (prospectDraftRef.current?.id !== payload.id) return;
      queueUpdate('contactPhone', payload.value || undefined);
    },
    FIELD_BUFFER_DELAY
  );

  useEffect(() => {
    cancelAddressSync();
    cancelNotesSync();
    cancelContactNameSync();
    cancelContactCompanySync();
    cancelContactEmailSync();
    cancelContactPhoneSync();
    if (!prospectDraft) {
      setLocalAddress('');
      setLocalNotes('');
      setLocalContactName('');
      setLocalContactCompany('');
      setLocalContactEmail('');
      setLocalContactPhone('');
      return;
    }
    setLocalAddress(getDisplayAddressValue(prospectDraft.name));
    setLocalNotes(prospectDraft.notes || '');
    setLocalContactName(prospectDraft.contactName || '');
    setLocalContactCompany(prospectDraft.contactCompany || '');
    setLocalContactEmail(prospectDraft.contactEmail || '');
    setLocalContactPhone(prospectDraft.contactPhone || '');
  }, [
    prospectDraft,
    cancelAddressSync,
    cancelNotesSync,
    cancelContactNameSync,
    cancelContactCompanySync,
    cancelContactEmailSync,
    cancelContactPhoneSync,
  ]);

  const handleAddressChange = useCallback((next: string) => {
    setLocalAddress(next);
    if (!prospectDraft?.id) return;
    scheduleAddressSync({ id: prospectDraft.id, value: next });
  }, [prospectDraft?.id, scheduleAddressSync]);

  const handleAddressBlur = useCallback(() => {
    if (!prospectDraftRef.current?.id) return;
    cancelAddressSync();
    queueUpdate('name', localAddress);
  }, [cancelAddressSync, queueUpdate, localAddress]);

  const handleNotesChange = useCallback((next: string) => {
    setLocalNotes(next);
    if (!prospectDraft?.id) return;
    scheduleNotesSync({ id: prospectDraft.id, value: next });
  }, [prospectDraft?.id, scheduleNotesSync]);

  const handleNotesBlur = useCallback(() => {
    if (!prospectDraftRef.current?.id) return;
    cancelNotesSync();
    queueUpdate('notes', localNotes);
  }, [cancelNotesSync, queueUpdate, localNotes]);

  const handleContactNameChange = useCallback((next: string) => {
    setLocalContactName(next);
    if (!prospectDraft?.id) return;
    scheduleContactNameSync({ id: prospectDraft.id, value: next });
  }, [prospectDraft?.id, scheduleContactNameSync]);

  const handleContactNameBlur = useCallback(() => {
    if (!prospectDraftRef.current?.id) return;
    cancelContactNameSync();
    queueUpdate('contactName', localContactName || undefined);
  }, [cancelContactNameSync, queueUpdate, localContactName]);

  const handleContactCompanyChange = useCallback((next: string) => {
    setLocalContactCompany(next);
    if (!prospectDraft?.id) return;
    scheduleContactCompanySync({ id: prospectDraft.id, value: next });
  }, [prospectDraft?.id, scheduleContactCompanySync]);

  const handleContactCompanyBlur = useCallback(() => {
    if (!prospectDraftRef.current?.id) return;
    cancelContactCompanySync();
    queueUpdate('contactCompany', localContactCompany || undefined);
  }, [cancelContactCompanySync, queueUpdate, localContactCompany]);

  const handleContactEmailChange = useCallback((next: string) => {
    setLocalContactEmail(next);
    if (!prospectDraft?.id) return;
    scheduleContactEmailSync({ id: prospectDraft.id, value: next });
  }, [prospectDraft?.id, scheduleContactEmailSync]);

  const handleContactEmailBlur = useCallback(() => {
    if (!prospectDraftRef.current?.id) return;
    cancelContactEmailSync();
    queueUpdate('contactEmail', localContactEmail || undefined);
  }, [cancelContactEmailSync, queueUpdate, localContactEmail]);

  const handleContactPhoneChange = useCallback((next: string) => {
    setLocalContactPhone(next);
    if (!prospectDraft?.id) return;
    scheduleContactPhoneSync({ id: prospectDraft.id, value: next });
  }, [prospectDraft?.id, scheduleContactPhoneSync]);

  const handleContactPhoneBlur = useCallback(() => {
    if (!prospectDraftRef.current?.id) return;
    cancelContactPhoneSync();
    queueUpdate('contactPhone', localContactPhone || undefined);
  }, [cancelContactPhoneSync, queueUpdate, localContactPhone]);

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
        setSelectedProspect(null);
        setIsEditPanelOpen(false);
        setProspectDraft(null);
        prospectDraftRef.current = null;
        cancelAutoSave();
        pendingPatchRef.current = {};
        lastEditedIdRef.current = null;
        // Decrement cached count in listings grid
        queryClient.setQueryData<any[] | undefined>(['/api/listings'], (prev) => {
          if (!Array.isArray(prev)) return prev;
          return prev.map((l: any) => (l?.id === listingId) ? { ...l, prospectCount: Math.max(0, (l?.prospectCount ?? 0) - 1) } : l);
        });
        toast({ title: 'Prospect Deleted (demo)' });
      } else {
        await apiRequest('DELETE', `/api/prospects/${selectedProspect.id}`);
        setSelectedProspect(null);
        setIsEditPanelOpen(false);
        setProspectDraft(null);
        prospectDraftRef.current = null;
        cancelAutoSave();
        pendingPatchRef.current = {};
        lastEditedIdRef.current = null;
        queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
        queryClient.invalidateQueries({ queryKey: ['/api/listings', listingId, 'prospects'] });
        // Decrement cached count for listings and mark stale
        queryClient.setQueryData<any[] | undefined>(['/api/listings'], (prev) => {
          if (!Array.isArray(prev)) return prev;
          return prev.map((l: any) => (l?.id === listingId) ? { ...l, prospectCount: Math.max(0, (l?.prospectCount ?? 0) - 1) } : l);
        });
        queryClient.invalidateQueries({ queryKey: ['/api/listings'] });
        toast({ title: 'Prospect Deleted' });
      }
    } catch {}
  }, [selectedProspect, listingId, can.edit, isDemoMode, cancelAutoSave]);

  // Keyboard shortcut: Ctrl+Delete (Windows) or Cmd+Delete (Mac)
  useEffect(() => {
    if (!isEditPanelOpen) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      // Avoid triggering while typing in inputs/textareas/contenteditable
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (target && (target as HTMLElement).isContentEditable) ||
        target?.closest('input, textarea, [contenteditable="true"]')
      ) {
        return;
      }
      const isMac = typeof navigator !== 'undefined' && (navigator.platform || '').toUpperCase().includes('MAC');
      const key = (e.key || '').toLowerCase();
      if ((key === 'delete') && ((isMac && e.metaKey) || (!isMac && e.ctrlKey))) {
        e.preventDefault();
        setDeleteDialogOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isEditPanelOpen]);

  const enablePolygonEditing = useCallback((prospectId: string) => {
    if (!can.edit) return;
    const prospect = linkedProspects.find(p => p.id === prospectId);
    if (!prospect || (prospect.geometry.type !== 'Polygon' && prospect.geometry.type !== 'Rectangle')) return;
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

  

  const discardPolygonChanges = useCallback(() => {
    if (!editingProspectId || !originalPolygonCoordinates) return;
    const polygon = polygonRefs.current.get(editingProspectId);
    if (polygon) { const path = polygon.getPath(); path.clear(); originalPolygonCoordinates.forEach(([lng, lat]) => path.push(new google.maps.LatLng(lat, lng))); polygon.setEditable(false); polygon.setDraggable(false); }
    setEditingProspectId(null); setOriginalPolygonCoordinates(null);
  }, [editingProspectId, originalPolygonCoordinates]);

  // Linking existing prospects via drawer removed

  const createProspectMutation = useMutation<Prospect, Error, CreateProspectVariables>({
    mutationFn: async ({ payload }) => {
      const normalized = {
        ...payload,
        status: (payload.status ?? 'prospect') as ProspectStatusType,
        notes: payload.notes ?? '',
      };

      if (isDemoMode) {
        return buildLocalProspect(normalized as any);
      }

      const res = await apiRequest('POST', '/api/prospects', normalized);
      const created = await res.json();
      if (listingId) {
        await apiRequest('POST', `/api/listings/${listingId}/prospects`, { prospectId: created.id });
      }
      return created;
    },
    onSuccess: (p, variables) => {
      queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) =>
        Array.isArray(prev) ? [...prev, p] : [p]
      );
      queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) =>
        Array.isArray(prev) ? [...prev, p] : [p]
      );
      queryClient.setQueryData<any[] | undefined>(['/api/listings'], (prev) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((l: any) => (l?.id === listingId) ? { ...l, prospectCount: Math.max(0, (l?.prospectCount ?? 0) + 1) } : l);
      });

      if (!isDemoMode) {
        queryClient.invalidateQueries({ queryKey: ['/api/listings', listingId, 'prospects'] });
        queryClient.invalidateQueries({ queryKey: ['/api/listings'] });
        refetchLinked();
      } else {
        const all = queryClient.getQueryData<Prospect[] | undefined>(['/api/prospects']) || [];
        persistProspectsGlobal(all);
        if (listingId) addProspectToWorkspace(listingId, p.id);
      }

      if (variables?.source === 'search') {
        setSearchPin(null);
        setClearSearchSignal((s) => s + 1);
      } else if (variables?.source === 'context-menu') {
        closeContextMenu();
      }

      setSelectedProspect(p);
      setIsEditPanelOpen(true);
      const label = (p.name || '').trim() || 'Prospect';
      toast({
        title: isDemoMode ? 'Prospect added (demo)' : 'Prospect added',
        description: `${label} linked to workspace`,
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to create prospect';
      toast({
        title: 'Could not add prospect',
        description: message,
        variant: 'destructive',
      });
    },
  });

  const formatCoordinates = useCallback((lat: number, lng: number) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`, []);

  const handleCopyCoordinates = useCallback(async (lat: number, lng: number) => {
    const text = formatCoordinates(lat, lng);
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {}

    if (!copied && typeof document !== 'undefined') {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        copied = true;
      } catch {}
    }

    if (copied) {
      toast({ title: 'Coordinates copied', description: text });
    } else {
      toast({ title: 'Copy failed', description: 'Unable to copy coordinates', variant: 'destructive' });
    }
  }, [formatCoordinates, toast]);

  const handleOpenInMaps = useCallback((lat: number, lng: number) => {
    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    let opened = false;
    try {
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (win) {
        opened = true;
        win.opener = null;
      }
    } catch {}
    if (!opened && typeof document !== 'undefined') {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      opened = true;
    }
    if (!opened) {
      window.location.href = url;
    }
  }, []);

  const handleCreateProspectAt = useCallback(async (lat: number, lng: number) => {
    if (!can.edit || createProspectMutation.isPending) return;
    let resolvedAddress = '';
    try {
      const result = await geocode.reverse(lat, lng);
      if (result.address) {
        resolvedAddress = result.address.trim();
      }
    } catch {}

    const displayName = resolvedAddress.length > 0 ? resolvedAddress : `New prospect ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    createProspectMutation.mutate({
      source: 'context-menu',
      payload: {
        name: displayName,
        geometry: { type: 'Point', coordinates: [lng, lat] as [number, number] },
        status: 'prospect',
        notes: '',
      },
    });
  }, [can.edit, createProspectMutation, geocode]);

  // Activity logging UI removed in workspace

  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '') as string;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Map container fills remaining height without causing page scroll */}
      <div className="relative flex-1 min-h-0 w-full overflow-hidden" ref={mapContainerRef}>
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

                  // Calculate acres for polygon/rectangle cases (to match /app)
                  const acres = geometry?.type === 'Polygon' ? calculatePolygonAcres(geometry) : null;

                  // If user was drawing an area for an existing prospect, update that one instead of creating new
                  const target = drawingForProspectRef.current;
                  if (target && geometry.type === 'Polygon') {
                    try {
                      if (isDemoMode) {
                        const patch: Partial<Prospect> = { geometry, acres: acres ? acres.toString() : undefined };
                        // Update caches
                        queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) => Array.isArray(prev) ? prev.map((p) => (p.id === target.id ? { ...p, ...patch } as Prospect : p)) : prev);
                        queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) => Array.isArray(prev) ? prev.map((p) => (p.id === target.id ? { ...p, ...patch } as Prospect : p)) : prev);
                        const all = (queryClient.getQueryData<Prospect[] | undefined>(['/api/prospects']) || []) as Prospect[];
                        persistProspectsGlobal(all);
                        setSelectedProspect((prev) => (prev && prev.id === target.id) ? ({ ...prev, ...patch } as Prospect) : prev);
                      } else {
                        const r = await apiRequest('PATCH', `/api/prospects/${target.id}`, { geometry, acres: acres ? acres.toString() : undefined });
                        const saved = await r.json();
                        setSelectedProspect((prev) => (prev && prev.id === saved.id ? saved : prev));
                        queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) => Array.isArray(prev) ? prev.map((p) => (p.id === saved.id ? saved : p)) : prev);
                        queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) => Array.isArray(prev) ? prev.map((p) => (p.id === saved.id ? saved : p)) : prev);
                      }
                      toast({ title: 'Area saved', description: acres ? `${acres.toFixed(2)} acres` : 'Polygon saved' });
                    } finally {
                      setDrawingForProspect(null);
                      drawingManagerRef.current?.setDrawingMode(null);
                      setDrawMode('select');
                      map?.setOptions({ draggable: true, disableDoubleClickZoom: false });
                    }
                    return;
                  }

                  // Otherwise, create a brand-new prospect and link it
                  const typeLabel = (type || 'prospect');
                  if (isDemoMode) {
                    // Start with empty name so the Address field placeholder shows and editing is smooth
                    const saved = buildLocalProspect({ name: '', status: 'prospect' as ProspectStatusType, notes: '', geometry, acres: acres ? acres.toString() : undefined } as any);
                    // Update caches for both listing and global
                    queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) => Array.isArray(prev) ? [...prev, saved] : [saved]);
                    queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) => Array.isArray(prev) ? [...prev, saved] : [saved]);
                    // Persist globally so the main map sees it in demo mode
                    const all = queryClient.getQueryData<Prospect[] | undefined>(['/api/prospects']) || [];
                    persistProspectsGlobal(all);
                    if (listingId) addProspectToWorkspace(listingId, saved.id);
                    // Bump cached count for demo listings grid
                    queryClient.setQueryData<any[] | undefined>(['/api/listings'], (prev) => {
                      if (!Array.isArray(prev)) return prev;
                      return prev.map((l: any) => (l?.id === listingId) ? { ...l, prospectCount: Math.max(0, (l?.prospectCount ?? 0) + 1) } : l);
                    });
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
                  // Use a non-empty default for server validation; user can edit in the panel
                  const res = await apiRequest('POST', '/api/prospects', { name: `New ${typeLabel}`, status: 'prospect', notes: '', geometry, acres: acres ? acres.toString() : undefined });
                  const saved = await res.json();
                  await apiRequest('POST', `/api/listings/${listingId}/prospects`, { prospectId: saved.id });
                  queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) => Array.isArray(prev) ? [...prev, saved] : [saved]);
                  // Bump cached count for the listings grid and mark it stale
                  queryClient.setQueryData<any[] | undefined>(['/api/listings'], (prev) => {
                    if (!Array.isArray(prev)) return prev;
                    return prev.map((l: any) => (l?.id === listingId) ? { ...l, prospectCount: Math.max(0, (l?.prospectCount ?? 0) + 1) } : l);
                  });
                  queryClient.invalidateQueries({ queryKey: ['/api/listings'], refetchType: 'inactive' });
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
            {/* Linked prospects (filtered by status) */}
            {filteredLinkedProspects.map((p) => {
              if (p.geometry.type !== 'Polygon' && p.geometry.type !== 'Rectangle') {
                return null;
              }
              const color = STATUS_META[p.status as ProspectStatusType]?.color || '#3B82F6';
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
            })}

            {/* Tools + search overlay */}
            <MapControls
              onSearch={(loc) => setSearchPin(loc)}
              prospects={filteredLinkedProspects}
              onProspectClick={(prospect) => {
                let target: { lat: number; lng: number } | null = null;
                if (prospect.geometry.type === 'Point') {
                  const [lng, lat] = prospect.geometry.coordinates as [number, number];
                  target = { lat, lng };
                } else if (prospect.geometry.type === 'Polygon' || prospect.geometry.type === 'Rectangle') {
                  const coords = prospect.geometry.coordinates as [number, number][][] | [number, number][];
                  const ring = Array.isArray(coords[0]) && Array.isArray((coords as any)[0][0])
                    ? (coords as [number, number][][])[0]
                    : (coords as [number, number][]);
                  if (ring.length > 0) {
                    const [lng, lat] = ring[0];
                    target = { lat, lng };
                  }
                }
                if (target && map) {
                  map.panTo(target);
                  map.setZoom(Math.max(map.getZoom() || 15, 15));
                }
                setSelectedProspect(prospect);
                setIsEditPanelOpen(true);
              }}
              bounds={bounds}
              defaultCenter={DEFAULT_CENTER}
              clearSearchSignal={clearSearchSignal}
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
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!searchPin || !can.edit) return;
                      const name = (searchPin.businessName?.trim() || searchPin.address || 'New Prospect').trim() || 'New Prospect';
                      createProspectMutation.mutate({
                        source: 'search',
                        payload: {
                          name,
                          geometry: { type: 'Point', coordinates: [searchPin.lng, searchPin.lat] as [number, number] },
                          status: 'prospect',
                          notes: '',
                          businessName: searchPin.businessName || undefined,
                          websiteUrl: searchPin.websiteUrl || undefined,
                          contactCompany: searchPin.businessName || undefined,
                        },
                      });
                    }}
                    disabled={createProspectMutation.isPending || !can.edit}
                  >
                    {createProspectMutation.isPending ? 'Adding...' : 'Add as Prospect'}
                  </Button>
                </div>
              </div>
            )}
            </GoogleMap>
            {contextMenu && (
              <MapContextMenu
                anchor={{ x: contextMenu.viewportX, y: contextMenu.viewportY }}
                latLng={{ lat: contextMenu.lat, lng: contextMenu.lng }}
                onCopy={() => handleCopyCoordinates(contextMenu.lat, contextMenu.lng)}
                onCreateProspect={() => handleCreateProspectAt(contextMenu.lat, contextMenu.lng)}
                onClose={closeContextMenu}
                canCreate={can.edit && !createProspectMutation.isPending}
              />
            )}
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
      {isEditPanelOpen && selectedProspect && prospectDraft && (
        <div className="absolute top-0 right-0 w-80 max-h-[90vh] flex flex-col bg-white shadow-xl border-l border-gray-200 z-50 overflow-y-auto" style={{ pointerEvents: 'auto' }}>
          <div className="sticky top-0 z-10 bg-white border-b px-4 pt-3 pb-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">Edit Prospect</h2>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => void closeEditPanel()}
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
                  <Input
                    value={localAddress}
                    onChange={(e) => handleAddressChange(e.target.value)}
                    onBlur={handleAddressBlur}
                    placeholder="Property address"
                    className="h-8 text-sm"
                  />
                </div>
                {/* Business information (shown when available) */}
                {(prospectDraft.businessName || prospectDraft.websiteUrl) && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-medium text-gray-700">Business Name</Label>
                      <Input
                        value={prospectDraft.businessName || ''}
                        onChange={(e) => updateSelectedProspect('businessName', e.target.value || undefined)}
                        placeholder="Business name"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-gray-700">Website</Label>
                      <Input
                        type="url"
                        value={prospectDraft.websiteUrl || ''}
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
                    <Select value={prospectDraft.status} onValueChange={(v) => updateSelectedProspect('status', v)}>
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
                    <Select value={(prospectDraft as any).followUpTimeframe || 'none'} onValueChange={(v) => {
                      const tf = (v === 'none' ? undefined : (v as FollowUpTimeframeType));
                      updateSelectedProspect('followUpTimeframe' as any, tf);
                      const anchor = prospectDraft.lastContactDate || (prospectDraft as any).createdDate;
                      const due = tf ? computeFollowUpDue(anchor, tf) : undefined;
                      updateSelectedProspect('followUpDueDate', due);
                    }}>
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
                    <Select value={prospectDraft.size || ''} onValueChange={(v) => updateSelectedProspect('size', v === 'none' ? '' : v)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select size" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {['< 5,000 SF','5,000 - 10,000 SF','10,000 - 25,000 SF','25,000 - 50,000 SF','50,000 - 100,000 SF','100,000+ SF'].map((x) => (<SelectItem key={x} value={x}>{x}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Acres</Label>
                    <Input value={prospectDraft.acres || ''} placeholder="Auto-calculated" className="h-8 text-sm bg-gray-50" disabled />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-700">Submarket</Label>
                  {submarketOptions.length === 0 ? (
                    <Select disabled><SelectTrigger className="h-8 text-sm"><SelectValue placeholder="No submarkets" /></SelectTrigger></Select>
                  ) : (
                    <Select value={(prospectDraft as any).submarketId || ''} onValueChange={(v) => updateSelectedProspect('submarketId' as any, v === 'none' ? undefined : v)}>
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
                  <Textarea
                    value={localNotes}
                    onChange={(e) => handleNotesChange(e.target.value)}
                    onBlur={handleNotesBlur}
                    rows={3}
                    className="resize-none text-sm"
                  />
                </div>
              </TabsContent>
              <TabsContent value="contact" className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Contact Name</Label>
                    <Input
                      value={localContactName}
                      onChange={(e) => handleContactNameChange(e.target.value)}
                      onBlur={handleContactNameBlur}
                      placeholder="Contact name"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Company</Label>
                    <Input
                      value={localContactCompany}
                      onChange={(e) => handleContactCompanyChange(e.target.value)}
                      onBlur={handleContactCompanyBlur}
                      placeholder="Company"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Email</Label>
                    <Input
                      type="email"
                      value={localContactEmail}
                      onChange={(e) => handleContactEmailChange(e.target.value)}
                      onBlur={handleContactEmailBlur}
                      placeholder="name@company.com"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Phone</Label>
                    <PhoneInput
                      value={localContactPhone}
                      onChange={(e) => handleContactPhoneChange(e.target.value)}
                      onBlur={handleContactPhoneBlur}
                      placeholder="(000) 000-0000"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
            <div className="flex items-center gap-2 pt-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => void closeEditPanel()}
                    variant="outline"
                    className="h-8 w-8 p-0 text-xs"
                    aria-label="Save and close"
                  >
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save and close</TooltipContent>
              </Tooltip>
              {selectedProspect.geometry.type === 'Polygon' || selectedProspect.geometry.type === 'Rectangle' ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      onClick={() => {
                        if (!can.edit) return;
                        if (editingProspectId === selectedProspect.id) {
                          void savePolygonChanges();
                        } else {
                          enablePolygonEditing(selectedProspect.id);
                        }
                      }} 
                      variant="outline" 
                      className="h-8 w-8 p-0"
                      disabled={!can.edit}
                      aria-label={editingProspectId === selectedProspect.id ? 'Finish editing' : 'Edit shape'}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{editingProspectId === selectedProspect.id ? 'Finish editing' : 'Edit shape'}</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => {
                        if (!can.edit || !selectedProspect) return;
                        // Mark this prospect as the target for the next drawn polygon
                        setDrawingForProspect(selectedProspect);
                        try {
                          drawingManagerRef.current?.setDrawingMode(window.google.maps.drawing.OverlayType.POLYGON);
                          setDrawMode('polygon');
                          map?.setOptions({ draggable: false, disableDoubleClickZoom: true });
                        } catch {}
                      }}
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
              <Button onClick={() => setDeleteDialogOpen(true)} variant="destructive" className="h-8 px-3 text-xs ml-auto" disabled={!can.edit} aria-label="Delete prospect"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </div>
      )}
      <ShareWorkspaceDialog listingId={listingId} open={shareOpen} onOpenChange={setShareOpen} canManage={can.share} />
      <Modal open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Delete Prospect</ModalTitle>
            <ModalDescription>
              Are you sure you want to delete this prospect? This action cannot be undone.
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <ModalClose asChild>
              <Button variant="outline">Cancel</Button>
            </ModalClose>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={() => { setDeleteDialogOpen(false); void deleteSelectedProspect(); }}
            >
              Delete
            </Button>
          </ModalFooter>
          <ModalClose asChild>
            <button
              type="button"
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="Close"
            >
              <span aria-hidden className="inline-block h-4 w-4">✕</span>
            </button>
          </ModalClose>
        </ModalContent>
      </Modal>
    </div>
  );
}
