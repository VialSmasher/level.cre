import { useCallback, useRef } from 'react';

type GeocodeResult = {
  address?: string;
  location?: { lat: number; lng: number };
  error?: string;
};

function formatResult(result?: google.maps.GeocoderResult | null): GeocodeResult {
  if (!result) return { error: 'No results' };
  const loc = result.geometry?.location;
  if (!loc) return { address: result.formatted_address || undefined };
  const lat = typeof loc.lat === 'function' ? loc.lat() : (loc as any).lat;
  const lng = typeof loc.lng === 'function' ? loc.lng() : (loc as any).lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return { address: result.formatted_address || undefined };
  }
  return {
    address: result.formatted_address || undefined,
    location: { lat, lng },
  };
}

export function useGeocode() {
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  const ensureGeocoder = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (geocoderRef.current) return geocoderRef.current;
    const ctor = window.google?.maps?.Geocoder;
    if (!ctor) return null;
    geocoderRef.current = new ctor();
    return geocoderRef.current;
  }, []);

  const forward = useCallback(async (query: string): Promise<GeocodeResult> => {
    const trimmed = query?.trim();
    if (!trimmed) return { error: 'Missing query' };
    const geocoder = ensureGeocoder();
    if (!geocoder) return { error: 'Geocoder unavailable' };
    return new Promise<GeocodeResult>((resolve) => {
      geocoder.geocode({ address: trimmed }, (results, status) => {
        if (status === 'OK' && results && results.length > 0) {
          resolve(formatResult(results[0]));
          return;
        }
        resolve({ error: status || 'ZERO_RESULTS' });
      });
    });
  }, [ensureGeocoder]);

  const reverse = useCallback(async (lat: number, lng: number): Promise<GeocodeResult> => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: 'Invalid coordinates' };
    const geocoder = ensureGeocoder();
    if (!geocoder) return { error: 'Geocoder unavailable' };
    return new Promise<GeocodeResult>((resolve) => {
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === 'OK' && results && results.length > 0) {
          resolve(formatResult(results[0]));
          return;
        }
        resolve({ error: status || 'ZERO_RESULTS' });
      });
    });
  }, [ensureGeocoder]);

  return { forward, reverse };
}
