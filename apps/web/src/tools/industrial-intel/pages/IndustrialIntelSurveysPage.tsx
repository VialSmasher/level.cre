import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, InfoWindowF, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Bot, Copy, ExternalLink, Eye, EyeOff, FileText, MapPin, Plus, Share2, Trash2, Upload } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getGoogleMapsApiKey, GOOGLE_MAPS_API_KEY_HELP_TEXT } from "@/lib/googleMapsApiKey";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type IntelListing = {
  id: string;
  sourceId: string;
  sourceName: string | null;
  title: string;
  address: string | null;
  normalizedAddress: string | null;
  market: string | null;
  submarket: string | null;
  status: string;
  listingType: string;
  assetType: string;
  latitude: number | null;
  longitude: number | null;
  geocodeStatus: string | null;
  geocodeConfidence: number | null;
  geocodeSource: string | null;
  dataQualityStatus: string | null;
  availableSf: number | null;
  landAcres: number | null;
  totalPrice: number | null;
  pricePerAcre: number | null;
  leaseRatePsf: number | null;
  brochureUrl: string | null;
  sourceUrl: string | null;
  lastSeenAt: string | null;
  removedAt: string | null;
};

type IntelRequirement = {
  id: string;
  title: string;
  clientName: string | null;
  status: string;
  dealType: string;
  market: string | null;
  submarket: string | null;
  minSf: number | null;
  maxSf: number | null;
  updatedAt: string | null;
  archivedAt: string | null;
};

type IntelRequirementListingDecision = {
  requirementId: string;
  listingId: string;
  decision: "shortlist" | "maybe" | "rejected";
  notes: string | null;
  sortOrder: number;
};

type IntelSurveyListItem = {
  id: string;
  requirementId: string | null;
  requirementTitle: string | null;
  title: string;
  clientName: string | null;
  status: "draft" | "shared" | "archived";
  shareToken: string | null;
  itemCount: number;
  visibleItemCount: number;
  createdAt: string | null;
  updatedAt: string | null;
};

type IntelSurveyItem = {
  id: string;
  surveyId: string;
  listingId: string;
  sortOrder: number;
  recommendationLabel: string | null;
  brokerNotes: string | null;
  clientNotes: string | null;
  hidden: boolean;
  listing: IntelListing;
};

type MappableSurveyItem = IntelSurveyItem & {
  listing: IntelListing & {
    latitude: number;
    longitude: number;
  };
};

type IntelSurveyDetail = IntelSurveyListItem & {
  items: IntelSurveyItem[];
};

type IntelSurveyEvent = {
  id: string;
  surveyId: string;
  actorType: "user" | "agent" | "system";
  actorId: string | null;
  action: string;
  summary: string | null;
  payload: Record<string, unknown>;
  createdAt: string | null;
};

type IntelListingAsset = {
  id: string;
  listingId: string | null;
  surveyId: string | null;
  surveyItemId: string | null;
  assetType: "brochure" | "flyer" | "aerial" | "site_plan" | "photo" | "survey_page" | "other";
  fileName: string;
  contentType: string;
  fileSize: number;
  storageBucket: string;
  storagePath: string;
  source: string;
  status: "pending" | "active" | "failed" | "archived";
  isPrimary: boolean;
  signedUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type PublicLinkCandidate = {
  id: string;
  listingId: string;
  candidateUrl: string;
  domain: string;
  title: string | null;
  snippet: string | null;
  confidence: number;
  status: "pending" | "approved" | "rejected";
  source: "resolver" | "manual";
  createdAt: string | null;
  updatedAt: string | null;
};

type PublicLinksResponse = {
  candidates: PublicLinkCandidate[];
};

type ResolvePublicLinksResponse = {
  status: "resolved" | "not_configured";
  message: string;
  persistedCandidates?: PublicLinkCandidate[];
};

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
  return listing.sourceUrl || listing.brochureUrl;
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

function formatRelativeTime(value: string | null | undefined) {
  if (!value) return "Just now";
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs)) return "Just now";
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  return date.toLocaleDateString();
}

function itemPatch(item: IntelSurveyItem, patch: Partial<IntelSurveyItem>) {
  return {
    sortOrder: patch.sortOrder ?? item.sortOrder,
    recommendationLabel:
      patch.recommendationLabel === undefined ? item.recommendationLabel : patch.recommendationLabel,
    brokerNotes: patch.brokerNotes === undefined ? item.brokerNotes : patch.brokerNotes,
    clientNotes: patch.clientNotes === undefined ? item.clientNotes : patch.clientNotes,
    hidden: patch.hidden === undefined ? item.hidden : patch.hidden,
  };
}

const GOOGLE_MAPS_API_KEY = getGoogleMapsApiKey();
const DEFAULT_MAP_CENTER = { lat: 53.5461, lng: -113.4938 };
const MAP_CONTAINER_STYLE = { width: "100%", height: "100%" };

