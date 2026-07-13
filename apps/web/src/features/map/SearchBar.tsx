import { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { Database, MapPin, MapPinned, Search } from 'lucide-react';
import type { Prospect } from '@level-cre/shared/schema';
import { getProspectDisplayName, getProspectSecondaryName, isPlaceholderProspectName } from '@/lib/prospectDisplay';
import type { MapSearchLocation } from './searchTypes';

interface SearchBarProps {
  onSearch: (location: MapSearchLocation) => void;
  prospects?: Prospect[];
  onProspectClick?: (prospect: Prospect) => void;
  bounds?: google.maps.LatLngBoundsLiteral | null;
  defaultCenter?: { lat: number; lng: number };
  marketLocation?: string;
  // When this value changes, the input clears (used after adding a prospect)
  clearSignal?: number;
}

type NewGoogleSearchItem = {
  type: 'google';
  api: 'new';
  key: string;
  prediction: google.maps.places.PlacePrediction;
  label: string;
  secondary?: string;
  description: string;
};

type LegacyGoogleSearchItem = {
  type: 'google';
  api: 'legacy';
  key: string;
  prediction: google.maps.places.AutocompletePrediction;
  label: string;
  secondary?: string;
  description: string;
};

type GoogleSearchItem = NewGoogleSearchItem | LegacyGoogleSearchItem;

type CombinedSearchItem =
  | { type: 'local'; key: string; prospect: Prospect; label: string; secondary?: string }
  | GoogleSearchItem;

const FALLBACK_RADIUS_METERS = 50000;
const PLACES_DEBOUNCE_MS = 300;
const DEFAULT_SEARCH_CENTER = { lat: 53.5461, lng: -113.4938 } as const;
const DEFAULT_MARKET_LOCATION = 'Edmonton, Alberta, Canada';
const DEFAULT_MARKET_BOUNDS = {
  north: 53.85,
  east: -112.85,
  south: 53.2,
  west: -114.25,
} as const;

const predictionTextToString = (text?: google.maps.places.FormattableText | null) => text?.text || '';

const withMarketLocation = (query: string, marketLocation: string) => {
  const trimmedQuery = query.trim();
  const trimmedMarket = marketLocation.trim();
  if (!trimmedQuery || !trimmedMarket) return trimmedQuery;

  const normalizedQuery = trimmedQuery.toLowerCase();
  const marketParts = trimmedMarket
    .toLowerCase()
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (marketParts.some((part) => normalizedQuery.includes(part))) {
    return trimmedQuery;
  }

  return `${trimmedQuery}, ${trimmedMarket}`;
};

const getPlacesNamespace = () => window.google?.maps?.places;

const hasNewAutocompleteApi = (places?: typeof google.maps.places) => {
  const maybePlaces = places as unknown as google.maps.PlacesLibrary | undefined;
  return Boolean(maybePlaces?.AutocompleteSuggestion && maybePlaces?.AutocompleteSessionToken);
};

const makeBounds = (bounds?: google.maps.LatLngBoundsLiteral | null) => {
  if (!bounds || !window.google?.maps?.LatLngBounds) return undefined;
  return new window.google.maps.LatLngBounds(
    { lat: bounds.south, lng: bounds.west },
    { lat: bounds.north, lng: bounds.east },
  );
};

export function SearchBar({
  onSearch,
  prospects = [],
  onProspectClick,
  bounds,
  defaultCenter = DEFAULT_SEARCH_CENTER,
  marketLocation = DEFAULT_MARKET_LOCATION,
  clearSignal,
}: SearchBarProps) {
  const [strictBounds, setStrictBounds] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [ready, setReady] = useState(false);
  const [value, setValue] = useState('');
  const [googleResults, setGoogleResults] = useState<GoogleSearchItem[]>([]);
  const requestIdRef = useRef(0);
  const suppressNextFetchRef = useRef(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const listboxId = 'places-suggestions-listbox';
  const normalizedInput = value.trim().toLowerCase();
  const marketName = marketLocation.split(',')[0]?.trim() || 'Market';
  const marketQuery = useCallback((query: string) => withMarketLocation(query, marketLocation), [marketLocation]);

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

    if (strictBounds) {
      return { ...base, locationRestriction: DEFAULT_MARKET_BOUNDS };
    }

    return {
      ...base,
      locationBias: { center: defaultCenter, radius: FALLBACK_RADIUS_METERS } as google.maps.CircleLiteral,
    };
  }, [bounds, strictBounds, defaultCenter]);

  useEffect(() => {
    const places = getPlacesNamespace();
    setReady(Boolean(places && (hasNewAutocompleteApi(places) || places.AutocompleteService)));
  }, []);

  const clearSuggestions = useCallback(() => {
    setGoogleResults([]);
    requestIdRef.current += 1;
  }, []);

  const setValueWithoutFetch = useCallback((nextValue: string) => {
    if (nextValue !== value) {
      suppressNextFetchRef.current = true;
    }
    setValue(nextValue);
  }, [value]);

  const fetchGoogleResults = useCallback(async (input: string): Promise<GoogleSearchItem[]> => {
    const places = getPlacesNamespace();
    if (!places) {
      throw new Error('Google Places library is not loaded.');
    }

    if (hasNewAutocompleteApi(places)) {
      const placesLibrary = places as unknown as google.maps.PlacesLibrary;
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new placesLibrary.AutocompleteSessionToken();
      }
      const { suggestions } = await placesLibrary.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        ...requestOptions,
        input,
        sessionToken: sessionTokenRef.current,
      });
      return suggestions.flatMap((suggestion, idx) => {
        const prediction = suggestion.placePrediction;
        if (!prediction) return [];
        const description = predictionTextToString(prediction.text);
        return [{
          type: 'google' as const,
          api: 'new' as const,
          key: prediction.placeId ? `google-new-${prediction.placeId}` : `google-new-${idx}-${description}`,
          prediction,
          label: predictionTextToString(prediction.mainText) || description,
          secondary: predictionTextToString(prediction.secondaryText) || undefined,
          description,
        }];
      });
    }

    if (!places.AutocompleteService) {
      throw new Error('Google Places autocomplete service is not loaded.');
    }

    const service = new places.AutocompleteService();
    const searchBounds = makeBounds(bounds || (strictBounds ? DEFAULT_MARKET_BOUNDS : null));
    const predictions = await new Promise<google.maps.places.AutocompletePrediction[]>((resolve, reject) => {
      service.getPlacePredictions({
        input,
        componentRestrictions: { country: 'ca' },
        locationRestriction: strictBounds && searchBounds ? searchBounds : undefined,
        locationBias: !strictBounds && searchBounds
          ? searchBounds
          : { center: defaultCenter, radius: FALLBACK_RADIUS_METERS },
      }, (results, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
          resolve(results);
          return;
        }
        if (status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          resolve([]);
          return;
        }
        reject(status);
      });
    });

    return predictions.map((prediction, idx) => {
      const description = prediction.description;
      return {
        type: 'google' as const,
        api: 'legacy' as const,
        key: prediction.place_id ? `google-legacy-${prediction.place_id}` : `google-legacy-${idx}-${description}`,
        prediction,
        label: prediction.structured_formatting?.main_text || description,
        secondary: prediction.structured_formatting?.secondary_text || undefined,
        description,
      };
    });
  }, [bounds, defaultCenter, requestOptions, strictBounds]);

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
          const results = await fetchGoogleResults(marketQuery(input));
          if (!cancelled && requestId === requestIdRef.current) {
            setGoogleResults(results);
          }
        } catch (error) {
          if (!cancelled && requestId === requestIdRef.current) {
            console.error('Failed to fetch Google Places suggestions', error);
            setGoogleResults([]);
          }
        }
      })();
    }, PLACES_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clearSuggestions, fetchGoogleResults, marketQuery, ready, value]);

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
    return [...localItems, ...googleResults];
  }, [googleResults, localResults]);

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

  const resolveNewPlacePrediction = useCallback(async (
    prediction: google.maps.places.PlacePrediction,
    description: string,
  ): Promise<MapSearchLocation> => {
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
    return {
      lat: place.location.lat(),
      lng: place.location.lng(),
      address: place.formattedAddress || description,
      businessName: place.displayName ?? undefined,
      websiteUrl: place.websiteURI ?? undefined,
      contactPhone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? undefined,
      placeId: prediction.placeId,
      googleMapsUrl: place.googleMapsURI ?? undefined,
    };
  }, []);

  const resolveLegacyPlacePrediction = useCallback(async (
    prediction: google.maps.places.AutocompletePrediction,
    description: string,
  ): Promise<MapSearchLocation> => {
    const places = getPlacesNamespace();
    if (!places?.PlacesService || !prediction.place_id) {
      throw new Error('Google Places details service is not loaded.');
    }

    if (!placesServiceRef.current) {
      placesServiceRef.current = new places.PlacesService(document.createElement('div'));
    }

    const place = await new Promise<google.maps.places.PlaceResult>((resolve, reject) => {
      placesServiceRef.current?.getDetails({
        placeId: prediction.place_id,
        fields: [
          'name',
          'formatted_address',
          'geometry',
          'website',
          'formatted_phone_number',
          'international_phone_number',
          'url',
          'place_id',
        ],
      }, (result, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && result) {
          resolve(result);
          return;
        }
        reject(status);
      });
    });

    const location = place.geometry?.location;
    if (!location) {
      throw new Error('Selected place did not include a location.');
    }

    return {
      lat: location.lat(),
      lng: location.lng(),
      address: place.formatted_address || description,
      businessName: place.name ?? undefined,
      websiteUrl: place.website ?? undefined,
      contactPhone: place.formatted_phone_number ?? place.international_phone_number ?? undefined,
      placeId: place.place_id || prediction.place_id,
      googleMapsUrl: place.url ?? undefined,
    };
  }, []);

  const resolveGoogleItem = useCallback((item: GoogleSearchItem) => {
    if (item.api === 'new') {
      return resolveNewPlacePrediction(item.prediction, item.description);
    }
    return resolveLegacyPlacePrediction(item.prediction, item.description);
  }, [resolveLegacyPlacePrediction, resolveNewPlacePrediction]);

  const handleSelect =
    (item: GoogleSearchItem) =>
    () => {
      const { description } = item;
      setValueWithoutFetch(description);
      clearSuggestions();
      setActiveIndex(-1);

      void (async () => {
        try {
          onSearch(await resolveGoogleItem(item));
        } catch (error) {
          try {
            const fallback = await geocodeAddress(marketQuery(description));
            onSearch({ ...fallback, businessName: undefined, websiteUrl: undefined });
          } catch (fallbackError) {
            console.error('Failed to resolve selected Google Places suggestion', error, fallbackError);
          }
        } finally {
          sessionTokenRef.current = null;
        }
      })();
    };

  const submitFreeformSearch = useCallback(() => {
    const query = value.trim();
    if (!query || !ready) return;

    setValueWithoutFetch(query);
    clearSuggestions();
    setActiveIndex(-1);

    void (async () => {
      const searchQuery = marketQuery(query);
      try {
        const results = await fetchGoogleResults(searchQuery);
        const first = results[0];
        if (!first) {
          throw new Error('No Google Places prediction found for freeform search.');
        }
        setValueWithoutFetch(first.description);
        onSearch(await resolveGoogleItem(first));
      } catch (error) {
        try {
          const fallback = await geocodeAddress(searchQuery);
          onSearch({ ...fallback, businessName: undefined, websiteUrl: undefined });
        } catch (fallbackError) {
          console.error('Failed to resolve freeform Google search', error, fallbackError);
        }
      } finally {
        sessionTokenRef.current = null;
      }
    })();
  }, [clearSuggestions, fetchGoogleResults, geocodeAddress, marketQuery, onSearch, ready, resolveGoogleItem, setValueWithoutFetch, value]);

  const submitFirstResultOrFreeform = useCallback(() => {
    if (combinedResults.length > 0) {
      const first = combinedResults[0];
      if (first.type === 'local') {
        handleLocalSelect(first.prospect)();
      } else {
        handleSelect(first)();
      }
      return;
    }
    submitFreeformSearch();
  }, [combinedResults, handleLocalSelect, handleSelect, submitFreeformSearch]);

  const renderSuggestions = () => {
    const localCount = localResults.length;
    const localItems = combinedResults.slice(0, localCount).filter((item) => item.type === 'local');
    return (
      <>
        {localCount > 0 && (
          <li className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase text-slate-500">
            Saved market
          </li>
        )}
        {localItems.map((item, idx) => (
          <li
            key={item.key}
            id={`places-option-${idx}`}
            role="option"
            aria-selected={activeIndex === idx}
            onClick={handleLocalSelect(item.prospect)}
            onMouseEnter={() => setActiveIndex(idx)}
            className={`cursor-pointer border-b border-slate-100 px-3 py-2.5 ${activeIndex === idx ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'}`}
          >
            <div className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5 shrink-0 text-blue-600" />
              <strong className="min-w-0 truncate text-sm font-medium text-slate-950">{item.label}</strong>
              <span className="rounded-sm border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">Level CRE</span>
            </div>
            {item.secondary && <small className="ml-5 block truncate text-xs text-slate-500">{item.secondary}</small>}
          </li>
        ))}
        {googleResults.length > 0 ? (
          <li className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase text-slate-500">
            Google Places near {marketName}
          </li>
        ) : null}
        {googleResults.map((item, resultIndex) => {
          const idx = localCount + resultIndex;
          return (
            <li
              key={item.key}
              id={`places-option-${idx}`}
              role="option"
              aria-selected={activeIndex === idx}
              onClick={handleSelect(item)}
              onMouseEnter={() => setActiveIndex(idx)}
              className={`flex cursor-pointer items-start gap-2 border-b border-slate-100 px-3 py-2.5 last:border-b-0 ${activeIndex === idx ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="min-w-0">
                <strong className="block truncate text-sm font-medium text-slate-950">{item.label}</strong>
                {item.secondary && <small className="block truncate text-xs text-slate-500">{item.secondary}</small>}
              </span>
            </li>
          );
        })}
      </>
    );
  };

  return (
    <div className="relative w-full sm:w-[min(72vw,520px)]">
      <div className="flex h-12 items-center gap-2 rounded-md border border-slate-300 bg-white px-2 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
        <Search className="ml-1 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <input
          ref={ref}
          value={value}
          onChange={handleInput}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              if (combinedResults.length === 0) return;
              e.preventDefault();
              setActiveIndex((prev) => {
                const next = Math.min(prev + 1, combinedResults.length - 1);
                const el = listRef.current?.querySelector(`#places-option-${next}`) as HTMLElement | null;
                el?.scrollIntoView({ block: 'nearest' });
                return next;
              });
            } else if (e.key === 'ArrowUp') {
              if (combinedResults.length === 0) return;
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
              e.preventDefault();
              if (activeIndex >= 0 && activeIndex < combinedResults.length) {
                const item = combinedResults[activeIndex];
                if (item.type === 'local') {
                  handleLocalSelect(item.prospect)();
                } else {
                  handleSelect(item)();
                }
              } else {
                submitFirstResultOrFreeform();
              }
            } else if (e.key === 'Escape') {
              clearSuggestions();
              setActiveIndex(-1);
            }
          }}
          disabled={!ready}
          className="min-w-0 flex-1 bg-transparent px-1 text-sm font-medium text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:outline-none"
          placeholder={`Search ${marketName} companies or addresses`}
          aria-label="Search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={combinedResults.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `places-option-${activeIndex}` : undefined}
        />
        <button
          type="button"
          aria-label={`Limit search to the ${marketName} market`}
          aria-pressed={strictBounds}
          title={strictBounds ? `${marketName} market only` : `Prefer ${marketName}, allow nearby results`}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-semibold ${strictBounds ? 'bg-slate-900 text-white hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
          onClick={() => setStrictBounds((v) => !v)}
        >
          <MapPinned className="h-4 w-4" />
          <span className="hidden sm:inline">{marketName}</span>
        </button>
        <button
          type="button"
          aria-label="Search"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-blue-600 text-xs text-white shadow-sm hover:bg-blue-700 active:translate-y-px"
          onClick={submitFirstResultOrFreeform}
        >
          <Search className="w-4 h-4" strokeWidth={2.5} />
        </button>
      </div>
      {combinedResults.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          ref={listRef}
          className="absolute z-[120] mt-1.5 max-h-80 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.16)]"
        >
          {renderSuggestions()}
        </ul>
      )}
    </div>
  );
}
