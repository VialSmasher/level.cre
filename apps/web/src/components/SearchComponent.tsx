import { useRef, useEffect } from 'react';
import type { Prospect } from '@shared/schema';

interface SearchComponentProps {
  prospects: Prospect[];
  map: google.maps.Map | null;
  onProspectSelect: (prospect: Prospect) => void;
  onLocationFound?: (location: { lat: number; lng: number; address: string; businessName?: string | null; websiteUrl?: string | null }) => void;
}

export function SearchComponent({ prospects, map, onProspectSelect, onLocationFound }: SearchComponentProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  // Handle prospect search from input change
  const handleProspectSearch = (query: string) => {
    if (!query.trim()) return;
    
    // Search existing prospects
    const prospect = prospects.find(p => 
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.notes.toLowerCase().includes(query.toLowerCase())
    );
    
    if (prospect && map) {
      let coords: { lat: number; lng: number };
      if (prospect.geometry.type === 'Point') {
        const [lng, lat] = prospect.geometry.coordinates as [number, number];
        coords = { lat, lng };
      } else {
        const coordinates = prospect.geometry.coordinates as [number, number][][];
        const [lng, lat] = coordinates[0][0];
        coords = { lat, lng };
      }
      map.setCenter(coords);
      map.setZoom(15);
      onProspectSelect(prospect);
    }
  };

  // Initialize Google Places Autocomplete
  useEffect(() => {
    if (window.google?.maps?.places && inputRef.current && map) {
      try {
        // Create autocomplete instance
        const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
          types: ['establishment', 'geocode'], // Include both businesses and addresses
          componentRestrictions: { country: 'ca' }, // Restrict to Canada
          fields: ['geometry', 'name', 'formatted_address', 'website', 'place_id']
        });

        autocompleteRef.current = autocomplete;

        // Handle place selection
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          console.log('Place selected:', place);
          
          if (place?.geometry?.location) {
            const lat = place.geometry.location.lat();
            const lng = place.geometry.location.lng();
            
            console.log('Moving map to:', { lat, lng });
            
            // Clean up address - remove "Canada"
            let cleanAddress = place.formatted_address || '';
            cleanAddress = cleanAddress.replace(/, Canada$/, '');
            
            // Center and zoom the map
            map.setCenter({ lat, lng });
            map.setZoom(Math.max(map.getZoom() || 15, 17));
            
            if (onLocationFound) {
              onLocationFound({
                lat,
                lng,
                address: cleanAddress,
                businessName: place.name || null,
                websiteUrl: place.website || null
              });
            }
          } else if (place?.name) {
            // Fallback: Use geocoder if autocomplete missing geometry
            console.log('Place missing geometry, using geocoder fallback');
            handleGeocodeSearch(place.name);
          }
        });

      } catch (error) {
        console.warn('Google Places Autocomplete not available:', error);
      }
    }
  }, [map, onLocationFound]);

  // Fallback geocoder search function
  const handleGeocodeSearch = (query: string) => {
    if (!query.trim() || !map || !window.google) return;
    
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: query }, (results, status) => {
      if (status === 'OK' && results && results.length > 0) {
        const location = results[0].geometry.location;
        const lat = location.lat();
        const lng = location.lng();
        
        console.log('Geocoder found location:', { lat, lng });
        
        // Clean up address - remove "Canada"
        let cleanAddress = results[0].formatted_address || query;
        cleanAddress = cleanAddress.replace(/, Canada$/, '');
        
        map.setCenter({ lat, lng });
        map.setZoom(Math.max(map.getZoom() || 15, 17));
        
        if (onLocationFound) {
          onLocationFound({ 
            lat, 
            lng, 
            address: cleanAddress,
            businessName: null,
            websiteUrl: null
          });
        }
      } else {
        console.log('Geocoder failed:', status);
      }
    });
  };


  return (
    <div 
      className="bg-white rounded-lg shadow-lg border"
      style={{ pointerEvents: 'auto' }}
    >
      <input
        ref={inputRef}
        type="text"
        onChange={(e) => {
          const value = e.target.value;
          // Search existing prospects while typing
          handleProspectSearch(value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const value = (e.target as HTMLInputElement).value;
            if (value.trim()) {
              console.log('Manual search for:', value);
              // Use geocoder for manual searches
              handleGeocodeSearch(value);
            }
          }
        }}
        placeholder="search"
        className="w-80 px-3 py-2 border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}