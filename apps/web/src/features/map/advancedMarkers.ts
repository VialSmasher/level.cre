type MarkerContentOptions = {
  color: string;
  borderColor?: string;
  label?: string;
  labelColor?: string;
  scale?: number;
  selected?: boolean;
};

export type AdvancedAssetMarker = google.maps.marker.AdvancedMarkerElement;

let markerLibraryPromise: Promise<google.maps.MarkerLibrary> | null = null;

export const loadAdvancedMarkerLibrary = async () => {
  if (!window.google?.maps?.importLibrary) {
    throw new Error('Google Maps marker library is not available.');
  }

  markerLibraryPromise ??= window.google.maps.importLibrary('marker') as Promise<google.maps.MarkerLibrary>;
  return markerLibraryPromise;
};

export const createCircleMarkerContent = ({
  color,
  borderColor = '#ffffff',
  label,
  labelColor = '#ffffff',
  scale = 8,
  selected = false,
}: MarkerContentOptions) => {
  const size = Math.max(scale * 2, label ? 26 : 0);
  const content = document.createElement('div');
  content.style.width = `${size}px`;
  content.style.height = `${size}px`;
  content.style.borderRadius = '9999px';
  content.style.background = color;
  content.style.border = `2px solid ${borderColor}`;
  content.style.boxShadow = selected
    ? '0 0 0 4px rgba(15, 23, 42, 0.42), 0 3px 10px rgba(15, 23, 42, 0.34)'
    : '0 2px 8px rgba(15, 23, 42, 0.28)';
  content.style.boxSizing = 'border-box';
  content.style.transform = 'translateY(50%)';
  content.style.display = 'grid';
  content.style.placeItems = 'center';
  content.style.color = labelColor;
  content.style.fontFamily = 'Inter, system-ui, sans-serif';
  content.style.fontSize = label && label.length > 2 ? '10px' : '12px';
  content.style.fontWeight = '700';
  content.style.lineHeight = '1';
  content.textContent = label ?? '';
  return content;
};

export const clearAdvancedMarker = (marker: AdvancedAssetMarker | null | undefined) => {
  if (marker) {
    marker.map = null;
  }
};
