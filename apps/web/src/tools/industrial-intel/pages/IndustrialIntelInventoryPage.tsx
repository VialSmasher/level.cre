import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  const { data: listings = [], isLoading } = useQuery<IntelListing[]>({
    queryKey: ["/api/intel/listings"],
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
