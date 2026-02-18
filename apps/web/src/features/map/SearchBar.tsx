import { useRef, useState, useMemo, useEffect } from 'react';
import { Search, Square, Star } from 'lucide-react';
import type { Prospect } from '@level-cre/shared/schema';
import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
} from 'use-places-autocomplete';

interface SearchBarProps {
  onSearch: (location: { lat: number; lng: number; address: string; businessName?: string | null; websiteUrl?: string | null }) => void;
  prospects?: Prospect[];
  onProspectClick?: (prospect: Prospect) => void;
  bounds?: google.maps.LatLngBoundsLiteral | null;
  defaultCenter?: { lat: number; lng: number };
  // When this value changes, the input clears (used after adding a prospect)
  clearSignal?: number;
}

type CombinedSearchItem =
  | { type: 'local'; key: string; prospect: Prospect; label: string; secondary?: string }
  | { type: 'google'; key: string; suggestion: google.maps.places.AutocompletePrediction };

export function SearchBar({
  onSearch,
  prospects = [],
  onProspectClick,
  bounds,
  defaultCenter = { lat: 53.5461, lng: -113.4938 },
  clearSignal,
}: SearchBarProps) {
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
  const normalizedInput = value.trim().toLowerCase();

  const localResults = useMemo(() => {
    if (!normalizedInput) return [] as Prospect[];
    return prospects
      .filter((p) => {
        const businessName = (p.businessName || '').toLowerCase();
        const address = (p.name || ((p as any).address as string) || '').toLowerCase();
        return businessName.includes(normalizedInput) || address.includes(normalizedInput);
      })
      .slice(0, 8);
  }, [normalizedInput, prospects]);

  const combinedResults = useMemo(() => {
    const localItems: CombinedSearchItem[] = localResults.map((prospect) => {
      const address = (prospect.name || ((prospect as any).address as string) || '').trim();
      const business = (prospect.businessName || '').trim();
      return {
        type: 'local',
        key: `local-${prospect.id}`,
        prospect,
        label: business || address || 'Local Prospect',
        secondary: business && address && business !== address ? address : undefined,
      };
    });
    const googleItems: CombinedSearchItem[] = data.map((suggestion, idx) => ({
      type: 'google',
      key: suggestion.place_id ? `google-${suggestion.place_id}` : `google-${idx}-${suggestion.description}`,
      suggestion,
    }));
    return [...localItems, ...googleItems];
  }, [data, localResults]);

  // Reset highlight when suggestions update
  useEffect(() => {
    setActiveIndex(-1);
  }, [status, combinedResults.length]);

  // Clear input when parent signals (e.g., after saving a prospect)
  useEffect(() => {
    if (typeof clearSignal === 'number') {
      setValue('', false);
      clearSuggestions();
      setActiveIndex(-1);
    }
  }, [clearSignal, setValue, clearSuggestions]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  const handleLocalSelect = (prospect: Prospect) => () => {
    const business = (prospect.businessName || '').trim();
    const address = (prospect.name || ((prospect as any).address as string) || '').trim();
    setValue(business || address, false);
    clearSuggestions();
    setActiveIndex(-1);
    onProspectClick?.(prospect);
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

  const renderSuggestions = () => {
    const localCount = localResults.length;
    return (
      <>
        {localCount > 0 && (
          <li className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border-b border-amber-100">
            Local Results
          </li>
        )}
        {combinedResults.map((item, idx) => {
          if (item.type === 'local') {
            return (
              <li
                key={item.key}
                id={`places-option-${idx}`}
                role="option"
                aria-selected={activeIndex === idx}
                onClick={handleLocalSelect(item.prospect)}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`p-2 cursor-pointer border-b border-amber-100 ${activeIndex === idx ? 'bg-amber-100' : 'bg-amber-50 hover:bg-amber-100'}`}
              >
                <div className="flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-amber-600" />
                  <strong className="text-gray-900">{item.label}</strong>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">CRM</span>
                </div>
                {item.secondary && <small className="text-gray-600">{item.secondary}</small>}
              </li>
            );
          }
          const {
            structured_formatting: { main_text, secondary_text },
          } = item.suggestion;
          return (
            <li
              key={item.key}
              id={`places-option-${idx}`}
              role="option"
              aria-selected={activeIndex === idx}
              onClick={handleSelect(item.suggestion)}
              onMouseEnter={() => setActiveIndex(idx)}
              className={`p-2 cursor-pointer ${activeIndex === idx ? 'bg-gray-100' : 'hover:bg-gray-100'}`}
            >
              <strong>{main_text}</strong> <small>{secondary_text}</small>
            </li>
          );
        })}
      </>
    );
  };

  return (
    <div className="relative w-[min(85vw,420px)]">
      <div className="flex items-center gap-2 bg-white/95 shadow-sm border border-gray-200 px-2 py-1.5">
        <input
          ref={ref}
          value={value}
          onChange={handleInput}
          onKeyDown={(e) => {
            if (combinedResults.length === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((prev) => {
                const next = Math.min(prev + 1, combinedResults.length - 1);
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
              if (activeIndex >= 0 && activeIndex < combinedResults.length) {
                e.preventDefault();
                const item = combinedResults[activeIndex];
                if (item.type === 'local') {
                  handleLocalSelect(item.prospect)();
                } else {
                  handleSelect(item.suggestion)();
                }
              } else if (combinedResults.length > 0) {
                e.preventDefault();
                const first = combinedResults[0];
                if (first.type === 'local') {
                  handleLocalSelect(first.prospect)();
                } else {
                  handleSelect(first.suggestion)();
                }
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
          aria-expanded={combinedResults.length > 0}
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
            if (combinedResults.length > 0) {
              const first = combinedResults[0];
              if (first.type === 'local') {
                handleLocalSelect(first.prospect)();
              } else {
                handleSelect(first.suggestion)();
              }
            }
          }}
        >
          <Search className="w-4 h-4" strokeWidth={2.5} />
        </button>
      </div>
      {combinedResults.length > 0 && (
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
