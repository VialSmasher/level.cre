import { useState, useEffect, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, DrawingManager, Marker, Polygon } from '@react-google-maps/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DeveloperSettings } from '@/components/DeveloperSettings';
import { CSVUploader } from '@/components/CSVUploaderNew';
import { SearchComponent } from '@/components/SearchComponent';

import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp,
  MapPin, 
  Edit3, 
  Trash2, 
  X,
  Save,
  Plus,
  Minus,
  Satellite,
  Map as MapIcon,
  Search,
  Download,
  Phone,
  Mail,
  MapPin as VisitIcon,
  FileText
} from 'lucide-react';
import { UpdatedProspect as Prospect, ProspectStatusType, Submarket, Touch, InsertTouch } from '@shared/schema';

const mapContainerStyle = {
  width: '100%',
  height: '100vh',
};

const center = {
  lat: 53.5461,
  lng: -113.4938, // Edmonton
};

const STATUS_COLORS = {
  prospect: '#3B82F6',
  contacted: '#F59E0B',
  followup: '#8B5CF6',
  listing: '#10B981',
  client: '#059669',
  no_go: '#EF4444',
};

// Static libraries array to prevent LoadScript reloading
const GOOGLE_MAPS_LIBRARIES: ("drawing" | "geometry" | "places")[] = ["drawing", "places"];

// Initialize API key outside component to prevent re-initialization
const getApiKey = () => {
  const override = localStorage.getItem('google-maps-api-key-override');
  const envKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  return override || envKey || '';
};

const INITIAL_API_KEY = getApiKey();

