import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, DrawingManager, Marker, Polygon, InfoWindow } from '@react-google-maps/api';
import {
  TerraDraw,
  TerraDrawSelectMode,
  TerraDrawPointMode,
  TerraDrawLineStringMode,
  TerraDrawFreehandLineStringMode,
  TerraDrawPolygonMode,
  TerraDrawRectangleMode,
  TerraDrawCircleMode,
  type GeoJSONStoreFeatures,
} from 'terra-draw';
import { TerraDrawGoogleMapsAdapter } from 'terra-draw-google-maps-adapter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, MapIcon, Satellite, ChevronLeft, ChevronRight, X, Save, Trash2, Filter, User, LogOut, Settings, Edit3 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MapControls } from '@/features/map/MapControls';

// Standardized size options for consistent use across Prospects and Requirements
const STANDARD_SIZE_OPTIONS = [
  '< 5,000 SF',
  '5,000 - 10,000 SF',
  '10,000 - 25,000 SF',
  '25,000 - 50,000 SF',
  '50,000 - 100,000 SF',
  '100,000+ SF'
] as const;
import { SearchComponent } from '@/components/SearchComponent';
import { CSVUploader } from '@/components/CSVUploader';
import { DeveloperSettings } from '@/components/DeveloperSettings';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { uniqueSubmarketNames } from '@/lib/submarkets';
import { nsKey, readJSON, writeJSON } from '@/lib/storage';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { STATUS_META } from '@level-cre/shared/schema';
import { StatusLegend } from '@/features/map/StatusLegend';

// Import all necessary types and data
import type { 
  Prospect, 
  ProspectStatusType, 
  FollowUpTimeframeType,
  Submarket,
  Touch 
} from '@level-cre/shared/schema';

const libraries: any = ['drawing', 'geometry', 'places'];

// Colors and labels now come from shared STATUS_META

const FOLLOW_UP_LABELS: Record<FollowUpTimeframeType, string> = {
  '1_month': '1 Month',
  '3_month': '3 Months',
  '6_month': '6 Months',
  '1_year': '1 Year'
};

interface MapData {
  prospects: Prospect[];
  submarkets: Submarket[];
  touches: Touch[];
}

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
      return areaInSquareFeet / 43560; // Convert to acres
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
    return areaInSquareFeet / 43560;
    
  } catch (error) {
    console.error('Error calculating polygon area:', error);
    return null;
  }
};

