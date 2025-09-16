import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, DrawingManager, Marker, Polygon, InfoWindow } from '@react-google-maps/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, MapIcon, Satellite, ChevronLeft, ChevronRight, X, Save, Trash2, Filter, ChevronDown, ChevronUp, User, LogOut, Settings, Edit3 } from 'lucide-react';

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
import { useAuth, useDemoAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { nsKey, readJSON, writeJSON } from '@/lib/storage';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';

// Import all necessary types and data
import type { 
  Prospect, 
  ProspectStatusType, 
  FollowUpTimeframeType,
  Submarket,
  Touch 
} from '@shared/schema';

const libraries: any = ['drawing', 'geometry', 'places'];

const STATUS_COLORS: Record<ProspectStatusType, string> = {
  'prospect': '#FBBF24',
  'contacted': '#3B82F6', 
  'listing': '#10B981',
  'client': '#8B5CF6',
  'no_go': '#EF4444'
};

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
  const { user } = useAuth();
  const { demoUser } = useDemoAuth();
  const { profile } = useProfile();
  
  // Memoize currentUser to prevent infinite loops
  const currentUser = useMemo(() => user || demoUser, [user, demoUser]);
  
  // Use profile submarkets as single source of truth (same as Knowledge page)
  const submarketOptions = profile?.submarkets || [];
  
  // Map state
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [center] = useState({ lat: 53.5461, lng: -113.4938 }); // Edmonton
  
  // Data state
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [submarkets, setSubmarkets] = useState<Submarket[]>([]);
  const [touches, setTouches] = useState<Touch[]>([]);
  
  // Filter state
  const [statusFilters, setStatusFilters] = useState<Set<ProspectStatusType>>(
    new Set(Object.keys(STATUS_COLORS) as ProspectStatusType[])
  );
  
  // Add submarket filter state
  const [selectedSubmarkets, setSelectedSubmarkets] = useState<Set<string>>(() => {
    return new Set(readJSON(nsKey(currentUser?.id, 'selectedSubmarkets'), []));
  });
  
  // UI state - load control panel state from user-scoped localStorage
  const [isControlPanelOpen, setIsControlPanelOpen] = useState(() => {
    return readJSON(nsKey(currentUser?.id, 'controlPanelOpen'), false);
  });
  const [isLegendOpen, setIsLegendOpen] = useState(() => {
    return readJSON(nsKey(currentUser?.id, 'legendOpen'), true);
  });
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const [editingProspectId, setEditingProspectId] = useState<string | null>(null);
  const [originalPolygonCoordinates, setOriginalPolygonCoordinates] = useState<[number, number][] | null>(null);
  const polygonRefs = useRef<Map<string, google.maps.Polygon>>(new Map());
  const [showImportDialog, setShowImportDialog] = useState(false);
  
  // Search pin state
  const [searchPin, setSearchPin] = useState<{ id: 'temp-search', lat: number, lng: number, address: string, businessName?: string | null, websiteUrl?: string | null } | null>(null);
  
  // Drawing state
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const [drawingForProspect, setDrawingForProspect] = useState<Prospect | null>(null);

  // Google Maps loader
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries,
  });

  // Reset state when user changes
  useEffect(() => {
    const handleUserChange = () => {
      setProspects([]);
      setSubmarkets([]);
      setTouches([]);
      setSelectedProspect(null);
      setIsEditPanelOpen(false);
      setEditingProspectId(null);
    };
    
    window.addEventListener('userChanged', handleUserChange);
    return () => window.removeEventListener('userChanged', handleUserChange);
  }, []);

  // Use React Query for authenticated data fetching
  const { data: prospectsData = [], refetch: refetchProspects } = useQuery<Prospect[]>({
    queryKey: ['/api/prospects'],
    enabled: !!currentUser,
    retry: false,
  });
  
  // Remove submarkets query - we'll use profile submarkets instead
  
  // Sync React Query data with local state
  useEffect(() => {
    setProspects(prospectsData);
  }, [prospectsData]);
  
  
  // Load touches from localStorage (keeping this for now)
  useEffect(() => {
    if (currentUser) {
      const savedData = readJSON<MapData | null>(nsKey(currentUser?.id, 'mapData'), null);
      if (savedData) {
        setTouches(savedData.touches || []);
      }
    }
  }, [currentUser?.id]);
  
  // Refetch data when user changes
  useEffect(() => {
    const handleUserChange = () => {
      if (currentUser) {
        refetchProspects();
      }
    };
    
    window.addEventListener('userChanged', handleUserChange);
    return () => {
      window.removeEventListener('userChanged', handleUserChange);
    };
  }, [currentUser?.id, refetchProspects]); // Use currentUser?.id to avoid infinite loop

  // Save data to user-scoped localStorage
  const saveData = useCallback(() => {
    const data: MapData = { prospects, submarkets: [], touches };
    writeJSON(nsKey(currentUser?.id, 'mapData'), data);
  }, [prospects, touches, currentUser?.id]);

  // Save data whenever prospects or touches change (but not on initial load)
  useEffect(() => {
    if (currentUser && prospects.length > 0) {
      const data: MapData = { prospects, submarkets: [], touches };
      writeJSON(nsKey(currentUser.id, 'mapData'), data);
    }
  }, [prospects, touches, currentUser?.id]);

  // Save UI state to user-scoped localStorage
  useEffect(() => {
    writeJSON(nsKey(currentUser?.id, 'controlPanelOpen'), isControlPanelOpen);
  }, [isControlPanelOpen, currentUser?.id]);

  useEffect(() => {
    writeJSON(nsKey(currentUser?.id, 'legendOpen'), isLegendOpen);
  }, [isLegendOpen, currentUser?.id]);
  
  // Save submarket filter state
  useEffect(() => {
    writeJSON(nsKey(currentUser?.id, 'selectedSubmarkets'), Array.from(selectedSubmarkets));
  }, [selectedSubmarkets, currentUser?.id]);

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
  }, []);

  const onMapUnmount = useCallback(() => {
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

          const response = await apiRequest('POST', '/api/prospects', newProspectData);
          const savedProspect = await response.json();
          setProspects(prev => [...prev, savedProspect]);
          setSelectedProspect(savedProspect);
        } else {
          // Update existing prospect
          const response = await apiRequest('PATCH', `/api/prospects/${drawingForProspect.id}`, updateData);
          const savedProspect = await response.json();
          setProspects(prev => prev.map(p => p.id === savedProspect.id ? savedProspect : p));
          setSelectedProspect(savedProspect);
        }

        // Invalidate React Query cache
        queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
        
        toast({
          title: "Polygon Added",
          description: `Polygon area added to prospect${acres ? ` (${acres.toFixed(2)} acres)` : ''}`,
        });

        // Reset drawing state and reopen edit panel
        setDrawingForProspect(null);
        setIsEditPanelOpen(true);
      } else {
        // Create new prospect (original behavior)
        const newProspectData = {
          name: `New ${e.type}`,
          status: 'prospect' as ProspectStatusType,
          notes: '',
          geometry,
          acres: acres ? acres.toString() : undefined
        };

        const response = await apiRequest('POST', '/api/prospects', newProspectData);
        const savedProspect = await response.json();
        setProspects(prev => [...prev, savedProspect]);
        
        queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
        
        toast({
          title: "Prospect Saved",
          description: `New ${e.type} prospect saved to your profile`,
        });
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
  }, [drawingForProspect, toast]);

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

  // CSV export handler
  const exportToCSV = useCallback(() => {
    const csvData = filteredProspects.map(prospect => ({
      name: prospect.name,
      status: prospect.status,
      notes: prospect.notes,
      lat: prospect.geometry.type === 'Point' ? 
           (prospect.geometry.coordinates as [number, number])[1] : 
           (prospect.geometry.coordinates as [number, number][][])[0][0][1],
      lng: prospect.geometry.type === 'Point' ? 
           (prospect.geometry.coordinates as [number, number])[0] : 
           (prospect.geometry.coordinates as [number, number][][])[0][0][0],
      submarketId: (prospect as any).submarketId || '',
      lastContactDate: (prospect as any).lastContactDate || '',
      createdDate: prospect.createdDate
    }));

    const headers = ['name', 'status', 'notes', 'lat', 'lng', 'submarketId', 'lastContactDate', 'createdDate'];
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => headers.map(header => `"${row[header as keyof typeof row]}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `prospects-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [filteredProspects]);

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

  // Submarket inference helper
  const inferSubmarketFromPoint = useCallback((point: { lat: number; lng: number }): string => {
    // For now, return empty string since we don't have submarket polygon logic
    // This can be enhanced later if submarkets are available
    return '';
  }, []);

  // Handle "Save as Prospect" from search pin - save immediately to database
  const handleSaveSearchPin = useCallback(async () => {
    if (!searchPin) return;
    
    try {
      const newProspectData = {
        name: searchPin.businessName || searchPin.address, // Use business name if available
        geometry: {
          type: 'Point' as const,
          coordinates: [searchPin.lng, searchPin.lat] as [number, number]
        },
        status: 'prospect' as ProspectStatusType,
        notes: '',
        submarketId: inferSubmarketFromPoint(searchPin) || '',
        businessName: searchPin.businessName || undefined,
        websiteUrl: searchPin.websiteUrl || undefined
      };

      console.log('Saving search pin as prospect:', newProspectData);
      
      // Save directly to database
      const response = await apiRequest('POST', '/api/prospects', newProspectData);
      const savedProspect = await response.json();
      
      // Add to prospects list
      setProspects(prev => [...prev, savedProspect]);
      
      // Invalidate query cache to refresh
      queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
      
      // Clear the search pin
      setSearchPin(null);
      
      // Show success message
      toast({
        title: "Prospect saved successfully",
        description: `"${savedProspect.name}" has been added to your map.`
      });
      
      console.log('Search pin saved as prospect:', savedProspect);
      
    } catch (error) {
      console.error('Error saving search pin as prospect:', error);
      toast({
        title: "Error saving prospect",
        description: "Failed to save prospect to database.",
        variant: "destructive"
      });
    }
  }, [searchPin, inferSubmarketFromPoint, toast, queryClient]);

  // Handle drawing polygon for point prospects
  const handleDrawPolygon = useCallback(() => {
    if (!drawingManagerRef.current || !selectedProspect) return;
    
    // Set the prospect we're drawing for
    setDrawingForProspect(selectedProspect);
    
    // Close the edit panel temporarily to allow drawing
    setIsEditPanelOpen(false);
    
    // Set drawing mode to polygon
    drawingManagerRef.current.setDrawingMode(window.google?.maps?.drawing?.OverlayType?.POLYGON);
    
    toast({
      title: "Draw Mode Enabled",
      description: "Click on the map to draw a polygon area for this prospect.",
    });
  }, [selectedProspect, toast]);

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
    
    // Enable polygon editing without auto-save
    setTimeout(() => {
      const polygon = polygonRefs.current.get(prospectId);
      if (polygon) {
        polygon.setEditable(true);
        polygon.setDraggable(true);
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

  // Update prospect handler - save to database
  const updateSelectedProspect = useCallback(async (field: keyof Prospect, value: any) => {
    if (!selectedProspect) return;
    
    const updatedProspect = { ...selectedProspect, [field]: value };
    setSelectedProspect(updatedProspect);
    
    try {
      // Save to database
      const response = await apiRequest('PATCH', `/api/prospects/${selectedProspect.id}`, { [field]: value });
      const savedProspect = await response.json();
      setProspects(prev => prev.map(p => p.id === savedProspect.id ? savedProspect : p));
      
      // Invalidate React Query cache to refresh knowledge dashboard
      queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
    } catch (error) {
      console.error('Error updating prospect:', error);
      // Fallback to local update
      setProspects(prev => prev.map(p => p.id === updatedProspect.id ? updatedProspect : p));
    }
  }, [selectedProspect]);

  // Delete prospect handler - remove from database
  const deleteSelectedProspect = useCallback(async () => {
    if (!selectedProspect) return;
    
    try {
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
  }, [selectedProspect, toast]);

  // API key change handler
  const handleApiKeyChange = useCallback((newApiKey: string) => {
    // Handle API key change if needed
    console.log('API key changed:', newApiKey);
  }, []);

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
    <div style={{ position: 'relative', height: '100vh', width: '100%', overflow: 'hidden' }}>
      {/* Map Canvas */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={center}
          zoom={11}
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
        >
          {/* Drawing Manager */}
          {isLoaded && (
            <DrawingManager
              onLoad={onDrawingManagerLoad}
              onOverlayComplete={onOverlayComplete}
              options={{
                drawingControl: true,
                drawingControlOptions: {
                  position: window.google?.maps?.ControlPosition?.TOP_LEFT,
                  drawingModes: [
                    window.google?.maps?.drawing?.OverlayType?.MARKER,
                    window.google?.maps?.drawing?.OverlayType?.POLYGON,
                  ],
                },
                polygonOptions: {
                  fillColor: '#3B82F6',
                  fillOpacity: 0.15,
                  strokeWeight: 2,
                  strokeColor: '#3B82F6',
                  clickable: false,
                  editable: false,
                  zIndex: 1,
                },
                markerOptions: {
                  draggable: false,
                },
              }}
            />
          )}

          {/* Render Prospects */}
          {filteredProspects.map((prospect) => {
            const color = STATUS_COLORS[prospect.status];
            
            if (prospect.geometry.type === 'Point') {
              const [lng, lat] = prospect.geometry.coordinates as [number, number];
              return (
                <Marker
                  key={prospect.id}
                  position={{ lat, lng }}
                  onClick={() => handleProspectClick(prospect)}
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

      {/* Floating UI Container - Non-blocking */}
      <div style={{ pointerEvents: 'none', position: 'absolute', inset: 0, zIndex: 40 }}>
        


        {/* Search Bar - Bottom Center */}
        <div 
          className="absolute bottom-20 left-1/2 transform -translate-x-1/2"
          style={{ pointerEvents: 'auto' }}
        >
          <SearchComponent 
            prospects={prospects}
            map={map}
            onProspectSelect={handleProspectClick}
            onLocationFound={handleLocationFound}
          />
        </div>

        {/* Filters Panel - Bottom Left */}
        <div 
          className="absolute bottom-20 left-4 flex flex-col gap-3"
          style={{ pointerEvents: 'auto' }}
        >
          {isLegendOpen ? (
            <div className="bg-white rounded-lg shadow-lg border">
              <div 
                className="flex items-center justify-between p-3 pb-2 cursor-pointer hover:bg-gray-50 rounded-t-lg"
                onClick={() => setIsLegendOpen(false)}
              >
                <div className="text-sm font-semibold">Filters</div>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </div>
              <div className="px-3 pb-3 space-y-1">
                {Object.entries(STATUS_COLORS).map(([status, color]) => (
                  <div
                    key={status}
                    className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-xs"
                    onClick={() => {
                      const newFilters = new Set(statusFilters);
                      if (statusFilters.has(status as ProspectStatusType)) {
                        newFilters.delete(status as ProspectStatusType);
                      } else {
                        newFilters.add(status as ProspectStatusType);
                      }
                      setStatusFilters(newFilters);
                    }}
                  >
                    <div 
                      className="w-3 h-3 rounded-full border" 
                      style={{ backgroundColor: color }}
                    />
                    <span className="capitalize flex-1">
                      {status.replace('_', ' ')}
                    </span>
                    {statusFilters.has(status as ProspectStatusType) && (
                      <span className="text-green-600">✓</span>
                    )}
                  </div>
                ))}
                
                {/* Submarket Filters */}
                {submarketOptions.length > 0 && (
                  <>
                    <div className="border-t border-gray-200 mt-2 pt-2">
                      <div className="text-xs font-medium text-gray-700 mb-1">Submarkets</div>
                      {submarketOptions.map((submarketName) => (
                        <div
                          key={submarketName}
                          className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded text-xs"
                          onClick={() => {
                            const newFilters = new Set(selectedSubmarkets);
                            if (selectedSubmarkets.has(submarketName)) {
                              newFilters.delete(submarketName);
                            } else {
                              newFilters.add(submarketName);
                            }
                            setSelectedSubmarkets(newFilters);
                          }}
                        >
                          <div className="w-3 h-3 rounded border bg-blue-100 border-blue-300" />
                          <span className="flex-1">{submarketName}</span>
                          {selectedSubmarkets.has(submarketName) && (
                            <span className="text-green-600">✓</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
                
                <button
                  onClick={() => {
                    setStatusFilters(new Set(Object.keys(STATUS_COLORS) as ProspectStatusType[]));
                    setSelectedSubmarkets(new Set());
                  }}
                  className="text-xs text-blue-600 hover:underline mt-2 w-full text-left"
                >
                  Clear all filters
                </button>
              </div>
            </div>
          ) : (
            <div 
              className="bg-white rounded-lg shadow-lg border border-gray-200 hover:bg-gray-50 cursor-pointer p-3"
              onClick={() => setIsLegendOpen(true)}
            >
              <div className="flex items-center justify-center">
                <Filter className="h-5 w-5 text-gray-700" />
              </div>
            </div>
          )}

          {/* Map View Toggle */}
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-1">
            <Button
              onClick={() => setMapType(mapType === 'roadmap' ? 'hybrid' : 'roadmap')}
              className="w-full h-8"
              variant="ghost"
              size="sm"
            >
              {mapType === 'roadmap' ? (
                <>
                  <Satellite className="h-4 w-4 mr-2" />
                  Hybrid
                </>
              ) : (
                <>
                  <MapIcon className="h-4 w-4 mr-2" />
                  Map
                </>
              )}
            </Button>
          </div>
        </div>


        {/* Developer Settings - Keep at bottom right but with margin */}
        <div 
          className="absolute bottom-4 right-4"
          style={{ pointerEvents: 'auto' }}
        >
          <DeveloperSettings onApiKeyChange={handleApiKeyChange} />
        </div>
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
                  {Object.entries(STATUS_COLORS).map(([status, color]) => (
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
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-sm capitalize">
                        {status.replace('_', ' ')}
                      </span>
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
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setIsEditPanelOpen(false)}
                className="text-gray-400 hover:text-gray-600 h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Body - Auto Height with Tabs */}
          <div className="px-4 py-3 space-y-4">
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
                        {Object.keys(STATUS_COLORS).map((status) => (
                          <SelectItem key={status} value={status}>
                            {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
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
                    <Input
                      type="tel"
                      value={selectedProspect.contactPhone || ''}
                      onChange={(e) => updateSelectedProspect('contactPhone', e.target.value)}
                      placeholder="Phone"
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
              <Button 
                onClick={async () => {
                  if (selectedProspect?.id === 'temp-prospect') {
                    // Create new prospect in database
                    try {
                      console.log('Creating new prospect:', selectedProspect);
                      const newProspectData = {
                        name: selectedProspect.name,
                        status: selectedProspect.status,
                        notes: selectedProspect.notes || '',
                        geometry: selectedProspect.geometry,
                        submarketId: selectedProspect.submarketId,
                        followUpTimeframe: selectedProspect.followUpTimeframe,
                        contactName: selectedProspect.contactName,
                        contactEmail: selectedProspect.contactEmail,
                        contactPhone: selectedProspect.contactPhone,
                        contactCompany: selectedProspect.contactCompany,
                        size: selectedProspect.size,
                        businessName: selectedProspect.businessName,
                        websiteUrl: selectedProspect.websiteUrl
                      };

                      const response = await apiRequest('POST', '/api/prospects', newProspectData);
                      const savedProspect = await response.json();
                      setProspects(prev => [...prev, savedProspect]);
                      
                      queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
                      
                      toast({
                        title: "Prospect saved successfully",
                        description: "Prospect has been added to your map."
                      });
                      
                      console.log('Prospect saved:', savedProspect);
                    } catch (error) {
                      console.error('Error saving prospect:', error);
                      toast({
                        title: "Error saving prospect",
                        description: "Failed to save prospect to database.",
                        variant: "destructive"
                      });
                    }
                  }
                  setIsEditPanelOpen(false);
                }}
                className="bg-blue-600 hover:bg-blue-700 flex-1 h-8 text-xs"
                title="Save Changes"
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                Save
              </Button>
              
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
                  // Show Edit button when not editing
                  <Button 
                    onClick={() => enablePolygonEditing(selectedProspect.id)}
                    variant="outline"
                    className="flex-1 h-8 text-xs"
                    title="Edit Polygon Points"
                  >
                    <Edit3 className="h-3.5 w-3.5 mr-1" />
                    Edit Shape
                  </Button>
                )
              ) : (
                <Button 
                  onClick={() => handleDrawPolygon()}
                  variant="outline"
                  className="flex-1 h-8 text-xs"
                  title="Draw Polygon Area"
                >
                  <Edit3 className="h-3.5 w-3.5 mr-1" />
                  Draw Area
                </Button>
              )}
              
              <Button 
                onClick={deleteSelectedProspect}
                variant="destructive"
                className="h-8 px-3 text-xs"
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
    </div>
  );
}