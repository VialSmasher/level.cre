import { useEffect, useRef } from 'react';
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
  markerId?: string;
  markerKind?: 'asset' | 'cluster' | 'temporary';
  markerCategory?: string;
  selected?: boolean;
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
  markerId,
  markerKind = 'asset',
  markerCategory,
  selected = false,
  onClick,
}: AdvancedMapMarkerProps) {
  const map = useGoogleMap();
  const onClickRef = useRef(onClick);
  const interactive = Boolean(onClick);

  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  useEffect(() => {
    if (!map) return undefined;

    let disposed = false;
    let marker: google.maps.marker.AdvancedMarkerElement | null = null;
    let content: HTMLElement | null = null;
    let listener: google.maps.MapsEventListener | null = null;
    let keyListener: ((event: KeyboardEvent) => void) | null = null;

    void (async () => {
      try {
        const { AdvancedMarkerElement } = await loadAdvancedMarkerLibrary();
        if (disposed) return;

        content = createCircleMarkerContent({ color, borderColor, label, labelColor, scale, selected });
        content.dataset.mapMarkerId = markerId || '';
        content.dataset.mapMarkerKind = markerKind;
        content.dataset.mapMarkerCategory = markerCategory || '';
        content.dataset.mapMarkerSelected = selected ? 'true' : 'false';
        content.style.cursor = interactive ? 'pointer' : 'default';
        if (interactive) {
          content.tabIndex = 0;
          content.setAttribute('role', 'button');
          content.setAttribute('aria-label', title || 'Open map property');
          keyListener = (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            onClickRef.current?.();
          };
          content.addEventListener('keydown', keyListener);
        }
        marker = new AdvancedMarkerElement({
          map,
          position,
          title,
          content,
          zIndex,
        });
        if (interactive) {
          listener = marker.addListener('click', () => onClickRef.current?.());
        }
      } catch (error) {
        console.error('Failed to create advanced map marker', error);
      }
    })();

    return () => {
      disposed = true;
      listener?.remove();
      if (content && keyListener) content.removeEventListener('keydown', keyListener);
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
    markerId,
    markerKind,
    markerCategory,
    selected,
    interactive,
  ]);

  return null;
}