export default function HomePage() {
  // API Key Management
  const [apiKey, setApiKey] = useState<string>(INITIAL_API_KEY);
  
  // Google Maps
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: INITIAL_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  // UI State
  const [isControlPanelOpen, setIsControlPanelOpen] = useState(() => 
    localStorage.getItem('control-panel-open') !== 'false'
  );
  const [isLegendOpen, setIsLegendOpen] = useState(() => 
    localStorage.getItem('legend-open') !== 'false'
  );
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const [isLogActivityOpen, setIsLogActivityOpen] = useState(false);
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>('roadmap');


  // Data State
  const [prospects, setProspects] = useState<Prospect[]>(() => {
    const saved = localStorage.getItem('prospects');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [submarkets, setSubmarkets] = useState<Submarket[]>(() => {
    const saved = localStorage.getItem('submarkets');
    return saved ? JSON.parse(saved) : [];
  });

  const [touches, setTouches] = useState<Touch[]>(() => {
    const saved = localStorage.getItem('touches');
    return saved ? JSON.parse(saved) : [];
  });

  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [statusFilters, setStatusFilters] = useState<Set<ProspectStatusType>>(() => {
    const saved = localStorage.getItem('status-filters');
    return saved ? new Set(JSON.parse(saved) as ProspectStatusType[]) : new Set(['prospect', 'contacted', 'followup', 'listing', 'client', 'no_go'] as ProspectStatusType[]);
  });
  const [selectedSubmarket, setSelectedSubmarket] = useState<string>('all');

  // Map State
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [drawingManager, setDrawingManager] = useState<google.maps.drawing.DrawingManager | null>(null);
  
  // Polygon Editing State
  const [editingProspectId, setEditingProspectId] = useState<string | null>(null);
  const [editablePolygons, setEditablePolygons] = useState<Map<string, google.maps.Polygon>>(new Map());

  // Handle API key changes (requires page reload for Google Maps)
  const handleApiKeyChange = (newKey: string) => {
    const finalKey = newKey || import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    setApiKey(finalKey);
    // Reload page to reinitialize Google Maps with new API key
    window.location.reload();
  };

  // Save data to localStorage and dispatch custom events for live updates
  useEffect(() => {
    localStorage.setItem('prospects', JSON.stringify(prospects));
    window.dispatchEvent(new CustomEvent('localStorageUpdate'));
  }, [prospects]);

  useEffect(() => {
    localStorage.setItem('submarkets', JSON.stringify(submarkets));
    window.dispatchEvent(new CustomEvent('localStorageUpdate'));
  }, [submarkets]);

  // Save UI state
  useEffect(() => {
    localStorage.setItem('control-panel-open', String(isControlPanelOpen));
  }, [isControlPanelOpen]);

  useEffect(() => {
    localStorage.setItem('legend-open', String(isLegendOpen));
  }, [isLegendOpen]);

  useEffect(() => {
    localStorage.setItem('status-filters', JSON.stringify(Array.from(statusFilters)));
  }, [statusFilters]);

  useEffect(() => {
    localStorage.setItem('touches', JSON.stringify(touches));
    window.dispatchEvent(new CustomEvent('localStorageUpdate'));
  }, [touches]);



  const onLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  const onDrawingManagerLoad = useCallback((drawingManagerInstance: google.maps.drawing.DrawingManager) => {
    setDrawingManager(drawingManagerInstance);
  }, []);

  const onOverlayComplete = useCallback((e: google.maps.drawing.OverlayCompleteEvent) => {
    let coordinates: [number, number] | [number, number][][];
    
    if (e.type === 'marker') {
      const marker = e.overlay as google.maps.Marker;
      const position = marker.getPosition()!;
      coordinates = [position.lng(), position.lat()];
    } else {
      const polygon = e.overlay as google.maps.Polygon;
      const ringCoordinates = polygon.getPath().getArray().map((latLng: google.maps.LatLng) => [latLng.lng(), latLng.lat()]) as [number, number][];
      coordinates = [ringCoordinates]; // Wrap in array for polygon ring structure
    }

    const newProspect: Prospect = {
      id: `prospect-${Date.now()}`,
      name: `New ${e.type === 'marker' ? 'Marker' : 'Polygon'}`,
      status: 'prospect',
      notes: '',
      createdDate: new Date().toISOString(),
      submarketId: undefined,
      lastContactDate: undefined,
      geometry: {
        type: e.type === 'marker' ? 'Point' : 'Polygon',
        coordinates: e.type === 'marker' ? coordinates : coordinates
      }
    };

    setProspects(prev => [...prev, newProspect]);
    setSelectedProspect(newProspect);
    setIsEditPanelOpen(true);
    
    // Remove the overlay from the map since we'll render our own
    e.overlay.setMap(null);
  }, []);

  const handleProspectClick = (prospect: Prospect) => {
    setSelectedProspect(prospect);
    setIsEditPanelOpen(true);
  };

  const updateSelectedProspect = (field: keyof Prospect, value: any) => {
    if (!selectedProspect) return;
    
    const updated = { ...selectedProspect, [field]: value };
    setSelectedProspect(updated);
    setProspects(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  const deleteSelectedProspect = () => {
    if (!selectedProspect) return;
    setProspects(prev => prev.filter(p => p.id !== selectedProspect.id));
    setSelectedProspect(null);
    setIsEditPanelOpen(false);
  };

  const addSubmarket = () => {
    const name = prompt('Enter submarket name:');
    if (!name) return;
    
    const newSubmarket: Submarket = {
      id: `submarket-${Date.now()}`,
      name,
      color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
      isActive: true
    };
    
    setSubmarkets(prev => [...prev, newSubmarket]);
  };

  const removeSubmarket = (id: string) => {
    setSubmarkets(prev => prev.map(s => s.id === id ? { ...s, isActive: false } : s));
    setProspects(prev => prev.map(p => p.submarketId === id ? { ...p, submarketId: undefined } : p));
  };



  const filteredProspects = prospects.filter(prospect => {
    const statusMatch = statusFilters.has(prospect.status);
    const submarketMatch = selectedSubmarket === 'all' || prospect.submarketId === selectedSubmarket;
    return statusMatch && submarketMatch;
  });

  const handleProspectsImport = (newProspects: Prospect[]) => {
    setProspects(prev => [...prev, ...newProspects]);
    // Ensure "prospect" status is always enabled for imported data
    setStatusFilters(prev => new Set([...Array.from(prev), 'prospect' as ProspectStatusType]));
  };

  const addTouch = (prospectId: string, kind: 'call' | 'email' | 'visit' | 'note', notes?: string) => {
    const newTouch: Touch = {
      id: `touch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      prospectId,
      kind,
      createdAt: new Date().toISOString(),
      notes: notes || ''
    };
    setTouches(prev => [...prev, newTouch]);
  };

  // Polygon Editing Functions
  const enablePolygonEditing = (prospectId: string) => {
    setEditingProspectId(prospectId);
  };

  const disablePolygonEditing = () => {
    // Save any changes and cleanup
    if (editingProspectId) {
      const editablePolygon = editablePolygons.get(editingProspectId);
      if (editablePolygon) {
        updatePolygonFromEditable(editingProspectId, editablePolygon);
      }
    }
    setEditingProspectId(null);
  };

  const updatePolygonFromEditable = (prospectId: string, polygon: google.maps.Polygon) => {
    const newCoordinates = polygon.getPath().getArray().map((latLng: google.maps.LatLng) => [latLng.lng(), latLng.lat()]) as [number, number][];
    
    setProspects(prev => prev.map(p => {
      if (p.id === prospectId && p.geometry.type === 'Polygon') {
        return {
          ...p,
          geometry: {
            ...p.geometry,
            coordinates: [newCoordinates] // Wrap in array for polygon ring structure
          }
        };
      }
      return p;
    }));
  };

  const onPolygonLoad = useCallback((polygon: google.maps.Polygon, prospectId: string) => {
    setEditablePolygons(prev => new Map(prev.set(prospectId, polygon)));
    
    // Add listeners for polygon changes
    polygon.getPath().addListener('set_at', () => {
      if (editingProspectId === prospectId) {
        updatePolygonFromEditable(prospectId, polygon);
      }
    });
    
    polygon.getPath().addListener('insert_at', () => {
      if (editingProspectId === prospectId) {
        updatePolygonFromEditable(prospectId, polygon);
      }
    });
    
    polygon.getPath().addListener('remove_at', () => {
      if (editingProspectId === prospectId) {
        updatePolygonFromEditable(prospectId, polygon);
      }
    });
  }, [editingProspectId]);

  const onPolygonUnmount = useCallback((prospectId: string) => {
    setEditablePolygons(prev => {
      const newMap = new Map(prev);
      newMap.delete(prospectId);
      return newMap;
    });
  }, []);

  const exportToCSV = () => {
    const csvData = filteredProspects.map(prospect => ({
      name: prospect.name,
      status: prospect.status,
      notes: prospect.notes,
      lat: prospect.geometry.type === 'Point' ? (prospect.geometry.coordinates as [number, number])[1] : (prospect.geometry.coordinates as [number, number][])[0][1],
      lng: prospect.geometry.type === 'Point' ? (prospect.geometry.coordinates as [number, number])[0] : (prospect.geometry.coordinates as [number, number][])[0][0],
      submarketId: prospect.submarketId || '',
      lastContactDate: prospect.lastContactDate || '',
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
  };

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
          onLoad={onLoad}
          onUnmount={onUnmount}
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
          } else {
            // Handle both old and new polygon coordinate formats
            let coordinates: [number, number][];
            const coords = prospect.geometry.coordinates as any;
            
            // Check if it's already a nested array (new format)
            if (Array.isArray(coords) && Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
              coordinates = coords[0]; // Get the outer ring from new format [[[lng, lat], ...]]
            } 
            // Check if it's a flat array of coordinate pairs (old format)
            else if (Array.isArray(coords) && Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
              coordinates = coords; // Use directly [[lng, lat], ...]
            }
            else {
              console.error('Invalid polygon coordinates format:', coords);
              return null;
            }
            
            const isEditing = editingProspectId === prospect.id;
            
            return (
              <Polygon
                key={prospect.id}
                paths={coordinates.map(([lng, lat]) => ({ lat, lng }))}
                onClick={() => handleProspectClick(prospect)}
                onLoad={(polygon) => onPolygonLoad(polygon, prospect.id)}
                onUnmount={() => onPolygonUnmount(prospect.id)}
                options={{
                  fillColor: color,
                  fillOpacity: isEditing ? 0.25 : 0.15,
                  strokeColor: color,
                  strokeWeight: isEditing ? 3 : 2,
                  strokeOpacity: isEditing ? 1 : 0.8,
                  clickable: true,
                  editable: isEditing,
                  draggable: isEditing,
                  zIndex: isEditing ? 100 : 1,
                }}
              />
            );
          }
        })}
        </GoogleMap>
      </div>

      {/* Floating UI Container - Non-blocking */}
      <div style={{ pointerEvents: 'none', position: 'absolute', inset: 0, zIndex: 40 }}>
        
        {/* Search Bar - Top Left */}
        <SearchComponent 
          prospects={prospects}
          map={map}
          onProspectSelect={handleProspectClick}
        />

        {/* Legend - Bottom Left */}
        <div 
          className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg border p-3"
          style={{ pointerEvents: 'auto' }}
        >
          <div className="text-sm font-semibold mb-2">Legend</div>
          <div className="space-y-1">
            {Object.entries(STATUS_COLORS).map(([status, color]) => (
              <div
                key={status}
                className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded"
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
                <span className="text-xs capitalize">
                  {status.replace('_', ' ')}
                </span>
                {statusFilters.has(status as ProspectStatusType) && (
                  <span className="text-xs text-green-600">✓</span>
                )}
              </div>
            ))}
            <button
              onClick={() => setStatusFilters(new Set(Object.keys(STATUS_COLORS) as ProspectStatusType[]))}
              className="text-xs text-blue-600 hover:underline mt-2"
            >
              Clear filters
            </button>
          </div>
        </div>

        {/* Top Right Controls */}
        <div 
          className="absolute top-4 right-4 flex flex-col gap-2"
          style={{ pointerEvents: 'auto' }}
        >
          {/* Map Type Toggle */}
          <Button
            onClick={() => setMapType(mapType === 'roadmap' ? 'hybrid' : 'roadmap')}
            className="bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            variant="outline"
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

          {/* Import/Export */}
          <div className="flex gap-2">
            <CSVUploader onProspectsImport={handleProspectsImport} />
            <Button onClick={exportToCSV} variant="outline" size="sm" className="bg-white">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>

          {/* Control Panel Toggle */}
          <Button
            onClick={() => setIsControlPanelOpen(!isControlPanelOpen)}
            className="bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            variant="outline"
            size="sm"
          >
            {isControlPanelOpen ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Bottom Right - Profile/User */}
        <div 
          className="absolute bottom-4 right-4"
          style={{ pointerEvents: 'auto' }}
        >
          <DeveloperSettings onApiKeyChange={handleApiKeyChange} />
        </div>
      </div>

      {/* Control Panel */}
      {isControlPanelOpen && (
        <div 
          className="absolute top-16 right-4 bg-white rounded-lg shadow-lg border p-4 w-72"
          style={{ pointerEvents: 'auto' }}
        >
          <div className="space-y-4">
            <div className="text-sm font-semibold text-gray-800">Control Panel</div>
            <div className="text-xs text-gray-600">Settings and filters will appear here</div>
          </div>
        </div>
      )}
    </div>
  );
            {/* Status Filters */}
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2">Status Filters</Label>
              <div className="flex flex-wrap gap-1 mb-2">
                {Object.keys(STATUS_COLORS).map((status) => {
                  const isSelected = statusFilters.has(status as ProspectStatusType);
                  const color = STATUS_COLORS[status as ProspectStatusType];
                  return (
                    <Button
                      key={status}
                      size="sm"
                      variant={isSelected ? 'default' : 'outline'}
                      onClick={() => {
                        const newFilters = new Set(statusFilters);
                        if (isSelected) {
                          newFilters.delete(status as ProspectStatusType);
                        } else {
                          newFilters.add(status as ProspectStatusType);
                        }
                        setStatusFilters(newFilters);
                      }}
                      className="text-xs"
                      style={isSelected ? { 
                        backgroundColor: color, 
                        borderColor: color,
                        color: 'white'
                      } : { 
                        borderColor: color,
                        color: color
                      }}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                    </Button>
                  );
                })}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStatusFilters(new Set(['prospect', 'contacted', 'followup', 'listing', 'client', 'no_go'] as ProspectStatusType[]))}
                className="text-xs w-full"
              >
                Clear Filters
              </Button>
            </div>

            {/* Submarket Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium text-gray-700">Submarket</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addSubmarket}
                  className="text-xs"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <Select value={selectedSubmarket} onValueChange={setSelectedSubmarket}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Submarkets</SelectItem>
                  {submarkets.filter(s => s.isActive).map((submarket) => (
                    <SelectItem key={submarket.id} value={submarket.id}>
                      {submarket.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {/* Submarket List */}
              <div className="mt-2 max-h-24 overflow-y-auto space-y-1">
                {submarkets.filter(s => s.isActive).map((submarket) => (
                  <div key={submarket.id} className="flex items-center justify-between p-1 bg-gray-50 rounded text-xs">
                    <span className="font-medium">{submarket.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeSubmarket(submarket.id)}
                      className="h-5 w-5 p-0 hover:bg-red-100 hover:text-red-600"
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legend Toggle */}
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

      {/* Legend */}
      {isLegendOpen && (
        <Card className="absolute bottom-4 left-16 bg-white/95 backdrop-blur-sm shadow-lg border border-gray-200 z-10">
          <CardContent className="p-3">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Status Legend</h3>
            <div className="space-y-1">
              {Object.entries(STATUS_COLORS).map(([status, color]) => {
                const isActive = statusFilters.has(status as ProspectStatusType);
                return (
                  <div 
                    key={status} 
                    className={`flex items-center text-xs cursor-pointer p-1 rounded transition-colors ${
                      isActive ? 'bg-gray-100' : 'hover:bg-gray-50 opacity-50'
                    }`}
                    onClick={() => {
                      const newFilters = new Set(statusFilters);
                      if (isActive) {
                        newFilters.delete(status as ProspectStatusType);
                      } else {
                        newFilters.add(status as ProspectStatusType);
                      }
                      setStatusFilters(newFilters);
                    }}
                  >
                    <div 
                      className="w-3 h-3 rounded mr-2" 
                      style={{ backgroundColor: color }}
                    ></div>
                    <span className="text-gray-700">
                      {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Side Panel */}
      <div 
        className={`absolute top-0 right-0 h-full w-96 bg-white shadow-xl border-l border-gray-200 transform transition-transform duration-300 ease-in-out z-20 ${
          isEditPanelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {selectedProspect && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center">
                <Edit3 className="mr-2 text-blue-600 h-5 w-5" />
                Edit Prospect
              </h2>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  disablePolygonEditing();
                  setIsEditPanelOpen(false);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Form Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Name */}
              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2">Name</Label>
                <Input
                  value={selectedProspect.name}
                  onChange={(e) => updateSelectedProspect('name', e.target.value)}
                  placeholder="Enter prospect name"
                />
              </div>

              {/* Status */}
              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2">Status</Label>
                <Select
                  value={selectedProspect.status}
                  onValueChange={(value: ProspectStatusType) => updateSelectedProspect('status', value)}
                >
                  <SelectTrigger>
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

              {/* Submarket */}
              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2">Submarket</Label>
                <Select
                  value={selectedProspect.submarketId || 'none'}
                  onValueChange={(value: string) => updateSelectedProspect('submarketId', value === 'none' ? undefined : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select submarket" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No submarket</SelectItem>
                    {submarkets.filter(s => s.isActive).map((submarket) => (
                      <SelectItem key={submarket.id} value={submarket.id}>
                        {submarket.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Polygon Editing */}
              {selectedProspect.geometry.type === 'Polygon' && (
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-2">Shape Editing</Label>
                  <div className="flex gap-2">
                    {editingProspectId === selectedProspect.id ? (
                      <Button
                        onClick={disablePolygonEditing}
                        variant="outline"
                        size="sm"
                        className="flex-1"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </Button>
                    ) : (
                      <Button
                        onClick={() => enablePolygonEditing(selectedProspect.id)}
                        variant="outline"
                        size="sm"
                        className="flex-1"
                      >
                        <Edit3 className="h-4 w-4 mr-2" />
                        Edit Shape
                      </Button>
                    )}
                  </div>
                  {editingProspectId === selectedProspect.id && (
                    <p className="text-xs text-gray-500 mt-2">
                      Click and drag the polygon vertices on the map to adjust the shape. 
                      Click "Save Changes" when finished.
                    </p>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2">Notes</Label>
                <Textarea
                  value={selectedProspect.notes}
                  onChange={(e) => updateSelectedProspect('notes', e.target.value)}
                  placeholder="Add notes about this prospect..."
                  rows={6}
                  className="resize-none"
                />
              </div>
            </div>

            {/* Recent Activity */}
            <div className="px-4 pb-4">
              <Label className="text-sm font-medium text-gray-700 mb-2">Recent Activity</Label>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {touches
                  .filter(touch => touch.prospectId === selectedProspect.id)
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 5)
                  .map((touch) => {
                    const Icon = touch.kind === 'call' ? Phone : 
                                 touch.kind === 'email' ? Mail : 
                                 touch.kind === 'visit' ? VisitIcon : FileText;
                    return (
                      <div key={touch.id} className="flex items-center text-xs p-2 bg-gray-50 rounded">
                        <Icon className="h-3 w-3 mr-2 text-gray-500" />
                        <span className="flex-1">{touch.kind} - {new Date(touch.createdAt).toLocaleDateString()}</span>
                      </div>
                    );
                  })}
                {touches.filter(touch => touch.prospectId === selectedProspect.id).length === 0 && (
                  <p className="text-xs text-gray-500 italic">No activity logged</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-gray-200 space-y-2">
              <Dialog open={isLogActivityOpen} onOpenChange={setIsLogActivityOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    Log Activity
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Log Activity</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { kind: 'call' as const, icon: Phone, label: 'Call' },
                        { kind: 'email' as const, icon: Mail, label: 'Email' },
                        { kind: 'visit' as const, icon: VisitIcon, label: 'Visit' },
                        { kind: 'note' as const, icon: FileText, label: 'Note' }
                      ].map(({ kind, icon: Icon, label }) => (
                        <Button
                          key={kind}
                          variant="outline"
                          onClick={() => {
                            addTouch(selectedProspect.id, kind);
                            setIsLogActivityOpen(false);
                          }}
                          className="flex flex-col items-center py-6 h-auto"
                        >
                          <Icon className="h-6 w-6 mb-2" />
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              
              <Button 
                onClick={() => setIsEditPanelOpen(false)}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </Button>
              <Button 
                onClick={deleteSelectedProspect}
                variant="destructive"
                className="w-full"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Prospect
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}