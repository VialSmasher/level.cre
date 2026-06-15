import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Check, CircleAlert, FileText, Image, Library, Plus, Search, Upload } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type IntelListing = {
  id: string;
  title: string;
  address: string | null;
  normalizedAddress: string | null;
  market: string | null;
  submarket: string | null;
  listingType: string;
  assetType: string;
  latitude: number | null;
  longitude: number | null;
  availableSf: number | null;
  landAcres: number | null;
  totalPrice: number | null;
  pricePerAcre: number | null;
  leaseRatePsf: number | null;
  brochureUrl: string | null;
  sourceUrl: string | null;
};

type IntelListingAsset = {
  id: string;
  dossierId: string | null;
  listingId: string | null;
  assetType: "brochure" | "flyer" | "aerial" | "site_plan" | "photo" | "survey_page" | "other";
  fileName: string;
  contentType: string;
  fileSize: number;
  status: "pending" | "active" | "failed" | "archived";
  isPrimary: boolean;
  signedUrl: string | null;
  createdAt: string | null;
};

type IntelDossierFact = {
  id: string;
  dossierId: string;
  factKey: string;
  label: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  confidence: number;
  status: "proposed" | "approved" | "rejected";
  source: string;
};

type IntelDossierListItem = {
  id: string;
  canonicalListingId: string | null;
  title: string;
  address: string | null;
  normalizedAddress: string | null;
  market: string | null;
  submarket: string | null;
  assetType: string | null;
  listingType: string | null;
  status: "active" | "draft" | "archived";
  latitude: number | null;
  longitude: number | null;
  dataCompletenessScore: number;
  assetCount: number;
  approvedFactCount: number;
  proposedFactCount: number;
  updatedAt: string | null;
};

type IntelDossierDetail = IntelDossierListItem & {
  facts: IntelDossierFact[];
  assets: IntelListingAsset[];
  listing: IntelListing | null;
};

const FACT_PRESETS = [
  { key: "site_size", label: "Site size" },
  { key: "building_size", label: "Building size" },
  { key: "asking_price", label: "Asking price" },
  { key: "zoning", label: "Zoning" },
  { key: "comments", label: "Broker comments" },
] as const;

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toLocaleString();
}

