import { useRef, useState, useMemo, useEffect } from 'react';
import { Search, Square } from 'lucide-react';
import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
} from 'use-places-autocomplete';

interface SearchBarProps {
  onSearch: (location: { lat: number; lng: number; address: string; businessName?: string | null; websiteUrl?: string | null }) => void;
  bounds?: google.maps.LatLngBoundsLiteral | null;
  defaultCenter?: { lat: number; lng: number };
}

export function SearchBar({ onSearch, bounds, defaultCenter = { lat: 53.5461, lng: -113.4938 } }: SearchBarProps) {
  const [strictBounds, setStrictBounds] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // Build dynamic request options based on current map bounds
  const requestOptions = useMemo(() => {
    const FALLBACK_RADIUS_METERS = 50000; // 50km bias around Edmonton if no bounds
    const base: Partial<google.maps.places.AutocompletionRequest> = {
      // Restrict suggestions to Canada
      componentRestrictions: { country: 'ca' },
      region: 'ca',
    };

    if (bounds) {
      if (strictBounds) {
        // Hard restrict to visible bounds
        return { ...base, locationRestriction: bounds } as google.maps.places.AutocompletionRequest;
      }
      // Bias towards visible bounds
      return { ...base, locationBias: bounds } as google.maps.places.AutocompletionRequest;
    }

    // Fallback: bias around Edmonton center with radius
    return {
      ...base,
      locationBias: { center: defaultCenter, radius: FALLBACK_RADIUS_METERS } as google.maps.CircleLiteral,
    } as google.maps.places.AutocompletionRequest;
  }, [bounds, strictBounds, defaultCenter]);

  const {
    ready,
    value,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
  } = usePlacesAutocomplete({ requestOptions, debounce: 300 });
  
  const ref = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = 'places-suggestions-listbox';

  // Reset highlight when suggestions update
  useEffect(() => {
    setActiveIndex(-1);
  }, [status, data.length]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  const handleSelect =
    (suggestion: { description: string; place_id?: string }) =>
    () => {
      const { description, place_id } = suggestion;
      // When user selects a place, we can replace the keyword without request data from API
      // by setting the second parameter to "false"
      setValue(description, false);
      clearSuggestions();

      // Resolve lat/lng first
      getGeocode({ address: description }).then(async (results) => {
        const { lat, lng } = getLatLng(results[0]);
        let businessName: string | null | undefined = undefined;
        let websiteUrl: string | null | undefined = undefined;

        // Try to fetch Place Details for name/website if available
        if (place_id && (window as any).google?.maps?.places?.PlacesService) {
          try {
            const svc = new window.google.maps.places.PlacesService(document.createElement('div'));
            const place = await new Promise<google.maps.places.PlaceResult | null>((resolve) => {
              svc.getDetails({ placeId: place_id, fields: ['name', 'website'] }, (p, status) => {
                if (status === window.google.maps.places.PlacesServiceStatus.OK) resolve(p || null);
                else resolve(null);
              });
            });
            businessName = place?.name ?? undefined;
            websiteUrl = (place as any)?.website ?? undefined;
          } catch (e) {
            // ignore details failure; fallback to address only
          }
        }

        onSearch({ lat, lng, address: description, businessName, websiteUrl });
      });
    };

  const renderSuggestions = () =>
    data.map((suggestion, idx) => {
      const {
        place_id,
        structured_formatting: { main_text, secondary_text },
      } = suggestion;

      return (
        <li
          key={place_id}
          id={`places-option-${idx}`}
          role="option"
          aria-selected={activeIndex === idx}
          onClick={handleSelect(suggestion)}
          onMouseEnter={() => setActiveIndex(idx)}
          className={`p-2 cursor-pointer ${activeIndex === idx ? 'bg-gray-100' : 'hover:bg-gray-100'}`}
        >
          <strong>{main_text}</strong> <small>{secondary_text}</small>
        </li>
      );
    });

  return (
    <div className="relative w-[min(85vw,420px)]">
      <div className="flex items-center gap-2 bg-white/95 shadow-sm border border-gray-200 px-2 py-1.5">
        <input
          ref={ref}
          value={value}
          onChange={handleInput}
          onKeyDown={(e) => {
            if (status !== 'OK' || data.length === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((prev) => {
                const next = Math.min(prev + 1, data.length - 1);
                // Scroll highlighted item into view
                const el = listRef.current?.querySelector(`#places-option-${next}`) as HTMLElement | null;
                el?.scrollIntoView({ block: 'nearest' });
                return next;
              });
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((prev) => {
                const next = Math.max(prev - 1, -1);
                if (next >= 0) {
                  const el = listRef.current?.querySelector(`#places-option-${next}`) as HTMLElement | null;
                  el?.scrollIntoView({ block: 'nearest' });
                }
                return next;
              });
            } else if (e.key === 'Enter') {
              if (activeIndex >= 0 && activeIndex < data.length) {
                e.preventDefault();
                handleSelect(data[activeIndex])();
              } else if (data.length > 0) {
                e.preventDefault();
                handleSelect(data[0])();
              }
            } else if (e.key === 'Escape') {
              clearSuggestions();
              setActiveIndex(-1);
            }
          }}
          disabled={!ready}
          className="flex-1 bg-transparent text-sm placeholder:text-gray-400 text-gray-800 focus:outline-none"
          placeholder="Search..."
          aria-label="Search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={status === 'OK'}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `places-option-${activeIndex}` : undefined}
        />
        <button
          type="button"
          aria-label="Strict bounds"
          title={strictBounds ? 'Strict bounds: on' : 'Strict bounds: off'}
          className={`h-7 w-7 grid place-items-center text-xs ${strictBounds ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'text-gray-700 hover:bg-gray-100'}`}
          onClick={() => setStrictBounds((v) => !v)}
        >
          <Square className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-label="Search"
          className="h-7 w-7 grid place-items-center bg-indigo-600 text-white text-xs hover:bg-indigo-500 active:scale-95"
          onClick={() => {
            if (data.length > 0) {
              handleSelect(data[0])();
            }
          }}
        >
          <Search className="w-4 h-4" strokeWidth={2.5} />
        </button>
      </div>
      {status === 'OK' && (
        <ul
          id={listboxId}
          role="listbox"
          ref={listRef}
          className="absolute z-10 w-full bg-white shadow-lg rounded-lg mt-1 max-h-60 overflow-y-auto"
        >
          {renderSuggestions()}
        </ul>
      )}
    </div>
  );
}
