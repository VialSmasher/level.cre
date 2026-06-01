import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff, FileText, Plus, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
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

type IntelSurveyDetail = IntelSurveyListItem & {
  items: IntelSurveyItem[];
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

export default function IndustrialIntelSurveysPage() {
  const { toast } = useToast();
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [listingSearch, setListingSearch] = useState("");
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
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove listing", description: error?.message || "Please try again.", variant: "destructive" });
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

      <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-6">
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
            <CardContent className="space-y-3">
              {surveysLoading ? (
                <p className="text-sm text-slate-500">Loading surveys...</p>
              ) : surveys.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                  Create the first internal survey draft to start arranging listings.
                </div>
              ) : (
                surveys.map((survey) => (
                  <button
                    key={survey.id}
                    type="button"
                    onClick={() => setSelectedSurveyId(survey.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
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
                ))
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
                    <Badge className="bg-slate-950 text-white">{selectedSurvey.status}</Badge>
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

              <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <CardTitle>Add listings</CardTitle>
                          <p className="mt-1 text-sm text-slate-600">Pull from active inventory or seed from a linked shortlist.</p>
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
                      <div className="grid gap-3 md:grid-cols-2">
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
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Survey listings</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {selectedSurvey.items.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600">
                          Add listings from inventory or a shortlist to start the draft.
                        </div>
                      ) : (
                        selectedSurvey.items.map((item, index) => (
                          <div key={item.id} className={`rounded-lg border p-4 ${item.hidden ? "border-slate-200 bg-slate-50 opacity-75" : "border-slate-200 bg-white"}`}>
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-lg font-semibold text-slate-950">{item.listing.title}</h3>
                                  {item.hidden && <Badge variant="outline">Hidden</Badge>}
                                </div>
                                <p className="mt-1 text-sm text-slate-600">{item.listing.normalizedAddress || item.listing.address || "Address pending"}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button type="button" size="icon" variant="outline" disabled={index === 0} onClick={() => moveItem(item, "up")}>
                                  <ArrowUp className="h-4 w-4" />
                                </Button>
                                <Button type="button" size="icon" variant="outline" disabled={index === selectedSurvey.items.length - 1} onClick={() => moveItem(item, "down")}>
                                  <ArrowDown className="h-4 w-4" />
                                </Button>
                                <Button type="button" size="icon" variant="outline" onClick={() => deleteItemMutation.mutate(item)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                              <Metric label="Building" value={formatListingSize(item.listing)} />
                              <Metric label="Land" value={item.listing.landAcres ? `${formatNumber(item.listing.landAcres)} ac` : "-"} />
                              <Metric label="Lease" value={formatLeaseRate(item.listing)} />
                              <Metric label="Sale" value={formatMoney(item.listing.totalPrice)} />
                              <Metric label="Submarket" value={listingArea(item.listing)} />
                              <Metric label="Source" value={item.listing.sourceName || "-"} />
                            </div>

                            <div className="mt-4 grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                              <div className="space-y-2">
                                <Label htmlFor={`label-${item.id}`}>Recommendation</Label>
                                <Input
                                  id={`label-${item.id}`}
                                  defaultValue={item.recommendationLabel || ""}
                                  onBlur={(event) => {
                                    const nextLabel = event.target.value || null;
                                    if (nextLabel !== item.recommendationLabel) {
                                      updateItemMutation.mutate({ item, patch: { recommendationLabel: nextLabel } });
                                    }
                                  }}
                                  placeholder="Best fit"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`notes-${item.id}`}>Client-visible notes</Label>
                                <Textarea
                                  id={`notes-${item.id}`}
                                  defaultValue={item.clientNotes || ""}
                                  onBlur={(event) => {
                                    const nextNotes = event.target.value || null;
                                    if (nextNotes !== item.clientNotes) {
                                      updateItemMutation.mutate({ item, patch: { clientNotes: nextNotes } });
                                    }
                                  }}
                                  placeholder="Why this option belongs in the survey"
                                  className="min-h-[88px]"
                                />
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                              <div className="flex items-center gap-2">
                                {firstLink(item.listing) ? (
                                  <a
                                    href={firstLink(item.listing) || undefined}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900"
                                  >
                                    Source link
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                ) : (
                                  <span className="text-sm text-slate-500">No public source link</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                {item.hidden ? <EyeOff className="h-4 w-4 text-slate-500" /> : <Eye className="h-4 w-4 text-emerald-600" />}
                                <Label htmlFor={`hidden-${item.id}`} className="text-sm font-medium text-slate-700">Include</Label>
                                <Switch
                                  id={`hidden-${item.id}`}
                                  checked={!item.hidden}
                                  onCheckedChange={(checked) => updateItemMutation.mutate({ item, patch: { hidden: !checked } })}
                                />
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>

                <aside className="space-y-4">
                  <div className="sticky top-28 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Client preview</p>
                        <h2 className="mt-2 text-xl font-semibold text-slate-950">{selectedSurvey.title}</h2>
                        <p className="mt-1 text-sm text-slate-600">{selectedSurvey.clientName || "Prepared client survey"}</p>
                      </div>
                      <Badge variant="outline" className="bg-slate-50">Private</Badge>
                    </div>

                    <div className="mt-5 space-y-4">
                      {visibleItems.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                          Included listings will appear here.
                        </div>
                      ) : (
                        visibleItems.map((item, index) => (
                          <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Option {index + 1}</p>
                                <h3 className="mt-1 font-semibold text-slate-950">{item.listing.title}</h3>
                                <p className="mt-1 text-sm text-slate-600">{item.listing.normalizedAddress || item.listing.address || "Address pending"}</p>
                              </div>
                              {item.recommendationLabel && <Badge className="bg-blue-100 text-blue-800">{item.recommendationLabel}</Badge>}
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                              <Metric label="Building" value={formatListingSize(item.listing)} />
                              <Metric label="Land" value={item.listing.landAcres ? `${formatNumber(item.listing.landAcres)} ac` : "-"} />
                              <Metric label="Lease" value={formatLeaseRate(item.listing)} />
                              <Metric label="Sale" value={formatMoney(item.listing.totalPrice)} />
                            </div>
                            {item.clientNotes && <p className="mt-4 text-sm leading-6 text-slate-700">{item.clientNotes}</p>}
                            {firstLink(item.listing) && (
                              <a
                                href={firstLink(item.listing) || undefined}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-700"
                              >
                                View listing
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </aside>
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
