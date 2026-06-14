import { useMemo, useState } from "react";
import { GoogleMap, InfoWindowF, useJsApiLoader } from "@react-google-maps/api";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, MapPin, Printer } from "lucide-react";
import { useRoute } from "wouter";
import { apiUrl } from "@/lib/api";
import { getGoogleMapsApiKey, getGoogleMapsMapId, GOOGLE_MAPS_API_KEY_HELP_TEXT } from "@/lib/googleMapsApiKey";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdvancedMapMarker } from "@/features/map/AdvancedMapMarker";

type IntelListing = {
  id: string;
  sourceName: string | null;
  title: string;
  address: string | null;
  normalizedAddress: string | null;
  market: string | null;
  submarket: string | null;
  latitude: number | null;
  longitude: number | null;
  availableSf: number | null;
  landAcres: number | null;
  totalPrice: number | null;
  leaseRatePsf: number | null;
  brochureUrl: string | null;
  sourceUrl: string | null;
};

type IntelSurveyItem = {
  id: string;
  sortOrder: number;
  recommendationLabel: string | null;
  clientNotes: string | null;
  listing: IntelListing;
};

type IntelSurveyDetail = {
  id: string;
  title: string;
  clientName: string | null;
  requirementTitle: string | null;
  updatedAt: string | null;
  items: IntelSurveyItem[];
};

type IntelListingAsset = {
  id: string;
  listingId: string | null;
  surveyId: string | null;
  surveyItemId: string | null;
  assetType: string;
  fileName: string;
  signedUrl: string | null;
};

type MappableSurveyItem = IntelSurveyItem & {
  listing: IntelListing & {
    latitude: number;
    longitude: number;
  };
};

const GOOGLE_MAPS_API_KEY = getGoogleMapsApiKey();
const GOOGLE_MAPS_MAP_ID = getGoogleMapsMapId();
const GOOGLE_MAPS_LIBRARIES: any = ["marker"];
const DEFAULT_MAP_CENTER = { lat: 53.5461, lng: -113.4938 };
const MAP_CONTAINER_STYLE = { width: "100%", height: "100%" };

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toLocaleString();
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatLeaseRate(listing: IntelListing) {
  if (!listing.leaseRatePsf) return "-";
  return `${formatMoney(listing.leaseRatePsf)} / SF`;
}

function formatListingSize(listing: IntelListing) {
  return listing.availableSf ? `${formatNumber(listing.availableSf)} SF` : "-";
}

function listingArea(listing: IntelListing) {
  return listing.submarket || listing.market || "Unassigned";
}

function firstLink(listing: IntelListing) {
  return listing.brochureUrl || listing.sourceUrl;
}

function isMappableListing(listing: IntelListing): listing is IntelListing & { latitude: number; longitude: number } {
  return typeof listing.latitude === "number" && typeof listing.longitude === "number";
}