function formatBytes(value: number) {
  if (!value) return "0 KB";
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(value / 1024)} KB`;
}

function cleanAssetType(file: File) {
  return file.type === "application/pdf" ? "brochure" : "photo";
}

function factDisplayValue(fact: IntelDossierFact) {
  if (fact.valueText) return fact.valueText;
  if (fact.valueNumber !== null && fact.valueNumber !== undefined) return formatNumber(fact.valueNumber);
  if (fact.valueBoolean !== null && fact.valueBoolean !== undefined) return fact.valueBoolean ? "Yes" : "No";
  return "-";
}

function completenessTone(score: number) {
  if (score >= 75) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (score >= 45) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-rose-50 text-rose-700 ring-rose-200";
}

export default function IndustrialIntelDossiersPage() {
  const { toast } = useToast();
  const [selectedDossierId, setSelectedDossierId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ title: "", address: "", market: "", assetType: "land" });
  const [newFact, setNewFact] = useState({ factKey: "site_size", valueText: "", confidence: 85 });

  const { data: dossiers = [], isLoading: dossiersLoading } = useQuery<IntelDossierListItem[]>({
    queryKey: ["/api/intel/dossiers"],
  });

  const selectedId = selectedDossierId || dossiers[0]?.id || null;
  const {
    data: selectedDossier,
    isLoading: detailLoading,
  } = useQuery<IntelDossierDetail>({
    queryKey: [`/api/intel/dossiers/${selectedId || "none"}`],
    enabled: Boolean(selectedId),
  });

  const filteredDossiers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return dossiers.filter((dossier) => {
      if (!needle) return true;
      return [dossier.title, dossier.address, dossier.submarket, dossier.market, dossier.assetType]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [dossiers, search]);

  const approvedFacts = selectedDossier?.facts.filter((fact) => fact.status === "approved") || [];
  const proposedFacts = selectedDossier?.facts.filter((fact) => fact.status === "proposed") || [];
  const pdfAssets = selectedDossier?.assets.filter((asset) => asset.contentType === "application/pdf") || [];
  const photoAssets = selectedDossier?.assets.filter((asset) => asset.contentType !== "application/pdf") || [];
  const activeListing = selectedDossier?.listing;
  const surveySyncRows = selectedDossier
    ? [
        {
          label: "Source files",
          value: selectedDossier.assets.length,
          ready: selectedDossier.assets.length > 0,
        },
        {
          label: "Review queue",
          value: proposedFacts.length,
          ready: proposedFacts.length === 0,
        },
        {
          label: "Approved facts",
          value: approvedFacts.length,
          ready: approvedFacts.length >= 3,
        },
        {
          label: "Map ready",
          value: selectedDossier.latitude && selectedDossier.longitude ? "Yes" : "No",
          ready: Boolean(selectedDossier.latitude && selectedDossier.longitude),
        },
      ]
    : [];

  const createDossierMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/intel/dossiers", {
        title: createForm.title.trim(),
        address: createForm.address.trim() || null,
        market: createForm.market.trim() || null,
        assetType: createForm.assetType || null,
        status: "draft",
      });
      return response.json() as Promise<IntelDossierDetail>;
    },
    onSuccess: (dossier) => {
      queryClient.invalidateQueries({ queryKey: ["/api/intel/dossiers"] });
      queryClient.setQueryData([`/api/intel/dossiers/${dossier.id}`], dossier);
      setSelectedDossierId(dossier.id);
      setCreateOpen(false);
      setCreateForm({ title: "", address: "", market: "", assetType: "land" });
      toast({ title: "Dossier created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create dossier", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  const uploadAssetsMutation = useMutation({
    mutationFn: async (files: File[]) => {
      if (!selectedId) throw new Error("Select a property dossier first.");
      if (!supabase) throw new Error("Supabase is not configured in this browser.");
      const uploaded: IntelListingAsset[] = [];
      for (const file of files) {
        if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          throw new Error(`${file.name} is not a supported file.`);
        }
        if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} is larger than 25 MB.`);
        const response = await apiRequest("POST", `/api/intel/dossiers/${selectedId}/assets/upload-url`, {
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
          assetType: cleanAssetType(file),
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
      queryClient.invalidateQueries({ queryKey: [`/api/intel/dossiers/${selectedId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/dossiers"] });
      toast({ title: assets.length === 1 ? "Asset uploaded" : `${assets.length} assets uploaded` });
    },
    onError: (error: any) => {
      toast({ title: "Upload failed", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  const extractAssetMutation = useMutation({
    mutationFn: async (asset: IntelListingAsset) => {
      if (!selectedId) throw new Error("Select a property dossier first.");
      const response = await apiRequest("POST", `/api/intel/dossiers/${selectedId}/assets/${asset.id}/extract`);
      return response.json() as Promise<{ facts: IntelDossierFact[] }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [`/api/intel/dossiers/${selectedId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/dossiers"] });
      toast({ title: `Extracted ${result.facts.filter(Boolean).length} proposed facts` });
    },
    onError: (error: any) => {
      toast({ title: "Extraction failed", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  const createFactMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Select a property dossier first.");
      const preset = FACT_PRESETS.find((candidate) => candidate.key === newFact.factKey);
      const response = await apiRequest("POST", `/api/intel/dossiers/${selectedId}/facts`, {
        factKey: newFact.factKey,
        label: preset?.label || newFact.factKey,
        valueText: newFact.valueText.trim(),
        confidence: newFact.confidence,
        status: "approved",
        source: "broker_review",
      });
      return response.json() as Promise<IntelDossierFact>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/intel/dossiers/${selectedId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/dossiers"] });
      setNewFact({ factKey: "site_size", valueText: "", confidence: 85 });
      toast({ title: "Fact saved" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to save fact", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  const updateFactMutation = useMutation({
    mutationFn: async ({ fact, status }: { fact: IntelDossierFact; status: "approved" | "rejected" }) => {
      const response = await apiRequest("PATCH", `/api/intel/dossiers/${fact.dossierId}/facts/${fact.id}`, { status });
      return response.json() as Promise<IntelDossierFact>;
    },
    onSuccess: (fact) => {
      queryClient.invalidateQueries({ queryKey: [`/api/intel/dossiers/${fact.dossierId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/dossiers"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update fact", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-blue-700">Tool B</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Property dossiers</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Build reusable property packages from brochures, photos, listing imports, and broker-approved facts.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
          <Library className="h-4 w-4 text-blue-700" />
          {dossiers.length} dossiers
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <aside className="space-y-4">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Library</CardTitle>
                <Button type="button" size="sm" onClick={() => setCreateOpen((value) => !value)}>
                  <Plus className="mr-2 h-4 w-4" />
                  New
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input className="pl-9" placeholder="Search address, market, type" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              {createOpen && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <Label>Title</Label>
                  <Input value={createForm.title} onChange={(event) => setCreateForm({ ...createForm, title: event.target.value })} placeholder="Border Business Park" />
                  <Label>Address</Label>
                  <Input value={createForm.address} onChange={(event) => setCreateForm({ ...createForm, address: event.target.value })} placeholder="5103 36 Street NW" />
                  <Label>Market</Label>
                  <Input value={createForm.market} onChange={(event) => setCreateForm({ ...createForm, market: event.target.value })} placeholder="SE Edmonton" />
                  <Button className="w-full" disabled={!createForm.title.trim() || createDossierMutation.isPending} onClick={() => createDossierMutation.mutate()}>
                    Create dossier
                  </Button>
                </div>
              )}
              <div className="max-h-[650px] space-y-2 overflow-y-auto pr-1">
                {dossiersLoading ? (
                  <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Loading dossiers...</p>
                ) : filteredDossiers.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">No dossiers match this search.</p>
                ) : (
                  filteredDossiers.map((dossier) => (
                    <button
                      key={dossier.id}
                      type="button"
                      onClick={() => setSelectedDossierId(dossier.id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        selectedId === dossier.id
                          ? "border-blue-300 bg-blue-50 shadow-sm"
                          : "border-slate-200 bg-white hover:border-blue-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="line-clamp-2 text-sm font-semibold text-slate-950">{dossier.title}</p>
                          <p className="mt-1 line-clamp-1 text-xs text-slate-500">{dossier.address || dossier.submarket || "No address yet"}</p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${completenessTone(dossier.dataCompletenessScore)}`}>
                          {dossier.dataCompletenessScore}%
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                        <span className="rounded-full bg-slate-100 px-2 py-1">{dossier.assetCount} assets</span>
                        <span className="rounded-full bg-slate-100 px-2 py-1">{dossier.approvedFactCount} approved facts</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </aside>

        <main className="space-y-5">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="p-0">
              {!selectedId || detailLoading ? (
                <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">
                  {selectedId ? "Loading dossier..." : "Select or create a property dossier."}
                </div>
              ) : !selectedDossier ? (
                <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">Dossier not found.</div>
              ) : (
                <div>
                  <div className="border-b border-slate-200 p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{selectedDossier.title}</h2>
                          <Badge variant="outline" className="bg-white">{selectedDossier.status}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{selectedDossier.address || selectedDossier.submarket || selectedDossier.market || "No location recorded"}</p>
                      </div>
                      <div className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${completenessTone(selectedDossier.dataCompletenessScore)}`}>
                        {selectedDossier.dataCompletenessScore}% package-ready
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold uppercase text-slate-500">Type</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">{selectedDossier.assetType || activeListing?.assetType || "-"}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold uppercase text-slate-500">Building</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">{activeListing?.availableSf ? `${formatNumber(activeListing.availableSf)} SF` : "-"}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold uppercase text-slate-500">Land</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">{activeListing?.landAcres ? `${activeListing.landAcres} acres` : "-"}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[11px] font-semibold uppercase text-slate-500">Market</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">{selectedDossier.submarket || selectedDossier.market || "-"}</p>
                      </div>
                    </div>
                  </div>

                  <section className="grid gap-5 p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="space-y-5">
                      <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-slate-950">Drop brochures, surveys, site plans, and photos</p>
                            <p className="mt-1 text-sm text-slate-600">Stored once here, reused across map cards, survey links, and export packages.</p>
                          </div>
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
                            <Upload className="h-4 w-4" />
                            Upload files
                            <input
                              type="file"
                              className="hidden"
                              multiple
                              accept="application/pdf,image/jpeg,image/png,image/webp"
                              onChange={(event) => {
                                const files = Array.from(event.target.files || []);
                                if (files.length) uploadAssetsMutation.mutate(files);
                                event.target.value = "";
                              }}
                            />
                          </label>
                        </div>
                      </div>

                      <div>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h3 className="text-lg font-semibold text-slate-950">Approved facts</h3>
                          <Badge variant="outline" className="bg-white">{approvedFacts.length} client-safe</Badge>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          {approvedFacts.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 md:col-span-2">No approved facts yet. Add broker-reviewed facts below.</p>
                          ) : (
                            approvedFacts.map((fact) => (
                              <div key={fact.id} className="rounded-xl border border-slate-200 bg-white p-4">
                                <p className="text-[11px] font-semibold uppercase text-slate-500">{fact.label}</p>
                                <p className="mt-1 text-sm font-semibold text-slate-950">{factDisplayValue(fact)}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <h3 className="text-lg font-semibold text-slate-950">Add broker-approved fact</h3>
                        <div className="mt-4 grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_120px]">
                          <select
                            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                            value={newFact.factKey}
                            onChange={(event) => setNewFact({ ...newFact, factKey: event.target.value })}
                          >
                            {FACT_PRESETS.map((fact) => (
                              <option key={fact.key} value={fact.key}>{fact.label}</option>
                            ))}
                          </select>
                          <Textarea
                            className="min-h-10"
                            value={newFact.valueText}
                            onChange={(event) => setNewFact({ ...newFact, valueText: event.target.value })}
                            placeholder="Example: +/- 11.78 acres, BE zoning, full city services at lot line"
                          />
                          <Button disabled={!newFact.valueText.trim() || createFactMutation.isPending} onClick={() => createFactMutation.mutate()}>
                            <Check className="mr-2 h-4 w-4" />
                            Save
                          </Button>
                        </div>
                      </div>

                      <div>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h3 className="text-lg font-semibold text-slate-950">Proposed facts</h3>
                          <Badge variant="outline" className="bg-white">{proposedFacts.length} need review</Badge>
                        </div>
                        {proposedFacts.length === 0 ? (
                          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">No facts waiting for review.</p>
                        ) : (
                          <div className="space-y-2">
                            {proposedFacts.map((fact) => (
                              <div key={fact.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-950">{fact.label}</p>
                                  <p className="text-sm text-slate-700">{factDisplayValue(fact)}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button size="sm" variant="outline" onClick={() => updateFactMutation.mutate({ fact, status: "rejected" })}>Reject</Button>
                                  <Button size="sm" onClick={() => updateFactMutation.mutate({ fact, status: "approved" })}>Approve</Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <aside className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h3 className="text-sm font-semibold text-slate-950">Package assets</h3>
                        <div className="mt-4 space-y-3">
                          <div className="flex items-center justify-between rounded-xl bg-white p-3">
                            <span className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-blue-700" /> PDFs</span>
                            <span className="text-sm text-slate-500">{pdfAssets.length}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl bg-white p-3">
                            <span className="flex items-center gap-2 text-sm font-semibold"><Image className="h-4 w-4 text-blue-700" /> Images</span>
                            <span className="text-sm text-slate-500">{photoAssets.length}</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <h3 className="text-sm font-semibold text-slate-950">Recent files</h3>
                        <div className="mt-3 space-y-2">
                          {(selectedDossier.assets || []).length === 0 ? (
                            <p className="rounded-xl border border-dashed border-slate-200 p-3 text-sm text-slate-500">No files uploaded yet.</p>
                          ) : (
                            selectedDossier.assets.slice(0, 8).map((asset) => (
                              <div key={asset.id} className="rounded-xl border border-slate-200 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="line-clamp-2 text-sm font-semibold text-slate-950">{asset.fileName}</p>
                                    <p className="mt-1 text-xs text-slate-500">{asset.assetType} - {formatBytes(asset.fileSize)}</p>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    {asset.contentType === "application/pdf" && asset.status === "active" && (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 px-2 text-xs"
                                        disabled={extractAssetMutation.isPending}
                                        onClick={() => extractAssetMutation.mutate(asset)}
                                      >
                                        Extract
                                      </Button>
                                    )}
                                    {asset.signedUrl && (
                                      <a href={asset.signedUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-700">
                                        Open
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <h3 className="text-sm font-semibold text-slate-950">Readiness</h3>
                        <div className="mt-3 space-y-2 text-sm">
                          <p className="flex items-center gap-2 text-slate-600">
                            {selectedDossier.address ? <Check className="h-4 w-4 text-emerald-600" /> : <CircleAlert className="h-4 w-4 text-amber-600" />}
                            Address
                          </p>
                          <p className="flex items-center gap-2 text-slate-600">
                            {selectedDossier.latitude && selectedDossier.longitude ? <Check className="h-4 w-4 text-emerald-600" /> : <CircleAlert className="h-4 w-4 text-amber-600" />}
                            Map coordinates
                          </p>
                          <p className="flex items-center gap-2 text-slate-600">
                            {selectedDossier.assets.length > 0 ? <Check className="h-4 w-4 text-emerald-600" /> : <CircleAlert className="h-4 w-4 text-amber-600" />}
                            Source files
                          </p>
                          <p className="flex items-center gap-2 text-slate-600">
                            {approvedFacts.length >= 3 ? <Check className="h-4 w-4 text-emerald-600" /> : <CircleAlert className="h-4 w-4 text-amber-600" />}
                            Client facts
                          </p>
                        </div>
                      </div>
                    </aside>
                  </section>
                </div>
              )}
            </CardContent>
          </Card>
        </main>

        <aside className="space-y-4">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>SurveySync</CardTitle>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
                  API-ready
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedDossier ? (
                surveySyncRows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center gap-2">
                      {row.ready ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <CircleAlert className="h-4 w-4 text-amber-600" />
                      )}
                      <span className="text-sm font-semibold text-slate-950">{row.label}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-600">{row.value}</span>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Select a dossier to see intake status.</p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <Bot className="mt-0.5 h-5 w-5 text-blue-700" />
                <div>
                  <p className="text-sm font-semibold text-slate-950">Agent handoff</p>
                  <p className="mt-1 text-sm text-slate-600">Create dossier, upload file, propose facts, await broker approval.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
