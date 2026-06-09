import { useEffect } from 'react';
import { useGoogleMap } from '@react-google-maps/api';
import { createCircleMarkerContent, loadAdvancedMarkerLibrary } from './advancedMarkers';

type AdvancedMapMarkerProps = {
  position: google.maps.LatLngLiteral;
  title?: string;
  color?: string;
  borderColor?: string;
  label?: string;
  labelColor?: string;
  scale?: number;
  zIndex?: number;
  onClick?: () => void;
};

export function AdvancedMapMarker({
  position,
  title,
  color = '#3B82F6',
  borderColor = '#ffffff',
  label,
  labelColor = '#ffffff',
  scale = 8,
  zIndex,
  onClick,
}: AdvancedMapMarkerProps) {
  const map = useGoogleMap();

  useEffect(() => {
    if (!map) return undefined;

    let disposed = false;
    let marker: google.maps.marker.AdvancedMarkerElement | null = null;
    let content: HTMLElement | null = null;
    let listener: google.maps.MapsEventListener | null = null;

    void (async () => {
      try {
        const { AdvancedMarkerElement } = await loadAdvancedMarkerLibrary();
        if (disposed) return;

        content = createCircleMarkerContent({ color, borderColor, label, labelColor, scale });
        content.style.cursor = onClick ? 'pointer' : 'default';
        marker = new AdvancedMarkerElement({
          map,
          position,
          title,
          content,
          zIndex,
        });
        if (onClick) {
          listener = marker.addListener('click', onClick);
        }
      } catch (error) {
        console.error('Failed to create advanced map marker', error);
      }
    })();

    return () => {
      disposed = true;
      listener?.remove();
      if (marker) {
        marker.map = null;
      }
      content?.remove();
    };
  }, [
    map,
    position.lat,
    position.lng,
    title,
    color,
    borderColor,
    label,
    labelColor,
    scale,
    zIndex,
    onClick,
  ]);

  return null;
}
