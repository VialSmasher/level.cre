import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GoogleMap, InfoWindowF, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getGoogleMapsApiKey } from "@/lib/googleMapsApiKey";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  leaseRatePsf: number | null;
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

type DuplicateListing = IntelListing & {
  sourceRecordKey: string;
  duplicateScore: number;
};

type DuplicateGroup = {
  key: string;
  reason: string;
  suggestedKeepId: string;
  listings: DuplicateListing[];
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
  lat: number | null;
  lng: number | null;
  availableSf: number | null;
  landAcres: number | null;
  totalPrice: number | null;
  pricePerAcre: number | null;
  leaseRatePsf: number | null;
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

function formatMoney(value: number | null) {
  if (!value) return null;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(value);
}

function formatListingValue(listing: IntelListing) {
  if (listing.listingType === "lease" || listing.listingType === "sublease") {
    return listing.leaseRatePsf ? `${formatMoney(listing.leaseRatePsf)} / SF` : null;
  }
  if (listing.totalPrice) return formatMoney(listing.totalPrice);
  if (listing.pricePerAcre) return `${formatMoney(listing.pricePerAcre)} / ac`;
  return null;
}

function formatLeaseRate(listing: IntelListing) {
  return listing.leaseRatePsf ? `${formatMoney(listing.leaseRatePsf)} / SF` : "-";
}

function buildGoogleMapsUrl(listing: IntelListing) {
  if (typeof listing.latitude === "number" && typeof listing.longitude === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${listing.latitude},${listing.longitude}`;
  }
  const query = listing.normalizedAddress || listing.address || listing.title;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
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

function sourceNameFromFile(file: File) {
  const normalized = file.name.toLowerCase();
  if (normalized.includes("costar") && normalized.includes("sale")) return "CoStar Sale Export";
  if (normalized.includes("costar") && normalized.includes("lease")) return "CoStar Lease Export";

  return file.name
    .replace(/\.(csv|xlsx|xls)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferUploadListingType(rowText: string) {
  const lower = rowText.toLowerCase();
  if (lower.includes("sublease") || lower.includes("sub-lease")) return "sublease";
  if (lower.includes("sale")) return "sale";
  if (lower.includes("lease")) return "lease";
  return null;
}

function inferUploadSourceListingType(sourceName: string) {
  const lower = sourceName.toLowerCase();
  if (lower.includes("sublease") || lower.includes("sub-lease")) return "sublease";
  if (lower.includes("sale")) return "sale";
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
    listingType: (listingType || inferUploadListingType(rowText))?.toLowerCase() || null,
    assetType: (assetType || inferUploadAssetType(rowText)).toLowerCase(),
    recordKeySuffix: readUploadValue(row, ["id", "listing id", "mls", "record id", "propertyid", "property id"]) || null,
    lat: parseUploadNumber(readUploadValue(row, ["lat", "latitude", "y", "map latitude"])),
    lng: parseUploadNumber(readUploadValue(row, ["lng", "lon", "long", "longitude", "x", "map longitude"])),
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
    totalPrice: parseUploadNumber(readUploadValue(row, ["price", "sale price", "asking price", "purchase price", "for sale price"])),
    pricePerAcre: parseUploadNumber(readUploadValue(row, ["price per acre", "$/acre", "psa"])),
    leaseRatePsf: parseUploadNumber(readUploadValue(row, [
      "rent/sf/yr",
      "rent sf yr",
      "rent",
      "lease rate",
      "net rent",
      "average weighted rent",
      "avg rent-direct (industrial)",
      "avg rent-sublet (industrial)",
    ])),
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
          <div className="space-y-4">
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
              <p className="text-base font-medium text-slate-900">Coordinates needed</p>
              <p className="mt-2 text-sm text-slate-600">
                Import latitude and longitude columns, or run geocoding later, and these listings will render here automatically.
              </p>
            </div>
            {selectedListing && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected listing</p>
                <p className="mt-2 font-semibold text-slate-950">{selectedListing.title}</p>
                <p className="mt-1 text-sm text-slate-600">{selectedListing.address || "Address still needs review"}</p>
                <div className="mt-3 grid gap-2 text-sm text-slate-600">
                  <p><span className="font-medium text-slate-900">Source:</span> {selectedListing.sourceName || "Unknown"}</p>
                  <p><span className="font-medium text-slate-900">Area:</span> {selectedListing.submarket || selectedListing.market || "Unassigned"}</p>
                  <p><span className="font-medium text-slate-900">Size:</span> {formatListingSize(selectedListing)}</p>
                </div>
              </div>
            )}
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
  const { toast } = useToast();
  const [showManualIntake, setShowManualIntake] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState("all");
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

  const { data: duplicateGroups = [] } = useQuery<DuplicateGroup[]>({
    queryKey: ["/api/intel/listings/duplicates"],
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
        lat: null,
        lng: null,
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
        records: uploadRows.map((row) => ({
          ...row,
          listingType: row.listingType || inferUploadSourceListingType(uploadSourceName),
        })),
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

  const archiveDuplicatesMutation = useMutation({
    mutationFn: async ({ keepId, duplicateIds }: { keepId: string; duplicateIds: string[] }) => {
      const response = await apiRequest("POST", "/api/intel/listings/duplicates/archive", {
        keepId,
        duplicateIds,
      });
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/intel/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/listings/duplicates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/summary"] });
      toast({
        title: "Duplicates archived",
        description: `${result.archived || 0} duplicate listing${result.archived === 1 ? "" : "s"} moved out of the active queue.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Could not archive duplicates",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  function applyUploadRows(rows: Record<string, unknown>[], sourceFile?: File) {
    const records = rows
      .map((row, index) => buildUploadRecord(row, index))
      .filter((record): record is UploadListingRecord => Boolean(record));

    if (records.length === 0) {
      setUploadRows([]);
      setUploadError("No usable listing rows found. Make sure the file has a property name or address column.");
      return;
    }

    if (sourceFile) {
      setUploadSourceName(sourceNameFromFile(sourceFile));
    }
    setUploadRows(records.slice(0, 500));
  }

  async function handleUploadFile(file: File | null) {
    if (!file) return;
    setUploadError(null);

    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
      try {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
        if (!worksheet) {
          setUploadRows([]);
          setUploadError("That workbook does not have a readable first sheet.");
          return;
        }
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
        applyUploadRows(rows, file);
      } catch (error) {
        setUploadRows([]);
        setUploadError(error instanceof Error ? error.message : "Could not parse that Excel file.");
      }
      return;
    }

    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.errors.length > 0 && result.data.length === 0) {
          setUploadRows([]);
          setUploadError(result.errors[0]?.message || "Could not parse that CSV.");
          return;
        }
        applyUploadRows(result.data, file);
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
      if (queueFilter === "needs_geocode" && (isRemoved || isMappableListing(listing))) return false;
      if (queueFilter === "needs_review" && (isRemoved || !hasListingQualityIssue(listing))) return false;
      if (queueFilter === "mapped" && !isMappableListing(listing)) return false;
      if (queueFilter === "sale" && listing.listingType !== "sale") return false;
      if (queueFilter === "lease" && listing.listingType !== "lease") return false;
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
  }, [filters, listings, queueFilter]);

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
  const queueOptions = useMemo(
    () => [
      { id: "all", label: "All", count: listings.length, tone: "blue" },
      { id: "needs_geocode", label: "Needs geocode", count: needsGeocodeCount, tone: "orange" },
      { id: "needs_review", label: "Needs review", count: needsReviewCount, tone: "amber" },
      { id: "mapped", label: "Mapped", count: mappedCount, tone: "sky" },
      { id: "sale", label: "Sale", count: listings.filter((listing) => listing.listingType === "sale" && !listing.removedAt).length, tone: "emerald" },
      { id: "lease", label: "Lease", count: listings.filter((listing) => listing.listingType === "lease" && !listing.removedAt).length, tone: "violet" },
    ],
    [listings, mappedCount, needsGeocodeCount, needsReviewCount],
  );

  const statCards = [
    { label: "Active", value: activeListings.length, caption: "not removed", tone: "blue", accent: "bg-blue-500" },
    { label: "Mapped", value: mappedCount, caption: "ready for map", tone: "emerald", accent: "bg-emerald-500" },
    { label: "Needs geocode", value: needsGeocodeCount, caption: "address cleanup", tone: "orange", accent: "bg-orange-500" },
    { label: "Needs review", value: needsReviewCount, caption: "quality flags", tone: "amber", accent: "bg-amber-500" },
    { label: "Removed", value: removedCount, caption: "source disappeared", tone: "rose", accent: "bg-rose-500" },
  ];

  const queueButtonClass = (option: { id: string; tone: string }) => {
    if (queueFilter !== option.id) {
      return "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700";
    }

    if (option.tone === "orange") return "border-orange-300 bg-orange-50 text-orange-800";
    if (option.tone === "amber") return "border-amber-300 bg-amber-50 text-amber-800";
    if (option.tone === "sky") return "border-sky-300 bg-sky-50 text-sky-800";
    if (option.tone === "emerald") return "border-emerald-300 bg-emerald-50 text-emerald-800";
    if (option.tone === "violet") return "border-violet-300 bg-violet-50 text-violet-800";
    return "border-blue-300 bg-blue-50 text-blue-700";
  };

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
        {statCards.map((item) => (
          <Card key={item.label} className="overflow-hidden border-slate-200 bg-white shadow-sm">
            <div className={`h-1 ${item.accent}`} />
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-600">{item.label}</p>
                  <p className="mt-1 text-3xl font-bold text-slate-950">{item.value}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.caption}</p>
                </div>
                <span className={`mt-1 h-2.5 w-2.5 rounded-full ${item.accent}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-4 p-0">
          <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Inventory command bar</p>
                <p className="text-xs text-slate-500">Filter the queue, map, and selected listing together.</p>
              </div>
              <p className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                {filteredListings.length} shown / {listings.length} loaded
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 px-4">
            {queueOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setQueueFilter(option.id)}
                className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${queueButtonClass(option)}`}
              >
                {option.label} <span className="ml-1 rounded-full bg-white/70 px-1.5 py-0.5 text-xs">{option.count}</span>
              </button>
            ))}
          </div>

          <div className="grid gap-3 px-4 md:grid-cols-2 xl:grid-cols-12">
            <div className="space-y-2 xl:col-span-4">
              <Label htmlFor="searchListings">Search listings</Label>
              <Input
                id="searchListings"
                placeholder="Search title, address, submarket, or source"
                value={filters.query}
                onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              />
            </div>
            <div className="space-y-2 xl:col-span-2">
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
            <div className="space-y-2 xl:col-span-2">
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
            <div className="space-y-2 xl:col-span-2">
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
            <div className="space-y-2 xl:col-span-1">
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
            <div className="space-y-2 xl:col-span-1">
              <Label htmlFor="minSfFilter">Min SF</Label>
              <Input
                id="minSfFilter"
                inputMode="numeric"
                placeholder="No minimum"
                value={filters.minSf}
                onChange={(event) => setFilters((current) => ({ ...current, minSf: event.target.value }))}
              />
            </div>
            <div className="space-y-2 xl:col-span-1">
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

          <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-gradient-to-r from-blue-50 via-white to-emerald-50 px-4 py-3">
            <p className="text-sm text-slate-600">
              Showing <span className="font-semibold text-slate-900">{filteredListings.length}</span> of <span className="font-semibold text-slate-900">{listings.length}</span> loaded listings.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setFilters({ query: "", submarket: "all", listingType: "all", source: "all", status: "active", minSf: "", maxSf: "" });
                  setQueueFilter("all");
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
              >
                Clear filters
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {duplicateGroups.length > 0 && (
        <Card className="overflow-hidden border-amber-200 bg-white shadow-sm">
          <div className="h-1 bg-amber-500" />
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Duplicate review</CardTitle>
                <p className="mt-1 text-sm text-slate-600">
                  Potential duplicate listings are grouped by CoStar PropertyID or exact address/type/size. Archive keeps the best row active and soft-removes the extras.
                </p>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                {duplicateGroups.length} group{duplicateGroups.length === 1 ? "" : "s"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {duplicateGroups.slice(0, 5).map((group) => {
              const keep = group.listings.find((listing) => listing.id === group.suggestedKeepId) || group.listings[0];
              const duplicateIds = group.listings.filter((listing) => listing.id !== keep.id).map((listing) => listing.id);
              return (
                <div key={group.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{keep.title}</p>
                      <p className="mt-1 text-sm text-slate-600">{keep.address || "Address needs review"}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-white px-2.5 py-1 text-slate-700">{group.reason}</span>
                        <span className="rounded-full bg-white px-2.5 py-1 text-slate-700">{group.listings.length} matching rows</span>
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">Keep: {keep.sourceName || "Unknown"}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => archiveDuplicatesMutation.mutate({ keepId: keep.id, duplicateIds })}
                      disabled={archiveDuplicatesMutation.isPending || duplicateIds.length === 0}
                      className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Archive {duplicateIds.length} duplicate{duplicateIds.length === 1 ? "" : "s"}
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {group.listings.map((listing) => (
                      <div
                        key={listing.id}
                        className={`rounded-xl border px-3 py-2 text-sm ${
                          listing.id === keep.id ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-950">{listing.sourceName || "Unknown source"}</p>
                            <p className="mt-0.5 text-xs text-slate-500">{listing.sourceRecordKey}</p>
                          </div>
                          <span className="text-xs font-semibold text-slate-500">score {listing.duplicateScore}</span>
                        </div>
                        <p className="mt-2 text-xs text-slate-600">
                          {formatListingSize(listing)} | {formatListingValue(listing) || "No rate/price"} | {formatDateTime(listing.lastSeenAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {showManualIntake && (
        <Card>
          <CardHeader>
            <CardTitle>Manual Intake</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Upload weekly Excel or CSV exports for bulk updates, or save a one-off URL when a listing needs manual handling.
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.45fr)]">
                <div className="space-y-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">Spreadsheet upload</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Drop a CoStar, LoopNet, broker, or landlord export here. Common columns like PropertyID, address, title, SF, lat/long, type, price, and URL are detected automatically.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
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
                      <Label htmlFor="listingUpload">Export file</Label>
                      <label
                        htmlFor="listingUpload"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          handleUploadFile(event.dataTransfer.files?.[0] || null);
                        }}
                        className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-blue-300 bg-blue-50/60 px-4 py-4 text-center transition hover:border-blue-400 hover:bg-blue-50"
                      >
                        <span className="text-sm font-semibold text-slate-950">Drop Excel or CSV here</span>
                        <span className="mt-1 text-xs text-slate-600">Supports .xlsx, .xls, and .csv exports</span>
                        <Input
                          id="listingUpload"
                          type="file"
                          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                          className="sr-only"
                          onChange={(event) => handleUploadFile(event.target.files?.[0] || null)}
                        />
                      </label>
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
                                <td className="px-3 py-2 text-slate-600">{row.listingType || inferUploadSourceListingType(uploadSourceName)} / {row.assetType || "building"}</td>
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
                      Imports update existing rows when the source URL, PropertyID, or row identity matches. Missing rows are not removed yet, so this is safe for mixed exports.
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
              {manualIngestMutation.isPending ? "Saving..." : "Save listing"}
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

      <div className="grid gap-6 xl:grid-cols-[minmax(360px,0.95fr)_minmax(420px,1.05fr)]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Inventory queue</CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  {filteredListings.length} of {listings.length} listings in this view.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {queueOptions.find((option) => option.id === queueFilter)?.label || "All"}
              </span>
            </div>
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
              <div className="max-h-[760px] space-y-3 overflow-y-auto pr-1">
                {filteredListings.map((listing) => {
                  const listingValue = formatListingValue(listing);
                  const isSelected = selectedListing?.id === listing.id;
                  return (
                    <button
                      key={listing.id}
                      type="button"
                      onClick={() => setSelectedListingId(listing.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        isSelected
                          ? "border-blue-300 bg-blue-50/70 shadow-sm"
                          : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="line-clamp-2 font-semibold text-slate-950">{listing.title}</p>
                          <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                            {listing.address || "Address still needs review"}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-slate-950">{formatListingSize(listing)}</p>
                          {listingValue && <p className="mt-1 text-xs text-slate-500">{listingValue}</p>}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {formatListingType(listing.listingType)}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {formatAssetType(listing.assetType)}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {listing.submarket || listing.market || "Unassigned"}
                        </span>
                        {isMappableListing(listing) ? (
                          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">Mapped</span>
                        ) : (
                          <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700">Needs geocode</span>
                        )}
                        {hasListingQualityIssue(listing) && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Needs review</span>
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                        <span className="line-clamp-1">{listing.sourceName || "Unknown source"}</span>
                        <span>{formatDateTime(listing.lastSeenAt)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
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

          <Card>
            <CardHeader>
              <CardTitle>Selected listing</CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedListing ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                  <p className="text-base font-medium text-slate-900">Pick a listing</p>
                  <p className="mt-2 text-sm text-slate-600">Select a record from the queue to review details and links.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="mb-3 flex flex-wrap gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          selectedListing.removedAt ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {selectedListing.removedAt ? "Removed" : formatStatus(selectedListing.status)}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {formatListingType(selectedListing.listingType)}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {formatAssetType(selectedListing.assetType)}
                        </span>
                      </div>
                      <h3 className="text-2xl font-semibold leading-tight text-slate-950">{selectedListing.title}</h3>
                      <p className="mt-2 text-sm text-slate-600">{selectedListing.normalizedAddress || selectedListing.address || "Address still needs review"}</p>
                    </div>
                    <a
                      href={buildGoogleMapsUrl(selectedListing)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Open in Google Maps
                    </a>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Building size</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">{selectedListing.availableSf ? `${selectedListing.availableSf.toLocaleString()} SF` : "-"}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Land size</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">{selectedListing.landAcres ? `${selectedListing.landAcres.toLocaleString()} ac` : "-"}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lease rate</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">{formatLeaseRate(selectedListing)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sale price</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">{selectedListing.totalPrice ? formatMoney(selectedListing.totalPrice) : "-"}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { label: "Submarket", value: selectedListing.submarket || selectedListing.market || "Unassigned" },
                      { label: "Source", value: selectedListing.sourceName || "Unknown" },
                      { label: "Geocode", value: selectedListing.geocodeStatus || (isMappableListing(selectedListing) ? "success" : "pending") },
                      { label: "Last seen", value: formatDateTime(selectedListing.lastSeenAt) },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-950">Broker read</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {!isMappableListing(selectedListing) && (
                        <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700">Needs coordinates</span>
                      )}
                      {hasListingQualityIssue(selectedListing) && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Needs data cleanup</span>
                      )}
                      {!selectedListing.sourceUrl && !selectedListing.brochureUrl && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">No source links</span>
                      )}
                      {isMappableListing(selectedListing) && !hasListingQualityIssue(selectedListing) && (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Ready for matching</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {selectedListing.sourceUrl && (
                      <a
                        href={selectedListing.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
                      >
                        Open source
                      </a>
                    )}
                    {selectedListing.brochureUrl && (
                      <a
                        href={selectedListing.brochureUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
                      >
                        Open brochure
                      </a>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
