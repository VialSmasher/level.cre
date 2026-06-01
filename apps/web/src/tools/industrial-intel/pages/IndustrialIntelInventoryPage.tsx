import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GoogleMap, InfoWindowF, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import Papa from "papaparse";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getGoogleMapsApiKey } from "@/lib/googleMapsApiKey";
import { apiRequest } from "@/lib/queryClient";

type IntelListing = {
  id: string;
  sourceId: string;
  sourceName: string | null;
  title: string;
  address: string | null;
  market: string | null;
  submarket: string | null;
  status: string;
  listingType: string;
  assetType: string;
  availableSf: number | null;
  landAcres: number | null;
  totalPrice: number | null;
  pricePerAcre: number | null;
  brochureUrl: string | null;
  sourceUrl: string | null;
  lastSeenAt: string | null;
  removedAt: string | null;
  latitude?: number | null;
  longitude?: number | null;
  normalizedAddress?: string | null;
  geocodeStatus?: string | null;
  geocodeConfidence?: number | null;
  dataQualityStatus?: string | null;
};

type MappableIntelListing = IntelListing & {
  latitude: number;
  longitude: number;
};

type UploadListingRecord = {
  sourceUrl: string | null;
  title: string;
  brochureUrl: string | null;
  address: string | null;
  market: string | null;
  submarket: string | null;
  listingType: string | null;
  assetType: string | null;
  recordKeySuffix: string | null;
  availableSf: number | null;
  landAcres: number | null;
  totalPrice: number | null;
  pricePerAcre: number | null;
};

const GOOGLE_MAPS_API_KEY = getGoogleMapsApiKey();
const DEFAULT_MAP_CENTER = { lat: 53.5461, lng: -113.4938 };
const MAP_CONTAINER_STYLE = { width: "100%", height: "100%" };

type IntelListingMapProps = {
  filteredListings: IntelListing[];
  mappableListings: MappableIntelListing[];
  selectedListing: IntelListing | null;
  selectedMappableListing: MappableIntelListing | null;
  mapCenter: { lat: number; lng: number };
  onSelectListing: (id: string | null) => void;
};

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

function formatListingType(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Unknown";
}

function formatStatus(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Unknown";
}

function formatAssetType(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Unknown";
}

