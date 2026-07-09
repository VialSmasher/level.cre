import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GoogleMap, Polygon, useJsApiLoader } from '@react-google-maps/api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { MapControls } from '@/features/map/MapControls';
import { createCustomAssetMarker } from '@/features/map/createCustomAssetMarker';
import { apiRequest } from '@/lib/queryClient';
import type { Prospect, ProspectGeometryType } from '@level-cre/shared/schema';
import { useProfile } from '@/hooks/useProfile';
import { uniqueSubmarketNames } from '@/lib/submarkets';
import { ArrowLeft, Briefcase, Share2 } from 'lucide-react';
import { Modal, ModalContent, ModalHeader, ModalFooter, ModalTitle, ModalDescription, ModalClose } from '@/components/primitives/Modal';
// TerraDraw handles new map asset creation; saved assets continue to render as Google map overlays.
import { ShareWorkspaceDialog } from '@/components/ShareWorkspaceDialog';
import { useAuth } from '@/contexts/AuthContext';
import { STATUS_META, type ProspectStatusType } from '@level-cre/shared/schema';
import { StatusLegend } from '@/features/map/StatusLegend';
import { MapContextMenu } from '@/features/map/MapContextMenu';
import { useTerraDrawGoogleMaps, type TerraDrawFinishPayload } from '@/features/map/useTerraDrawGoogleMaps';
import { useGeocode } from '@/hooks/useGeocode';
import { GOOGLE_MAPS_API_KEY_HELP_TEXT, getGoogleMapsApiKey, getGoogleMapsMapId } from '@/lib/googleMapsApiKey';
import { nsKey, readJSON, removeKey, writeJSON } from '@/lib/storage';
import { clearAdvancedMarker, type AdvancedAssetMarker } from '@/features/map/advancedMarkers';
import { searchLocationToProspectDetails, type MapSearchLocation } from '@/features/map/searchTypes';
import { createAllStatusFilterSet, createStatusFilterSet, getStatusCounts } from '@/features/map/statusFilters';
import { ProspectEditPanel, formatSfWithCommas, getDisplayAddressValue } from '@/features/map/ProspectEditPanel';
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

const libraries: any = ['geometry', 'places', 'marker'];
const FIELD_BUFFER_DELAY = 600;
const GOOGLE_MAPS_API_KEY = getGoogleMapsApiKey();
const GOOGLE_MAPS_MAP_ID = getGoogleMapsMapId();

type CreateProspectVariables = {
  payload: {
    name: string;
    geometry: ProspectGeometryType;
    status?: ProspectStatusType;
    notes?: string;
    businessName?: string;
    websiteUrl?: string;
    contactCompany?: string;
    contactPhone?: string;
    aiMetadata?: Record<string, unknown>;
    lotSizeAcres?: number;
  };
  source?: 'search' | 'context-menu';
};

type ContextMenuState = {
  lat: number;
  lng: number;
  viewportX: number;
  viewportY: number;
};

type WorkspaceMember = { userId: string; role: 'owner'|'editor'|'viewer'; email?: string|null };
type SearchPin = MapSearchLocation;

const EMPTY_PROSPECTS: Prospect[] = [];
const EMPTY_MEMBERS: WorkspaceMember[] = [];
const DEMO_MAP_RESET_VERSION = '2026-06-terradraw-clean-map-v1';
const DEMO_MAP_RESET_KEY = 'levelcre:demoMapResetVersion';

const clearLegacyDemoMapData = () => {
  if (typeof window === 'undefined') return false;
  try {
    const demoRequested = localStorage.getItem('demo-mode') === 'true';
    if (!demoRequested) return false;
    if (readJSON<string | null>(DEMO_MAP_RESET_KEY, null) === DEMO_MAP_RESET_VERSION) return false;
    removeKey(nsKey('demo-user', 'mapData'));
    removeKey(nsKey(null, 'mapData'));
    writeJSON(DEMO_MAP_RESET_KEY, DEMO_MAP_RESET_VERSION);
    return true;
  } catch {
    return false;
  }
};

