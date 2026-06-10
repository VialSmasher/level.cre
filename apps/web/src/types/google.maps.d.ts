/// <reference types="@types/google.maps" />

declare global {
  interface Window {
    google: typeof google;
  }
}

declare namespace google.maps.places {
  class AutocompleteSessionToken {}

  interface AutocompleteRequest {
    input: string;
    includedRegionCodes?: string[];
    includedPrimaryTypes?: string[];
    language?: string;
    locationBias?: google.maps.LatLngBoundsLiteral | google.maps.CircleLiteral;
    locationRestriction?: google.maps.LatLngBoundsLiteral;
    origin?: google.maps.LatLng | google.maps.LatLngLiteral;
    region?: string;
    sessionToken?: AutocompleteSessionToken;
  }

  interface AutocompleteResponse {
    suggestions: AutocompleteSuggestion[];
  }

  class AutocompleteSuggestion {
    placePrediction?: PlacePrediction;

    static fetchAutocompleteSuggestions(request: AutocompleteRequest): Promise<AutocompleteResponse>;
  }

  interface PredictionText {
    text?: string;
    toString(): string;
  }

  interface PlacePrediction {
    placeId: string;
    text: PredictionText;
    mainText?: PredictionText;
    secondaryText?: PredictionText;
    toPlace(): Place;
  }

  class Place {
    displayName?: string | null;
    formattedAddress?: string | null;
    googleMapsURI?: string | null;
    internationalPhoneNumber?: string | null;
    location?: google.maps.LatLng | null;
    nationalPhoneNumber?: string | null;
    websiteURI?: string | null;

    fetchFields(options: { fields: string[] }): Promise<void>;
  }

  interface PlacesLibrary {
    AutocompleteSessionToken: typeof AutocompleteSessionToken;
    AutocompleteSuggestion: typeof AutocompleteSuggestion;
    Place: typeof Place;
  }
}

export {};