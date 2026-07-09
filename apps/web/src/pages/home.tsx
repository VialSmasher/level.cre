import { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react';
import { GoogleMap, useJsApiLoader, Polygon, InfoWindow } from '@react-google-maps/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, MapIcon, MapPin, Satellite, ChevronLeft, ChevronRight, X, Trash2, Filter, User, LogOut, Settings, Edit3, Phone, Handshake } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MapControls } from '@/features/map/MapControls';
import { MapContextMenu } from '@/features/map/MapContextMenu';

const SPEED_TAG_SF_VALUES = [5000, 10000, 25000, 50000, 100000] as const;
import { SearchComponent } from '@/components/SearchComponent';
import { CSVUploader } from '@/components/CSVUploader';
import { DeveloperSettings } from '@/components/DeveloperSettings';
import { GamificationToast } from '@/components/GamificationToast';
import { useToast } from '@/hooks/use-toast';
import { useGeocode } from '@/hooks/useGeocode';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { uniqueSubmarketNames } from '@/lib/submarkets';
import { nsKey, readJSON, removeKey, writeJSON } from '@/lib/storage';
import { getGoogleMapsApiKey, getGoogleMapsMapId } from '@/lib/googleMapsApiKey';
import { getProspectDisplayName } from '@/lib/prospectDisplay';
import { quickLogSpecFor, type QuickLogType } from '@/lib/gamificationUi';
import { logBrokerActivity } from '@/lib/brokerActions';
import { VoiceDictationButton } from '@/components/VoiceDictationButton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { STATUS_META } from '@level-cre/shared/schema';
import { StatusLegend } from '@/features/map/StatusLegend';
import { useTerraDrawGoogleMaps, type MapDrawMode, type TerraDrawFinishPayload } from '@/features/map/useTerraDrawGoogleMaps';
import { AdvancedMapMarker } from '@/features/map/AdvancedMapMarker';
import { searchLocationToProspectDetails, type MapSearchLocation } from '@/features/map/searchTypes';
import { createStatusFilterSet, getStatusCounts } from '@/features/map/statusFilters';

// Import all necessary types and data
import type { 
  Prospect, 
  ProspectStatusType, 
  FollowUpTimeframeType,
  Submarket,
  Touch 
} from '@level-cre/shared/schema';

const libraries: any = ['geometry', 'places', 'marker'];
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' } as const;
const GOOGLE_MAPS_API_KEY = getGoogleMapsApiKey();
const GOOGLE_MAPS_MAP_ID = getGoogleMapsMapId();
const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  mapTypeControl: false,
  scaleControl: true,
  streetViewControl: false,
  rotateControl: false,
  fullscreenControl: true,
  gestureHandling: 'greedy',
  clickableIcons: false,
  mapId: GOOGLE_MAPS_MAP_ID,
};
const DEFAULT_CENTER = { lat: 53.5461, lng: -113.4938 }; // Edmonton
const DEFAULT_ZOOM = 11;
const EMPTY_PROSPECTS: Prospect[] = [];
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

type ContextMenuState = {
  lat: number;
  lng: number;
  viewportX: number;
  viewportY: number;
};

// Colors and labels now come from shared STATUS_META

const FOLLOW_UP_LABELS: Record<FollowUpTimeframeType, string> = {
  '1_month': '1 Month',
  '3_month': '3 Months',
  '6_month': '6 Months',
  '1_year': '1 Year'
};

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
const addDaysIsoFromNow = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

interface MapData {
  prospects: Prospect[];
  submarkets: Submarket[];
  touches: Touch[];
}

type RenderableProspectEntry =
  | { id: string; prospect: Prospect; color: string; kind: 'point'; position: { lat: number; lng: number } }
  | { id: string; prospect: Prospect; color: string; kind: 'polygon'; paths: Array<{ lat: number; lng: number }> };

type SearchPin = MapSearchLocation & { id: 'temp-search' };

const MapOverlayLayer = memo(function MapOverlayLayer({
  renderableProspects,
  terraMode,
  editingProspectId,
  onProspectClick,
  polygonRefs,
}: {
  renderableProspects: RenderableProspectEntry[];
  terraMode: string;
  editingProspectId: string | null;
  onProspectClick: (prospect: Prospect) => void;
  polygonRefs: { current: Map<string, google.maps.Polygon> };
}) {
  const savedOverlaysInteractive = terraMode === 'select';

  return (
    <>
      {renderableProspects.map((entry) => {
        if (entry.kind === 'point') {
          return (
            <AdvancedMapMarker
              key={entry.id}
              position={entry.position}
              title={getProspectDisplayName(entry.prospect)}
              color={entry.color}
              scale={8}
              onClick={savedOverlaysInteractive ? () => onProspectClick(entry.prospect) : undefined}
            />
          );
        }
        return (
          <Polygon
            key={entry.id}
            paths={entry.paths}
            onClick={savedOverlaysInteractive ? () => onProspectClick(entry.prospect) : undefined}
            onLoad={(polygon) => {
              polygonRefs.current.set(entry.id, polygon);
            }}
            options={{
              fillColor: entry.color,
              fillOpacity: editingProspectId === entry.id ? 0.25 : 0.15,
              strokeColor: entry.color,
              strokeWeight: editingProspectId === entry.id ? 3 : 2,
              strokeOpacity: 0.8,
              clickable: savedOverlaysInteractive,
              editable: savedOverlaysInteractive && editingProspectId === entry.id,
              draggable: savedOverlaysInteractive && editingProspectId === entry.id,
              zIndex: editingProspectId === entry.id ? 2 : 1,
            }}
          />
        );
      })}
    </>
  );
});

// Function to calculate polygon area in square feet and convert to acres
const calculatePolygonAcres = (geometry: any): number | null => {
  if (!geometry || geometry.type !== 'Polygon') return null;
  
  try {
    // Handle both legacy format [[lng, lat], ...] and GeoJSON format [[[lng, lat], ...]]
    let coordinates = geometry.coordinates;
    
    // If it's the new GeoJSON format (array of rings), take the first ring (exterior)
    if (Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0])) {
      coordinates = coordinates[0]; // Take exterior ring
    }
    
    if (!coordinates || coordinates.length < 3) return null;
    
    // Convert to Google Maps LatLng objects
    const path = coordinates.map((coord: [number, number]) => ({
      lat: coord[1],
      lng: coord[0]
    }));
    
    // Use Google Maps geometry library if available
    if (window.google?.maps?.geometry?.spherical) {
      const areaInSquareMeters = window.google.maps.geometry.spherical.computeArea(path);
      const areaInSquareFeet = areaInSquareMeters * 10.764; // Convert to square feet
      const acres = areaInSquareFeet / 43560; // Convert to acres
      return Math.round((acres + Number.EPSILON) * 100) / 100;
    }
    
    // Fallback: Shoelace formula for area calculation (approximate)
    let area = 0;
    for (let i = 0; i < path.length; i++) {
      const j = (i + 1) % path.length;
      area += path[i].lng * path[j].lat;
      area -= path[j].lng * path[i].lat;
    }
    area = Math.abs(area) / 2;
    
    // Rough conversion from degrees to square feet (very approximate)
    const metersPerDegree = 111320; // meters per degree at equator
    const areaInSquareMeters = area * metersPerDegree * metersPerDegree;
    const areaInSquareFeet = areaInSquareMeters * 10.764;
    const acres = areaInSquareFeet / 43560;
    return Math.round((acres + Number.EPSILON) * 100) / 100;
    
  } catch (error) {
    console.error('Error calculating polygon area:', error);
    return null;
  }
};

const formatSfWithCommas = (value?: number | null): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
};

