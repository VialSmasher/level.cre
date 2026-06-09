import { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Square, Star } from 'lucide-react';
import type { Prospect } from '@level-cre/shared/schema';
import { getProspectDisplayName, getProspectSecondaryName, isPlaceholderProspectName } from '@/lib/prospectDisplay';
import type { MapSearchLocation } from './searchTypes';

interface SearchBarProps {
  onSearch: (location: MapSearchLocation) => void;
  prospects?: Prospect[];
  onProspectClick?: (prospect: Prospect) => void;
  bounds?: google.maps.LatLngBoundsLiteral | null;
  defaultCenter?: { lat: number; lng: number };
  // When this value changes, the input clears (used after adding a prospect)
  clearSignal?: number;
}

type GoogleSearchItem = {
  type: 'google';
  key: string;
  suggestion: google.maps.places.AutocompleteSuggestion;
  prediction: google.maps.places.PlacePrediction;
  label: string;
  secondary?: string;
  description: string;
};

type CombinedSearchItem =
  | { type: 'local'; key: string; prospect: Prospect; label: string; secondary?: string }
  | GoogleSearchItem;

const FALLBACK_RADIUS_METERS = 50000;
const PLACES_DEBOUNCE_MS = 300;

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
  const [ready, setReady] = useState(false);
  const [value, setValue] = useState('');
  const [googleSuggestions, setGoogleSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const requestIdRef = useRef(0);
  const suppressNextFetchRef = useRef(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = 'places-suggestions-listbox';
  const normalizedInput = value.trim().toLowerCase();

  const requestOptions = useMemo((): Omit<google.maps.places.AutocompleteRequest, 'input'> => {
    const base: Omit<google.maps.places.AutocompleteRequest, 'input'> = {
      includedRegionCodes: ['ca'],
      region: 'ca',
    };

    if (bounds) {
      if (strictBounds) {
        return { ...base, locationRestriction: bounds };
      }
      return { ...base, locationBias: bounds };
    }

    return {
      ...base,
      locationBias: { center: defaultCenter, radius: FALLBACK_RADIUS_METERS } as google.maps.CircleLiteral,
    };
  }, [bounds, strictBounds, defaultCenter]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        if (!window.google?.maps?.importLibrary) {
          if (!cancelled) setReady(false);
          return;
        }
        await window.google.maps.importLibrary('places');
        if (!cancelled) setReady(true);
      } catch (error) {
        console.error('Failed to load Google Places autocomplete library', error);
        if (!cancelled) setReady(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const clearSuggestions = useCallback(() => {
    setGoogleSuggestions([]);
    requestIdRef.current += 1;
  }, []);

  const setValueWithoutFetch = useCallback((nextValue: string) => {
    if (nextValue !== value) {
      suppressNextFetchRef.current = true;
    }
    setValue(nextValue);
  }, [value]);

  useEffect(() => {
    const input = value.trim();
    if (!ready || !input) {
      clearSuggestions();
      if (!input) {
        sessionTokenRef.current = null;
      }
      return undefined;
    }

    if (suppressNextFetchRef.current) {
      suppressNextFetchRef.current = false;
      clearSuggestions();
      return undefined;
    }

    let cancelled = false;
    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const places = await window.google.maps.importLibrary('places') as google.maps.PlacesLibrary;
          if (!sessionTokenRef.current) {
            sessionTokenRef.current = new places.AutocompleteSessionToken();
          }
          const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            ...requestOptions,
            input,
            sessionToken: sessionTokenRef.current,
          });
          if (!cancelled && requestId === requestIdRef.current) {
            setGoogleSuggestions(suggestions.filter((suggestion) => suggestion.placePrediction));
          }
        } catch (error) {
          if (!cancelled && requestId === requestIdRef.current) {
            console.error('Failed to fetch Google Places suggestions', error);
            setGoogleSuggestions([]);
          }
        }
      })();
    }, PLACES_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clearSuggestions, ready, requestOptions, value]);

  const localResults = useMemo(() => {
    if (!normalizedInput) return [] as Prospect[];
    return prospects
      .filter((p) => {
        const businessName = (p.businessName || '').toLowerCase();
        const address = (isPlaceholderProspectName(p.name) ? '' : p.name || ((p as any).address as string) || '').toLowerCase();
        return businessName.includes(normalizedInput) || address.includes(normalizedInput);
      })
      .slice(0, 8);
  }, [normalizedInput, prospects]);

  const combinedResults = useMemo(() => {
    const localItems: CombinedSearchItem[] = localResults.map((prospect) => {
      return {
        type: 'local',
        key: `local-${prospect.id}`,
        prospect,
        label: getProspectDisplayName(prospect),
        secondary: getProspectSecondaryName(prospect),
      };
    });
    const googleItems: CombinedSearchItem[] = googleSuggestions.flatMap((suggestion, idx) => {
      const prediction = suggestion.placePrediction;
      if (!prediction) return [];
      const description = prediction.text.text;
      return [{
        type: 'google' as const,
        key: prediction.placeId ? `google-${prediction.placeId}` : `google-${idx}-${description}`,
        suggestion,
        prediction,
        label: prediction.mainText?.text || description,
        secondary: prediction.secondaryText?.text || undefined,
        description,
      }];
    });
    return [...localItems, ...googleItems];
  }, [googleSuggestions, localResults]);

  // Reset highlight when suggestions update
  useEffect(() => {
    setActiveIndex(-1);
  }, [combinedResults.length]);

  // Clear input when parent signals (e.g., after saving a prospect)
  useEffect(() => {
    if (typeof clearSignal === 'number') {
      setValue('');
      clearSuggestions();
      sessionTokenRef.current = null;
      setActiveIndex(-1);
    }
  }, [clearSignal, clearSuggestions]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  const handleLocalSelect = (prospect: Prospect) => () => {
    setValueWithoutFetch(getProspectDisplayName(prospect));
    clearSuggestions();
    sessionTokenRef.current = null;
    setActiveIndex(-1);
    onProspectClick?.(prospect);
  };

  const geocodeAddress = useCallback(async (address: string) => {
    const geocoder = new window.google.maps.Geocoder();
    const results = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
      geocoder.geocode({ address, componentRestrictions: { country: 'CA' } }, (data, status) => {
        if (status === 'OK' && data?.[0]) {
          resolve(data);
          return;
        }
        reject(status);
      });
    });
    const location = results[0].geometry.location;
    return {
      lat: location.lat(),
      lng: location.lng(),
      address: results[0].formatted_address || address,
    };
  }, []);

  const handleSelect =
    (item: GoogleSearchItem) =>
    () => {
      const { description, prediction } = item;
      setValueWithoutFetch(description);
      clearSuggestions();
      setActiveIndex(-1);

      void (async () => {
        try {
          const place = prediction.toPlace();
          await place.fetchFields({
            fields: [
              'displayName',
              'formattedAddress',
              'location',
              'websiteURI',
              'nationalPhoneNumber',
              'internationalPhoneNumber',
              'googleMapsURI',
            ],
          });
          if (!place.location) {
            throw new Error('Selected place did not include a location.');
          }
          onSearch({
            lat: place.location.lat(),
            lng: place.location.lng(),
            address: place.formattedAddress || description,
            businessName: place.displayName ?? undefined,
            websiteUrl: place.websiteURI ?? undefined,
            contactPhone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? undefined,
            placeId: prediction.placeId,
            googleMapsUrl: place.googleMapsURI ?? undefined,
          });
        } catch (error) {
          try {
            const fallback = await geocodeAddress(description);
            onSearch({ ...fallback, businessName: undefined, websiteUrl: undefined });
          } catch (fallbackError) {
            console.error('Failed to resolve selected Google Places suggestion', error, fallbackError);
          }
        } finally {
          sessionTokenRef.current = null;
        }
      })();
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
          return (
            <li
              key={item.key}
              id={`places-option-${idx}`}
              role="option"
              aria-selected={activeIndex === idx}
              onClick={handleSelect(item)}
              onMouseEnter={() => setActiveIndex(idx)}
              className={`p-2 cursor-pointer ${activeIndex === idx ? 'bg-gray-100' : 'hover:bg-gray-100'}`}
            >
              <strong>{item.label}</strong> {item.secondary && <small>{item.secondary}</small>}
            </li>
          );
        })}
      </>
    );
  };

  return (
    <div className="relative w-full sm:w-[min(85vw,420px)]">
      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white/95 px-2 py-2 shadow-sm sm:py-1.5">
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
                  handleSelect(item)();
                }
              } else if (combinedResults.length > 0) {
                e.preventDefault();
                const first = combinedResults[0];
                if (first.type === 'local') {
                  handleLocalSelect(first.prospect)();
                } else {
                  handleSelect(first)();
                }
              }
            } else if (e.key === 'Escape') {
              clearSuggestions();
              setActiveIndex(-1);
            }
          }}
          disabled={!ready}
          className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
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
          className={`grid h-9 w-9 shrink-0 place-items-center rounded text-xs sm:h-7 sm:w-7 ${strictBounds ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'text-gray-700 hover:bg-gray-100'}`}
          onClick={() => setStrictBounds((v) => !v)}
        >
          <Square className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-label="Search"
          className="grid h-9 w-9 shrink-0 place-items-center rounded bg-indigo-600 text-xs text-white hover:bg-indigo-500 active:scale-95 sm:h-7 sm:w-7"
          onClick={() => {
            if (combinedResults.length > 0) {
              const first = combinedResults[0];
              if (first.type === 'local') {
                handleLocalSelect(first.prospect)();
              } else {
                handleSelect(first)();
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
          className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg bg-white shadow-lg"
        >
          {renderSuggestions()}
        </ul>
      )}
    </div>
  );
}
