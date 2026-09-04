import { useEffect, useRef } from 'react';
import { useGoogleMap } from '@react-google-maps/api';
import { createCircleMarkerContent, loadAdvancedMarkerLibrary, updateCircleMarkerContent } from './advancedMarkers';

type AdvancedMapMarkerProps = {
  position: google.maps.LatLngLiteral; title?: string; color?: string; borderColor?: string;
  label?: string; labelColor?: string; scale?: number; zIndex?: number; markerId?: string;
  markerKind?: 'asset' | 'cluster' | 'temporary'; markerCategory?: string; selected?: boolean; onClick?: () => void;
};

export function AdvancedMapMarker({
  position, title, color = '#3B82F6', borderColor = '#ffffff', label, labelColor = '#ffffff',
  scale = 8, zIndex, markerId, markerKind = 'asset', markerCategory, selected = false, onClick,
}: AdvancedMapMarkerProps) {
  const map = useGoogleMap();
  const latest = useRef({ position, title, color, borderColor, label, labelColor, scale, zIndex, markerId, markerKind, markerCategory, selected, onClick });
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);

  const update = () => {
    const marker = markerRef.current, content = contentRef.current, props = latest.current;
    if (!marker || !content) return;
    marker.position = props.position;
    marker.title = props.title || '';
    marker.zIndex = props.zIndex;
    updateCircleMarkerContent(content, { ...props, scale: Math.max(props.scale, props.onClick ? 12 : 0) });
    content.dataset.mapMarkerId = props.markerId || '';
    content.dataset.mapMarkerKind = props.markerKind;
    content.dataset.mapMarkerCategory = props.markerCategory || '';
    content.dataset.mapMarkerSelected = props.selected ? 'true' : 'false';
    content.style.cursor = props.onClick ? 'pointer' : 'default';
    content.tabIndex = props.onClick ? 0 : -1;
    if (props.onClick) { content.setAttribute('role', 'button'); content.setAttribute('aria-label', props.title || 'Open map property'); }
    else { content.removeAttribute('role'); content.removeAttribute('aria-label'); }
  };
  useEffect(() => {
    latest.current = { position, title, color, borderColor, label, labelColor, scale, zIndex, markerId, markerKind, markerCategory, selected, onClick };
    update();
  }, [position.lat, position.lng, title, color, borderColor, label, labelColor, scale, zIndex, markerId, markerKind, markerCategory, selected, onClick]);

  useEffect(() => {
    if (!map) return;
    let disposed = false;
    let listener: google.maps.MapsEventListener | undefined;
    const onKey = (event: KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ') && latest.current.onClick) {
        event.preventDefault(); event.stopPropagation(); latest.current.onClick();
      }
    };
    void loadAdvancedMarkerLibrary().then(({ AdvancedMarkerElement }) => {
      if (disposed) return;
      const content = createCircleMarkerContent(latest.current);
      content.addEventListener('keydown', onKey);
      contentRef.current = content;
      markerRef.current = new AdvancedMarkerElement({ map, position: latest.current.position, content });
      listener = markerRef.current.addListener('click', () => latest.current.onClick?.());
      update();
    }).catch(error => { if (!disposed) console.error('Failed to create map marker', error); });
    return () => {
      disposed = true; listener?.remove();
      contentRef.current?.removeEventListener('keydown', onKey);
      if (markerRef.current) markerRef.current.map = null;
      contentRef.current?.remove(); markerRef.current = null; contentRef.current = null;
    };
  }, [map, markerId]);
  return null;
}