function formatListingSize(listing: IntelListing) {
  if (listing.assetType === "land") {
    return listing.landAcres ? `${listing.landAcres.toLocaleString()} ac` : "-";
  }
  return listing.availableSf?.toLocaleString() || "-";
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function readUploadValue(row: Record<string, unknown>, aliases: string[]) {
  const wanted = new Set(aliases.map(normalizeHeader));
  const found = Object.entries(row).find(([key]) => wanted.has(normalizeHeader(key)));
  const value = found?.[1];
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function parseUploadNumber(value: string) {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferUploadListingType(rowText: string) {
  const lower = rowText.toLowerCase();
  if (lower.includes("sublease") || lower.includes("sub-lease")) return "sublease";
  if (lower.includes("sale")) return "sale";
  if (lower.includes("lease")) return "lease";
  return "lease";
}

function inferUploadAssetType(rowText: string) {
  const lower = rowText.toLowerCase();
  if (lower.includes("land") || lower.includes("acre")) return "land";
  if (lower.includes("yard")) return "yard";
  return "building";
}

function buildUploadRecord(row: Record<string, unknown>, index: number): UploadListingRecord | null {
  const title =
    readUploadValue(row, ["title", "listing", "listing title", "property", "property name", "name"]) ||
    readUploadValue(row, ["address", "street address", "property address"]);
  const address = readUploadValue(row, ["address", "street address", "property address", "location"]);
  const sourceUrl = readUploadValue(row, ["url", "source url", "listing url", "link", "loopnet url", "website"]);
  const brochureUrl = readUploadValue(row, ["brochure", "brochure url", "flyer", "flyer url", "pdf"]);
  const listingType = readUploadValue(row, ["listing type", "deal type", "type"]);
  const assetType = readUploadValue(row, ["asset type", "property type"]);
  const rowText = Object.values(row).join(" ");

  if (!title && !address) return null;

  return {
    sourceUrl: sourceUrl || null,
    title: title || `Uploaded listing ${index + 1}`,
    brochureUrl: brochureUrl || null,
    address: address || null,
    market: readUploadValue(row, ["market", "city", "region name"]) || "Edmonton Metro",
    submarket: readUploadValue(row, ["submarket", "submarket name", "submarket cluster", "area", "district"]) || null,
    listingType: (listingType || inferUploadListingType(rowText)).toLowerCase(),
    assetType: (assetType || inferUploadAssetType(rowText)).toLowerCase(),
    recordKeySuffix: readUploadValue(row, ["id", "listing id", "mls", "record id", "propertyid", "property id"]) || null,
    availableSf: parseUploadNumber(readUploadValue(row, [
      "available sf",
      "sf",
      "size",
      "building sf",
      "lease sf",
      "space available",
      "total available space (sf)",
      "total available space",
      "direct available space",
      "smallest available space",
      "max building contiguous space",
    ])),
    landAcres: parseUploadNumber(readUploadValue(row, ["land acres", "acres", "site acres", "land size"])),
    totalPrice: parseUploadNumber(readUploadValue(row, ["price", "sale price", "asking price", "purchase price"])),
    pricePerAcre: parseUploadNumber(readUploadValue(row, ["price per acre", "$/acre", "psa"])),
  };
}

function hasListingQualityIssue(listing: IntelListing) {
  const lowerTitle = listing.title.toLowerCase();
  return (
    !listing.address ||
    lowerTitle.length < 12 ||
    lowerTitle.includes("contact an associate") ||
    listing.dataQualityStatus === "review" ||
    listing.geocodeStatus === "blocked"
  );
}

function isMappableListing(listing: IntelListing): listing is MappableIntelListing {
  return typeof listing.latitude === "number" && typeof listing.longitude === "number";
}

function IndustrialIntelListingMap({
  filteredListings,
  mappableListings,
  selectedListing,
  selectedMappableListing,
  mapCenter,
  onSelectListing,
}: IntelListingMapProps) {
  const { isLoaded: isMapLoaded, loadError: mapLoadError } = useJsApiLoader({
    id: "industrial-intel-map",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  return (
    <Card className="xl:order-2">
      <CardHeader>
        <CardTitle>Map</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <p>
            Showing <span className="font-semibold text-slate-900">{mappableListings.length}</span> mapped listings from the current filtered set.
          </p>
          <p>
            {filteredListings.length - mappableListings.length} still need geocodes or address cleanup.
          </p>
        </div>

        {mapLoadError ? (
          <div className="rounded-2xl border border-dashed border-rose-300 bg-rose-50 px-6 py-10 text-center">
            <p className="text-base font-medium text-rose-900">Map failed to load</p>
            <p className="mt-2 text-sm text-rose-700">Check the shared Google Maps key configuration and allowed referrers.</p>
          </div>
        ) : !isMapLoaded ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600">
            Loading map...
          </div>
        ) : mappableListings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
            <p className="text-base font-medium text-slate-900">No mapped listings yet</p>
            <p className="mt-2 text-sm text-slate-600">
              This first slice is wired. As soon as listing records expose latitude and longitude, filtered listings will render here automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="h-[420px] overflow-hidden rounded-2xl border border-slate-200">
              <GoogleMap
                mapContainerStyle={MAP_CONTAINER_STYLE}
                center={mapCenter}
                zoom={selectedMappableListing ? 13 : 10}
                options={{
                  streetViewControl: false,
                  mapTypeControl: false,
                  fullscreenControl: true,
                  gestureHandling: "greedy",
                }}
              >
                {mappableListings.map((listing) => (
                  <MarkerF
                    key={listing.id}
                    position={{ lat: listing.latitude, lng: listing.longitude }}
                    onClick={() => onSelectListing(listing.id)}
                  />
                ))}
                {selectedMappableListing && (
                  <InfoWindowF
                    position={{ lat: selectedMappableListing.latitude, lng: selectedMappableListing.longitude }}
                    onCloseClick={() => onSelectListing(null)}
                  >
                    <div className="max-w-[16rem] space-y-2 p-1 text-sm text-slate-700">
                      <p className="font-semibold text-slate-900">{selectedMappableListing.title}</p>
                      <p>{selectedMappableListing.normalizedAddress || selectedMappableListing.address || "Address needs review"}</p>
                      <p>
                        {formatListingType(selectedMappableListing.listingType)} - {formatListingSize(selectedMappableListing)}
                      </p>
                      <p>{selectedMappableListing.sourceName || "Unknown source"}</p>
                      <div className="flex flex-wrap gap-3">
                        {selectedMappableListing.brochureUrl && (
                          <a href={selectedMappableListing.brochureUrl} target="_blank" rel="noreferrer" className="text-sky-700 hover:text-sky-900">
                            Brochure
                          </a>
                        )}
                        {selectedMappableListing.sourceUrl && (
                          <a href={selectedMappableListing.sourceUrl} target="_blank" rel="noreferrer" className="text-sky-700 hover:text-sky-900">
                            Source
                          </a>
                        )}
                      </div>
                    </div>
                  </InfoWindowF>
                )}
              </GoogleMap>
            </div>
            {selectedListing && !selectedMappableListing && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span className="font-medium text-amber-900">Selected listing is not mappable yet.</span> It still needs geocoding or address cleanup before it can render on the map.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MapUnavailableCard() {
  return (
    <Card className="xl:order-2">
      <CardHeader>
        <CardTitle>Map</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-6 py-10 text-center">
          <p className="text-base font-medium text-amber-900">Google Maps key is not available in this environment</p>
          <p className="mt-2 text-sm text-amber-800">
            Listings still load below. Once the shared key is present at runtime, mapped records will render here.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function IndustrialIntelInventoryPage() {
  const queryClient = useQueryClient();
  const [showManualIntake, setShowManualIntake] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    query: "",
    submarket: "all",
    listingType: "all",
    source: "all",
    status: "active",
    minSf: "",
    maxSf: "",
  });
  const [form, setForm] = useState({
    sourceUrl: "",
    title: "",
    brochureUrl: "",
    address: "",
    market: "Edmonton Metro",
    submarket: "",
    listingType: "lease",
    assetType: "building",
    recordKeySuffix: "",
    availableSf: "",
    landAcres: "",
    totalPrice: "",
    pricePerAcre: "",
  });
  const [uploadSourceName, setUploadSourceName] = useState("LoopNet Weekly Export");
  const [uploadRows, setUploadRows] = useState<UploadListingRecord[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: listings = [], isLoading, isError, error } = useQuery<IntelListing[]>({
    queryKey: ["/api/intel/listings"],
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/intel/manual-listings/preview", {
        sourceUrl: form.sourceUrl,
      });
      return response.json();
    },
    onSuccess: (preview) => {
      setForm((current) => ({
        ...current,
        title: current.title || preview.title || "",
        brochureUrl: current.brochureUrl || preview.brochureUrl || "",
        address: current.address || preview.address || "",
        market: current.market || preview.market || "Edmonton Metro",
        submarket: current.submarket || preview.submarket || "",
        listingType: current.listingType || preview.listingType || "lease",
        assetType: current.assetType || preview.assetType || "building",
        availableSf: current.availableSf || (preview.availableSf ? String(preview.availableSf) : ""),
        landAcres: current.landAcres || (preview.landAcres ? String(preview.landAcres) : ""),
        totalPrice: current.totalPrice || (preview.totalPrice ? String(preview.totalPrice) : ""),
        pricePerAcre: current.pricePerAcre || (preview.pricePerAcre ? String(preview.pricePerAcre) : ""),
      }));
    },
  });

  const manualIngestMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/intel/manual-listings", {
        sourceUrl: form.sourceUrl,
        title: form.title,
        brochureUrl: form.brochureUrl || null,
        address: form.address || null,
        market: form.market || null,
        submarket: form.submarket || null,
        listingType: form.listingType || null,
        assetType: form.assetType || null,
        recordKeySuffix: form.recordKeySuffix || null,
        availableSf: form.availableSf ? Number(form.availableSf) : null,
        landAcres: form.landAcres ? Number(form.landAcres) : null,
        totalPrice: form.totalPrice ? Number(form.totalPrice) : null,
        pricePerAcre: form.pricePerAcre ? Number(form.pricePerAcre) : null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intel/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/changes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/summary"] });
      setForm((current) => ({
        ...current,
        sourceUrl: "",
        title: "",
        brochureUrl: "",
        address: "",
        submarket: "",
        recordKeySuffix: "",
        availableSf: "",
        landAcres: "",
        totalPrice: "",
        pricePerAcre: "",
      }));
      setShowManualIntake(false);
    },
  });

  const uploadIngestMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/intel/manual-listings/upload", {
        sourceName: uploadSourceName || "Spreadsheet Upload",
        records: uploadRows,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intel/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/changes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/summary"] });
      setUploadRows([]);
      setUploadError(null);
      setShowManualIntake(false);
    },
  });

  function handleUploadFile(file: File | null) {
    if (!file) return;
    setUploadError(null);
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const records = result.data
          .map((row, index) => buildUploadRecord(row, index))
          .filter((record): record is UploadListingRecord => Boolean(record));

        if (result.errors.length > 0 && records.length === 0) {
          setUploadRows([]);
          setUploadError(result.errors[0]?.message || "Could not parse that CSV.");
          return;
        }

        if (records.length === 0) {
          setUploadRows([]);
          setUploadError("No usable listing rows found. Make sure the file has a title or address column.");
          return;
        }

        setUploadRows(records.slice(0, 500));
      },
      error: (error) => {
        setUploadRows([]);
        setUploadError(error.message || "Could not parse that CSV.");
      },
    });
  }

  const submarketOptions = useMemo(() => {
    return Array.from(new Set(listings.map((listing) => listing.submarket || listing.market).filter(Boolean)))
      .sort((a, b) => String(a).localeCompare(String(b)));
  }, [listings]);

  const sourceOptions = useMemo(() => {
    return Array.from(new Set(listings.map((listing) => listing.sourceName).filter(Boolean)))
      .sort((a, b) => String(a).localeCompare(String(b)));
  }, [listings]);

  const filteredListings = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    const minSf = filters.minSf ? Number(filters.minSf) : null;
    const maxSf = filters.maxSf ? Number(filters.maxSf) : null;

    return listings.filter((listing) => {
      const listingSubmarket = listing.submarket || listing.market || "";
      const isRemoved = Boolean(listing.removedAt);

      if (filters.status === "active" && isRemoved) return false;
      if (filters.status === "removed" && !isRemoved) return false;
      if (filters.submarket !== "all" && listingSubmarket !== filters.submarket) return false;
      if (filters.listingType !== "all" && listing.listingType !== filters.listingType) return false;
      if (filters.source !== "all" && (listing.sourceName || "") !== filters.source) return false;
      if (minSf !== null && (listing.availableSf ?? 0) < minSf) return false;
      if (maxSf !== null && (listing.availableSf ?? Number.POSITIVE_INFINITY) > maxSf) return false;
      if (query) {
        const haystack = [listing.title, listing.address, listingSubmarket, listing.sourceName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [filters, listings]);

  const mappableListings = useMemo(
    () => filteredListings.filter(isMappableListing),
    [filteredListings],
  );

  const selectedListing = useMemo(() => {
    const activeListing = filteredListings.find((listing) => listing.id === selectedListingId) || null;
    if (activeListing) return activeListing;
    return mappableListings[0] || filteredListings[0] || null;
  }, [filteredListings, mappableListings, selectedListingId]);

  const selectedMappableListing = selectedListing && isMappableListing(selectedListing) ? selectedListing : null;
  const activeListings = useMemo(() => listings.filter((listing) => !listing.removedAt), [listings]);
  const mappedCount = useMemo(() => listings.filter(isMappableListing).length, [listings]);
  const needsGeocodeCount = useMemo(
    () => listings.filter((listing) => !listing.removedAt && !isMappableListing(listing)).length,
    [listings],
  );
  const needsReviewCount = useMemo(
    () => listings.filter((listing) => !listing.removedAt && hasListingQualityIssue(listing)).length,
    [listings],
  );
  const removedCount = useMemo(() => listings.filter((listing) => Boolean(listing.removedAt)).length, [listings]);

  const mapCenter = useMemo(() => {
    if (selectedMappableListing) {
      return { lat: selectedMappableListing.latitude, lng: selectedMappableListing.longitude };
    }

    if (mappableListings.length > 0) {
      const totals = mappableListings.reduce(
        (accumulator, listing) => ({
          lat: accumulator.lat + listing.latitude,
          lng: accumulator.lng + listing.longitude,
        }),
        { lat: 0, lng: 0 },
      );

      return {
        lat: totals.lat / mappableListings.length,
        lng: totals.lng / mappableListings.length,
      };
    }

    return DEFAULT_MAP_CENTER;
  }, [mappableListings, selectedMappableListing]);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge variant="outline" className="mb-2 rounded-full border-blue-200 bg-blue-50 px-3 py-1 text-blue-700">
            Industrial Intel
          </Badge>
          <h2 className="text-3xl font-semibold text-slate-950">External Inventory</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Review tracked external listings, narrow the set quickly with filters, and keep manual intake tucked away for the rare edge case.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowManualIntake((current) => !current)}
          className="w-fit rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:border-blue-200 hover:text-blue-700"
        >
          {showManualIntake ? "Hide manual intake" : "Manual intake"}
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Active", value: activeListings.length, caption: "not removed" },
          { label: "Mapped", value: mappedCount, caption: "ready for map" },
          { label: "Needs geocode", value: needsGeocodeCount, caption: "address cleanup" },
          { label: "Needs review", value: needsReviewCount, caption: "quality flags" },
          { label: "Removed", value: removedCount, caption: "source disappeared" },
        ].map((item) => (
          <Card key={item.label} className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-slate-600">{item.label}</p>
              <p className="mt-1 text-3xl font-bold text-slate-950">{item.value}</p>
              <p className="mt-1 text-xs text-slate-500">{item.caption}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2 xl:col-span-2">
              <Label htmlFor="searchListings">Search listings</Label>
              <Input
                id="searchListings"
                placeholder="Search title, address, submarket, or source"
                value={filters.query}
                onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="submarketFilter">Submarket</Label>
              <select
                id="submarketFilter"
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                value={filters.submarket}
                onChange={(event) => setFilters((current) => ({ ...current, submarket: event.target.value }))}
              >
                <option value="all">All submarkets</option>
                {submarketOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="typeFilter">Listing type</Label>
              <select
                id="typeFilter"
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                value={filters.listingType}
                onChange={(event) => setFilters((current) => ({ ...current, listingType: event.target.value }))}
              >
                <option value="all">All types</option>
                <option value="lease">Lease</option>
                <option value="sale">Sale</option>
                <option value="sublease">Sublease</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sourceFilter">Source</Label>
              <select
                id="sourceFilter"
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                value={filters.source}
                onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value }))}
              >
                <option value="all">All sources</option>
                {sourceOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="statusFilter">Status</Label>
              <select
                id="statusFilter"
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                value={filters.status}
                onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="active">Active only</option>
                <option value="all">All listings</option>
                <option value="removed">Removed only</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="minSfFilter">Min SF</Label>
              <Input
                id="minSfFilter"
                inputMode="numeric"
                placeholder="No minimum"
                value={filters.minSf}
                onChange={(event) => setFilters((current) => ({ ...current, minSf: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxSfFilter">Max SF</Label>
              <Input
                id="maxSfFilter"
                inputMode="numeric"
                placeholder="No maximum"
                value={filters.maxSf}
                onChange={(event) => setFilters((current) => ({ ...current, maxSf: event.target.value }))}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm text-slate-600">
              Showing <span className="font-semibold text-slate-900">{filteredListings.length}</span> of <span className="font-semibold text-slate-900">{listings.length}</span> listings.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFilters({ query: "", submarket: "all", listingType: "all", source: "all", status: "active", minSf: "", maxSf: "" })}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
              >
                Clear filters
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {showManualIntake && (
        <Card>
          <CardHeader>
            <CardTitle>Manual Intake</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Upload a weekly CSV export for bulk updates, or save a one-off URL when a listing needs manual handling.
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.45fr)]">
                <div className="space-y-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">Spreadsheet upload</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Export Excel as CSV, then upload it here. Common columns like address, title, SF, acres, type, price, and URL are detected automatically.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.6fr)]">
                    <div className="space-y-2">
                      <Label htmlFor="uploadSourceName">Upload source</Label>
                      <Input
                        id="uploadSourceName"
                        value={uploadSourceName}
                        onChange={(event) => setUploadSourceName(event.target.value)}
                        placeholder="LoopNet Weekly Export"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="listingCsv">CSV file</Label>
                      <Input
                        id="listingCsv"
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(event) => handleUploadFile(event.target.files?.[0] || null)}
                      />
                    </div>
                  </div>
                  {uploadError && <p className="text-sm text-rose-600">{uploadError}</p>}
                  {uploadIngestMutation.isError && (
                    <p className="text-sm text-rose-600">{(uploadIngestMutation.error as Error).message}</p>
                  )}
                  {uploadRows.length > 0 && (
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        Ready to import <span className="font-semibold text-slate-900">{uploadRows.length}</span> rows. Preview the first few before saving.
                      </div>
                      <div className="max-h-64 overflow-auto rounded-2xl border border-slate-200">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-3 py-2 font-semibold">Title</th>
                              <th className="px-3 py-2 font-semibold">Address</th>
                              <th className="px-3 py-2 font-semibold">Type</th>
                              <th className="px-3 py-2 font-semibold">Size</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {uploadRows.slice(0, 8).map((row, index) => (
                              <tr key={`${row.title}-${index}`}>
                                <td className="max-w-[18rem] px-3 py-2 font-medium text-slate-900">{row.title}</td>
                                <td className="max-w-[16rem] px-3 py-2 text-slate-600">{row.address || "Needs review"}</td>
                                <td className="px-3 py-2 text-slate-600">{row.listingType || "lease"} / {row.assetType || "building"}</td>
                                <td className="px-3 py-2 text-slate-600">
                                  {row.availableSf ? row.availableSf.toLocaleString() : row.landAcres ? `${row.landAcres} ac` : "-"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Weekly importer</p>
                    <p className="mt-2 text-sm text-slate-600">
                      Imports update existing rows when the source URL or row identity matches. Missing rows are not removed yet, so this is safe for mixed exports.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => uploadIngestMutation.mutate()}
                    disabled={uploadIngestMutation.isPending || uploadRows.length === 0}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {uploadIngestMutation.isPending ? "Importing..." : `Import ${uploadRows.length || ""} rows`}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <h3 className="text-base font-semibold text-slate-950">Single URL intake</h3>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="sourceUrl">Listing URL</Label>
                <Input id="sourceUrl" placeholder="https://..." value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="title">Listing title</Label>
                <Input id="title" placeholder="Short, clean listing title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brochureUrl">Brochure URL</Label>
                <Input id="brochureUrl" placeholder="Optional brochure link" value={form.brochureUrl} onChange={(event) => setForm({ ...form, brochureUrl: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" placeholder="Street address if confirmed" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="market">Market</Label>
                <Input id="market" placeholder="Edmonton Metro" value={form.market} onChange={(event) => setForm({ ...form, market: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="submarket">Submarket</Label>
                <Input id="submarket" placeholder="Optional submarket" value={form.submarket} onChange={(event) => setForm({ ...form, submarket: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="listingType">Listing type</Label>
                <select id="listingType" className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" value={form.listingType} onChange={(event) => setForm({ ...form, listingType: event.target.value })}>
                  <option value="lease">Lease</option>
                  <option value="sale">Sale</option>
                  <option value="sublease">Sublease</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assetType">Asset type</Label>
                <select id="assetType" className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" value={form.assetType} onChange={(event) => setForm({ ...form, assetType: event.target.value })}>
                  <option value="building">Building</option>
                  <option value="land">Land</option>
                  <option value="yard">Yard</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="recordKeySuffix">Record key suffix</Label>
                <Input id="recordKeySuffix" placeholder="Optional, e.g. sale or lease" value={form.recordKeySuffix} onChange={(event) => setForm({ ...form, recordKeySuffix: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="availableSf">Available SF</Label>
                <Input id="availableSf" placeholder="Optional square footage" value={form.availableSf} onChange={(event) => setForm({ ...form, availableSf: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="landAcres">Land acres</Label>
                <Input id="landAcres" placeholder="Optional acreage" value={form.landAcres} onChange={(event) => setForm({ ...form, landAcres: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalPrice">Total price</Label>
                <Input id="totalPrice" placeholder="Optional total price" value={form.totalPrice} onChange={(event) => setForm({ ...form, totalPrice: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pricePerAcre">Price per acre</Label>
                <Input id="pricePerAcre" placeholder="Optional price per acre" value={form.pricePerAcre} onChange={(event) => setForm({ ...form, pricePerAcre: event.target.value })} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => previewMutation.mutate()}
                disabled={previewMutation.isPending || !form.sourceUrl}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {previewMutation.isPending ? "Fetching..." : "Preview autofill"}
              </button>
              <button
                type="button"
                onClick={() => manualIngestMutation.mutate()}
                disabled={manualIngestMutation.isPending || !form.sourceUrl || !form.title}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {manualIngestMutation.isPending ? "Saving..." : "Save to Tool B"}
              </button>
              <p className="text-sm text-slate-500">
                Review any autofilled values before saving. Use the record key suffix when one source URL intentionally needs separate sale and lease entries.
              </p>
            </div>
            {previewMutation.isError && (
              <p className="mt-3 text-sm text-rose-600">{(previewMutation.error as Error).message}</p>
            )}
            {manualIngestMutation.isError && (
              <p className="mt-3 text-sm text-rose-600">{(manualIngestMutation.error as Error).message}</p>
            )}
            {previewMutation.isSuccess && (
              <p className="mt-3 text-sm text-emerald-700">Preview loaded. Review the fields before saving.</p>
            )}
            {manualIngestMutation.isSuccess && (
              <p className="mt-3 text-sm text-emerald-700">Listing saved into Industrial Intel and tracking is active.</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.9fr)]">
        {GOOGLE_MAPS_API_KEY ? (
          <IndustrialIntelListingMap
            filteredListings={filteredListings}
            mappableListings={mappableListings}
            selectedListing={selectedListing}
            selectedMappableListing={selectedMappableListing}
            mapCenter={mapCenter}
            onSelectListing={setSelectedListingId}
          />
        ) : (
          <MapUnavailableCard />
        )}

        <Card className="xl:order-1">
          <CardHeader>
            <CardTitle>Listings</CardTitle>
          </CardHeader>
          <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading listings...</p>
          ) : isError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-10 text-center">
              <p className="text-base font-medium text-rose-900">Listings failed to load</p>
              <p className="mt-2 text-sm text-rose-700">{(error as Error)?.message || "The API returned an unexpected error."}</p>
            </div>
          ) : listings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <p className="text-base font-medium text-slate-900">No external inventory yet</p>
              <p className="mt-2 text-sm text-slate-600">
                Listings will appear here as source runs and manual intake save new records.
              </p>
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <p className="text-base font-medium text-slate-900">No listings match the current filters</p>
              <p className="mt-2 text-sm text-slate-600">
                Clear or loosen the filters to bring more listings back into view.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-3 pr-4 font-medium">Listing</th>
                    <th className="py-3 pr-4 font-medium">Source</th>
                    <th className="py-3 pr-4 font-medium">Status</th>
                    <th className="py-3 pr-4 font-medium">Type</th>
                    <th className="py-3 pr-4 font-medium">Asset</th>
                    <th className="py-3 pr-4 font-medium">Submarket</th>
                    <th className="py-3 pr-4 font-medium">Size</th>
                    <th className="py-3 pr-4 font-medium">Last Seen</th>
                    <th className="py-3 pr-4 font-medium">Links</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredListings.map((listing) => (
                    <tr
                      key={listing.id}
                      className={`align-top ${selectedListing?.id === listing.id ? "bg-sky-50/80" : ""}`}
                    >
                      <td className="max-w-[28rem] py-4 pr-4">
                        <button
                          type="button"
                          onClick={() => setSelectedListingId(listing.id)}
                          className="w-full text-left"
                        >
                          <div className="space-y-1.5">
                          <p className="line-clamp-2 font-medium text-slate-900">{listing.title}</p>
                          <p className="text-slate-500">{listing.address || "Address still needs review"}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            {isMappableListing(listing) ? (
                              <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">
                                Mapped
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700">
                                Needs geocode
                              </span>
                            )}
                            {hasListingQualityIssue(listing) && (
                              <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                Needs review
                              </span>
                            )}
                          </div>
                        </div>
                        </button>
                      </td>
                      <td className="py-4 pr-4 text-slate-700">
                        <div className="max-w-[11rem]">
                          <p className="font-medium text-slate-900">{listing.sourceName || "Unknown source"}</p>
                        </div>
                      </td>
                      <td className="py-4 pr-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            listing.removedAt
                              ? "bg-rose-100 text-rose-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {listing.removedAt ? "Removed" : formatStatus(listing.status)}
                        </span>
                      </td>
                      <td className="py-4 pr-4">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {formatListingType(listing.listingType)}
                        </span>
                      </td>
                      <td className="py-4 pr-4">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {formatAssetType(listing.assetType)}
                        </span>
                      </td>
                      <td className="py-4 pr-4 text-slate-700">
                        {listing.submarket || listing.market || "Unassigned"}
                      </td>
                      <td className="py-4 pr-4 text-slate-700">
                        {formatListingSize(listing)}
                      </td>
                      <td className="py-4 pr-4 text-slate-700">{formatDateTime(listing.lastSeenAt)}</td>
                      <td className="py-4 pr-4">
                        <div className="flex flex-col gap-1">
                          {listing.brochureUrl && (
                            <a
                              href={listing.brochureUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sky-700 hover:text-sky-900"
                            >
                              Brochure
                            </a>
                          )}
                          {listing.sourceUrl && (
                            <a
                              href={listing.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sky-700 hover:text-sky-900"
                            >
                              Source
                            </a>
                          )}
                          {!listing.brochureUrl && !listing.sourceUrl && (
                            <span className="text-slate-400">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        </Card>
      </div>
    </div>
  );
}
