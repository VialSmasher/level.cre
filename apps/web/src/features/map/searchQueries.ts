const ADDRESS_TERMS = /\b(?:avenue|ave|boulevard|blvd|circle|court|crescent|cres|drive|dr|highway|hwy|lane|parkway|pkwy|place|range road|road|route|rr|street|st|terrace|township|trail|way)\b/i;
const CANADIAN_POSTAL_CODE = /\b[a-z]\d[a-z]\s?\d[a-z]\d\b/i;
const STREET_NUMBER = /\b\d{1,6}(?:-\d{1,6})?\s+\S/i;

export function buildPlacesAutocompleteQuery(query: string) {
  return query.trim();
}

export function buildMarketGeocodeQuery(query: string, marketLocation: string) {
  const trimmedQuery = query.trim();
  const trimmedMarket = marketLocation.trim();
  if (!trimmedQuery || !trimmedMarket) return trimmedQuery;

  const marketName = trimmedMarket.split(',')[0]?.trim().toLowerCase();
  if (marketName && trimmedQuery.toLowerCase().includes(marketName)) {
    return trimmedQuery;
  }

  return `${trimmedQuery}, ${trimmedMarket}`;
}

export function isLikelyAddressQuery(query: string) {
  const trimmed = query.trim();
  return STREET_NUMBER.test(trimmed) || ADDRESS_TERMS.test(trimmed) || CANADIAN_POSTAL_CODE.test(trimmed);
}