function buildGoogleMapsUrl(listing: IntelListing) {
  if (isMappableListing(listing)) {
    return `https://www.google.com/maps/search/?api=1&query=${listing.latitude},${listing.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [listing.normalizedAddress || listing.address, listing.submarket || listing.market].filter(Boolean).join(" "),
  )}`;
}

async function fetchSharedSurvey(token: string): Promise<IntelSurveyDetail> {
  const response = await fetch(apiUrl(`/api/intel/surveys/share/${encodeURIComponent(token)}`), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function fetchSharedSurveyAssets(token: string): Promise<IntelListingAsset[]> {
  const response = await fetch(apiUrl(`/api/intel/surveys/share/${encodeURIComponent(token)}/assets`), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export default function IndustrialIntelSurveyClientPage() {
  const [, params] = useRoute("/tools/industrial-intel/surveys/share/:token");
  const token = params?.token || "";
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const { data: survey, isLoading, error } = useQuery<IntelSurveyDetail>({
    queryKey: [`/api/intel/surveys/share/${token}`],
    queryFn: () => fetchSharedSurvey(token),
    enabled: token.length > 0,
  });

  const { data: assets = [] } = useQuery<IntelListingAsset[]>({
    queryKey: [`/api/intel/surveys/share/${token}/assets`],
    queryFn: () => fetchSharedSurveyAssets(token),
    enabled: token.length > 0,
  });

  const { isLoaded: isMapLoaded, loadError: mapLoadError } = useJsApiLoader({
    id: "industrial-intel-client-survey-map",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
    mapIds: [GOOGLE_MAPS_MAP_ID],
  });

  const orderedItems = useMemo(
    () => [...(survey?.items || [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [survey?.items],
  );

  const mappableItems = useMemo(
    () => orderedItems.filter((item): item is MappableSurveyItem => isMappableListing(item.listing)),
    [orderedItems],
  );

  const selectedItem = useMemo(() => {
    return orderedItems.find((item) => item.id === selectedItemId) || orderedItems[0] || null;
  }, [orderedItems, selectedItemId]);

  const selectedMapItem = useMemo(() => {
    const explicit = mappableItems.find((item) => item.id === selectedItemId);
    if (explicit) return explicit;
    if (selectedItem && isMappableListing(selectedItem.listing)) return selectedItem as MappableSurveyItem;
    return mappableItems[0] || null;
  }, [mappableItems, selectedItem, selectedItemId]);

  const assetsByItemId = useMemo(() => {
    const grouped = new Map<string, IntelListingAsset[]>();
    assets.forEach((asset) => {
      if (asset.surveyItemId) {
        grouped.set(asset.surveyItemId, [...(grouped.get(asset.surveyItemId) || []), asset]);
        return;
      }
      if (asset.listingId) {
        orderedItems
          .filter((item) => item.listing.id === asset.listingId)
          .forEach((item) => {
            grouped.set(item.id, [...(grouped.get(item.id) || []), asset]);
          });
      }
    });
    return grouped;
  }, [assets, orderedItems]);

  const mapCenter = selectedMapItem
    ? { lat: selectedMapItem.listing.latitude, lng: selectedMapItem.listing.longitude }
    : DEFAULT_MAP_CENTER;
  const assetItemCount = assetsByItemId.size;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 text-sm text-slate-600">
        Loading survey...
      </div>
    );
  }

  if (error || !survey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 text-center">
        <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-lg font-semibold text-slate-950">Survey unavailable</p>
          <p className="mt-2 text-sm text-slate-600">This survey link may have expired or been disabled.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white px-5 py-4 print:border-b-0">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">Client Survey</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{survey.title}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {survey.clientName || "Prepared survey"}
              {survey.requirementTitle ? ` - ${survey.requirementTitle}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Badge variant="outline" className="bg-slate-50">
              {orderedItems.length} options
            </Badge>
            <Button type="button" variant="outline" className="gap-2" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1800px] gap-3 px-4 pt-4 md:grid-cols-4 print:grid-cols-4 print:px-0 print:pt-0">
        <ClientSummaryMetric label="Options" value={String(orderedItems.length)} caption="shortlisted properties" />
        <ClientSummaryMetric label="Mapped" value={`${mappableItems.length} / ${orderedItems.length}`} caption="shown on map" />
        <ClientSummaryMetric label="Brochures" value={`${assetItemCount} / ${orderedItems.length}`} caption="attached files" />
        <ClientSummaryMetric
          label="Updated"
          value={survey.updatedAt ? new Date(survey.updatedAt).toLocaleDateString() : "-"}
          caption="latest package refresh"
        />
      </section>

      <main className="mx-auto grid max-w-[1800px] gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_420px] print:block print:max-w-none print:p-0">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-700" />
              <p className="text-sm font-semibold">
                {mappableItems.length} mapped / {orderedItems.length} options
              </p>
            </div>
            {orderedItems.length - mappableItems.length > 0 && (
              <Badge variant="outline" className="bg-amber-50 text-amber-800">
                {orderedItems.length - mappableItems.length} need coordinates
              </Badge>
            )}
          </div>
          <div className="h-[calc(100vh-160px)] min-h-[560px] bg-slate-100">
            {!GOOGLE_MAPS_API_KEY ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-600">
                {GOOGLE_MAPS_API_KEY_HELP_TEXT}
              </div>
            ) : mapLoadError ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-rose-700">
                Google Maps failed to load.
              </div>
            ) : !isMapLoaded ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading map...</div>
            ) : mappableItems.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-600">
                This survey does not have mappable listings yet.
              </div>
            ) : (
              <GoogleMap
                mapContainerStyle={MAP_CONTAINER_STYLE}
                center={mapCenter}
                zoom={mappableItems.length === 1 ? 13 : 10}
                options={{
                  streetViewControl: false,
                  mapTypeControl: false,
                  fullscreenControl: true,
                  gestureHandling: "greedy",
                  mapId: GOOGLE_MAPS_MAP_ID,
                }}
              >
                {mappableItems.map((item) => {
                  const optionNumber = orderedItems.findIndex((candidate) => candidate.id === item.id) + 1;
                  return (
                    <AdvancedMapMarker
                      key={item.id}
                      position={{ lat: item.listing.latitude, lng: item.listing.longitude }}
                      title={item.listing.title}
                      label={String(optionNumber)}
                      color="#2563eb"
                      scale={10}
                      onClick={() => setSelectedItemId(item.id)}
                    />
                  );
                })}
                {selectedMapItem && (
                  <InfoWindowF
                    position={{ lat: selectedMapItem.listing.latitude, lng: selectedMapItem.listing.longitude }}
                    onCloseClick={() => setSelectedItemId(null)}
                  >
                    <div className="max-w-[17rem] space-y-2 p-1 text-sm text-slate-700">
                      <p className="font-semibold text-slate-950">{selectedMapItem.listing.title}</p>
                      <p>{selectedMapItem.listing.normalizedAddress || selectedMapItem.listing.address || "Address pending"}</p>
                      <p>{formatListingSize(selectedMapItem.listing)} - {listingArea(selectedMapItem.listing)}</p>
                      <div className="flex flex-wrap gap-3">
                        {assetsByItemId.get(selectedMapItem.id)?.[0]?.signedUrl && (
                          <a href={assetsByItemId.get(selectedMapItem.id)?.[0]?.signedUrl || undefined} target="_blank" rel="noreferrer" className="font-semibold text-blue-700">
                            Brochure
                          </a>
                        )}
                        {firstLink(selectedMapItem.listing) && (
                          <a href={firstLink(selectedMapItem.listing) || undefined} target="_blank" rel="noreferrer" className="font-semibold text-blue-700">
                            Flyer/listing
                          </a>
                        )}
                        <a href={buildGoogleMapsUrl(selectedMapItem.listing)} target="_blank" rel="noreferrer" className="font-semibold text-blue-700">
                          Open maps
                        </a>
                      </div>
                    </div>
                  </InfoWindowF>
                )}
              </GoogleMap>
            )}
          </div>
        </section>

        <aside className="space-y-3 print:space-y-4">
          {orderedItems.map((item, index) => {
            const itemAssets = assetsByItemId.get(item.id) || [];
            const primaryAsset = itemAssets[0] || null;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedItemId(item.id)}
                className={`block w-full rounded-lg border bg-white p-4 text-left shadow-sm transition print:break-inside-avoid print:shadow-none ${
                  selectedItem?.id === item.id
                    ? "border-blue-300 ring-2 ring-blue-100"
                    : "border-slate-200 hover:border-blue-200"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Option {index + 1}</p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-950">{item.listing.title}</h2>
                    <p className="mt-1 text-sm text-slate-600">{item.listing.normalizedAddress || item.listing.address || "Address pending"}</p>
                  </div>
                  {item.recommendationLabel && <Badge className="bg-blue-100 text-blue-800">{item.recommendationLabel}</Badge>}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <ClientMetric label="Building" value={formatListingSize(item.listing)} />
                  <ClientMetric label="Land" value={item.listing.landAcres ? `${formatNumber(item.listing.landAcres)} ac` : "-"} />
                  <ClientMetric label="Lease" value={formatLeaseRate(item.listing)} />
                  <ClientMetric label="Sale" value={formatMoney(item.listing.totalPrice)} />
                  <ClientMetric label="Area" value={listingArea(item.listing)} />
                  <ClientMetric label="Source" value={item.listing.sourceName || "-"} />
                </div>

                {item.clientNotes && <p className="mt-4 text-sm leading-6 text-slate-700">{item.clientNotes}</p>}

                <div className="mt-4 flex flex-wrap gap-3">
                  {primaryAsset?.signedUrl && (
                    <a
                      href={primaryAsset.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700"
                      onClick={(event) => event.stopPropagation()}
                    >
                      View brochure
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {firstLink(item.listing) && (
                    <a
                      href={firstLink(item.listing) || undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700"
                      onClick={(event) => event.stopPropagation()}
                    >
                      View listing
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <a
                    href={buildGoogleMapsUrl(item.listing)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Open maps
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </button>
            );
          })}
        </aside>
      </main>
    </div>
  );
}

function ClientMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function ClientSummaryMetric({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm print:shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-600">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{caption}</p>
        </div>
        <FileText className="h-4 w-4 text-blue-700" />
      </div>
    </div>
  );
}