export default function HomePage() {
  const { toast } = useToast();
  const { user, isDemoMode } = useAuth();
  const { profile } = useProfile();
  
  // Memoize currentUser to prevent infinite loops
  const currentUser = useMemo(() => user, [user]);
  
  // Use normalized, de-duplicated submarkets for consistent options
  const submarketOptions = uniqueSubmarketNames(profile?.submarkets || []);
  
  // Map state
  const DEFAULT_CENTER = { lat: 53.5461, lng: -113.4938 }; // Edmonton
  const DEFAULT_ZOOM = 11;
  const [map, setMap] = useState<google.maps.Map | null>(null);
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

  // Terra Draw state
  const terraDrawRef = useRef<TerraDraw | null>(null);
  const terraAdapterRef = useRef<any | null>(null);
  const terraStartedRef = useRef<boolean>(false);
  const terraBridgeAttachedRef = useRef<boolean>(false);
  const terraReboundDoneRef = useRef<boolean>(false);
  type TerraMode = 'select' | 'point' | 'linestring' | 'freehand-linestring' | 'polygon' | 'rectangle' | 'circle';
  const [terraMode, setTerraMode] = useState<TerraMode>('select');
  const [terraFeatures, setTerraFeatures] = useState<GeoJSONStoreFeatures[]>([]);
  
  // Data state
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [submarkets, setSubmarkets] = useState<Submarket[]>([]);
  const [touches, setTouches] = useState<Touch[]>([]);
  
  // Filter state
  const [statusFilters, setStatusFilters] = useState<Set<ProspectStatusType>>(
    new Set(Object.keys(STATUS_META) as ProspectStatusType[])
  );
  
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
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const [editingProspectId, setEditingProspectId] = useState<string | null>(null);
  const [originalPolygonCoordinates, setOriginalPolygonCoordinates] = useState<[number, number][] | null>(null);
  const polygonRefs = useRef<Map<string, google.maps.Polygon>>(new Map());
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Note: Escape key close handler moved below to avoid TDZ on closeEditPanel
  
  // Search pin state
  const [searchPin, setSearchPin] = useState<{ id: 'temp-search', lat: number, lng: number, address: string, businessName?: string | null, websiteUrl?: string | null } | null>(null);
  // Signal to clear the SearchBar input when a prospect is added
  const [clearSearchSignal, setClearSearchSignal] = useState(0);
  
  // Drawing state
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const [drawingForProspect, setDrawingForProspect] = useState<Prospect | null>(null);
  const drawingForProspectRef = useRef<Prospect | null>(null);
  useEffect(() => { drawingForProspectRef.current = drawingForProspect; }, [drawingForProspect]);

  // Google Maps loader (locked to .env key only)
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '') as string,
    libraries,
  });

  // Avoid resetting local state on user change; we invalidate queries instead (see listener below)

  // Use React Query for authenticated data fetching
  const { data: prospectsData = [], refetch: refetchProspects } = useQuery<Prospect[]>({
    queryKey: ['/api/prospects'],
    enabled: !!currentUser,
    retry: false,
  });
  
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

  // Filter prospects based on status and submarket
  const filteredProspects = prospects.filter(prospect => {
    const passesStatus = statusFilters.has(prospect.status);
    const passesSubmarket = selectedSubmarkets.size === 0 || 
                            (prospect.submarketId && selectedSubmarkets.has(prospect.submarketId));
    return passesStatus && passesSubmarket;
  });

  // Map event handlers
  const onMapLoad = useCallback((map: google.maps.Map) => {
    setMap(map);

    // Initialise Terra Draw (non-invasive test layer)
    try {
      console.log('[Terra] Initialising on map load');
      const adapter = new TerraDrawGoogleMapsAdapter({ lib: google.maps, map });
      // Adapter will bind to Google's interactive pane on 'ready' below
      const draw = new TerraDraw({
        adapter,
        modes: [
          new TerraDrawSelectMode(),
          new TerraDrawPointMode(),
          new TerraDrawLineStringMode(),
          new TerraDrawFreehandLineStringMode(),
          new TerraDrawPolygonMode(),
          new TerraDrawRectangleMode(),
          new TerraDrawCircleMode(),
        ],
      });
      draw.on('ready', () => {
        if (terraReboundDoneRef.current) return;
        try {
          const root = map.getDiv() as HTMLDivElement;
          // @ts-ignore ensure events come from a stable element
          adapter.getMapEventElement = () => root;
          draw.stop();
          draw.start();
          draw.setMode('select');
          terraReboundDoneRef.current = true;
          console.log('[Terra] rebound to map root');
        } catch (e) {
          console.warn('[Terra] unable to bind to map root', e);
        }
      });
      draw.on('finish', async (id) => {
        const feature = draw.getSnapshotFeature(id as any);
        const snap = draw.getSnapshot();
        console.log('[Terra] finish', feature);
        setTerraFeatures(snap);

        // If we are drawing for a selected prospect and it's a polygon, save it
        const target = drawingForProspectRef.current;
        if (target && feature && feature.geometry && feature.geometry.type === 'Polygon') {
          try {
            const newGeom = {
              type: 'Polygon' as const,
              coordinates: feature.geometry.coordinates as [number, number][][],
            };
            const acres = calculatePolygonAcres(newGeom);
            const response = await apiRequest('PATCH', `/api/prospects/${target.id}` , {
              geometry: newGeom,
              acres: acres ? acres.toString() : undefined,
            });
            const saved = await response.json();
            setProspects(prev => prev.map(p => p.id === saved.id ? saved : p));
            if (selectedProspect && selectedProspect.id === saved.id) {
              setSelectedProspect(saved);
            }
            toast({ title: 'Area saved', description: acres ? `${acres.toFixed(2)} acres` : 'Polygon saved' });
          } catch (err) {
            console.error('Failed to save polygon from Terra', err);
            toast({ title: 'Save failed', description: 'Could not save polygon to prospect', variant: 'destructive' });
          } finally {
            setDrawingForProspect(null);
            setTerraModeSafe('select');
          }
        }
      });
      draw.on('change', () => {
        const snap = draw.getSnapshot();
        console.log('[Terra] change', snap);
        setTerraFeatures(snap);
      });
      // Defer starting Terra until map projection/bounds are ready (first idle)
      terraDrawRef.current = draw;
      terraAdapterRef.current = adapter;
      setTerraMode('select');
      // Styles will be applied after Terra starts (onIdle)

      // expose for debugging
      // @ts-expect-error
      (window as any).__terra = draw;
      console.log('[Terra] mode:', draw.getMode(), 'state:', draw.getModeState());

      // Terra prepared
    } catch (err) {
      console.error('Terra Draw init failed:', err);
    }
  }, []);

  const onMapUnmount = useCallback(() => {
    try { terraDrawRef.current?.stop(); } catch {}
    terraDrawRef.current = null;
    terraAdapterRef.current = null;
    terraStartedRef.current = false;
    terraBridgeAttachedRef.current = false;
    terraReboundDoneRef.current = false;
    setMap(null);
  }, []);

  const onDrawingManagerLoad = useCallback((drawingManager: google.maps.drawing.DrawingManager) => {
    drawingManagerRef.current = drawingManager;
  }, []);

  const onOverlayComplete = useCallback(async (e: google.maps.drawing.OverlayCompleteEvent) => {
    let geometry: any;

    if (e.type === 'marker') {
      const marker = e.overlay as google.maps.Marker;
      const position = marker.getPosition();
      if (position) {
        geometry = {
          type: 'Point' as const,
          coordinates: [position.lng(), position.lat()] as [number, number]
        };
      }
      marker.setMap(null); // Remove the temporary overlay
    } else if (e.type === 'polygon') {
      const polygon = e.overlay as google.maps.Polygon;
      const path = polygon.getPath();
      const coordinates: [number, number][] = [];
      
      for (let i = 0; i < path.getLength(); i++) {
        const point = path.getAt(i);
        coordinates.push([point.lng(), point.lat()]);
      }
      
      // Close the polygon by adding first point at the end
      if (coordinates.length > 0) {
        coordinates.push(coordinates[0]);
      }
      
      geometry = {
        type: 'Polygon' as const,
        coordinates: [coordinates]
      };
      
      polygon.setMap(null); // Remove the temporary overlay
    } else if (e.type === 'rectangle') {
      const rect = e.overlay as google.maps.Rectangle;
      const bounds = rect.getBounds();
      if (bounds) {
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
        geometry = { type: 'Polygon' as const, coordinates: [ring] };
      }
      rect.setMap(null);
    }

    const acres = calculatePolygonAcres(geometry);

    try {
      if (drawingForProspect && e.type === 'polygon') {
        // Update existing prospect with polygon geometry
        const updateData = {
          geometry,
          acres: acres ? acres.toString() : undefined
        };

        if (drawingForProspect.id === 'temp-prospect') {
          // Create new prospect for search pin
          const newProspectData = {
            name: drawingForProspect.name,
            status: drawingForProspect.status,
            notes: drawingForProspect.notes,
            geometry,
            acres: acres ? acres.toString() : undefined,
            submarketId: drawingForProspect.submarketId
          };

          if (isDemoMode) {
            const localProspect = buildLocalProspect({
              name: newProspectData.name,
              status: newProspectData.status,
              notes: newProspectData.notes,
              geometry: newProspectData.geometry,
              acres: newProspectData.acres,
              submarketId: newProspectData.submarketId,
            } as any);
            const next = [...prospects, localProspect];
            persistProspects(next);
            setSelectedProspect(localProspect);
          } else {
            const response = await apiRequest('POST', '/api/prospects', newProspectData);
            const savedProspect = await response.json();
            setProspects(prev => [...prev, savedProspect]);
            setSelectedProspect(savedProspect);
          }
        } else {
          // Update existing prospect
          if (isDemoMode) {
            const updated = prospects.map(p => p.id === drawingForProspect.id ? { ...p, ...updateData } as Prospect : p);
            persistProspects(updated);
            const sel = updated.find(p => p.id === drawingForProspect.id) || null;
            setSelectedProspect(sel);
          } else {
            const response = await apiRequest('PATCH', `/api/prospects/${drawingForProspect.id}`, updateData);
            const savedProspect = await response.json();
            setProspects(prev => prev.map(p => p.id === savedProspect.id ? savedProspect : p));
            setSelectedProspect(savedProspect);
          }
        }
        // Invalidate React Query cache only if we saved via network
        if (!isDemoMode) {
          queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
        }
        
        toast({
          title: "Polygon Added",
          description: `Polygon area added to prospect${acres ? ` (${acres.toFixed(2)} acres)` : ''}`,
        });

        // Reset drawing state and reopen edit panel
        setDrawingForProspect(null);
        setIsEditPanelOpen(true);
      } else {
        // Create new prospect (original behavior)
        if (isDemoMode) {
          const newProspectData = {
            // Leave name empty in demo so the Address field placeholder shows and editing is smooth
            name: '',
            status: 'prospect' as ProspectStatusType,
            notes: '',
            geometry,
            acres: acres ? acres.toString() : undefined
          };
          const localProspect = buildLocalProspect({
            name: newProspectData.name,
            status: newProspectData.status,
            notes: newProspectData.notes,
            geometry: newProspectData.geometry,
            acres: newProspectData.acres,
          } as any);
          const next = [...prospects, localProspect];
          persistProspects(next);
          setSelectedProspect(localProspect);
          setIsEditPanelOpen(true);
          toast({ title: 'Prospect Saved', description: `New ${e.type} added locally (demo).` });
        } else {
          const response = await apiRequest('POST', '/api/prospects', newProspectData);
          const savedProspect = await response.json();
          setProspects(prev => [...prev, savedProspect]);
          setSelectedProspect(savedProspect);
          setIsEditPanelOpen(true);
          
          queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
          
          toast({
            title: "Prospect Saved",
            description: `New ${e.type} prospect saved to your profile`,
          });
        }
      }
    } catch (error) {
      console.error('Error saving prospect:', error);
      toast({
        title: "Error",
        description: "Failed to save prospect. Please try again.",
        variant: "destructive"
      });
    }

    // Reset drawing manager to selection mode after placing asset
    if (drawingManagerRef.current) {
      drawingManagerRef.current.setDrawingMode(null);
    }
  }, [drawingForProspect, toast, isDemoMode, prospects]);

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
  const handleLocationFound = useCallback((location: { lat: number; lng: number; address: string; businessName?: string | null; websiteUrl?: string | null }) => {
    console.log('Creating search pin at:', location);
    setSearchPin({
      id: 'temp-search',
      lat: location.lat,
      lng: location.lng,
      address: location.address,
      businessName: location.businessName,
      websiteUrl: location.websiteUrl
    });
  }, []);

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
    contactName: data.contactName,
    contactEmail: data.contactEmail,
    contactPhone: data.contactPhone,
    contactCompany: data.contactCompany,
    size: data.size,
    acres: data.acres,
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
        // Also persist business metadata and map company to Contact tab
        businessName: searchPin.businessName || undefined,
        contactCompany: searchPin.businessName || undefined,
        websiteUrl: searchPin.websiteUrl || undefined
      };

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
          websiteUrl: newProspectData.websiteUrl,
        } as any);
        const next = [...prospects, localProspect];
        persistProspects(next);
        setSelectedProspect(localProspect);
        setIsEditPanelOpen(true);
        setSearchPin(null);
        // Also clear the search input field
        setClearSearchSignal((s) => s + 1);
        toast({ title: 'Prospect saved (demo)', description: `"${localProspect.name}" added locally.` });
      } else {
        // Save directly to database
        const response = await apiRequest('POST', '/api/prospects', newProspectData);
        const savedProspect = await response.json();
        
        // Add to prospects list
        setProspects(prev => [...prev, savedProspect]);
        setSelectedProspect(savedProspect);
        setIsEditPanelOpen(true);
        
        // Invalidate query cache to refresh
        queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
        
        // Clear the search pin and input
        setSearchPin(null);
        setClearSearchSignal((s) => s + 1);
        
        // Show success message
        toast({
          title: "Prospect saved successfully",
          description: `"${savedProspect.name}" has been added to your map.`
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

  // Handle drawing polygon for point prospects
  const handleDrawPolygon = useCallback(() => {
    if (!drawingManagerRef.current) return;

    if (selectedProspect) {
      // If a prospect is selected, we are drawing for it.
      setDrawingForProspect(selectedProspect);
      setIsEditPanelOpen(false); // Close panel to allow drawing
      toast({
        title: "Draw Mode Enabled",
        description: `Click on the map to draw an area for ${selectedProspect.name}.`,
      });
    }
    
    // Set drawing mode to polygon
    drawingManagerRef.current.setDrawingMode(window.google?.maps?.drawing?.OverlayType?.POLYGON);
    
  }, [selectedProspect, toast]);

  // Terra Draw handlers
  const setTerraModeSafe = useCallback((mode: TerraMode) => {
    // Disable Google DrawingManager when using Terra Draw to avoid conflicts
    drawingManagerRef.current?.setDrawingMode(null);
    if (!terraDrawRef.current) return;
    try {
      console.log('[Terra] setMode', mode);
      terraDrawRef.current.setMode(mode);
      setTerraMode(mode);
      // Adjust map interactions to prioritise drawing
      if (map) {
        const drawing = mode !== 'select';
        map.setOptions({
          draggable: !drawing,
          disableDoubleClickZoom: drawing,
        } as google.maps.MapOptions);
      }
    } catch (e) {
      console.error('Failed to set Terra mode', e);
    }
  }, [map]);

  const clearTerra = useCallback(() => {
    try { terraDrawRef.current?.clear(); } catch {}
    setTerraFeatures([]);
    setTerraModeSafe('select');
  }, [setTerraModeSafe]);

  // Enable polygon editing
  const enablePolygonEditing = useCallback((prospectId: string) => {
    // Find the prospect to get original coordinates
    const prospect = prospects.find(p => p.id === prospectId);
    if (!prospect || prospect.geometry.type !== 'Polygon') {
      return;
    }
    
    // Store original coordinates for potential discard
    const originalCoords = prospect.geometry.coordinates[0] as [number, number][];
    setOriginalPolygonCoordinates(originalCoords);
    setEditingProspectId(prospectId);
    
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
              const response = await apiRequest('PATCH', `/api/prospects/${prospectId}`, {
                geometry: newGeom,
                acres: acres ? acres.toString() : undefined
              });
              const saved = await response.json();
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
        path.addListener('set_at', scheduleSave);
        path.addListener('insert_at', scheduleSave);
        path.addListener('remove_at', scheduleSave);
      }
    }, 100);
  }, [prospects]);

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
    
    try {
      const response = await apiRequest('PATCH', `/api/prospects/${editingProspectId}`, { 
        geometry: updatedGeometry,
        acres: acres ? acres.toString() : undefined
      });
      const savedProspect = await response.json();
      
      // Update local state
      setProspects(prev => prev.map(p => p.id === savedProspect.id ? savedProspect : p));
      
      if (selectedProspect && selectedProspect.id === savedProspect.id) {
        setSelectedProspect(savedProspect);
      }
      
      // Exit edit mode
      polygon.setEditable(false);
      polygon.setDraggable(false);
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
  }, [editingProspectId, selectedProspect, toast]);

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
    
    setEditingProspectId(null);
    setOriginalPolygonCoordinates(null);
    
    toast({
      title: "Changes Discarded",
      description: "Polygon reverted to original shape",
    });
  }, [editingProspectId, originalPolygonCoordinates, toast]);

  // Update prospect handler - debounced + optimistic to reduce flicker while typing
  const homeSaveTimerRef = useRef<number | null>(null);
  const homePendingPatchRef = useRef<Partial<Prospect>>({});
  const homeLastEditedIdRef = useRef<string | null>(null);

  const flushHomeQueuedSave = useCallback(async () => {
    if (!selectedProspect) return;
    const id = selectedProspect.id;
    const patch = homePendingPatchRef.current;
    homePendingPatchRef.current = {};
    if (!patch || Object.keys(patch).length === 0) return;
    try {
      const response = await apiRequest('PATCH', `/api/prospects/${id}`, patch);
      const savedProspect = await response.json();
      setProspects(prev => prev.map(p => p.id === savedProspect.id ? savedProspect : p));
      setSelectedProspect(prev => (prev && prev.id === savedProspect.id ? savedProspect : prev));
      // Invalidate to refresh any other views using this query
      queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
    } catch (error) {
      console.error('Error updating prospect:', error);
    }
  }, [selectedProspect, queryClient]);

  const updateSelectedProspect = useCallback((field: keyof Prospect, value: any) => {
    if (!selectedProspect) return;
    const id = selectedProspect.id;
    if (homeLastEditedIdRef.current && homeLastEditedIdRef.current !== id && homeSaveTimerRef.current) {
      window.clearTimeout(homeSaveTimerRef.current);
      homeSaveTimerRef.current = null;
      homePendingPatchRef.current = {};
    }
    homeLastEditedIdRef.current = id;

    const updatedProspect = { ...selectedProspect, [field]: value } as Prospect;
    setSelectedProspect(updatedProspect);

    homePendingPatchRef.current = { ...homePendingPatchRef.current, [field]: value };
    if (homeSaveTimerRef.current) window.clearTimeout(homeSaveTimerRef.current);
    homeSaveTimerRef.current = window.setTimeout(() => { homeSaveTimerRef.current = null; void flushHomeQueuedSave(); }, 450);
  }, [selectedProspect, flushHomeQueuedSave]);

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
      
      // Invalidate React Query cache to refresh knowledge dashboard
      queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
      
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
  }, [selectedProspect, isDemoMode, prospects, toast]);

  // API key change handler (no-op; use .env key)
  const handleApiKeyChange = useCallback((_newApiKey: string) => {
    // Intentionally no-op: key is sourced from VITE_GOOGLE_MAPS_API_KEY only.
  }, []);

  // Close the edit panel, flush pending changes, and reset drawing state
  const closeEditPanel = useCallback(() => {
    // Flush any pending debounced save
    if (homeSaveTimerRef.current) {
      window.clearTimeout(homeSaveTimerRef.current);
      homeSaveTimerRef.current = null;
      void flushHomeQueuedSave();
    }
    // Reset UI + selection
    setIsEditPanelOpen(false);
    setSelectedProspect(null);
    setDrawingForProspect(null);
    // Reset drawing tools
    try { drawingManagerRef.current?.setDrawingMode(null); } catch {}
    try { setTerraModeSafe('select'); } catch {}
    try { map?.setOptions({ draggable: true, disableDoubleClickZoom: false } as google.maps.MapOptions); } catch {}
  }, [flushHomeQueuedSave, setTerraModeSafe, map]);

  // Close Edit Panel on Escape key
  useEffect(() => {
    if (!isEditPanelOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeEditPanel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isEditPanelOpen, closeEditPanel]);

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
    <div style={{ position: 'relative', height: 'calc(100vh - 4rem)', width: '100%', overflow: 'hidden' }}>
      {/* Map Canvas */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={center}
          zoom={zoom}
          onLoad={onMapLoad}
          onUnmount={onMapUnmount}
          mapTypeId={mapType}
          options={{
            disableDefaultUI: true,
            zoomControl: true,
            mapTypeControl: false,
            scaleControl: true,
            streetViewControl: false,
            rotateControl: false,
            fullscreenControl: true,
            gestureHandling: 'greedy'
          }}
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
            // Start Terra once after projection/bounds are ready
            if (!terraStartedRef.current && terraDrawRef.current) {
              try {
                const draw = terraDrawRef.current;
                draw.start();
                draw.setMode('select');
                // Apply high-contrast styles now that Terra is enabled
                try {
                  draw.updateModeOptions('polygon', {
                    styles: {
                      fillColor: '#2563EB',
                      fillOpacity: 0.2,
                      outlineColor: '#2563EB',
                      outlineWidth: 2,
                      closingPointColor: '#2563EB',
                      closingPointOutlineColor: '#ffffff',
                      closingPointOutlineWidth: 2,
                      closingPointWidth: 6,
                      editedPointColor: '#10B981',
                      editedPointOutlineColor: '#ffffff',
                      editedPointOutlineWidth: 2,
                      editedPointWidth: 6,
                      coordinatePointColor: '#2563EB',
                      coordinatePointOutlineColor: '#ffffff',
                      coordinatePointOutlineWidth: 2,
                      coordinatePointWidth: 5,
                      snappingPointColor: '#F59E0B',
                      snappingPointOutlineColor: '#ffffff',
                      snappingPointOutlineWidth: 2,
                      snappingPointWidth: 6,
                    },
                  } as any);
                  draw.updateModeOptions('rectangle', {
                    styles: {
                      fillColor: '#059669',
                      fillOpacity: 0.2,
                      outlineColor: '#059669',
                      outlineWidth: 2,
                    },
                  } as any);
                } catch (styleErr) {
                  console.warn('[Terra] Failed to set styles after start', styleErr);
                }
                terraStartedRef.current = true;
                console.log('[Terra] started after idle');
              } catch (e) {
                console.warn('[Terra] failed to start after idle', e);
              }
            }
          }}
        >
          {/* Google DrawingManager re-enabled */}
          {isLoaded && (
            <DrawingManager
              onLoad={onDrawingManagerLoad}
              onOverlayComplete={onOverlayComplete}
              options={{
                drawingControl: false,
                polygonOptions: {
                  fillColor: '#3B82F6',
                  fillOpacity: 0.15,
                  strokeWeight: 2,
                  strokeColor: '#3B82F6',
                  clickable: true,
                  editable: false,
                  zIndex: 1,
                },
                markerOptions: {
                  draggable: false,
                },
                rectangleOptions: {
                  fillColor: '#059669',
                  fillOpacity: 0.15,
                  strokeWeight: 2,
                  strokeColor: '#059669',
                  clickable: true,
                  editable: false,
                  zIndex: 1,
                },
              }}
            />
          )}

          {/* Render Prospects */}
          {filteredProspects.map((prospect) => {
          const color = STATUS_META[prospect.status].color;
            
            if (prospect.geometry.type === 'Point') {
              const [lng, lat] = prospect.geometry.coordinates as [number, number];
              return (
                <Marker
                  key={prospect.id}
                  position={{ lat, lng }}
                  onClick={() => handleProspectClick(prospect)}
                  clickable={terraMode === 'select'}
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
            } else if (prospect.geometry.type === 'Polygon') {
              // Handle polygon coordinates
              const coords = prospect.geometry.coordinates as [number, number][][] | [number, number][];
              let coordinates: [number, number][];
              
              if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
                // New format: [[[lng, lat], ...]]
                coordinates = coords[0] as [number, number][];
              } else {
                // Old format: [[lng, lat], ...]
                coordinates = coords as [number, number][];
              }
              
              return (
                <Polygon
                  key={prospect.id}
                  paths={coordinates.map(([lng, lat]) => ({ lat, lng }))}
                  onClick={() => handleProspectClick(prospect)}
                  onLoad={(polygon) => {
                    // Store polygon reference for later use
                    polygonRefs.current.set(prospect.id, polygon);
                  }}
                  options={{
                    fillColor: color,
                    fillOpacity: editingProspectId === prospect.id ? 0.25 : 0.15,
                    strokeColor: color,
                    strokeWeight: editingProspectId === prospect.id ? 3 : 2,
                    strokeOpacity: 0.8,
                    clickable: true,
                    editable: editingProspectId === prospect.id,
                    draggable: editingProspectId === prospect.id,
                    zIndex: editingProspectId === prospect.id ? 2 : 1,
                  }}
                />
              );
            }
            return null;
          })}

          {/* Search Pin */}
          {searchPin && (
            <>
              <Marker
                position={{ lat: searchPin.lat, lng: searchPin.lng }}
                icon={{
                  path: window.google?.maps?.SymbolPath?.CIRCLE,
                  fillColor: '#FF6B35',
                  fillOpacity: 1,
                  strokeWeight: 3,
                  strokeColor: '#ffffff',
                  scale: 12,
                }}
              />
              <InfoWindow
                position={{ lat: searchPin.lat, lng: searchPin.lng }}
                onCloseClick={() => setSearchPin(null)}
              >
                <div className="p-2 max-w-xs">
                  <h3 className="font-medium text-sm mb-2">{searchPin.address}</h3>
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
                      ✕
                    </button>
                  </div>
                </div>
              </InfoWindow>
            </>
          )}
        </GoogleMap>
      </div>

      {/* Map Controls - Top Left (authoritative) */}
      <MapControls
        onSearch={(location) => {
          handleLocationFound(location);
          if (map) {
            map.panTo({ lat: location.lat, lng: location.lng });
            map.setZoom(15);
          }
          setCenter({ lat: location.lat, lng: location.lng });
          setZoom(15);
        }}
        bounds={bounds}
        defaultCenter={DEFAULT_CENTER}
        clearSearchSignal={clearSearchSignal}
        onPolygon={() => {
          if (selectedProspect) {
            setDrawingForProspect(selectedProspect);
            toast({ title: 'Draw Mode', description: `Draw an area for ${selectedProspect.name}.` });
          }
          if (drawingManagerRef.current) {
            drawingManagerRef.current.setDrawingMode(window.google?.maps?.drawing?.OverlayType?.POLYGON);
          }
        }}
        onPin={() => {
          if (drawingManagerRef.current) {
            drawingManagerRef.current.setDrawingMode(window.google?.maps?.drawing?.OverlayType?.MARKER);
          }
        }}
        onPan={() => {
          if (drawingManagerRef.current) {
            drawingManagerRef.current.setDrawingMode(null);
          }
          toast({ title: 'Pan Tool', description: 'Pan/hand tool selected. You can now move the map.' });
        }}
        mapType={mapType}
        onMapTypeChange={setMapType}
        onMyLocation={() => {
          if (map) {
            map.panTo(DEFAULT_CENTER);
            map.setZoom(DEFAULT_ZOOM);
          }
          setCenter(DEFAULT_CENTER);
          setZoom(DEFAULT_ZOOM);
          writeJSON(nsKey(currentUser?.id, 'mapViewport'), { ...DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
        }}
        onRectangle={() => {
          if (drawingManagerRef.current) {
            drawingManagerRef.current.setDrawingMode(window.google?.maps?.drawing?.OverlayType?.RECTANGLE);
          }
        }}
        onSelect={() => setTerraModeSafe('select')}
        activeTerraMode={terraMode as any}
      />

      {/* Developer Settings - Keep at bottom right but with margin */}
      <div 
        className="absolute bottom-4 right-4"
        style={{ pointerEvents: 'auto' }}
      >
        <DeveloperSettings />
      </div>

      {/* Control Panel - Slides in from left */}
      {isControlPanelOpen && (
        <div 
          className="absolute top-0 left-0 h-full w-80 bg-white shadow-xl border-r border-gray-200 z-40"
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
          className="absolute top-0 right-0 w-80 h-auto max-h-[90vh] flex flex-col bg-white shadow-xl border-l border-gray-200 z-50 overflow-y-auto"
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
                    onClick={closeEditPanel}
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
                {/* Address */}
                <div>
                  <Label className="text-xs font-medium text-gray-700">Address</Label>
                  <Input
                    value={selectedProspect.name}
                    onChange={(e) => updateSelectedProspect('name', e.target.value)}
                    placeholder="Property address"
                    className="h-8 text-sm"
                  />
                </div>

                {/* Business Information Row */}
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
                    <Select
                      value={selectedProspect.followUpTimeframe || "none"}
                      onValueChange={(value: FollowUpTimeframeType | "none") => 
                        updateSelectedProspect('followUpTimeframe', value === "none" ? undefined : value)
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
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

                {/* Size and Acres Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Size</Label>
                    <Select
                      value={selectedProspect.size || ''}
                      onValueChange={(value) => updateSelectedProspect('size', value === 'none' ? '' : value)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {STANDARD_SIZE_OPTIONS.map((sizeOption) => (
                          <SelectItem key={sizeOption} value={sizeOption}>
                            {sizeOption}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Acres</Label>
                    <Input
                      value={selectedProspect.acres || ''}
                      placeholder="Auto-calculated from polygon"
                      className="h-8 text-sm bg-gray-50"
                      disabled
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
                      <SelectContent>
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
                  <Label className="text-xs font-medium text-gray-700">Notes</Label>
                  <Textarea
                    value={selectedProspect.notes}
                    onChange={(e) => updateSelectedProspect('notes', e.target.value)}
                    placeholder="Add notes..."
                    rows={3}
                    className="resize-none text-sm"
                  />
                </div>
              </TabsContent>

              <TabsContent value="contact" className="space-y-4">
                {/* Contact Name & Company Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Contact Name</Label>
                    <Input
                      value={selectedProspect.contactName || ''}
                      onChange={(e) => updateSelectedProspect('contactName', e.target.value)}
                      placeholder="Name"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Company</Label>
                    <Input
                      value={selectedProspect.contactCompany || ''}
                      onChange={(e) => updateSelectedProspect('contactCompany', e.target.value)}
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
                      value={selectedProspect.contactEmail || ''}
                      onChange={(e) => updateSelectedProspect('contactEmail', e.target.value)}
                      placeholder="Email"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-700">Phone</Label>
                    <PhoneInput
                      value={selectedProspect.contactPhone || ''}
                      onChange={(e) => updateSelectedProspect('contactPhone', e.target.value)}
                      placeholder="(000) 000-0000"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Footer - Sticky */}
          <div className="sticky bottom-0 z-10 bg-white border-t px-4 py-3">
            <div className="flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={closeEditPanel}
                    variant="outline"
                    className="h-8 w-8 p-0 text-xs"
                    aria-label="Save and close"
                    title="Save and close"
                  >
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save and close</TooltipContent>
              </Tooltip>
              
              {selectedProspect.geometry.type === 'Polygon' ? (
                editingProspectId === selectedProspect.id ? (
                  // Show Save/Discard buttons when editing
                  <div className="flex gap-2 flex-1">
                    <Button 
                      onClick={savePolygonChanges}
                      className="bg-green-600 hover:bg-green-700 flex-1 h-8 text-xs"
                      title="Save Changes"
                    >
                      <Save className="h-3.5 w-3.5 mr-1" />
                      Save Changes
                    </Button>
                    <Button 
                      onClick={discardPolygonChanges}
                      variant="outline"
                      className="flex-1 h-8 text-xs hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                      title="Discard Changes"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Discard
                    </Button>
                  </div>
                ) : (
                  // Show Edit button when not editing (icon-only)
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        onClick={() => enablePolygonEditing(selectedProspect.id)}
                        variant="outline"
                        className="h-8 w-8 p-0"
                        aria-label="Edit shape"
                        title="Edit shape"
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
              
              <Button 
                onClick={deleteSelectedProspect}
                variant="destructive"
                className="h-8 px-3 text-xs ml-auto"
                title="Delete Prospect"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
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
      <div className="absolute bottom-4 left-4 z-20" style={{ pointerEvents: 'auto' }}>
        <StatusLegend
          selected={statusFilters}
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
