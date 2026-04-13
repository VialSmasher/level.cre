import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  availableSf: number | null;
  brochureUrl: string | null;
  sourceUrl: string | null;
  lastSeenAt: string | null;
  removedAt: string | null;
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

function hasListingQualityIssue(listing: IntelListing) {
  const lowerTitle = listing.title.toLowerCase();
  return !listing.address || lowerTitle.length < 12 || lowerTitle.includes("contact an associate");
}

export default function IndustrialIntelInventoryPage() {
  const queryClient = useQueryClient();
  const [showManualIntake, setShowManualIntake] = useState(false);
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
    availableSf: "",
  });

  const { data: listings = [], isLoading } = useQuery<IntelListing[]>({
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
        availableSf: current.availableSf || (preview.availableSf ? String(preview.availableSf) : ""),
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
        availableSf: form.availableSf ? Number(form.availableSf) : null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intel/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/changes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/summary"] });
      setForm((current) => ({ ...current, sourceUrl: "", title: "", brochureUrl: "", address: "", submarket: "", availableSf: "" }));
      setShowManualIntake(false);
    },
  });

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

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-3xl font-semibold text-slate-950">External Inventory</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Review tracked external listings, narrow the set quickly with filters, and keep manual intake tucked away for the rare edge case.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
              <button
                type="button"
                onClick={() => setShowManualIntake((current) => !current)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
              >
                {showManualIntake ? "Hide manual intake" : "Show manual intake"}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {showManualIntake && (
        <Card>
          <CardHeader>
            <CardTitle>Manual URL Intake</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Keep this for exceptions and review-only cases. The normal operating path should come from automated ingest or bot-driven intake.
            </div>

            <div className="grid gap-4 md:grid-cols-2">
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
                <Label htmlFor="availableSf">Available SF</Label>
                <Input id="availableSf" placeholder="Optional square footage" value={form.availableSf} onChange={(event) => setForm({ ...form, availableSf: event.target.value })} />
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
                Review any autofilled values before saving. Use this only when the automated lane is not the right fit.
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

      <Card>
        <CardHeader>
          <CardTitle>Listings</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading listings...</p>
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
                    <th className="py-3 pr-4 font-medium">Submarket</th>
                    <th className="py-3 pr-4 font-medium">Available SF</th>
                    <th className="py-3 pr-4 font-medium">Last Seen</th>
                    <th className="py-3 pr-4 font-medium">Links</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredListings.map((listing) => (
                    <tr key={listing.id} className="align-top">
                      <td className="max-w-[28rem] py-4 pr-4">
                        <div className="space-y-1.5">
                          <p className="line-clamp-2 font-medium text-slate-900">{listing.title}</p>
                          <p className="text-slate-500">{listing.address || "Address still needs review"}</p>
                          {hasListingQualityIssue(listing) && (
                            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                              Needs review
                            </span>
                          )}
                        </div>
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
                      <td className="py-4 pr-4 text-slate-700">
                        {listing.submarket || listing.market || "Unassigned"}
                      </td>
                      <td className="py-4 pr-4 text-slate-700">
                        {listing.availableSf?.toLocaleString() || "—"}
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
                            <span className="text-slate-400">—</span>
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
  );
}