export default function Workspace() {
  const [, params] = useRoute('/app/workspaces/:id');
  const listingId = params?.id as string;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isDemoMode } = useAuth();
  const [clearedLegacyDemoMapData] = useState(() => clearLegacyDemoMapData());

  const { data: listing } = useQuery<Listing>({ queryKey: ['/api/listings', listingId], enabled: !!listingId });
  const {
    data: linkedProspects = EMPTY_PROSPECTS,
    refetch: refetchLinked,
    error: linkedProspectsError,
    isLoading: isLinkedProspectsLoading,
  } = useQuery<Prospect[]>({ queryKey: ['/api/listings', listingId, 'prospects'], enabled: !!listingId });
  const { data: allProspects = EMPTY_PROSPECTS } = useQuery<Prospect[]>({ queryKey: ['/api/prospects'] });
  const { data: members = EMPTY_MEMBERS } = useQuery<WorkspaceMember[]>({ queryKey: ['/api/listings', listingId, 'members'], enabled: !!listingId });
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

  useEffect(() => {
    if (clearedLegacyDemoMapData || clearLegacyDemoMapData()) {
      queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], []);
      if (listingId) {
        queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], []);
      }
    }
  }, [clearedLegacyDemoMapData, isDemoMode, listingId, queryClient]);

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
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries,
    mapIds: [GOOGLE_MAPS_MAP_ID],
  });

  const linkedProspectsErrorMessage = linkedProspectsError instanceof Error
    ? linkedProspectsError.message
    : null;

  // Drawing state
  type DrawMode = 'select' | 'point' | 'polygon' | 'rectangle';
  const [drawMode, setDrawMode] = useState<DrawMode>('select');

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
  const customAssetMarkersRef = useRef<AdvancedAssetMarker[]>([]);
  const subjectMarkerRef = useRef<AdvancedAssetMarker | null>(null);
  const searchMarkerRef = useRef<AdvancedAssetMarker | null>(null);

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

  const [searchPin, setSearchPin] = useState<SearchPin | null>(null);
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
  const [localBuildingSf, setLocalBuildingSf] = useState('');
  const [localLotSizeAcres, setLocalLotSizeAcres] = useState('');
  const manualLotOverrideRef = useRef<Set<string>>(new Set());
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
    buildingSf: data.buildingSf,
    lotSizeAcres: data.lotSizeAcres,
    aiMetadata: data.aiMetadata,
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
    return createAllStatusFilterSet();
  });
  const workspaceStatusFilterStorageKey = listingId ? `workspaceStatusFilters:${listingId}` : null;
  const skipNextWorkspaceStatusPersistRef = useRef(false);
  const filteredLinkedProspects = useMemo(() => {
    return linkedProspects.filter((p) => statusFilters.has(p.status as StatusKey));
  }, [linkedProspects, statusFilters]);
  const statusCounts = useMemo(() => getStatusCounts(linkedProspects), [linkedProspects]);

  useEffect(() => {
    if (!map) return;

    customAssetMarkersRef.current.forEach(clearAdvancedMarker);
    customAssetMarkersRef.current = [];

    let disposed = false;
    const nextMarkers: AdvancedAssetMarker[] = [];

    void (async () => {
      for (const p of filteredLinkedProspects) {
        if (disposed || p.geometry.type !== 'Point') continue;
        const [lng, lat] = p.geometry.coordinates as [number, number];
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        try {
          const color = STATUS_META[p.status as ProspectStatusType]?.color || '#3B82F6';
          const marker = await createCustomAssetMarker(map, {
            lat,
            lng,
            title: p.name || 'Custom Asset',
            color,
            scale: 8,
          });
          if (disposed) {
            clearAdvancedMarker(marker);
          } else {
            nextMarkers.push(marker);
          }
        } catch (err) {
          if (!disposed) {
            console.error('Failed to create custom asset marker', err);
          }
        }
      }

      if (!disposed) {
        customAssetMarkersRef.current = nextMarkers;
      }
    })();

    return () => {
      disposed = true;
      nextMarkers.forEach(clearAdvancedMarker);
      if (customAssetMarkersRef.current === nextMarkers) {
        customAssetMarkersRef.current = [];
      }
    };
  }, [map, filteredLinkedProspects]);

  useEffect(() => {
    if (!map) {
      if (subjectMarkerRef.current) {
        clearAdvancedMarker(subjectMarkerRef.current);
        subjectMarkerRef.current = null;
      }
      return;
    }

    clearAdvancedMarker(subjectMarkerRef.current);
    subjectMarkerRef.current = null;

    if (!subjectPosition) return;

    let disposed = false;
    let nextMarker: AdvancedAssetMarker | null = null;

    void (async () => {
      try {
        nextMarker = await createCustomAssetMarker(map, {
          lat: subjectPosition.lat,
          lng: subjectPosition.lng,
          title: listing?.title || 'Subject Property',
          color: '#ef4444',
          scale: 10,
        });
        if (disposed) {
          clearAdvancedMarker(nextMarker);
        } else {
          subjectMarkerRef.current = nextMarker;
        }
      } catch (err) {
        if (!disposed) {
          console.error('Failed to create subject marker', err);
        }
      }
    })();

    return () => {
      disposed = true;
      clearAdvancedMarker(nextMarker);
      if (subjectMarkerRef.current === nextMarker) {
        subjectMarkerRef.current = null;
      }
    };
  }, [map, subjectPosition, listing?.title]);

  useEffect(() => {
    if (!map) {
      if (searchMarkerRef.current) {
        clearAdvancedMarker(searchMarkerRef.current);
        searchMarkerRef.current = null;
      }
      return;
    }

    clearAdvancedMarker(searchMarkerRef.current);
    searchMarkerRef.current = null;

    if (!searchPin) return;

    let disposed = false;
    let nextMarker: AdvancedAssetMarker | null = null;

    void (async () => {
      try {
        nextMarker = await createCustomAssetMarker(map, {
          lat: searchPin.lat,
          lng: searchPin.lng,
          title: searchPin.businessName || searchPin.address || 'Search Pin',
          color: '#7C3AED',
          scale: 8,
        });
        if (disposed) {
          clearAdvancedMarker(nextMarker);
        } else {
          searchMarkerRef.current = nextMarker;
        }
      } catch (err) {
        if (!disposed) {
          console.error('Failed to create search marker', err);
        }
      }
    })();

    return () => {
      disposed = true;
      clearAdvancedMarker(nextMarker);
      if (searchMarkerRef.current === nextMarker) {
        searchMarkerRef.current = null;
      }
    };
  }, [map, searchPin]);

  // Persist status filters per workspace id
  useEffect(() => {
    if (!workspaceStatusFilterStorageKey) return;
    try {
      skipNextWorkspaceStatusPersistRef.current = true;
      const raw = localStorage.getItem(workspaceStatusFilterStorageKey);
      setStatusFilters(raw ? createStatusFilterSet(JSON.parse(raw)) : createAllStatusFilterSet());
    } catch {}
  }, [workspaceStatusFilterStorageKey]);
  useEffect(() => {
    if (!workspaceStatusFilterStorageKey) return;
    if (skipNextWorkspaceStatusPersistRef.current) {
      skipNextWorkspaceStatusPersistRef.current = false;
      return;
    }

    try { localStorage.setItem(workspaceStatusFilterStorageKey, JSON.stringify(Array.from(statusFilters))); } catch {}
  }, [statusFilters, workspaceStatusFilterStorageKey]);

  // Reuse profile submarkets for dropdowns (normalized + de-duped)
  const { profile } = useProfile();
  const submarketOptions = uniqueSubmarketNames(profile?.submarkets || []);

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
        const areaInSquareFeet = areaInSquareMeters * 10.764;
        const acres = areaInSquareFeet / 43560;
        return Math.round((acres + Number.EPSILON) * 100) / 100;
      }
      let area = 0; for (let i = 0; i < path.length; i++) { const j = (i + 1) % path.length; area += path[i].lng * path[j].lat; area -= path[j].lng * path[i].lat; }
      area = Math.abs(area) / 2;
      const metersPerDegree = 111320;
      const areaInSquareMeters = area * metersPerDegree * metersPerDegree;
      const acres = (areaInSquareMeters * 10.764) / 43560;
      return Math.round((acres + Number.EPSILON) * 100) / 100;
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
    try { setDrawMode('select'); } catch {}
    try { map?.setOptions({ draggable: true, disableDoubleClickZoom: false, clickableIcons: false }); } catch {}
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
      setLocalBuildingSf('');
      setLocalLotSizeAcres('');
      return;
    }
    setLocalAddress(getDisplayAddressValue(prospectDraft.name));
    setLocalNotes(prospectDraft.notes || '');
    setLocalContactName(prospectDraft.contactName || '');
    setLocalContactCompany(prospectDraft.contactCompany || '');
    setLocalContactEmail(prospectDraft.contactEmail || '');
    setLocalContactPhone(prospectDraft.contactPhone || '');
    setLocalBuildingSf(formatSfWithCommas(prospectDraft.buildingSf));
    setLocalLotSizeAcres(
      prospectDraft.lotSizeAcres === null || prospectDraft.lotSizeAcres === undefined
        ? ''
        : prospectDraft.lotSizeAcres.toFixed(2)
    );
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
            manualLotOverrideRef.current.delete(prospectId);
            if (isDemoMode) {
              // Local update in demo mode
              const patch: Partial<Prospect> = { geometry: newGeom, lotSizeAcres: acres };
              queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) => Array.isArray(prev) ? prev.map((p) => (p.id === prospectId ? { ...p, ...patch } as Prospect : p)) : prev);
              queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) => Array.isArray(prev) ? prev.map((p) => (p.id === prospectId ? { ...p, ...patch } as Prospect : p)) : prev);
              const all = (queryClient.getQueryData<Prospect[] | undefined>(['/api/prospects']) || []) as Prospect[];
              persistProspectsGlobal(all);
              setSelectedProspect(prev => (prev && prev.id === prospectId) ? ({ ...prev, ...patch } as Prospect) : prev);
            } else {
              const r = await apiRequest('PATCH', `/api/prospects/${prospectId}`, { geometry: newGeom, lotSizeAcres: acres });
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
    mutationFn: async ({ payload, source }) => {
      const normalized = {
        ...payload,
        status: (payload.status ?? 'prospect') as ProspectStatusType,
        notes: payload.notes ?? '',
      };

      if (isDemoMode) {
        return buildLocalProspect(normalized as any);
      }

      const { businessName, websiteUrl, contactCompany, contactPhone, aiMetadata, ...initialPayload } = normalized;
      const enrichmentPatch = { businessName, websiteUrl, contactCompany, contactPhone, aiMetadata };
      const hasEnrichmentPatch = source === 'search' && Object.values(enrichmentPatch).some((value) => value !== undefined);

      const res = await apiRequest('POST', '/api/prospects', source === 'search' ? initialPayload : normalized);
      let created = await res.json();
      if (listingId) {
        await apiRequest('POST', `/api/listings/${listingId}/prospects`, { prospectId: created.id });
      }
      if (hasEnrichmentPatch) {
        try {
          const patchRes = await apiRequest('PATCH', `/api/prospects/${created.id}`, enrichmentPatch);
          created = await patchRes.json();
        } catch (enrichmentError) {
          console.warn('Prospect created, but Google Places enrichment could not be applied', enrichmentError);
        }
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

  const handleTerraDrawFinish = useCallback(async ({ geometry, mode }: TerraDrawFinishPayload) => {
    if (!can.edit) return;

    const acres = geometry.type === 'Polygon' ? calculatePolygonAcres(geometry) : null;
    const target = drawingForProspectRef.current;

    if (target && geometry.type === 'Polygon') {
      try {
        manualLotOverrideRef.current.delete(target.id);

        if (isDemoMode) {
          const patch: Partial<Prospect> = { geometry, lotSizeAcres: acres ?? undefined };
          queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) =>
            Array.isArray(prev) ? prev.map((p) => (p.id === target.id ? { ...p, ...patch } as Prospect : p)) : prev
          );
          queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) =>
            Array.isArray(prev) ? prev.map((p) => (p.id === target.id ? { ...p, ...patch } as Prospect : p)) : prev
          );
          const all = (queryClient.getQueryData<Prospect[] | undefined>(['/api/prospects']) || []) as Prospect[];
          persistProspectsGlobal(all);
          setSelectedProspect((prev) => (prev && prev.id === target.id ? ({ ...prev, ...patch } as Prospect) : prev));
        } else {
          const response = await apiRequest('PATCH', `/api/prospects/${target.id}`, {
            geometry,
            lotSizeAcres: acres ?? undefined,
          });
          const saved = await response.json();
          setSelectedProspect((prev) => (prev && prev.id === saved.id ? saved : prev));
          queryClient.setQueryData<Prospect[] | undefined>(['/api/listings', listingId, 'prospects'], (prev) =>
            Array.isArray(prev) ? prev.map((p) => (p.id === saved.id ? saved : p)) : prev
          );
          queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) =>
            Array.isArray(prev) ? prev.map((p) => (p.id === saved.id ? saved : p)) : prev
          );
        }

        toast({ title: 'Area saved', description: acres ? `${acres.toFixed(2)} acres` : 'Polygon saved' });
      } finally {
        setDrawingForProspect(null);
        setIsEditPanelOpen(true);
        setDrawMode('select');
        map?.setOptions({ draggable: true, disableDoubleClickZoom: false, clickableIcons: false });
      }
      return;
    }

    await createProspectMutation.mutateAsync({
      payload: {
        name: mode === 'point' ? 'Dropped pin' : 'Mapped area',
        status: 'prospect',
        notes: '',
        geometry,
        lotSizeAcres: acres ?? undefined,
      },
    });
  }, [
    calculatePolygonAcres,
    can.edit,
    createProspectMutation,
    isDemoMode,
    listingId,
    map,
    persistProspectsGlobal,
    queryClient,
    toast,
  ]);

  const notifyTerraDrawUnavailable = useCallback(() => {
    toast({
      title: 'Drawing tools are still loading',
      description: 'Wait for the map to finish loading, then choose a drawing tool again.',
      variant: 'destructive',
    });
  }, [toast]);

  const handleTerraDrawError = useCallback((error: unknown) => {
    console.error('TerraDraw error:', error);
    toast({
      title: 'Drawing tool failed',
      description: 'The map stayed open, but the drawing action did not complete. Try the tool again.',
      variant: 'destructive',
    });
  }, [toast]);

  const {
    mode: terraDrawMode,
    setMode: setTerraDrawMode,
  } = useTerraDrawGoogleMaps({
    map,
    enabled: isLoaded && !!GOOGLE_MAPS_API_KEY,
    onFinish: handleTerraDrawFinish,
    onUnavailable: notifyTerraDrawUnavailable,
    onError: handleTerraDrawError,
  });

  const activateTerraDrawMode = useCallback((mode: DrawMode) => {
    if (mode !== 'select' && !can.edit) return;
    const activated = setTerraDrawMode(mode);
    setDrawMode(activated ? mode : 'select');
  }, [can.edit, setTerraDrawMode]);

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

  const apiKey = GOOGLE_MAPS_API_KEY;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Map container fills remaining height without causing page scroll */}
      <div className="relative flex-1 min-h-0 w-full overflow-hidden" ref={mapContainerRef}>
        {!apiKey && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
            <div className="max-w-lg space-y-2">
              <div className="text-base font-medium text-gray-700">Missing Google Maps API key</div>
              <div className="text-sm text-gray-500">{GOOGLE_MAPS_API_KEY_HELP_TEXT}</div>
            </div>
          </div>
        )}
        {!isLoaded && apiKey && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            Loading map...
          </div>
        )}
        {isLoaded && apiKey && (
          <div className="absolute inset-0 z-0">
            {(isLinkedProspectsLoading || linkedProspectsErrorMessage) && (
              <div className="absolute left-4 top-28 z-[1001] max-w-md rounded-md border bg-white/95 px-3 py-2 text-sm shadow-lg backdrop-blur-sm md:top-16">
                <div className="font-medium text-gray-900">
                  {linkedProspectsErrorMessage ? 'Workspace asset load failed' : 'Loading workspace assets'}
                </div>
                <div className={linkedProspectsErrorMessage ? 'text-red-600' : 'text-gray-600'}>
                  {linkedProspectsErrorMessage || 'Fetching linked prospects for this workspace.'}
                </div>
              </div>
            )}
            {/* Floating workspace actions (top-right) */}
            <div
              className={`absolute right-3 top-[7.25rem] z-[65] flex max-w-[calc(100vw-1.5rem)] items-center gap-1 rounded-lg border border-slate-200 bg-white/95 p-1.5 shadow-lg backdrop-blur-sm sm:top-4 ${isEditPanelOpen ? 'md:right-[22rem]' : 'md:right-4'}`}
            >
              <div className="flex min-w-0 items-center gap-2 px-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <Briefcase className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="hidden text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:block">Workspace</p>
                  <p className="max-w-[150px] truncate text-sm font-semibold text-slate-950 sm:max-w-[220px]" title={listing?.title || listing?.address || 'Workspace'}>
                    {listing?.title || listing?.address || 'Workspace'}
                  </p>
                </div>
              </div>
              <div className="h-7 w-px bg-slate-200" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/app/workspaces')}
                className="h-9 w-9 rounded-xl p-0 text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                aria-label="Back to workspaces"
                title="Back to workspaces"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShareOpen(true)}
                className="h-9 w-9 rounded-xl p-0 text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                aria-label="Share workspace"
                title="Share workspace"
              >
                <Share2 className="h-4 w-4" />
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
                clickableIcons: false,
                mapTypeId: mapType,
                mapId: GOOGLE_MAPS_MAP_ID,
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
            {/* Linked prospects (filtered by status) */}
            {filteredLinkedProspects.map((p) => {
              if (p.geometry.type !== 'Polygon' && p.geometry.type !== 'Rectangle') {
                return null;
              }
              const overlaysInteractive = drawMode === 'select';
              const color = STATUS_META[p.status as ProspectStatusType]?.color || '#3B82F6';
              const coords = p.geometry.coordinates as [number, number][][] | [number, number][];
              const ring = Array.isArray(coords[0]) && Array.isArray((coords as any)[0][0])
                ? (coords as [number, number][][])[0]
                : (coords as [number, number][]);
              return (
                <Polygon
                  key={p.id}
                  paths={ring.map(([lng, lat]) => ({ lat, lng }))}
                  onClick={overlaysInteractive ? () => { setSelectedProspect(p); setIsEditPanelOpen(true); } : undefined}
                  onLoad={(poly) => { polygonRefs.current.set(p.id, poly); }}
                  options={{
                    fillColor: color,
                    fillOpacity: 0.15,
                    strokeColor: color,
                    strokeOpacity: 0.8,
                    strokeWeight: 2,
                    clickable: overlaysInteractive,
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
              onPolygon={() => activateTerraDrawMode('polygon')}
              onRectangle={() => activateTerraDrawMode('rectangle')}
              onPin={() => activateTerraDrawMode('point')}
              onSelect={() => activateTerraDrawMode('select')}
              onPan={() => activateTerraDrawMode('select')}
              onMyLocation={() => {
                if (!map || !navigator.geolocation) return;
                navigator.geolocation.getCurrentPosition((pos) => {
                  const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                  map.setCenter(c); map.setZoom(15);
                });
              }}
              mapType={mapType}
              onMapTypeChange={(t) => { setMapType(t); try { map?.setMapTypeId(t); } catch {} }}
              activeTerraMode={terraDrawMode}
            />

            {/* Confirm search selection */}
            {searchPin && (
              <div className="absolute left-3 right-3 top-[10.5rem] z-[60] sm:left-4 sm:right-auto sm:top-[76px]">
                <div className="bg-white p-2 rounded shadow border">
                  <div className="text-sm font-medium">{searchPin.businessName || searchPin.address}</div>
                  {searchPin.businessName && (
                    <div className="mb-2 text-xs text-slate-600">{searchPin.address}</div>
                  )}
                  {(searchPin.contactPhone || searchPin.websiteUrl) && (
                    <div className="mb-2 space-y-0.5 text-xs text-slate-600">
                      {searchPin.contactPhone && <div>{searchPin.contactPhone}</div>}
                      {searchPin.websiteUrl && <div className="max-w-xs truncate">{searchPin.websiteUrl}</div>}
                    </div>
                  )}
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!searchPin || !can.edit) return;
                      const prospectDetails = searchLocationToProspectDetails(searchPin);
                      const name = (searchPin.address || searchPin.businessName?.trim() || 'New Prospect').trim() || 'New Prospect';
                      createProspectMutation.mutate({
                        source: 'search',
                        payload: {
                          name,
                          geometry: { type: 'Point', coordinates: [searchPin.lng, searchPin.lat] as [number, number] },
                          status: 'prospect',
                          notes: '',
                          ...prospectDetails,
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
      <div className="absolute bottom-3 left-3 z-40 sm:bottom-4 sm:left-4" style={{ pointerEvents: 'auto' }}>
        <StatusLegend
          selected={statusFilters}
          counts={statusCounts}
          onChange={setStatusFilters}
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
        <ProspectEditPanel
          prospect={prospectDraft}
          values={{
            address: localAddress,
            businessName: prospectDraft.businessName || '',
            websiteUrl: prospectDraft.websiteUrl || '',
            buildingSf: localBuildingSf,
            lotSizeAcres: localLotSizeAcres,
            submarketId: prospectDraft.submarketId || '',
            notes: localNotes,
            contactName: localContactName,
            contactCompany: localContactCompany,
            contactEmail: localContactEmail,
            contactPhone: localContactPhone,
          }}
          submarketOptions={submarketOptions}
          isEditingShape={editingProspectId === selectedProspect.id}
          canEditShape={can.edit}
          showSaveAction
          deleteDisabled={!can.edit}
          onClose={() => void closeEditPanel()}
          onSaveAction={() => void closeEditPanel()}
          onDelete={() => setDeleteDialogOpen(true)}
          onEditShape={() => {
            if (!can.edit) return;
            if (editingProspectId === selectedProspect.id) {
              void savePolygonChanges();
            } else {
              enablePolygonEditing(selectedProspect.id);
            }
          }}
          onDrawArea={() => {
            if (!can.edit || !selectedProspect) return;
            setDrawingForProspect(selectedProspect);
            activateTerraDrawMode('polygon');
          }}
          onAddressChange={handleAddressChange}
          onAddressBlur={handleAddressBlur}
          onBusinessNameChange={(value) => updateSelectedProspect('businessName', value || null)}
          onWebsiteUrlChange={(value) => updateSelectedProspect('websiteUrl', value || null)}
          onStatusChange={(value) => updateSelectedProspect('status', value)}
          onFollowUpChange={(timeframe, dueDate) => {
            updateSelectedProspect('followUpTimeframe', timeframe);
            updateSelectedProspect('followUpDueDate', dueDate);
          }}
          onBuildingSfChange={(displayValue, parsedValue) => {
            if (!prospectDraft.id) return;
            setLocalBuildingSf(displayValue);
            updateSelectedProspect('buildingSf', parsedValue);
          }}
          onLotSizeAcresChange={(displayValue, parsedValue) => {
            if (!prospectDraft.id) return;
            setLocalLotSizeAcres(displayValue);
            manualLotOverrideRef.current.add(prospectDraft.id);
            updateSelectedProspect('lotSizeAcres', parsedValue);
          }}
          onSubmarketChange={(value) => updateSelectedProspect('submarketId', value)}
          onNotesChange={handleNotesChange}
          onNotesBlur={handleNotesBlur}
          onContactNameChange={handleContactNameChange}
          onContactNameBlur={handleContactNameBlur}
          onContactCompanyChange={handleContactCompanyChange}
          onContactCompanyBlur={handleContactCompanyBlur}
          onContactEmailChange={handleContactEmailChange}
          onContactEmailBlur={handleContactEmailBlur}
          onContactPhoneChange={handleContactPhoneChange}
          onContactPhoneBlur={handleContactPhoneBlur}
        />
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
              <span aria-hidden className="inline-block h-4 w-4">x</span>
            </button>
          </ModalClose>
        </ModalContent>
      </Modal>
    </div>
  );
}
