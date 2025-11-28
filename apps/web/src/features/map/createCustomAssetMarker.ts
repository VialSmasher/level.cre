export type CustomAsset = {
  id?: string | number;
  title?: string;
  lat: number;
  lng: number;
  markerOptions?: google.maps.MarkerOptions;
};

/**
 * Adds a custom asset marker and wires up an InfoWindow with copy + external link actions.
 * Uses DOM nodes (not strings) so that event listeners remain intact after sanitization.
 */
export function createCustomAssetMarker(map: google.maps.Map, asset: CustomAsset): google.maps.Marker {
  if (!map || !asset) {
    throw new Error('Map instance and asset data are required.');
  }

  const { lat, lng, title = 'Custom Asset', markerOptions } = asset;

  const marker = new google.maps.Marker({
    position: { lat, lng },
    map,
    title,
    ...(markerOptions ?? {}),
  });

  const infoWindow = new google.maps.InfoWindow();

  const buildInfoWindowContent = () => {
    const wrap = document.createElement('div');
    wrap.className = 'p-3 min-w-[200px] text-gray-800';

    const heading = document.createElement('h3');
    heading.textContent = title;
    heading.className = 'font-bold text-base mb-2';
    wrap.appendChild(heading);

    const coordsRow = document.createElement('div');
    coordsRow.className = 'flex items-center justify-between bg-gray-100 p-2 rounded mb-3';

    const coordsText = document.createElement('span');
    coordsText.className = 'text-sm font-mono text-gray-600';
    coordsText.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    coordsRow.appendChild(coordsText);

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'ml-2 text-blue-600 hover:text-blue-800 text-sm font-semibold transition-colors';
    copyBtn.textContent = 'Copy';

    const resetCopyState = () => {
      copyBtn.textContent = 'Copy';
      copyBtn.classList.add('text-blue-600');
      copyBtn.classList.remove('text-green-600');
    };

    copyBtn.addEventListener('click', async (evt) => {
      evt.stopPropagation();
      const value = `${lat},${lng}`;
      try {
        if (!navigator.clipboard) {
          throw new Error('Clipboard API unavailable');
        }
        await navigator.clipboard.writeText(value);
        copyBtn.textContent = 'Copied!';
        copyBtn.classList.remove('text-blue-600');
        copyBtn.classList.add('text-green-600');
        setTimeout(resetCopyState, 2000);
      } catch (err) {
        console.error('Clipboard copy failed', err);
        copyBtn.textContent = 'Error';
        setTimeout(resetCopyState, 2000);
      }
    });

    coordsRow.appendChild(copyBtn);
    wrap.appendChild(coordsRow);

    const mapsLink = document.createElement('a');
    // The standard, reliable Google Maps Search URL
    mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    mapsLink.target = '_blank';
    mapsLink.rel = 'noopener noreferrer';
    mapsLink.className = 'block text-blue-600 hover:underline text-sm';
    mapsLink.textContent = 'View on Google Maps';
    wrap.appendChild(mapsLink);

    return wrap;
  };

  marker.addListener('click', () => {
    infoWindow.setContent(buildInfoWindowContent());
    infoWindow.open({
      anchor: marker,
      map,
      shouldFocus: false,
    });
  });

  return marker;
}
