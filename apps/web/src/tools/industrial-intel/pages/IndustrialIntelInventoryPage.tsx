import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
          This table is backed by new Industrial Intel tables only. It does not read from the
          existing Level CRE listings or workspaces data model.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Manual URL Intake</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Listing URL" value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} />
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Brochure URL (optional)" value={form.brochureUrl} onChange={(event) => setForm({ ...form, brochureUrl: event.target.value })} />
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Address (optional)" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Market" value={form.market} onChange={(event) => setForm({ ...form, market: event.target.value })} />
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Submarket (optional)" value={form.submarket} onChange={(event) => setForm({ ...form, submarket: event.target.value })} />
            <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.listingType} onChange={(event) => setForm({ ...form, listingType: event.target.value })}>
              <option value="lease">Lease</option>
              <option value="sale">Sale</option>
              <option value="sublease">Sublease</option>
            </select>
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Available SF (optional)" value={form.availableSf} onChange={(event) => setForm({ ...form, availableSf: event.target.value })} />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending || !form.sourceUrl}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {previewMutation.isPending ? "Fetching..." : "Autofill from URL"}
            </button>
            <button
              type="button"
              onClick={() => manualIngestMutation.mutate()}
              disabled={manualIngestMutation.isPending || !form.sourceUrl || !form.title}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {manualIngestMutation.isPending ? "Saving..." : "Save listing URL"}
            </button>
            <p className="text-sm text-slate-500">
              Start with a public listing URL, autofill what we can, then let Tool B track changes over time.
            </p>
          </div>
          {previewMutation.isError && (
            <p className="mt-3 text-sm text-rose-600">{(previewMutation.error as Error).message}</p>
          )}
          {manualIngestMutation.isError && (
            <p className="mt-3 text-sm text-rose-600">{(manualIngestMutation.error as Error).message}</p>
          )}
          {previewMutation.isSuccess && (
            <p className="mt-3 text-sm text-emerald-700">Fetched page metadata and filled what was detectable.</p>
          )}
          {manualIngestMutation.isSuccess && (
            <p className="mt-3 text-sm text-emerald-700">Listing saved into Industrial Intel and change tracking.</p>
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
                The read-only inventory surface is ready. Once the VPS claw runs the Intel ingest
                job, listings will start appearing here.
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
                      <td className="py-4 pr-4">
                        <p className="font-medium text-slate-900">{listing.title}</p>
                        <p className="mt-1 text-slate-500">{listing.address || "No address yet"}</p>
                      </td>
                      <td className="py-4 pr-4 text-slate-700">{listing.sourceName || "Unknown"}</td>
                      <td className="py-4 pr-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            listing.removedAt
                              ? "bg-rose-100 text-rose-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {listing.removedAt ? "removed" : listing.status}
                        </span>
                      </td>
                      <td className="py-4 pr-4">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {listing.listingType}
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