export default function IndustrialIntelSurveysPage() {
  const { toast } = useToast();
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [selectedMapItemId, setSelectedMapItemId] = useState<string | null>(null);
  const [listingSearch, setListingSearch] = useState("");
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [createForm, setCreateForm] = useState({
    title: "",
    clientName: "",
    requirementId: "",
  });

  const { data: surveys = [], isLoading: surveysLoading } = useQuery<IntelSurveyListItem[]>({
    queryKey: ["/api/intel/surveys"],
  });

  const { data: requirements = [] } = useQuery<IntelRequirement[]>({
    queryKey: ["/api/intel/requirements"],
  });

  const { data: listings = [] } = useQuery<IntelListing[]>({
    queryKey: ["/api/intel/listings"],
  });

  useEffect(() => {
    if (!selectedSurveyId && surveys.length > 0) {
      setSelectedSurveyId(surveys[0].id);
    }
  }, [selectedSurveyId, surveys]);

  const selectedSurveySummary = surveys.find((survey) => survey.id === selectedSurveyId) || null;

  const surveyQueryKey = selectedSurveyId ? [`/api/intel/surveys/${selectedSurveyId}`] : ["/api/intel/surveys/_"];
  const { data: selectedSurvey, isLoading: selectedSurveyLoading } = useQuery<IntelSurveyDetail>({
    queryKey: surveyQueryKey,
    enabled: Boolean(selectedSurveyId),
  });

  const eventsQueryKey = selectedSurveyId ? [`/api/intel/surveys/${selectedSurveyId}/events`] : ["/api/intel/surveys/_/events"];
  const { data: surveyEvents = [] } = useQuery<IntelSurveyEvent[]>({
    queryKey: eventsQueryKey,
    enabled: Boolean(selectedSurveyId),
  });

  const assetsQueryKey = selectedSurveyId ? [`/api/intel/surveys/${selectedSurveyId}/assets`] : ["/api/intel/surveys/_/assets"];
  const { data: surveyAssets = [] } = useQuery<IntelListingAsset[]>({
    queryKey: assetsQueryKey,
    enabled: Boolean(selectedSurveyId),
  });

  const { isLoaded: isMapLoaded, loadError: mapLoadError } = useJsApiLoader({
    id: "industrial-intel-survey-map",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  const shortlistQueryKey = selectedSurvey?.requirementId
    ? [`/api/intel/requirements/${selectedSurvey.requirementId}/shortlist`]
    : ["/api/intel/requirements/_/shortlist"];
  const { data: shortlistDecisions = [] } = useQuery<IntelRequirementListingDecision[]>({
    queryKey: shortlistQueryKey,
    enabled: Boolean(selectedSurvey?.requirementId),
  });

  const selectedListingIds = useMemo(
    () => new Set((selectedSurvey?.items || []).map((item) => item.listingId)),
    [selectedSurvey?.items],
  );

  const filteredListings = useMemo(() => {
    const needle = listingSearch.trim().toLowerCase();
    return listings
      .filter((listing) => !listing.removedAt)
      .filter((listing) => !selectedListingIds.has(listing.id))
      .filter((listing) => {
        if (!needle) return true;
        return [listing.title, listing.address, listing.submarket, listing.market, listing.sourceName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .slice(0, 18);
  }, [listingSearch, listings, selectedListingIds]);

  const visibleItems = useMemo(
    () => (selectedSurvey?.items || []).filter((item) => !item.hidden).sort((a, b) => a.sortOrder - b.sortOrder),
    [selectedSurvey?.items],
  );

  const mappableSurveyItems = useMemo(
    () => visibleItems.filter((item): item is MappableSurveyItem => isMappableListing(item.listing)),
    [visibleItems],
  );

  const selectedMapItem = useMemo(() => {
    const explicit = mappableSurveyItems.find((item) => item.id === selectedMapItemId);
    return explicit || mappableSurveyItems[0] || null;
  }, [mappableSurveyItems, selectedMapItemId]);

  const selectedDetailItem = useMemo(() => {
    const explicit = (selectedSurvey?.items || []).find((item) => item.id === selectedMapItemId);
    return explicit || selectedMapItem || visibleItems[0] || null;
  }, [selectedSurvey?.items, selectedMapItem, selectedMapItemId, visibleItems]);

  const selectedDetailAssets = useMemo(() => {
    if (!selectedDetailItem) return [];
    return surveyAssets.filter((asset) => (
      asset.surveyItemId === selectedDetailItem.id ||
      (!asset.surveyItemId && asset.listingId === selectedDetailItem.listingId)
    ));
  }, [selectedDetailItem, surveyAssets]);

  const publicLinksQueryKey = selectedDetailItem
    ? [`/api/intel/listings/${selectedDetailItem.listingId}/public-links`]
    : ["/api/intel/listings/no-selection/public-links"];
  const {
    data: publicLinksData,
    isLoading: isLoadingPublicLinks,
    isError: isPublicLinksError,
    error: publicLinksError,
  } = useQuery<PublicLinksResponse>({
    queryKey: publicLinksQueryKey,
    enabled: Boolean(selectedDetailItem),
  });
  const publicLinkCandidates = publicLinksData?.candidates || [];
  const approvedPublicLink = publicLinkCandidates.find((candidate) => candidate.status === "approved") || null;

  const mapCenter = useMemo(() => {
    if (selectedMapItem) {
      return { lat: selectedMapItem.listing.latitude, lng: selectedMapItem.listing.longitude };
    }
    return DEFAULT_MAP_CENTER;
  }, [selectedMapItem]);

  const unmappedVisibleCount = visibleItems.length - mappableSurveyItems.length;

  const focusPreview = () => {
    previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const shortlistedListingIds = useMemo(
    () => shortlistDecisions.filter((decision) => decision.decision === "shortlist").map((decision) => decision.listingId),
    [shortlistDecisions],
  );

  const createSurveyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/intel/surveys", {
        title: createForm.title.trim(),
        clientName: createForm.clientName.trim() || null,
        requirementId: createForm.requirementId || null,
      });
      return response.json() as Promise<IntelSurveyDetail>;
    },
    onSuccess: (survey) => {
      queryClient.invalidateQueries({ queryKey: ["/api/intel/surveys"] });
      queryClient.setQueryData([`/api/intel/surveys/${survey.id}`], survey);
      queryClient.invalidateQueries({ queryKey: [`/api/intel/surveys/${survey.id}/events`] });
      setSelectedSurveyId(survey.id);
      setCreateForm({ title: "", clientName: "", requirementId: "" });
      toast({ title: "Survey draft created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create survey", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  const updateSurveyMutation = useMutation({
    mutationFn: async (patch: Partial<IntelSurveyDetail>) => {
      if (!selectedSurvey) throw new Error("No survey selected");
      const response = await apiRequest("PATCH", `/api/intel/surveys/${selectedSurvey.id}`, patch);
      return response.json() as Promise<IntelSurveyDetail>;
    },
    onSuccess: (survey) => {
      queryClient.setQueryData([`/api/intel/surveys/${survey.id}`], survey);
      queryClient.invalidateQueries({ queryKey: ["/api/intel/surveys"] });
      queryClient.invalidateQueries({ queryKey: [`/api/intel/surveys/${survey.id}/events`] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update survey", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async (listingId: string) => {
      if (!selectedSurveyId) throw new Error("No survey selected");
      const response = await apiRequest("POST", `/api/intel/surveys/${selectedSurveyId}/items`, { listingId });
      return response.json() as Promise<IntelSurveyDetail>;
    },
    onSuccess: (survey) => {
      queryClient.setQueryData([`/api/intel/surveys/${survey.id}`], survey);
      queryClient.invalidateQueries({ queryKey: ["/api/intel/surveys"] });
      queryClient.invalidateQueries({ queryKey: [`/api/intel/surveys/${survey.id}/events`] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to add listing", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ item, patch }: { item: IntelSurveyItem; patch: Partial<IntelSurveyItem> }) => {
      if (!selectedSurveyId) throw new Error("No survey selected");
      const response = await apiRequest(
        "PATCH",
        `/api/intel/surveys/${selectedSurveyId}/items/${item.id}`,
        itemPatch(item, patch),
      );
      return response.json() as Promise<IntelSurveyDetail>;
    },
    onSuccess: (survey) => {
      queryClient.setQueryData([`/api/intel/surveys/${survey.id}`], survey);
      queryClient.invalidateQueries({ queryKey: ["/api/intel/surveys"] });
      queryClient.invalidateQueries({ queryKey: [`/api/intel/surveys/${survey.id}/events`] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update listing", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (item: IntelSurveyItem) => {
      if (!selectedSurveyId) throw new Error("No survey selected");
      const response = await apiRequest("DELETE", `/api/intel/surveys/${selectedSurveyId}/items/${item.id}`);
      return response.json() as Promise<IntelSurveyDetail>;
    },
    onSuccess: (survey) => {
      queryClient.setQueryData([`/api/intel/surveys/${survey.id}`], survey);
      queryClient.invalidateQueries({ queryKey: ["/api/intel/surveys"] });
      queryClient.invalidateQueries({ queryKey: [`/api/intel/surveys/${survey.id}/events`] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove listing", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  const shareSurveyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSurveyId) throw new Error("No survey selected");
      const response = await apiRequest("POST", `/api/intel/surveys/${selectedSurveyId}/share`);
      return response.json() as Promise<IntelSurveyDetail>;
    },
    onSuccess: (survey) => {
      queryClient.setQueryData([`/api/intel/surveys/${survey.id}`], survey);
      queryClient.invalidateQueries({ queryKey: ["/api/intel/surveys"] });
      queryClient.invalidateQueries({ queryKey: [`/api/intel/surveys/${survey.id}/events`] });
      toast({ title: "Client survey link created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create share link", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  const disableShareMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSurveyId) throw new Error("No survey selected");
      const response = await apiRequest("DELETE", `/api/intel/surveys/${selectedSurveyId}/share`);
      return response.json() as Promise<IntelSurveyDetail>;
    },
    onSuccess: (survey) => {
      queryClient.setQueryData([`/api/intel/surveys/${survey.id}`], survey);
      queryClient.invalidateQueries({ queryKey: ["/api/intel/surveys"] });
      queryClient.invalidateQueries({ queryKey: [`/api/intel/surveys/${survey.id}/events`] });
      toast({ title: "Client survey link disabled" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to disable share link", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  const uploadAssetMutation = useMutation({
    mutationFn: async ({ item, files }: { item: IntelSurveyItem; files: File[] }) => {
      if (!selectedSurveyId) throw new Error("No survey selected");
      if (!supabase) throw new Error("Supabase is not configured in this browser");

      const uploaded: IntelListingAsset[] = [];
      for (const file of files) {
        if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          throw new Error(`${file.name} is not a supported brochure or image file`);
        }
        if (file.size > 25 * 1024 * 1024) {
          throw new Error(`${file.name} is larger than the 25 MB upload limit`);
        }

        const response = await apiRequest("POST", `/api/intel/surveys/${selectedSurveyId}/items/${item.id}/assets/upload-url`, {
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
          assetType: file.type === "application/pdf" ? "brochure" : "photo",
        });
        const created = await response.json() as {
          asset: IntelListingAsset;
          upload: { bucket: string; path: string; token: string };
        };

        const { error } = await (supabase.storage.from(created.upload.bucket) as any).uploadToSignedUrl(
          created.upload.path,
          created.upload.token,
          file,
          { contentType: file.type, upsert: false },
        );
        if (error) throw error;

        const completeResponse = await apiRequest("POST", `/api/intel/assets/${created.asset.id}/complete`);
        uploaded.push(await completeResponse.json() as IntelListingAsset);
      }
      return uploaded;
    },
    onSuccess: (assets) => {
      queryClient.invalidateQueries({ queryKey: assetsQueryKey });
      toast({ title: assets.length === 1 ? "Brochure uploaded" : `${assets.length} assets uploaded` });
    },
    onError: (error: any) => {
      toast({ title: "Upload failed", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  const resolvePublicLinksMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDetailItem) throw new Error("Select a survey property before searching.");
      const response = await apiRequest("POST", `/api/intel/listings/${selectedDetailItem.listingId}/resolve-public-links`);
      return response.json() as Promise<ResolvePublicLinksResponse>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: publicLinksQueryKey });
      if (result.status === "not_configured") {
        toast({
          title: "Search provider not configured",
          description: result.message,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: (result.persistedCandidates?.length || 0) > 0 ? "Public link candidates ready" : "No public links found",
        description: result.message,
      });
    },
    onError: (error: any) => {
      toast({ title: "Public link search failed", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  const updatePublicLinkMutation = useMutation({
    mutationFn: async ({ candidateId, action }: { candidateId: string; action: "approve" | "reject" }) => {
      if (!selectedDetailItem) throw new Error("Select a survey property before updating a public link.");
      const response = await apiRequest(
        "POST",
        `/api/intel/listings/${selectedDetailItem.listingId}/public-links/${candidateId}/${action}`,
      );
      return response.json() as Promise<PublicLinkCandidate>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: publicLinksQueryKey });
    },
    onError: (error: any) => {
      toast({ title: "Public link update failed", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  const addShortlist = () => {
    const missing = shortlistedListingIds.filter((listingId) => !selectedListingIds.has(listingId));
    if (missing.length === 0) {
      toast({ title: "Shortlisted listings are already in this survey" });
      return;
    }
    missing.forEach((listingId) => addItemMutation.mutate(listingId));
  };

  const moveItem = (item: IntelSurveyItem, direction: "up" | "down") => {
    if (!selectedSurvey) return;
    const ordered = [...selectedSurvey.items].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex((candidate) => candidate.id === item.id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= ordered.length) return;

    const other = ordered[swapWith];
    updateItemMutation.mutate({ item, patch: { sortOrder: other.sortOrder } });
    updateItemMutation.mutate({ item: other, patch: { sortOrder: item.sortOrder } });
  };

  const canCreateSurvey = createForm.title.trim().length > 0 && !createSurveyMutation.isPending;

  const shareUrl = selectedSurvey?.shareToken
    ? `${window.location.origin}/tools/industrial-intel/surveys/share/${selectedSurvey.shareToken}`
    : null;

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: "Client survey link copied" });
    } catch {
      toast({ title: "Copy failed", description: shareUrl, variant: "destructive" });
    }
  };

  const uploadFilesForSelectedItem = (fileList: FileList | File[] | null) => {
    if (!selectedDetailItem || !fileList) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;
    uploadAssetMutation.mutate({ item: selectedDetailItem, files });
  };

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-700">Tool B</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">Survey builder</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Build private client-facing survey drafts from requirements, shortlist decisions, and live Industrial Intel inventory.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
          <FileText className="h-4 w-4 text-blue-700" />
          {surveys.length} drafts
        </div>
      </section>

      <section className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Create survey</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="surveyTitle">Title</Label>
                <Input
                  id="surveyTitle"
                  value={createForm.title}
                  onChange={(event) => setCreateForm({ ...createForm, title: event.target.value })}
                  placeholder="Q3 west-end shortlist"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="surveyClient">Client</Label>
                <Input
                  id="surveyClient"
                  value={createForm.clientName}
                  onChange={(event) => setCreateForm({ ...createForm, clientName: event.target.value })}
                  placeholder="Client name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="surveyRequirement">Requirement</Label>
                <select
                  id="surveyRequirement"
                  value={createForm.requirementId}
                  onChange={(event) => {
                    const requirement = requirements.find((item) => item.id === event.target.value);
                    setCreateForm({
                      ...createForm,
                      requirementId: event.target.value,
                      clientName: createForm.clientName || requirement?.clientName || "",
                      title: createForm.title || requirement?.title || "",
                    });
                  }}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm"
                >
                  <option value="">No linked requirement</option>
                  {requirements.map((requirement) => (
                    <option key={requirement.id} value={requirement.id}>
                      {requirement.title}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="button" className="w-full gap-2" disabled={!canCreateSurvey} onClick={() => createSurveyMutation.mutate()}>
                <Plus className="h-4 w-4" />
                Create draft
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Survey list</CardTitle>
            </CardHeader>
            <CardContent>
              {surveysLoading ? (
                <p className="text-sm text-slate-500">Loading surveys...</p>
              ) : surveys.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                  Create the first internal survey draft to start arranging listings.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {surveys.map((survey) => (
                    <button
                      key={survey.id}
                      type="button"
                      onClick={() => setSelectedSurveyId(survey.id)}
                      className={`rounded-lg border p-3 text-left transition ${
                        selectedSurveyId === survey.id
                          ? "border-blue-300 bg-blue-50 shadow-sm"
                          : "border-slate-200 bg-white hover:border-blue-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">{survey.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{survey.clientName || "No client named"}</p>
                        </div>
                        <Badge variant="outline" className="bg-white">{survey.status}</Badge>
                      </div>
                      <p className="mt-3 text-xs font-medium text-slate-600">
                        {survey.visibleItemCount} visible / {survey.itemCount} total
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {!selectedSurveyId || selectedSurveyLoading ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-slate-500">
                {selectedSurveyId ? "Loading survey..." : "Select or create a survey draft."}
              </CardContent>
            </Card>
          ) : !selectedSurvey ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-slate-500">Survey not found.</CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <CardTitle>{selectedSurvey.title}</CardTitle>
                      <p className="mt-2 text-sm text-slate-600">
                        {selectedSurvey.clientName || "No client named"}
                        {selectedSurvey.requirementTitle ? ` - ${selectedSurvey.requirementTitle}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={focusPreview}>
                        <MapPin className="h-4 w-4" />
                        Preview map
                      </Button>
                      {shareUrl ? (
                        <>
                          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={copyShareUrl}>
                            <Copy className="h-4 w-4" />
                            Copy link
                          </Button>
                          <a
                            href={shareUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Open client view
                          </a>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => disableShareMutation.mutate()}
                            disabled={disableShareMutation.isPending}
                          >
                            Disable link
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => shareSurveyMutation.mutate()}
                          disabled={shareSurveyMutation.isPending || visibleItems.length === 0}
                        >
                          <Share2 className="h-4 w-4" />
                          Create client link
                        </Button>
                      )}
                      <Badge className="bg-slate-950 text-white">{selectedSurvey.status}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="selectedSurveyTitle">Survey title</Label>
                    <Input
                      id="selectedSurveyTitle"
                      defaultValue={selectedSurveySummary?.title ?? selectedSurvey.title}
                      onBlur={(event) => {
                        if (event.target.value !== selectedSurvey.title) {
                          updateSurveyMutation.mutate({ title: event.target.value });
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="selectedSurveyClient">Client</Label>
                    <Input
                      id="selectedSurveyClient"
                      defaultValue={selectedSurveySummary?.clientName ?? selectedSurvey.clientName ?? ""}
                      onBlur={(event) => {
                        const nextClientName = event.target.value || null;
                        if (nextClientName !== selectedSurvey.clientName) {
                          updateSurveyMutation.mutate({ clientName: nextClientName });
                        }
                      }}
                    />
                  </div>
                </CardContent>
              </Card>

              <section className="space-y-6">
                <div ref={previewRef} className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
                  <Card className="overflow-hidden">
                    <CardHeader className="border-b border-slate-100 bg-white">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <CardTitle>Survey map</CardTitle>
                          <p className="mt-1 text-sm text-slate-600">
                            Build the client deliverable by adding listings, selecting pins, and checking missing map data.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="bg-white">
                            {mappableSurveyItems.length} mapped / {visibleItems.length} included
                          </Badge>
                          {unmappedVisibleCount > 0 && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-800">
                              {unmappedVisibleCount} need coordinates
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="h-[680px] bg-slate-100">
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
                        ) : mappableSurveyItems.length === 0 ? (
                          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-600">
                            Add listings with latitude and longitude to render the survey map.
                          </div>
                        ) : (
                          <GoogleMap
                            mapContainerStyle={MAP_CONTAINER_STYLE}
                            center={mapCenter}
                            zoom={mappableSurveyItems.length === 1 ? 13 : 10}
                            options={{
                              streetViewControl: false,
                              mapTypeControl: false,
                              fullscreenControl: true,
                              gestureHandling: "greedy",
                            }}
                          >
                            {mappableSurveyItems.map((item) => {
                              const optionNumber = visibleItems.findIndex((visibleItem) => visibleItem.id === item.id) + 1;
                              return (
                                <MarkerF
                                  key={item.id}
                                  position={{ lat: item.listing.latitude, lng: item.listing.longitude }}
                                  label={{ text: String(optionNumber), color: "#ffffff", fontWeight: "700" }}
                                  onClick={() => setSelectedMapItemId(item.id)}
                                />
                              );
                            })}
                            {selectedMapItem && (
                              <InfoWindowF
                                position={{ lat: selectedMapItem.listing.latitude, lng: selectedMapItem.listing.longitude }}
                                onCloseClick={() => setSelectedMapItemId(null)}
                              >
                                <div className="max-w-[17rem] space-y-2 p-1 text-sm text-slate-700">
                                  <p className="font-semibold text-slate-950">{selectedMapItem.listing.title}</p>
                                  <p>{selectedMapItem.listing.normalizedAddress || selectedMapItem.listing.address || "Address pending"}</p>
                                  <p>{formatListingSize(selectedMapItem.listing)} - {listingArea(selectedMapItem.listing)}</p>
                                  <div className="flex flex-wrap gap-3">
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
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle>Selected property</CardTitle>
                        <Badge variant="outline" className="bg-slate-50">Private draft</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {!selectedDetailItem ? (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                          Select a pin or add a listing to start shaping the survey.
                        </div>
                      ) : (
                        <>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold text-slate-950">{selectedDetailItem.listing.title}</h3>
                              {selectedDetailItem.hidden && <Badge variant="outline">Hidden</Badge>}
                            </div>
                            <p className="mt-1 text-sm text-slate-600">
                              {selectedDetailItem.listing.normalizedAddress || selectedDetailItem.listing.address || "Address pending"}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <Metric label="Building" value={formatListingSize(selectedDetailItem.listing)} />
                            <Metric label="Land" value={selectedDetailItem.listing.landAcres ? `${formatNumber(selectedDetailItem.listing.landAcres)} ac` : "-"} />
                            <Metric label="Lease" value={formatLeaseRate(selectedDetailItem.listing)} />
                            <Metric label="Sale" value={formatMoney(selectedDetailItem.listing.totalPrice)} />
                            <Metric label="Area" value={listingArea(selectedDetailItem.listing)} />
                            <Metric label="Source" value={selectedDetailItem.listing.sourceName || "-"} />
                          </div>

                          <div className="space-y-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                            <div
                              className="rounded-lg border border-slate-200 bg-white px-4 py-5 text-center"
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault();
                                uploadFilesForSelectedItem(event.dataTransfer.files);
                              }}
                            >
                              <Upload className="mx-auto h-5 w-5 text-blue-700" />
                              <p className="mt-2 text-sm font-semibold text-slate-950">Drop brochures or photos</p>
                              <p className="mt-1 text-xs text-slate-500">PDF, JPG, PNG, or WebP. 25 MB max.</p>
                              <label className="mt-3 inline-flex h-9 cursor-pointer items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50">
                                Choose files
                                <input
                                  type="file"
                                  multiple
                                  accept="application/pdf,image/jpeg,image/png,image/webp"
                                  className="hidden"
                                  disabled={uploadAssetMutation.isPending}
                                  onChange={(event) => {
                                    uploadFilesForSelectedItem(event.target.files);
                                    event.target.value = "";
                                  }}
                                />
                              </label>
                              {uploadAssetMutation.isPending && <p className="mt-2 text-xs text-slate-500">Uploading...</p>}
                            </div>

                            {selectedDetailAssets.length > 0 && (
                              <div className="space-y-2">
                                {selectedDetailAssets.map((asset) => (
                                  <div key={asset.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-950">{asset.fileName}</p>
                                      <p className="text-xs text-slate-500">{asset.assetType}</p>
                                    </div>
                                    {asset.signedUrl && (
                                      <a href={asset.signedUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-blue-700">
                                        View
                                      </a>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="rounded-lg border border-slate-200 bg-white p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-950">Find public flyer</p>
                                <p className="mt-1 text-xs leading-5 text-slate-500">
                                  Use the configured Google or Vertex resolver to find broker and landlord listing pages.
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {approvedPublicLink && (
                                  <a
                                    href={approvedPublicLink.candidateUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex h-9 items-center rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white"
                                  >
                                    Open link
                                  </a>
                                )}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => resolvePublicLinksMutation.mutate()}
                                  disabled={resolvePublicLinksMutation.isPending}
                                >
                                  {resolvePublicLinksMutation.isPending ? "Searching..." : "Find link"}
                                </Button>
                              </div>
                            </div>

                            {resolvePublicLinksMutation.data?.status === "not_configured" && (
                              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                                {resolvePublicLinksMutation.data.message}
                              </div>
                            )}
                            {resolvePublicLinksMutation.isError && (
                              <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700">
                                Resolver failed. {(resolvePublicLinksMutation.error as Error)?.message || "Please try again."}
                              </div>
                            )}
                            {isPublicLinksError && (
                              <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700">
                                Public links failed to load. {(publicLinksError as Error)?.message || "Please try again."}
                              </div>
                            )}

                            {isLoadingPublicLinks ? (
                              <p className="mt-3 text-xs text-slate-500">Loading public link candidates...</p>
                            ) : publicLinkCandidates.length > 0 ? (
                              <div className="mt-3 space-y-2">
                                {publicLinkCandidates.map((candidate) => (
                                  <div key={candidate.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                            {candidate.domain}
                                          </span>
                                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                            candidate.status === "approved"
                                              ? "bg-emerald-100 text-emerald-700"
                                              : candidate.status === "rejected"
                                                ? "bg-rose-100 text-rose-700"
                                                : "bg-blue-100 text-blue-700"
                                          }`}>
                                            {candidate.status}
                                          </span>
                                          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                            {candidate.confidence}%
                                          </span>
                                        </div>
                                        <a
                                          href={candidate.candidateUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="mt-2 line-clamp-2 block text-sm font-semibold text-slate-950 hover:text-blue-700"
                                        >
                                          {candidate.title || candidate.candidateUrl}
                                        </a>
                                        {candidate.snippet && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{candidate.snippet}</p>}
                                      </div>
                                      <div className="flex shrink-0 gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          className="h-8 px-2 text-xs"
                                          onClick={() => updatePublicLinkMutation.mutate({ candidateId: candidate.id, action: "approve" })}
                                          disabled={updatePublicLinkMutation.isPending || candidate.status === "approved"}
                                        >
                                          Approve
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-8 px-2 text-xs"
                                          onClick={() => updatePublicLinkMutation.mutate({ candidateId: candidate.id, action: "reject" })}
                                          disabled={updatePublicLinkMutation.isPending || candidate.status === "rejected"}
                                        >
                                          Reject
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-xs text-slate-500">No public link candidates saved yet.</p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`selected-label-${selectedDetailItem.id}`}>Recommendation</Label>
                            <Input
                              id={`selected-label-${selectedDetailItem.id}`}
                              key={`label-${selectedDetailItem.id}`}
                              defaultValue={selectedDetailItem.recommendationLabel || ""}
                              onBlur={(event) => {
                                const nextLabel = event.target.value || null;
                                if (nextLabel !== selectedDetailItem.recommendationLabel) {
                                  updateItemMutation.mutate({ item: selectedDetailItem, patch: { recommendationLabel: nextLabel } });
                                }
                              }}
                              placeholder="Best fit"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`selected-notes-${selectedDetailItem.id}`}>Client-visible notes</Label>
                            <Textarea
                              id={`selected-notes-${selectedDetailItem.id}`}
                              key={`notes-${selectedDetailItem.id}`}
                              defaultValue={selectedDetailItem.clientNotes || ""}
                              onBlur={(event) => {
                                const nextNotes = event.target.value || null;
                                if (nextNotes !== selectedDetailItem.clientNotes) {
                                  updateItemMutation.mutate({ item: selectedDetailItem, patch: { clientNotes: nextNotes } });
                                }
                              }}
                              placeholder="Why this option belongs in the survey"
                              className="min-h-[120px]"
                            />
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                            <div className="flex flex-wrap gap-3">
                              {approvedPublicLink || firstLink(selectedDetailItem.listing) ? (
                                <a
                                  href={approvedPublicLink?.candidateUrl || firstLink(selectedDetailItem.listing) || undefined}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900"
                                >
                                  {approvedPublicLink ? "View public link" : "View listing"}
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              ) : (
                                <span className="text-sm text-slate-500">No public link</span>
                              )}
                              <a
                                href={buildGoogleMapsUrl(selectedDetailItem.listing)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900"
                              >
                                Open maps
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </div>
                            <div className="flex items-center gap-3">
                              {selectedDetailItem.hidden ? <EyeOff className="h-4 w-4 text-slate-500" /> : <Eye className="h-4 w-4 text-emerald-600" />}
                              <Label htmlFor={`selected-hidden-${selectedDetailItem.id}`} className="text-sm font-medium text-slate-700">Include</Label>
                              <Switch
                                id={`selected-hidden-${selectedDetailItem.id}`}
                                checked={!selectedDetailItem.hidden}
                                onCheckedChange={(checked) => updateItemMutation.mutate({ item: selectedDetailItem, patch: { hidden: !checked } })}
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <Card>
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <CardTitle>Add listings</CardTitle>
                          <p className="mt-1 text-sm text-slate-600">Search inventory, then add properties to the survey map.</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addShortlist}
                          disabled={!selectedSurvey.requirementId || shortlistedListingIds.length === 0}
                        >
                          Add shortlist
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Input
                        value={listingSearch}
                        onChange={(event) => setListingSearch(event.target.value)}
                        placeholder="Search inventory by title, address, submarket, source"
                      />
                      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                        {filteredListings.map((listing) => (
                          <div key={listing.id} className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-950">{listing.title}</p>
                                <p className="mt-1 text-xs text-slate-500">{listing.normalizedAddress || listing.address || "Address pending"}</p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => addItemMutation.mutate(listing.id)}
                                disabled={addItemMutation.isPending}
                              >
                                Add
                              </Button>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                              <span>{formatListingSize(listing)}</span>
                              <span>{listingArea(listing)}</span>
                              <span>{listing.sourceName || "Unknown source"}</span>
                              {isMappableListing(listing) ? (
                                <span className="font-semibold text-emerald-700">Map ready</span>
                              ) : (
                                <span className="font-semibold text-amber-700">Needs coordinates</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Included options</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {selectedSurvey.items.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                            Added listings will appear here in client order.
                          </div>
                        ) : (
                          selectedSurvey.items.map((item, index) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setSelectedMapItemId(item.id)}
                              className={`w-full rounded-lg border p-3 text-left transition ${
                                selectedDetailItem?.id === item.id
                                  ? "border-blue-300 bg-blue-50 shadow-sm"
                                  : item.hidden
                                    ? "border-slate-200 bg-slate-50 opacity-75"
                                    : "border-slate-200 bg-white hover:border-blue-200"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Option {index + 1}</p>
                                  <p className="mt-1 font-semibold text-slate-950">{item.listing.title}</p>
                                  <p className="mt-1 text-xs text-slate-500">{item.listing.normalizedAddress || item.listing.address || "Address pending"}</p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button type="button" size="icon" variant="outline" disabled={index === 0} onClick={(event) => { event.stopPropagation(); moveItem(item, "up"); }}>
                                    <ArrowUp className="h-4 w-4" />
                                  </Button>
                                  <Button type="button" size="icon" variant="outline" disabled={index === selectedSurvey.items.length - 1} onClick={(event) => { event.stopPropagation(); moveItem(item, "down"); }}>
                                    <ArrowDown className="h-4 w-4" />
                                  </Button>
                                  <Button type="button" size="icon" variant="outline" onClick={(event) => { event.stopPropagation(); deleteItemMutation.mutate(item); }}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                                <span>{formatListingSize(item.listing)}</span>
                                <span>{listingArea(item.listing)}</span>
                                {item.hidden && <span className="font-semibold text-slate-700">Hidden</span>}
                                {!isMappableListing(item.listing) && <span className="font-semibold text-amber-700">Needs coordinates</span>}
                              </div>
                            </button>
                          ))
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4 text-blue-700" />
                          <CardTitle>Action trail</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {surveyEvents.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                            Survey actions will appear here for future assistant review.
                          </div>
                        ) : (
                          surveyEvents.slice(0, 8).map((event) => (
                            <div key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-900">{event.summary || event.action}</p>
                                <Badge variant="outline" className="bg-white">{event.actorType}</Badge>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">{formatRelativeTime(event.createdAt)}</p>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}
