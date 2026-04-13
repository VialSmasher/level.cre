import { useState } from "react";
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
    },
  });

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-3xl font-semibold text-slate-950">External Inventory</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Review tracked external listings, spot weak records quickly, and add brochure-backed
          listings through the manual intake lane.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Manual URL Intake</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Paste a public listing URL, pull in what Tool B can detect, review the fields, then
            save the listing into Industrial Intel.
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
              Start with the source URL, review any autofilled values, then save only the supported fields.
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
                  {listings.map((listing) => (
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