const parseSfInput = (raw: string): number | null => {
  const digitsOnly = raw.replace(/[^\d]/g, '');
  if (!digitsOnly) return null;
  const parsed = Number.parseInt(digitsOnly, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseAcresInput = (raw: string): number | null => {
  const cleaned = raw.replace(/[^\d.]/g, '');
  if (!cleaned || cleaned === '.') return null;
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

export default function HomePage() {
  const { toast } = useToast();
  const { user, isDemoMode } = useAuth();
  const { profile } = useProfile();
  const geocode = useGeocode();
  
  // Memoize currentUser to prevent infinite loops
  const currentUser = useMemo(() => user, [user]);
  const canCreateProspects = !!currentUser || isDemoMode;
  
  // Use normalized, de-duplicated submarkets for consistent options
  const submarketOptions = uniqueSubmarketNames(profile?.submarkets || []);
  
  // Map state
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>(() => {
    const primary = readJSON<any>(nsKey(currentUser?.id, 'mapType'), null);
    if (primary === 'roadmap' || primary === 'hybrid') return primary;
    const fallback = readJSON<any>('mapType::guest', null);
    return (fallback === 'roadmap' || fallback === 'hybrid') ? fallback : 'roadmap';
  });
  const [center, setCenter] = useState<{ lat: number; lng: number }>(() => {
    const saved = readJSON<{ lat: number; lng: number; zoom: number } | null>(nsKey(currentUser?.id, 'mapViewport'), null);
    return saved && typeof saved.lat === 'number' && typeof saved.lng === 'number' ? { lat: saved.lat, lng: saved.lng } : DEFAULT_CENTER;
  });
  const [zoom, setZoom] = useState<number>(() => {
    const saved = readJSON<{ lat: number; lng: number; zoom: number } | null>(nsKey(currentUser?.id, 'mapViewport'), null);
    return saved && typeof saved.zoom === 'number' ? saved.zoom : DEFAULT_ZOOM;
  });
  const [bounds, setBounds] = useState<google.maps.LatLngBoundsLiteral | null>(null);

  // TerraDraw controls the creation of new map assets. Existing saved assets
  // still render from Prospect.geometry via Google overlays below.
  type TerraMode = MapDrawMode;
  const [terraMode, setTerraMode] = useState<TerraMode>('select');
  
  // Data state
  const [prospects, setProspects] = useState<Prospect[]>(() => {
    clearLegacyDemoMapData();
    return [];
  });
  const [submarkets, setSubmarkets] = useState<Submarket[]>([]);
  const [touches, setTouches] = useState<Touch[]>([]);
  const touchesRef = useRef<Touch[]>([]);
  useEffect(() => {
    touchesRef.current = touches;
  }, [touches]);
  
  // Filter state
  const statusFilterStorageKey = nsKey(currentUser?.id, 'mapStatusFilters');
  const skipNextStatusFilterPersistRef = useRef(false);
  const [statusFilters, setStatusFilters] = useState<Set<ProspectStatusType>>(() => {
    return createStatusFilterSet(readJSON<unknown>(statusFilterStorageKey, null));
  });
  
  // Add submarket filter state
  const [selectedSubmarkets, setSelectedSubmarkets] = useState<Set<string>>(() => {
    return new Set(readJSON(nsKey(currentUser?.id, 'selectedSubmarkets'), []));
  });
  
  // UI state - load control panel state from user-scoped localStorage
  const [isControlPanelOpen, setIsControlPanelOpen] = useState(() => {
    return readJSON(nsKey(currentUser?.id, 'controlPanelOpen'), false);
  });
  // Legend open/close managed inside StatusLegend component
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const focusedProspectIdRef = useRef<string | null>(null);
  const [editingProspectId, setEditingProspectId] = useState<string | null>(null);
  const [originalPolygonCoordinates, setOriginalPolygonCoordinates] = useState<[number, number][] | null>(null);
  const polygonRefs = useRef<Map<string, google.maps.Polygon>>(new Map());
  const polygonPathListenersRef = useRef<Map<string, google.maps.MapsEventListener[]>>(new Map());
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [xpToast, setXpToast] = useState<{ id: number; xp: number; label?: string } | null>(null);
  const [savePulse, setSavePulse] = useState(false);
  const [quickLogPendingType, setQuickLogPendingType] = useState<'call' | 'email' | 'meeting' | null>(null);
  const [isXpSoundEnabled, setIsXpSoundEnabled] = useState<boolean>(() => {
    const settings = readJSON<any>(nsKey(currentUser?.id, 'userSettings'), null);
    if (settings && typeof settings.soundEffects === 'boolean') return settings.soundEffects;
    const saved = readJSON<boolean | null>(nsKey(currentUser?.id, 'gamificationSoundEnabled'), null);
    if (typeof saved === 'boolean') return saved;
    const guest = readJSON<boolean | null>('gamificationSoundEnabled::guest', null);
    return typeof guest === 'boolean' ? guest : true;
  });
  // Note: Escape key close handler moved below to avoid TDZ on closeEditPanel
  
  // Search pin state
  const [searchPin, setSearchPin] = useState<SearchPin | null>(null);
  // Signal to clear the SearchBar input when a prospect is added
  const [clearSearchSignal, setClearSearchSignal] = useState(0);
  
  // Drawing state
  const [drawingForProspect, setDrawingForProspect] = useState<Prospect | null>(null);
  const drawingForProspectRef = useRef<Prospect | null>(null);
  useEffect(() => { drawingForProspectRef.current = drawingForProspect; }, [drawingForProspect]);

  // Google Maps loader
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries,
    mapIds: [GOOGLE_MAPS_MAP_ID],
  });
  useEffect(() => {
    const settings = readJSON<any>(nsKey(currentUser?.id, 'userSettings'), null) || {};
    writeJSON(nsKey(currentUser?.id, 'userSettings'), {
      ...settings,
      soundEffects: isXpSoundEnabled,
    });
  }, [isXpSoundEnabled, currentUser?.id]);

  useEffect(() => {
    const syncSoundSetting = () => {
      const settings = readJSON<any>(nsKey(currentUser?.id, 'userSettings'), null);
      if (settings && typeof settings.soundEffects === 'boolean') {
        setIsXpSoundEnabled(settings.soundEffects);
      }
    };
    syncSoundSetting();
    window.addEventListener('storage', syncSoundSetting);
    return () => window.removeEventListener('storage', syncSoundSetting);
  }, [currentUser?.id]);

  const playXpSound = useCallback(() => {
    if (!isXpSoundEnabled) return;
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.03, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.14);
    } catch {}
  }, [isXpSoundEnabled]);

  const bumpLocalSkillXp = useCallback((delta: number, skillKey: 'followUp' | 'prospecting' = 'followUp') => {
    if (!delta || Number.isNaN(delta)) return;
    queryClient.setQueryData<any>(['/api/skills'], (prev) => {
      if (!prev || typeof prev !== 'object') return prev;
      return {
        ...prev,
        [skillKey]: Math.max(0, Number(prev[skillKey] || 0) + delta),
      };
    });
  }, []);

  const triggerXpFeedback = useCallback((xp: number, label?: string) => {
    if (!xp || xp <= 0) return;
    setXpToast({ id: Date.now(), xp, label });
    setSavePulse(true);
    window.setTimeout(() => setSavePulse(false), 450);
    playXpSound();
  }, [playXpSound]);

  const parseProspectPatchResponse = useCallback((payload: any): { prospect: Prospect; newXpGained: number } => {
    const gained = Number(payload?.newXpGained || 0);
    const { newXpGained: _ignored, ...prospectRaw } = payload || {};
    return {
      prospect: prospectRaw as Prospect,
      newXpGained: Number.isFinite(gained) ? gained : 0,
    };
  }, []);

  // Avoid resetting local state on user change; we invalidate queries instead (see listener below)

  // Use React Query for authenticated data fetching
  const {
    data: prospectsData = EMPTY_PROSPECTS,
    refetch: refetchProspects,
    error: prospectsError,
    isLoading: isProspectsLoading,
  } = useQuery<Prospect[]>({
    queryKey: ['/api/prospects'],
    enabled: !!currentUser && !isDemoMode,
    retry: false,
  });

  useEffect(() => {
    if (clearLegacyDemoMapData()) {
      queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], []);
      setProspects([]);
      setTouches([]);
    }
  }, [isDemoMode]);
  
  // Remove submarkets query - we'll use profile submarkets instead
  
  // Sync React Query data with local state
  useEffect(() => {
    if (isDemoMode) {
      const stored = readJSON<MapData | null>(nsKey(currentUser?.id, 'mapData'), null);
      const localProspects = stored?.prospects || [];
      const byId: Record<string, Prospect> = {};
      for (const p of prospectsData) byId[p.id] = p;
      for (const lp of localProspects) {
        if (!byId[lp.id]) byId[lp.id] = lp;
      }
      setProspects(Object.values(byId));
    } else {
      setProspects(prospectsData);
    }
  }, [prospectsData, isDemoMode, currentUser?.id]);
  
  
  // Load touches from localStorage (keeping this for now)
  useEffect(() => {
    if (currentUser) {
      const savedData = readJSON<MapData | null>(nsKey(currentUser?.id, 'mapData'), null);
      if (savedData) {
        setTouches(savedData.touches || []);
      }
    }
  }, [currentUser?.id]);
  
  // Refetch data when user changes (stable listener to avoid update loops)
  useEffect(() => {
    const handleUserChange = () => {
      queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
    };
    window.addEventListener('userChanged', handleUserChange);
    return () => window.removeEventListener('userChanged', handleUserChange);
  }, []);

  // Save data to user-scoped localStorage
  const saveData = useCallback(() => {
    const data: MapData = { prospects, submarkets: [], touches };
    writeJSON(nsKey(currentUser?.id, 'mapData'), data);
  }, [prospects, touches, currentUser?.id]);

  // Debounced persistence to localStorage to avoid blocking on every keystroke
  const persistTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!currentUser) return;
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    persistTimerRef.current = window.setTimeout(() => {
      // Preserve prior behavior of not persisting an empty set on first load
      if (prospects.length > 0) {
        const data: MapData = { prospects, submarkets: [], touches };
        writeJSON(nsKey(currentUser.id, 'mapData'), data);
      }
      persistTimerRef.current = null;
    }, 700);
    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [prospects, touches, currentUser?.id]);

  // Save UI state to user-scoped localStorage
  useEffect(() => {
    writeJSON(nsKey(currentUser?.id, 'controlPanelOpen'), isControlPanelOpen);
  }, [isControlPanelOpen, currentUser?.id]);

  useEffect(() => {
    skipNextStatusFilterPersistRef.current = true;
    setStatusFilters(createStatusFilterSet(readJSON<unknown>(statusFilterStorageKey, null)));
  }, [statusFilterStorageKey]);

  useEffect(() => {
    if (skipNextStatusFilterPersistRef.current) {
      skipNextStatusFilterPersistRef.current = false;
      return;
    }

    writeJSON(statusFilterStorageKey, Array.from(statusFilters));
  }, [statusFilters, statusFilterStorageKey]);

  // No longer persisting legend open state
  
  // Save submarket filter state
  useEffect(() => {
    writeJSON(nsKey(currentUser?.id, 'selectedSubmarkets'), Array.from(selectedSubmarkets));
  }, [selectedSubmarkets, currentUser?.id]);

  // Load map type when user changes
  useEffect(() => {
    const primary = readJSON<any>(nsKey(currentUser?.id, 'mapType'), null);
    const fallback = readJSON<any>('mapType::guest', null);
    const next = (primary === 'roadmap' || primary === 'hybrid')
      ? primary
      : ((fallback === 'roadmap' || fallback === 'hybrid') ? fallback : 'roadmap');
    setMapType(next);
  }, [currentUser?.id]);

  // Persist map type per user
  useEffect(() => {
    writeJSON(nsKey(currentUser?.id, 'mapType'), mapType);
  }, [mapType, currentUser?.id]);

  // Apply map type immediately to the Google Map instance
  useEffect(() => {
    if (map) {
      map.setMapTypeId(mapType);
    }
  }, [map, mapType]);

  // Load viewport when user changes
  useEffect(() => {
    const saved = readJSON<{ lat: number; lng: number; zoom: number } | null>(nsKey(currentUser?.id, 'mapViewport'), null);
    if (saved) {
      setCenter({ lat: saved.lat, lng: saved.lng });
      setZoom(saved.zoom ?? DEFAULT_ZOOM);
    } else {
      setCenter(DEFAULT_CENTER);
      setZoom(DEFAULT_ZOOM);
    }
  }, [currentUser?.id]);

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

  // Filter prospects based on status and submarket
  const filteredProspects = useMemo(() => {
    return prospects.filter(prospect => {
      const passesStatus = statusFilters.has(prospect.status);
      const passesSubmarket = selectedSubmarkets.size === 0 ||
                              (prospect.submarketId && selectedSubmarkets.has(prospect.submarketId));
      return passesStatus && passesSubmarket;
    });
  }, [prospects, statusFilters, selectedSubmarkets]);

  const statusCounts = useMemo(() => getStatusCounts(prospects), [prospects]);

  const renderableProspects = useMemo(() => {
    return filteredProspects.map((prospect) => {
      const color = STATUS_META[prospect.status].color;
      if (prospect.geometry.type === 'Point') {
        const [lng, lat] = prospect.geometry.coordinates as [number, number];
        return {
          id: prospect.id,
          prospect,
          color,
          kind: 'point' as const,
          position: { lat, lng },
        };
      }
      if (prospect.geometry.type === 'Polygon' || prospect.geometry.type === 'Rectangle') {
        const coords = prospect.geometry.coordinates as [number, number][][] | [number, number][];
        const coordinates = (Array.isArray(coords[0]) && Array.isArray(coords[0][0]))
          ? (coords[0] as [number, number][])
          : (coords as [number, number][]);
        return {
          id: prospect.id,
          prospect,
          color,
          kind: 'polygon' as const,
          paths: coordinates.map(([lng, lat]) => ({ lat, lng })),
        };
      }
      return null;
    }).filter(Boolean) as RenderableProspectEntry[];
  }, [filteredProspects]);

  const clearPolygonPathListeners = useCallback((prospectId?: string) => {
    if (prospectId) {
      const listeners = polygonPathListenersRef.current.get(prospectId) || [];
      listeners.forEach((listener) => google.maps.event.removeListener(listener));
      polygonPathListenersRef.current.delete(prospectId);
      return;
    }
    polygonPathListenersRef.current.forEach((listeners) => {
      listeners.forEach((listener) => google.maps.event.removeListener(listener));
    });
    polygonPathListenersRef.current.clear();
  }, []);

  const upsertProspectInCache = useCallback((nextProspect: Prospect) => {
    queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const idx = list.findIndex((p) => p.id === nextProspect.id);
      if (idx === -1) return [...list, nextProspect];
      const copy = [...list];
      copy[idx] = nextProspect;
      return copy;
    });
  }, []);

  const removeProspectFromCache = useCallback((prospectId: string) => {
    queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) =>
      Array.isArray(prev) ? prev.filter((p) => p.id !== prospectId) : prev
    );
  }, []);

  // Map event handlers
  const onMapLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  const onMapUnmount = useCallback(() => {
    setMap(null);
  }, []);

  // CSV import handler - save all imported prospects to database
  const handleProspectsImport = useCallback(async (newProspects: Prospect[]) => {
    // Filter out duplicates based on name and coordinates
    const uniqueNewProspects = newProspects.filter(newProspect => {
      return !prospects.some(existing => 
        existing.name === newProspect.name ||
        (existing.geometry.type === newProspect.geometry.type &&
         JSON.stringify(existing.geometry.coordinates) === JSON.stringify(newProspect.geometry.coordinates))
      );
    });

    if (uniqueNewProspects.length === 0) {
      toast({
        title: "No New Data",
        description: "All imported prospects already exist",
      });
      return;
    }

    // Save each prospect to database
    const savedProspects: Prospect[] = [];
    let saveCount = 0;
    
    for (const prospect of uniqueNewProspects) {
      try {
        const response = await apiRequest('POST', '/api/prospects', prospect);
        const savedProspect = await response.json();
        savedProspects.push(savedProspect);
        saveCount++;
      } catch (error) {
        console.error('Error saving prospect:', error);
        // Fallback to local storage if database fails
        savedProspects.push(prospect);
      }
    }

    // Ensure "prospect" status is always enabled for imported data
    setStatusFilters(prev => new Set([...Array.from(prev), 'prospect' as ProspectStatusType]));
    
    toast({
      title: "Prospects Imported", 
      description: `${saveCount} prospects saved to your database profile`,
    });

    // Update local state with saved prospects
    setProspects(prev => [...prev, ...savedProspects]);
    
    // Invalidate React Query cache to refresh knowledge dashboard
    if (saveCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
    }
  }, [prospects, toast]);

  // CSV export handler (round-trip: WKT for polygons, POINT for points)
  const exportToCSV = useCallback(() => {
    const wktFromGeometry = (geometry: any): string => {
      if (!geometry) return ''
      if (geometry.type === 'Point') {
        const [lng, lat] = geometry.coordinates as [number, number]
        return `POINT(${lng} ${lat})`
      }
      if (geometry.type === 'Polygon') {
        const rings: [number, number][][] = Array.isArray(geometry.coordinates[0][0])
          ? geometry.coordinates
          : [geometry.coordinates]
        // Only export exterior ring for now
        const ring = rings[0]
        const pairs = ring.map(([lng, lat]) => `${lng} ${lat}`).join(', ')
        return `POLYGON((${pairs}))`
      }
      return ''
    }

    const rows = filteredProspects.map(p => ({
      name: p.name,
      status: p.status,
      notes: p.notes,
      coordinates: wktFromGeometry(p.geometry),
      submarketId: (p as any).submarketId || '',
      lastContactDate: (p as any).lastContactDate || '',
      createdDate: p.createdDate,
    }))

    const headers = ['name', 'status', 'notes', 'coordinates', 'submarketId', 'lastContactDate', 'createdDate']
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => `"${(r as any)[h] ?? ''}"`).join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `prospects-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [filteredProspects])

  // Prospect click handler
  const handleProspectClick = useCallback((prospect: Prospect) => {
    console.log('Prospect clicked:', prospect);
    setSelectedProspect(prospect);
    setIsEditPanelOpen(true);
  }, []);

  // Handle location found from search
  const handleLocationFound = useCallback((location: MapSearchLocation) => {
    console.log('Creating search pin at:', location);
    setSearchPin({
      id: 'temp-search',
      lat: location.lat,
      lng: location.lng,
      address: location.address,
      businessName: location.businessName,
      websiteUrl: location.websiteUrl,
      contactPhone: location.contactPhone,
      placeId: location.placeId,
      googleMapsUrl: location.googleMapsUrl,
    });
  }, []);

  const formatCoordinates = useCallback((lat: number, lng: number) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`, []);

  const handleCopyCoordinates = useCallback(async (lat: number, lng: number) => {
    const text = formatCoordinates(lat, lng);
    let copied = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
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
    toast({
      title: copied ? 'Coordinates copied' : 'Copy failed',
      description: text,
      variant: copied ? undefined : 'destructive',
    });
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

  const getProspectLatLng = useCallback((prospect?: Prospect | null): { lat: number; lng: number } | null => {
    if (!prospect?.geometry) return null;
    const geometry: any = prospect.geometry;
    if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
      const [lng, lat] = geometry.coordinates as [number, number];
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
      return null;
    }
    if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
      const ring: [number, number][] = Array.isArray(geometry.coordinates[0]?.[0])
        ? (geometry.coordinates[0] as [number, number][])
        : (geometry.coordinates as [number, number][]);
      if (!Array.isArray(ring) || ring.length === 0) return null;
      const usable = ring.length > 1 ? ring.slice(0, -1) : ring;
      const valid = usable.filter(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng));
      if (!valid.length) return null;
      const acc = valid.reduce((sum, [lng, lat]) => ({ lat: sum.lat + lat, lng: sum.lng + lng }), { lat: 0, lng: 0 });
      return { lat: acc.lat / valid.length, lng: acc.lng / valid.length };
    }
    return null;
  }, []);

  const selectedProspectLatLng = useMemo(
    () => getProspectLatLng(selectedProspect),
    [getProspectLatLng, selectedProspect]
  );

  useEffect(() => {
    if (!map || prospects.length === 0 || typeof window === 'undefined') return;
    let storedTargetId: string | null = null;
    try {
      storedTargetId = window.localStorage.getItem('levelcre:focusProspectId');
    } catch {}
    const targetId = new URLSearchParams(window.location.search).get('prospectId') || storedTargetId;
    if (!targetId || focusedProspectIdRef.current === targetId) return;

    const targetProspect = prospects.find((prospect) => prospect.id === targetId);
    if (!targetProspect) return;

    focusedProspectIdRef.current = targetId;
    const targetLatLng = getProspectLatLng(targetProspect);
    if (targetLatLng) {
      map.panTo(targetLatLng);
      map.setZoom(Math.max(map.getZoom() || 15, 16));
      setCenter(targetLatLng);
      setZoom(Math.max(map.getZoom() || 16, 16));
    }
    setSelectedProspect(targetProspect);
    setIsEditPanelOpen(true);
    setIsControlPanelOpen(false);
    try {
      window.localStorage.removeItem('levelcre:focusProspectId');
    } catch {}
  }, [map, prospects, getProspectLatLng]);

  // Demo helpers: id generation, building & persisting local prospects
  const genId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const buildLocalProspect = (
    data: Partial<Prospect> & Pick<Prospect, 'name' | 'status' | 'notes' | 'geometry'>
  ): Prospect => ({
    id: genId(),
    createdDate: new Date().toISOString(),
    submarketId: data.submarketId,
    lastContactDate: data.lastContactDate,
    followUpTimeframe: data.followUpTimeframe,
    followUpDueDate: data.followUpDueDate || (data.followUpTimeframe ? computeFollowUpDue(new Date().toISOString(), data.followUpTimeframe) : undefined),
    contactName: data.contactName,
    contactEmail: data.contactEmail,
    contactPhone: data.contactPhone,
    contactCompany: data.contactCompany,
    buildingSf: data.buildingSf,
    lotSizeAcres: data.lotSizeAcres,
    businessName: (data as any).businessName,
    websiteUrl: (data as any).websiteUrl,
    name: data.name,
    status: data.status,
    notes: data.notes,
    geometry: data.geometry,
  });

  const persistProspects = (next: Prospect[]) => {
    setProspects(next);
    const dataToSave: MapData = { prospects: next, submarkets: [], touches };
    writeJSON(nsKey(currentUser?.id, 'mapData'), dataToSave);
  };

  // Submarket inference helper
  const inferSubmarketFromPoint = useCallback((point: { lat: number; lng: number }): string => {
    // For now, return empty string since we don't have submarket polygon logic
    // This can be enhanced later if submarkets are available
    return '';
  }, []);

  // Handle "Save as Prospect" from search pin - save immediately (demo local or API)
  const handleSaveSearchPin = useCallback(async () => {
    if (!searchPin) return;
    
    try {
      const prospectDetails = searchLocationToProspectDetails(searchPin);
      const newProspectData = {
        // Map address to Property tab (Address field is `name`)
        name: searchPin.address,
        geometry: {
          type: 'Point' as const,
          coordinates: [searchPin.lng, searchPin.lat] as [number, number]
        },
        status: 'prospect' as ProspectStatusType,
        notes: '',
        submarketId: inferSubmarketFromPoint(searchPin) || '',
        ...prospectDetails,
      };
      const { businessName, websiteUrl, contactCompany, contactPhone, aiMetadata, ...initialProspectData } = newProspectData;
      const enrichmentPatch = { businessName, websiteUrl, contactCompany, contactPhone, aiMetadata };
      const hasEnrichmentPatch = Object.values(enrichmentPatch).some((value) => value !== undefined);

      console.log('Saving search pin as prospect:', newProspectData);

      if (isDemoMode) {
        const localProspect = buildLocalProspect({
          name: newProspectData.name,
          status: newProspectData.status,
          notes: newProspectData.notes,
          geometry: newProspectData.geometry,
          submarketId: newProspectData.submarketId,
          businessName: newProspectData.businessName,
          contactCompany: newProspectData.contactCompany,
          contactPhone: newProspectData.contactPhone,
          websiteUrl: newProspectData.websiteUrl,
          aiMetadata: newProspectData.aiMetadata,
        } as any);
        const next = [...prospects, localProspect];
        persistProspects(next);
        setSelectedProspect(localProspect);
        setIsEditPanelOpen(true);
        setSearchPin(null);
        // Also clear the search input field
        setClearSearchSignal((s) => s + 1);
        toast({ title: 'Prospect saved (demo)', description: `"${getProspectDisplayName(localProspect)}" added locally.` });
      } else {
        // Save directly to database
        const response = await apiRequest('POST', '/api/prospects', initialProspectData);
        let savedProspect = await response.json();
        if (hasEnrichmentPatch) {
          try {
            const patchResponse = await apiRequest('PATCH', `/api/prospects/${savedProspect.id}`, enrichmentPatch);
            savedProspect = await patchResponse.json();
          } catch (enrichmentError) {
            console.warn('Prospect saved, but Google Places enrichment could not be applied', enrichmentError);
          }
        }
        
        // Add to prospects list
        setProspects(prev => [...prev, savedProspect]);
        setSelectedProspect(savedProspect);
        setIsEditPanelOpen(true);
        
        queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) => {
          const list = Array.isArray(prev) ? prev : [];
          if (list.some((p) => p.id === savedProspect.id)) return list;
          return [...list, savedProspect];
        });
        
        // Clear the search pin and input
        setSearchPin(null);
        setClearSearchSignal((s) => s + 1);
        
        // Show success message
        toast({
          title: "Prospect saved successfully",
          description: `"${getProspectDisplayName(savedProspect)}" has been added to your map.`
        });
        
        console.log('Search pin saved as prospect:', savedProspect);
      }

    } catch (error) {
      console.error('Error saving search pin as prospect:', error);
      toast({
        title: "Error saving prospect",
        description: "Failed to save prospect to database.",
        variant: "destructive"
      });
    }
  }, [searchPin, inferSubmarketFromPoint, toast, queryClient, isDemoMode, prospects]);

  const createProspectFromContext = useMutation<Prospect, Error, { lat: number; lng: number; address?: string }>({
    mutationFn: async ({ lat, lng, address }) => {
      const cleanedAddress = address?.replace(/, Canada$/, '').trim();
      const fallbackName = cleanedAddress && cleanedAddress.length > 0
        ? cleanedAddress
        : `Dropped pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      const payload = {
        name: fallbackName,
        geometry: {
          type: 'Point' as const,
          coordinates: [lng, lat] as [number, number],
        },
        status: 'prospect' as ProspectStatusType,
        notes: '',
        submarketId: inferSubmarketFromPoint({ lat, lng }) || '',
      };

      if (isDemoMode) {
        return buildLocalProspect(payload as any);
      }

      const response = await apiRequest('POST', '/api/prospects', payload);
      return await response.json();
    },
    onSuccess: (created) => {
      setProspects((prev) => {
        const next = [...prev, created];
        if (isDemoMode) {
          const dataToSave: MapData = { prospects: next, submarkets: [], touches: touchesRef.current };
          writeJSON(nsKey(currentUser?.id, 'mapData'), dataToSave);
        }
        return next;
      });
      if (!isDemoMode) {
        upsertProspectInCache(created);
      }
      setSelectedProspect(created);
      setIsEditPanelOpen(true);
      closeContextMenu();
      const label = getProspectDisplayName(created);
      toast({
        title: isDemoMode ? 'Prospect added (demo)' : 'Prospect added',
        description: `${label} saved to your map`,
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

  const handleCreateProspectAt = useCallback(async (lat: number, lng: number) => {
    if (!canCreateProspects || createProspectFromContext.isPending) return;
    let address: string | undefined;
    try {
      const result = await geocode.reverse(lat, lng);
      if (result.address) {
        address = result.address;
      }
    } catch {}
    createProspectFromContext.mutate({ lat, lng, address });
  }, [canCreateProspects, createProspectFromContext, geocode]);

  const handleTerraDrawFinish = useCallback(async ({ geometry, mode }: TerraDrawFinishPayload) => {
    const eventType = mode === 'point' ? 'marker' : mode;
    const acres = calculatePolygonAcres(geometry);
    const target = drawingForProspectRef.current;

    try {
      if (target && geometry.type === 'Polygon') {
        manualLotOverrideRef.current.delete(target.id);
        const updateData = {
          geometry,
          lotSizeAcres: acres ?? undefined,
        };

        if (target.id === 'temp-prospect') {
          const newProspectData = {
            name: target.name,
            status: target.status,
            notes: target.notes,
            geometry,
            lotSizeAcres: acres ?? undefined,
            submarketId: target.submarketId,
          };

          if (isDemoMode) {
            const localProspect = buildLocalProspect(newProspectData as any);
            const next = [...prospects, localProspect];
            persistProspects(next);
            setSelectedProspect(localProspect);
          } else {
            const response = await apiRequest('POST', '/api/prospects', newProspectData);
            const savedProspect = await response.json();
            setProspects((prev) => [...prev, savedProspect]);
            setSelectedProspect(savedProspect);
            upsertProspectInCache(savedProspect);
          }
        } else if (isDemoMode) {
          const updated = prospects.map((p) => (p.id === target.id ? { ...p, ...updateData } as Prospect : p));
          persistProspects(updated);
          const selected = updated.find((p) => p.id === target.id) || null;
          setSelectedProspect(selected);
        } else {
          const response = await apiRequest('PATCH', `/api/prospects/${target.id}`, updateData);
          const payload = await response.json();
          const { prospect: savedProspect, newXpGained } = parseProspectPatchResponse(payload);
          setProspects((prev) => prev.map((p) => (p.id === savedProspect.id ? savedProspect : p)));
          setSelectedProspect(savedProspect);
          upsertProspectInCache(savedProspect);
          if (newXpGained > 0) {
            bumpLocalSkillXp(newXpGained, 'followUp');
            triggerXpFeedback(newXpGained);
          }
        }

        toast({
          title: 'Polygon added',
          description: `Polygon area added to prospect${acres ? ` (${acres.toFixed(2)} acres)` : ''}`,
        });

        setDrawingForProspect(null);
        setIsEditPanelOpen(true);
        return;
      }

      if (isDemoMode) {
        const localProspect = buildLocalProspect({
          name: '',
          status: 'prospect',
          notes: '',
          geometry,
          lotSizeAcres: acres ?? undefined,
        } as any);
        const next = [...prospects, localProspect];
        persistProspects(next);
        setSelectedProspect(localProspect);
        setIsEditPanelOpen(true);
        toast({ title: 'Prospect saved', description: `New ${eventType} added locally (demo).` });
      } else {
        const payload = {
          name: eventType === 'marker' ? 'Dropped pin' : 'Mapped area',
          status: 'prospect' as ProspectStatusType,
          notes: '',
          geometry,
          lotSizeAcres: acres ?? undefined,
        };
        const response = await apiRequest('POST', '/api/prospects', payload);
        const savedProspect = await response.json();
        setProspects((prev) => [...prev, savedProspect]);
        setSelectedProspect({ ...savedProspect, name: '' });
        setIsEditPanelOpen(true);

        queryClient.setQueryData<Prospect[] | undefined>(['/api/prospects'], (prev) => {
          const list = Array.isArray(prev) ? prev : [];
          if (list.some((p) => p.id === savedProspect.id)) return list;
          return [...list, savedProspect];
        });

        toast({
          title: 'Prospect saved',
          description: `New ${eventType} prospect saved to your profile`,
        });
      }
    } catch (error) {
      console.error('Error saving TerraDraw prospect:', error);
      toast({
        title: 'Error',
        description: 'Failed to save prospect. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDrawingForProspect(null);
    }
  }, [
    buildLocalProspect,
    bumpLocalSkillXp,
    isDemoMode,
    parseProspectPatchResponse,
    persistProspects,
    prospects,
    queryClient,
    toast,
    triggerXpFeedback,
    upsertProspectInCache,
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
    clear: clearTerraDraw,
    mode: terraDrawMode,
    setMode: setTerraDrawMode,
  } = useTerraDrawGoogleMaps({
    map,
    enabled: isLoaded && !!GOOGLE_MAPS_API_KEY,
    onFinish: handleTerraDrawFinish,
    onUnavailable: notifyTerraDrawUnavailable,
    onError: handleTerraDrawError,
  });

  useEffect(() => {
    setTerraMode(terraDrawMode);
  }, [terraDrawMode]);

  const activateTerraDrawMode = useCallback((mode: TerraMode) => {
    const activated = setTerraDrawMode(mode);
    setTerraMode(activated ? mode : 'select');
  }, [setTerraDrawMode]);

  // Handle drawing polygon for point prospects
  const handleDrawPolygon = useCallback(() => {
    if (selectedProspect) {
      // If a prospect is selected, we are drawing for it.
      setDrawingForProspect(selectedProspect);
      setIsEditPanelOpen(false); // Close panel to allow drawing
      toast({
        title: "Draw Mode Enabled",
        description: `Click on the map to draw an area for ${getProspectDisplayName(selectedProspect)}.`,
      });
    }
    
    activateTerraDrawMode('polygon');
    
  }, [activateTerraDrawMode, selectedProspect, toast]);

  // Terra Draw handlers
  const setTerraModeSafe = useCallback((mode: TerraMode) => {
    activateTerraDrawMode(mode);
  }, [activateTerraDrawMode]);

  const clearTerra = useCallback(() => {
    clearTerraDraw();
    setTerraModeSafe('select');
  }, [clearTerraDraw, setTerraModeSafe]);

  // Enable polygon editing
  const enablePolygonEditing = useCallback((prospectId: string) => {
    // Find the prospect to get original coordinates
    const prospect = prospects.find(p => p.id === prospectId);
    if (!prospect || (prospect.geometry.type !== 'Polygon' && prospect.geometry.type !== 'Rectangle')) {
      return;
    }
    
    if (editingProspectId && editingProspectId !== prospectId) {
      clearPolygonPathListeners(editingProspectId);
    }

    // Store original coordinates for potential discard
    const originalCoords = prospect.geometry.coordinates[0] as [number, number][];
    setOriginalPolygonCoordinates(originalCoords);
    setEditingProspectId(prospectId);
    clearPolygonPathListeners(prospectId);
    
    // Enable polygon editing with debounced auto-save on vertex edits
    setTimeout(() => {
      const polygon = polygonRefs.current.get(prospectId);
      if (polygon) {
        polygon.setEditable(true);
        polygon.setDraggable(true);
        const path = polygon.getPath();

        let timer: any = null;
        const scheduleSave = () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(async () => {
            const coords: [number, number][] = [];
            for (let i = 0; i < path.getLength(); i++) {
              const pt = path.getAt(i);
              coords.push([pt.lng(), pt.lat()]);
            }
            if (coords.length > 0) coords.push(coords[0]);
            const newGeom = { type: 'Polygon' as const, coordinates: [coords] };
            const acres = calculatePolygonAcres(newGeom);
            try {
              manualLotOverrideRef.current.delete(prospectId);
              const response = await apiRequest('PATCH', `/api/prospects/${prospectId}`, {
                geometry: newGeom,
                lotSizeAcres: acres
              });
              const payload = await response.json();
              const { prospect: saved } = parseProspectPatchResponse(payload);
              setProspects(prev => prev.map(p => p.id === saved.id ? saved : p));
              if (selectedProspect && selectedProspect.id === saved.id) {
                setSelectedProspect(saved);
              }
            } catch (err) {
              console.error('Auto-save polygon error:', err);
            }
          }, 500); // debounce 500ms
        };

        // Attach listeners
        const listeners = [
          path.addListener('set_at', scheduleSave),
          path.addListener('insert_at', scheduleSave),
          path.addListener('remove_at', scheduleSave),
        ];
        polygonPathListenersRef.current.set(prospectId, listeners);
      }
    }, 100);
  }, [prospects, clearPolygonPathListeners, editingProspectId]);

  // Save current polygon changes
  const savePolygonChanges = useCallback(async () => {
    if (!editingProspectId) return;
    
    const polygon = polygonRefs.current.get(editingProspectId);
    if (!polygon) {
      return;
    }
    
    // Get current coordinates from the polygon
    const path = polygon.getPath();
    const newCoordinates: [number, number][] = [];
    for (let i = 0; i < path.getLength(); i++) {
      const point = path.getAt(i);
      newCoordinates.push([point.lng(), point.lat()]);
    }
    // Close the polygon
    if (newCoordinates.length > 2) {
      newCoordinates.push(newCoordinates[0]);
    }
    
    const updatedGeometry = {
      type: 'Polygon' as const,
      coordinates: [newCoordinates]
    };
    
    const acres = calculatePolygonAcres(updatedGeometry);
    const hadManualOverride = manualLotOverrideRef.current.has(editingProspectId);
    const polygonMoved = JSON.stringify(newCoordinates) !== JSON.stringify(originalPolygonCoordinates || []);
    const patchPayload: Record<string, any> = {
      geometry: updatedGeometry,
    };
    if (!hadManualOverride || polygonMoved) {
      manualLotOverrideRef.current.delete(editingProspectId);
      patchPayload.lotSizeAcres = acres;
    }
    
    try {
      const response = await apiRequest('PATCH', `/api/prospects/${editingProspectId}`, patchPayload);
      const payload = await response.json();
      const { prospect: savedProspect } = parseProspectPatchResponse(payload);
      
      // Update local state
      setProspects(prev => prev.map(p => p.id === savedProspect.id ? savedProspect : p));
      
      if (selectedProspect && selectedProspect.id === savedProspect.id) {
        setSelectedProspect(savedProspect);
      }
      
      // Exit edit mode
      polygon.setEditable(false);
      polygon.setDraggable(false);
      clearPolygonPathListeners(editingProspectId);
      setEditingProspectId(null);
      setOriginalPolygonCoordinates(null);
      
      toast({
        title: "Polygon Saved", 
        description: `Changes saved successfully${acres ? ` (${acres.toFixed(2)} acres)` : ''}`,
      });
      
    } catch (error: any) {
      console.error('Error saving polygon changes:', error);
      toast({
        title: "Save Failed",
        description: "Could not save polygon changes. Please try again.",
        variant: "destructive",
        duration: 4000,
      });
    }
  }, [editingProspectId, selectedProspect, toast, clearPolygonPathListeners, originalPolygonCoordinates]);

  // Discard polygon changes and revert to original
  const discardPolygonChanges = useCallback(() => {
    if (!editingProspectId || !originalPolygonCoordinates) return;
    
    const polygon = polygonRefs.current.get(editingProspectId);
    if (polygon) {
      // Revert to original coordinates
      const path = polygon.getPath();
      path.clear();
      
      originalPolygonCoordinates.forEach(([lng, lat]) => {
        path.push(new google.maps.LatLng(lat, lng));
      });
      
      // Exit edit mode
      polygon.setEditable(false);
      polygon.setDraggable(false);
    }
    
    clearPolygonPathListeners(editingProspectId);
    setEditingProspectId(null);
    setOriginalPolygonCoordinates(null);
    
    toast({
      title: "Changes Discarded",
      description: "Polygon reverted to original shape",
    });
  }, [editingProspectId, originalPolygonCoordinates, toast, clearPolygonPathListeners]);

  // Update prospect handler - debounced + optimistic to reduce flicker while typing
  const homeSaveTimerRef = useRef<number | null>(null);
  const homePendingPatchRef = useRef<Partial<Prospect>>({});
  const homeLastEditedIdRef = useRef<string | null>(null);
  const manualLotOverrideRef = useRef<Set<string>>(new Set());
  const [buildingSfInput, setBuildingSfInput] = useState('');
  const [lotSizeAcresInput, setLotSizeAcresInput] = useState('');
  const mapVisualFieldsRef = useRef<Set<keyof Prospect>>(new Set<keyof Prospect>([
    'name',
    'status',
    'geometry',
    'submarketId',
  ]));

  const flushHomeQueuedSave = useCallback(async () => {
    if (!selectedProspect) return;
    const id = selectedProspect.id;
    const patch = homePendingPatchRef.current;
    homePendingPatchRef.current = {};
    if (!patch || Object.keys(patch).length === 0) return;
    try {
      // In demo mode, persist locally without hitting the API
      if (isDemoMode) {
        setProspects(prev => {
          const next = prev.map(p => (p.id === id ? ({ ...p, ...patch } as Prospect) : p));
          persistProspects(next);
          return next;
        });
        setSelectedProspect(prev => (prev && prev.id === id ? ({ ...prev, ...patch } as Prospect) : prev));
        return;
      }
      const response = await apiRequest('PATCH', `/api/prospects/${id}`, patch);
      const payload = await response.json();
      const { prospect: savedProspect, newXpGained } = parseProspectPatchResponse(payload);
      const patchKeys = Object.keys(patch) as (keyof Prospect)[];
      const hasMapVisualChanges = patchKeys.some((key) => mapVisualFieldsRef.current.has(key));
      if (hasMapVisualChanges) {
        setProspects(prev => prev.map(p => p.id === savedProspect.id ? savedProspect : p));
      }
      setSelectedProspect(prev => (prev && prev.id === savedProspect.id ? savedProspect : prev));
      upsertProspectInCache(savedProspect);
      if (newXpGained > 0) {
        bumpLocalSkillXp(newXpGained, 'followUp');
        triggerXpFeedback(newXpGained);
      }
    } catch (error) {
      console.error('Error updating prospect:', error);
    }
  }, [selectedProspect, isDemoMode, upsertProspectInCache]);

  const queueSelectedProspectPatch = useCallback((field: keyof Prospect, value: any) => {
    if (!selectedProspect) return;
    const id = selectedProspect.id;
    if (homeLastEditedIdRef.current && homeLastEditedIdRef.current !== id && homeSaveTimerRef.current) {
      window.clearTimeout(homeSaveTimerRef.current);
      homeSaveTimerRef.current = null;
      homePendingPatchRef.current = {};
    }
    homeLastEditedIdRef.current = id;
    homePendingPatchRef.current = { ...homePendingPatchRef.current, [field]: value };
    if (homeSaveTimerRef.current) window.clearTimeout(homeSaveTimerRef.current);
    homeSaveTimerRef.current = window.setTimeout(() => { homeSaveTimerRef.current = null; void flushHomeQueuedSave(); }, 500);
  }, [selectedProspect, flushHomeQueuedSave]);

  const updateSelectedProspect = useCallback((field: keyof Prospect, value: any) => {
    if (!selectedProspect) return;
    const id = selectedProspect.id;

    // Optimistic UI update for selected prospect and list
    const updatedProspect = { ...selectedProspect, [field]: value } as Prospect;
    setSelectedProspect(updatedProspect);
    // Avoid full map/list rerenders for text-heavy fields to keep typing responsive.
    // Visual map fields can still update optimistically.
    if (mapVisualFieldsRef.current.has(field)) {
      setProspects(prev => prev.map(p => (p.id === id ? ({ ...p, [field]: value } as Prospect) : p)));
    }

    // Queue patch with debounce
    queueSelectedProspectPatch(field, value);
  }, [selectedProspect, queueSelectedProspectPatch]);

  useEffect(() => {
    if (!selectedProspect) {
      setBuildingSfInput('');
      setLotSizeAcresInput('');
      return;
    }
    setBuildingSfInput(formatSfWithCommas(selectedProspect.buildingSf));
    setLotSizeAcresInput(
      selectedProspect.lotSizeAcres === null || selectedProspect.lotSizeAcres === undefined
        ? ''
        : selectedProspect.lotSizeAcres.toFixed(2)
    );
  }, [selectedProspect?.id, selectedProspect?.buildingSf, selectedProspect?.lotSizeAcres]);

  const runQuickLog = useCallback(async (type: QuickLogType) => {
    if (!selectedProspect || quickLogPendingType) return;

    const spec = quickLogSpecFor(type);
    const due = addDaysIsoFromNow(spec.followUpDays);
    const expectedXp = spec.xp;
    const optimistic = {
      ...selectedProspect,
      followUpDueDate: due,
      lastContactDate: new Date().toISOString(),
      status: selectedProspect.status === 'prospect' ? 'contacted' : selectedProspect.status,
    } as Prospect;

    setQuickLogPendingType(type);

    if (homeSaveTimerRef.current) {
      window.clearTimeout(homeSaveTimerRef.current);
      homeSaveTimerRef.current = null;
      homePendingPatchRef.current = {};
    }

    setSelectedProspect(optimistic);
    bumpLocalSkillXp(expectedXp, 'followUp');
    triggerXpFeedback(expectedXp, spec.toastLabel);

    try {
      const result = await logBrokerActivity({
        prospect: selectedProspect,
        type,
        notes: spec.note,
        nextFollowUp: due,
      });
      const saved = result.prospect || optimistic;
      const newXpGained = Number(result.newXpGained || 0);
      setProspects(prev => prev.map(p => p.id === saved.id ? saved : p));
      setSelectedProspect(saved);
      upsertProspectInCache(saved);
      queryClient.invalidateQueries({ queryKey: ['/api/interactions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/skill-activities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats/header'] });

      const delta = newXpGained - expectedXp;
      if (delta !== 0) {
        bumpLocalSkillXp(delta, 'followUp');
      }
      if (newXpGained > 0 && newXpGained !== expectedXp) {
        triggerXpFeedback(newXpGained, spec.toastLabel);
      }
    } catch (error) {
      setSelectedProspect(selectedProspect);
      bumpLocalSkillXp(-expectedXp, 'followUp');
      toast({
        title: 'Quick log failed',
        description: 'Could not save follow-up action.',
        variant: 'destructive',
      });
    } finally {
      setQuickLogPendingType(null);
    }
  }, [selectedProspect, quickLogPendingType, bumpLocalSkillXp, triggerXpFeedback, parseProspectPatchResponse, upsertProspectInCache, toast]);

  // Delete prospect handler - remove from database
  const deleteSelectedProspect = useCallback(async () => {
    if (!selectedProspect) return;
    
    try {
      // Cancel any pending auto-save for this prospect to avoid race conditions
      if (homeSaveTimerRef.current) {
        window.clearTimeout(homeSaveTimerRef.current);
        homeSaveTimerRef.current = null;
        homePendingPatchRef.current = {};
      }

      if (isDemoMode) {
        // Local delete in demo mode (no network)
        const next = prospects.filter(p => p.id !== selectedProspect.id);
        persistProspects(next);
        setSelectedProspect(null);
        setIsEditPanelOpen(false);
        toast({ title: 'Prospect Deleted (demo)', description: 'Removed from local data' });
        return;
      }

      // Delete from database
      await apiRequest('DELETE', `/api/prospects/${selectedProspect.id}`);
      setProspects(prev => prev.filter(p => p.id !== selectedProspect.id));
      setSelectedProspect(null);
      setIsEditPanelOpen(false);
      
      removeProspectFromCache(selectedProspect.id);
      
      toast({
        title: "Prospect Deleted",
        description: "The prospect has been removed from your profile",
      });
    } catch (error) {
      console.error('Error deleting prospect:', error);
      toast({
        title: "Error",
        description: "Failed to delete prospect from database",
        variant: "destructive"
      });
    }
  }, [selectedProspect, isDemoMode, prospects, toast, removeProspectFromCache]);

  // API key change handler (no-op; use .env key)
  const handleApiKeyChange = useCallback((_newApiKey: string) => {
    // Intentionally no-op: key is sourced from the configured env key.
  }, []);

  // Close the edit panel, flush pending changes, and reset drawing state
  const closeEditPanel = useCallback(async () => {
    // If polygon editing is active, persist geometry before closing
    if (editingProspectId) {
      try {
        await savePolygonChanges();
      } catch {}
    }
    // Flush any pending debounced metadata save
    if (homeSaveTimerRef.current) {
      window.clearTimeout(homeSaveTimerRef.current);
      homeSaveTimerRef.current = null;
    }
    await flushHomeQueuedSave();
    // Reset UI + selection
    if (editingProspectId) {
      clearPolygonPathListeners(editingProspectId);
    }
    setIsEditPanelOpen(false);
    setSelectedProspect(null);
    setDrawingForProspect(null);
    // Reset drawing tools
    try { setTerraModeSafe('select'); } catch {}
    try { map?.setOptions({ draggable: true, disableDoubleClickZoom: false, clickableIcons: false } as google.maps.MapOptions); } catch {}
  }, [editingProspectId, savePolygonChanges, flushHomeQueuedSave, setTerraModeSafe, map, clearPolygonPathListeners]);

  useEffect(() => {
    return () => {
      clearPolygonPathListeners();
    };
  }, [clearPolygonPathListeners]);

  // Save + close on Escape, even while editing polygon
  useEffect(() => {
    if (!isEditPanelOpen && !editingProspectId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Act like a save button then close the panel
        e.preventDefault();
        e.stopPropagation();
        void closeEditPanel();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isEditPanelOpen, editingProspectId, closeEditPanel]);

  const handleMapSearch = useCallback((location: MapSearchLocation) => {
    handleLocationFound(location);
    if (map) {
      map.panTo({ lat: location.lat, lng: location.lng });
      map.setZoom(15);
    }
    setCenter({ lat: location.lat, lng: location.lng });
    setZoom(15);
  }, [handleLocationFound, map]);

  const handleMapPolygonTool = useCallback(() => {
    if (selectedProspect) {
      setDrawingForProspect(selectedProspect);
      toast({ title: 'Draw Mode', description: `Draw an area for ${getProspectDisplayName(selectedProspect)}.` });
    }
    setTerraModeSafe('polygon');
  }, [selectedProspect, setTerraModeSafe, toast]);

  const handleMapPinTool = useCallback(() => {
    setTerraModeSafe('point');
  }, [setTerraModeSafe]);

  const handleMapPanTool = useCallback(() => {
    setTerraModeSafe('select');
    toast({ title: 'Pan Tool', description: 'Pan/hand tool selected. You can now move the map.' });
  }, [setTerraModeSafe, toast]);

  const handleMapResetViewport = useCallback(() => {
    if (map) {
      map.panTo(DEFAULT_CENTER);
      map.setZoom(DEFAULT_ZOOM);
    }
    setCenter(DEFAULT_CENTER);
    setZoom(DEFAULT_ZOOM);
    writeJSON(nsKey(currentUser?.id, 'mapViewport'), { ...DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
  }, [map, currentUser?.id, DEFAULT_CENTER, DEFAULT_ZOOM]);

  const handleMapRectangleTool = useCallback(() => {
    setTerraModeSafe('rectangle');
  }, [setTerraModeSafe]);

  const prospectsErrorMessage = prospectsError instanceof Error
    ? prospectsError.message
    : null;

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Maps...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      {/* Map Canvas */}
      <div className="absolute inset-0 z-0" ref={mapContainerRef}>
        {(isProspectsLoading || prospectsErrorMessage) && (
          <div className="absolute left-4 top-4 z-50 max-w-md rounded-md border bg-white/95 px-3 py-2 text-sm shadow-lg backdrop-blur-sm">
            <div className="font-medium text-gray-900">
              {prospectsErrorMessage ? 'Asset load failed' : 'Loading assets'}
            </div>
            <div className={prospectsErrorMessage ? 'text-red-600' : 'text-gray-600'}>
              {prospectsErrorMessage || 'Fetching prospects for the main map.'}
            </div>
          </div>
        )}
        <GoogleMap
          mapContainerStyle={MAP_CONTAINER_STYLE}
          center={center}
          zoom={zoom}
          onLoad={onMapLoad}
          onUnmount={onMapUnmount}
          mapTypeId={mapType}
          options={MAP_OPTIONS}
          onIdle={() => {
            if (!map) return;
            const c = map.getCenter();
            const z = map.getZoom();
            if (c) {
              const next = { lat: c.lat(), lng: c.lng() };
              // Persist viewport only; avoid setting React state here to prevent render loops
              writeJSON(nsKey(currentUser?.id, 'mapViewport'), { ...next, zoom: z ?? DEFAULT_ZOOM });
            }
            const b = map.getBounds?.();
            if (b) {
              const ne = b.getNorthEast();
              const sw = b.getSouthWest();
              const nextBounds = { north: ne.lat(), east: ne.lng(), south: sw.lat(), west: sw.lng() } as const;
              setBounds((prev) => (
                prev &&
                prev.north === nextBounds.north &&
                prev.east === nextBounds.east &&
                prev.south === nextBounds.south &&
                prev.west === nextBounds.west
                  ? prev
                  : { ...nextBounds }
              ));
            }
          }}
        >
          {/* Render Prospects */}
          <MapOverlayLayer
            renderableProspects={renderableProspects}
            terraMode={terraMode}
            editingProspectId={editingProspectId}
            onProspectClick={handleProspectClick}
            polygonRefs={polygonRefs}
          />

          {/* Search Pin */}
          {searchPin && (
            <>
              <AdvancedMapMarker
                position={{ lat: searchPin.lat, lng: searchPin.lng }}
                title={searchPin.businessName || searchPin.address}
                color="#FF6B35"
                scale={12}
                zIndex={3}
              />
              <InfoWindow
                position={{ lat: searchPin.lat, lng: searchPin.lng }}
                onCloseClick={() => setSearchPin(null)}
              >
                <div className="p-2 max-w-xs">
                  <h3 className="font-medium text-sm">{searchPin.businessName || searchPin.address}</h3>
                  {searchPin.businessName && (
                    <p className="mb-2 text-xs text-gray-600">{searchPin.address}</p>
                  )}
                  {(searchPin.contactPhone || searchPin.websiteUrl) && (
                    <div className="mb-2 space-y-0.5 text-xs text-gray-600">
                      {searchPin.contactPhone && <div>{searchPin.contactPhone}</div>}
                      {searchPin.websiteUrl && <div className="truncate">{searchPin.websiteUrl}</div>}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveSearchPin}
                      className="flex-1 bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1.5 rounded transition-colors"
                    >
                      Add to Map
                    </button>
                    <button
                      onClick={() => setSearchPin(null)}
                      className="px-2 py-1.5 text-gray-500 hover:text-gray-700 text-xs"
                    >
                      x
                    </button>
                  </div>
                </div>
              </InfoWindow>
            </>
          )}
        </GoogleMap>
        {contextMenu && (
          <MapContextMenu
            anchor={{ x: contextMenu.viewportX, y: contextMenu.viewportY }}
            latLng={{ lat: contextMenu.lat, lng: contextMenu.lng }}
            onCopy={() => handleCopyCoordinates(contextMenu.lat, contextMenu.lng)}
            onCreateProspect={() => handleCreateProspectAt(contextMenu.lat, contextMenu.lng)}
            onClose={closeContextMenu}
            canCreate={canCreateProspects && !createProspectFromContext.isPending}
          />
        )}
      </div>

      {/* Map Controls - Top Left (authoritative) */}
      <MapControls
        onSearch={handleMapSearch}
        prospects={prospects}
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
          handleProspectClick(prospect);
        }}
        bounds={bounds}
        defaultCenter={DEFAULT_CENTER}
        clearSearchSignal={clearSearchSignal}
        onPolygon={handleMapPolygonTool}
        onPin={handleMapPinTool}
        onPan={handleMapPanTool}
        mapType={mapType}
        onMapTypeChange={setMapType}
        onMyLocation={handleMapResetViewport}
        onRectangle={handleMapRectangleTool}
        onSelect={() => setTerraModeSafe('select')}
        activeTerraMode={terraMode as any}
      />

      {/* Developer Settings - Keep at bottom right but with margin */}
      <div 
        className="absolute bottom-4 right-4 z-30 hidden sm:block"
        style={{ pointerEvents: 'auto' }}
      >
        <DeveloperSettings />
      </div>

      {/* Control Panel - Slides in from left */}
      {isControlPanelOpen && (
        <div 
          className="absolute inset-x-2 inset-y-2 z-[70] rounded-lg border border-gray-200 bg-white shadow-xl md:inset-y-0 md:left-0 md:right-auto md:h-full md:w-80 md:rounded-none md:border-y-0 md:border-l-0 md:border-r"
          style={{ pointerEvents: 'auto', transform: 'translateX(0)', transition: 'transform 0.3s ease-in-out' }}
        >
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">
                Filters & Settings
              </h2>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setIsControlPanelOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="text-sm text-gray-600">
                Advanced filtering and configuration options will be available here.
              </div>
              
              {/* Status Filters Section */}
              <div>
                <h3 className="text-sm font-medium text-gray-800 mb-2">Status Filters</h3>
                <div className="space-y-2">
                  {Object.entries(STATUS_META).map(([status, meta]) => (
                    <label key={status} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={statusFilters.has(status as ProspectStatusType)}
                        onChange={() => {
                          const newFilters = new Set(statusFilters);
                          if (statusFilters.has(status as ProspectStatusType)) {
                            newFilters.delete(status as ProspectStatusType);
                          } else {
                            newFilters.add(status as ProspectStatusType);
                          }
                          setStatusFilters(newFilters);
                        }}
                        className="rounded"
                      />
                      <div 
                        className="w-3 h-3 rounded-full border" 
                        style={{ backgroundColor: meta.color }}
                      />
                      <span className="text-sm">{meta.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Panel - Content-Sized with Proper Scrolling */}
      {isEditPanelOpen && selectedProspect && (
        <div 
          className="absolute bottom-2 left-2 right-2 z-[80] flex max-h-[74dvh] flex-col overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl md:left-auto md:right-0 md:top-0 md:bottom-auto md:w-80 md:max-h-[90vh] md:rounded-none md:border-y-0 md:border-r-0 md:border-l"
          style={{ pointerEvents: 'auto' }}
        >
          {/* Header - Sticky */}
          <div className="sticky top-0 z-10 bg-white border-b px-4 pt-3 pb-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">
                Edit Prospect
              </h2>
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

          {/* Body - Auto Height with Tabs */}
          <div className="px-4 py-3 space-y-4">
            <p className="text-[11px] text-gray-500">Changes save automatically</p>
            <Tabs defaultValue="property" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="property" className="text-xs">Property</TabsTrigger>
                <TabsTrigger value="contact" className="text-xs">Contact</TabsTrigger>
              </TabsList>
              
              <TabsContent value="property" className="space-y-4">
                {/* Business Name */}
                <div>
                  <Label className="text-xs font-medium text-gray-700">Business Name</Label>
                  <Input
                    key={`businessName-${selectedProspect.id}`}
                    defaultValue={selectedProspect.businessName || ''}
                    onChange={(e) => queueSelectedProspectPatch('businessName', e.target.value || null)}
                    placeholder="Business name"
                    className="h-8 text-sm"
                  />
                </div>

                {/* Address */}
                <div>
                  <Label className="text-xs font-medium text-gray-700">Address</Label>
                  {(() => {
                    const n = selectedProspect?.name || '';
                    const display = /^New\s+(polygon|rectangle|point|marker)/i.test(n) ? '' : n;
                    return (
                      <div className="flex items-center gap-2">
                        <Input
                          key={`name-${selectedProspect.id}`}
                          defaultValue={display}
                          onChange={(e) => queueSelectedProspectPatch('name', e.target.value)}
                          placeholder="Property address"
                          className="h-8 text-sm"
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-8 w-8 p-0 shrink-0"
                              aria-label="Open coordinates in Google Maps"
                              title="Open in Google Maps"
                              disabled={!selectedProspectLatLng}
                              onClick={() => {
                                if (!selectedProspectLatLng) return;
                                handleOpenInMaps(selectedProspectLatLng.lat, selectedProspectLatLng.lng);
                              }}
                            >
                              <MapPin className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Open point in Google Maps</TooltipContent>
                        </Tooltip>
                      </div>
                    );
                  })()}
                </div>

                {/* Status & Follow Up Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Status</Label>
                    <Select
                      value={selectedProspect.status}
                      onValueChange={(value: ProspectStatusType) => updateSelectedProspect('status', value)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[120]">
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
                    <Select
                      value={selectedProspect.followUpTimeframe || "none"}
                      onValueChange={(value: FollowUpTimeframeType | "none") => {
                        const tf = value === 'none' ? undefined : value;
                        updateSelectedProspect('followUpTimeframe', tf);
                        const anchor = selectedProspect.lastContactDate || selectedProspect.createdDate;
                        const due = tf ? computeFollowUpDue(anchor, tf as FollowUpTimeframeType) : null;
                        updateSelectedProspect('followUpDueDate', due);
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent className="z-[120]">
                        <SelectItem value="none">None</SelectItem>
                        {Object.entries(FOLLOW_UP_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Building SF and Lot Size (manual override enabled) */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-gray-700">Speed Tags</Label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {SPEED_TAG_SF_VALUES.map((sf) => (
                      <Button
                        key={sf}
                        type="button"
                        variant="outline"
                        className="h-7 px-0 text-[11px]"
                        onClick={() => {
                          setBuildingSfInput(formatSfWithCommas(sf));
                          updateSelectedProspect('buildingSf', sf);
                        }}
                      >
                        {sf >= 100000 ? '100k+' : `${Math.round(sf / 1000)}k`}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Building SF</Label>
                    <Input
                      value={buildingSfInput}
                      onChange={(e) => {
                        const parsed = parseSfInput(e.target.value);
                        setBuildingSfInput(parsed === null ? '' : formatSfWithCommas(parsed));
                        updateSelectedProspect('buildingSf', parsed);
                      }}
                      placeholder="e.g. 10,000"
                      inputMode="numeric"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Lot Size (Acres)</Label>
                    <Input
                      value={lotSizeAcresInput}
                      onChange={(e) => {
                        if (!selectedProspect) return;
                        setLotSizeAcresInput(e.target.value);
                        manualLotOverrideRef.current.add(selectedProspect.id);
                        const parsed = parseAcresInput(e.target.value);
                        updateSelectedProspect('lotSizeAcres', parsed);
                      }}
                      placeholder="Auto or manual"
                      inputMode="decimal"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                {/* Submarket */}
                <div>
                  <Label className="text-xs font-medium text-gray-700">Submarket</Label>
                  {submarketOptions.length === 0 ? (
                    <Select disabled>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="No submarkets defined" />
                      </SelectTrigger>
                    </Select>
                  ) : (
                    <Select
                      value={selectedProspect.submarketId || ''}
                      onValueChange={(value) => updateSelectedProspect('submarketId', value === 'none' ? undefined : value)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select submarket" />
                      </SelectTrigger>
                      <SelectContent className="z-[120]">
                        <SelectItem value="none">None</SelectItem>
                        {submarketOptions.map((submarketName) => (
                          <SelectItem key={submarketName} value={submarketName}>
                            {submarketName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Label className="text-xs font-medium text-gray-700">Notes</Label>
                    <VoiceDictationButton
                      className="h-7 w-7 p-0"
                      onTranscript={(text) => {
                        const existing = notesTextareaRef.current?.value || selectedProspect.notes || '';
                        const next = existing ? `${existing.trimEnd()} ${text}` : text;
                        if (notesTextareaRef.current) {
                          notesTextareaRef.current.value = next;
                        }
                        setSelectedProspect({ ...selectedProspect, notes: next });
                        queueSelectedProspectPatch('notes', next);
                      }}
                    />
                  </div>
                  <Textarea
                    ref={notesTextareaRef}
                    key={`notes-${selectedProspect.id}`}
                    defaultValue={selectedProspect.notes || ''}
                    onChange={(e) => queueSelectedProspectPatch('notes', e.target.value)}
                    placeholder="Add notes..."
                    rows={3}
                    className="resize-none text-sm"
                  />
                </div>
              </TabsContent>

              <TabsContent value="contact" className="space-y-4">
                <div>
                  <Label className="text-xs font-medium text-gray-700">Website</Label>
                  <Input
                    type="url"
                    key={`websiteUrl-${selectedProspect.id}`}
                    defaultValue={selectedProspect.websiteUrl || ''}
                    onChange={(e) => queueSelectedProspectPatch('websiteUrl', e.target.value || null)}
                    placeholder="Website URL"
                    className="h-8 text-sm"
                  />
                </div>

                {/* Contact Name & Company Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Contact Name</Label>
                    <Input
                      key={`contactName-${selectedProspect.id}`}
                      defaultValue={selectedProspect.contactName || ''}
                      onChange={(e) => queueSelectedProspectPatch('contactName', e.target.value)}
                      placeholder="Name"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Company</Label>
                    <Input
                      key={`contactCompany-${selectedProspect.id}`}
                      defaultValue={selectedProspect.contactCompany || ''}
                      onChange={(e) => queueSelectedProspectPatch('contactCompany', e.target.value)}
                      placeholder="Company"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                {/* Email & Phone Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Email</Label>
                    <Input
                      type="email"
                      key={`contactEmail-${selectedProspect.id}`}
                      defaultValue={selectedProspect.contactEmail || ''}
                      onChange={(e) => queueSelectedProspectPatch('contactEmail', e.target.value)}
                      placeholder="Email"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Phone</Label>
                    <PhoneInput
                      key={`contactPhone-${selectedProspect.id}`}
                      defaultValue={selectedProspect.contactPhone || ''}
                      onChange={(e) => queueSelectedProspectPatch('contactPhone', e.target.value)}
                      placeholder="(000) 000-0000"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Footer - Sticky */}
          <div className="sticky bottom-0 z-10 bg-white border-t px-4 py-3 relative">
            <div className="relative flex items-center justify-center">
              {xpToast && (
                <GamificationToast
                  key={xpToast.id}
                  xp={xpToast.xp}
                  label={xpToast.label}
                  onDone={() => setXpToast(null)}
                />
              )}

              <div className={`flex items-center gap-1 ${savePulse ? 'animate-pulse' : ''}`}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => void runQuickLog('call')}
                      variant="outline"
                      className="h-8 w-8 p-0"
                      aria-label="Quick log call"
                      title="Quick log call"
                      disabled={quickLogPendingType !== null}
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Quick call + 30d follow-up</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => void runQuickLog('meeting')}
                      variant="outline"
                      className="h-8 w-8 p-0"
                      aria-label="Quick log meeting"
                      title="Quick log meeting"
                      disabled={quickLogPendingType !== null}
                    >
                      <Handshake className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Quick meeting follow-up</TooltipContent>
                </Tooltip>
                {selectedProspect.geometry.type === 'Polygon' || selectedProspect.geometry.type === 'Rectangle' ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => {
                          if (editingProspectId === selectedProspect.id) {
                            void savePolygonChanges();
                          } else {
                            enablePolygonEditing(selectedProspect.id);
                          }
                        }}
                        variant="outline"
                        className="h-8 w-8 p-0"
                        aria-label={editingProspectId === selectedProspect.id ? 'Finish editing' : 'Edit shape'}
                        title={editingProspectId === selectedProspect.id ? 'Finish editing' : 'Edit shape'}
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
                        onClick={() => handleDrawPolygon()}
                        variant="outline"
                        className="h-8 w-8 p-0"
                        aria-label="Draw area"
                        title="Draw area"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Draw area</TooltipContent>
                  </Tooltip>
                )}
              </div>
              
              <Button 
                onClick={deleteSelectedProspect}
                variant="destructive"
                className="absolute right-0 h-8 px-3 text-xs"
                title="Delete Prospect"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            {selectedProspectLatLng && (
              <button
                type="button"
                className="mt-2 block w-full text-[10px] text-gray-400 hover:text-gray-600 text-center"
                onClick={() => void handleCopyCoordinates(selectedProspectLatLng.lat, selectedProspectLatLng.lng)}
                title="Click to copy coordinates"
              >
                {formatCoordinates(selectedProspectLatLng.lat, selectedProspectLatLng.lng)}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Import Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Import CSV Data</h3>
              <Button 
                onClick={() => setShowImportDialog(false)}
                variant="ghost" 
                size="sm"
                className="p-1"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <CSVUploader 
              onProspectsImport={(importedProspects) => {
                handleProspectsImport(importedProspects);
                setShowImportDialog(false);
              }} 
            />
          </div>
        </div>
      )}
      {/* Status Legend (bottom-left) with built-in chevron */}
      <div className="absolute bottom-3 left-3 z-40 sm:bottom-4 sm:left-4" style={{ pointerEvents: 'auto' }}>
        <StatusLegend
          selected={statusFilters}
          counts={statusCounts}
          onChange={setStatusFilters}
          onToggle={(key) => {
            const next = new Set(statusFilters);
            if (next.has(key)) next.delete(key); else next.add(key);
            setStatusFilters(next);
          }}
        />
      </div>
    </div>
  );
}
