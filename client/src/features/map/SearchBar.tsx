import { useRef, useState, useCallback, useEffect } from 'react';
import { Search } from 'lucide-react';
import usePlacesAutocomplete, {
  getGeocode,
  getLatLng,
} from 'use-places-autocomplete';

interface SearchBarProps {
  onSearch: (location: { lat: number; lng: number; address: string; businessName?: string | null; websiteUrl?: string | null }) => void;
}

export function SearchBar({ onSearch }: SearchBarProps) {
  const {
    ready,
    value,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: {
      /* Define search scope here */
    },
    debounce: 300,
  });
  
  const ref = useRef<HTMLInputElement>(null);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  const handleSelect =
    ({ description }: { description: string }) =>
    () => {
      // When user selects a place, we can replace the keyword without request data from API
      // by setting the second parameter to "false"
      setValue(description, false);
      clearSuggestions();

      // Get latitude and longitude via utility functions
      getGeocode({ address: description }).then((results) => {
        const { lat, lng } = getLatLng(results[0]);
        console.log('📍 Coordinates: ', { lat, lng });
        onSearch({ lat, lng, address: description });
      });
    };

  const renderSuggestions = () =>
    data.map((suggestion) => {
      const {
        place_id,
        structured_formatting: { main_text, secondary_text },
      } = suggestion;

      return (
        <li
          key={place_id}
          onClick={handleSelect(suggestion)}
          className="p-2 hover:bg-gray-100 cursor-pointer"
        >
          <strong>{main_text}</strong> <small>{secondary_text}</small>
        </li>
      );
    });

  return (
    <div className="relative w-[min(85vw,420px)]">
      <div className="flex items-center gap-2 bg-white/95 shadow-sm border border-gray-200 px-3 py-1.5">
        <input
          ref={ref}
          value={value}
          onChange={handleInput}
          disabled={!ready}
          className="flex-1 bg-transparent text-sm placeholder:text-gray-400 text-gray-800 focus:outline-none"
          placeholder="Search..."
          aria-label="Search"
        />
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
      {status === 'OK' && <ul className="absolute z-10 w-full bg-white shadow-lg rounded-lg mt-1 max-h-60 overflow-y-auto">{renderSuggestions()}</ul>}
    </div>
  );
}
