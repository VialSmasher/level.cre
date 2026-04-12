import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type IntelSummary = {
  activeListings: number;
  newListings: number;
  changedListings: number;
  removedListings: number;
  lastRunAt: string | null;
};

type IntelSource = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  feedUrl: string | null;
  isActive: boolean;
  updatedAt: string | null;
};

type IntelRun = {
  id: string;
  sourceId: string | null;
  sourceName: string | null;
  triggerType: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  recordsSeen: number;
  recordsNew: number;
  recordsUpdated: number;
  recordsRemoved: number;
  errorMessage: string | null;
};

type IntelChange = {
  id: string;
  listingId: string;
  listingTitle: string;
  sourceName: string | null;
  changeType: string;
  changeSummary: string | null;
  observedAt: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

export default function IndustrialIntelHomePage() {
  const { data: summary, isLoading: summaryLoading } = useQuery<IntelSummary>({
    queryKey: ["/api/intel/summary"],
  });
  const { data: sources = [], isLoading: sourcesLoading } = useQuery<IntelSource[]>({
    queryKey: ["/api/intel/sources"],
  });
  const { data: runs = [], isLoading: runsLoading } = useQuery<IntelRun[]>({
    queryKey: ["/api/intel/runs"],
  });
  const { data: changes = [], isLoading: changesLoading } = useQuery<IntelChange[]>({
    queryKey: ["/api/intel/changes"],
  });

  const cards = [
    { label: "Active Listings", value: summary?.activeListings ?? 0 },
    { label: "New Today", value: summary?.newListings ?? 0 },
    { label: "Changed Today", value: summary?.changedListings ?? 0 },
    { label: "Removed Today", value: summary?.removedListings ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-3xl font-semibold text-slate-950">Overview</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Tool B is running in parallel to the live Level CRE app. This slice is read-only and uses
          isolated Industrial Intel tables and APIs only.
        </p>
        <p className="mt-2 max-w-3xl text-xs uppercase tracking-wide text-slate-500">
          Development fallback: sample Intel data will render if the core tables are not yet seeded.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-slate-950">
                {summaryLoading ? "..." : card.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent Runs</CardTitle>
          </CardHeader>
          <CardContent>
            {runsLoading ? (
              <p className="text-sm text-slate-500">Loading runs...</p>
            ) : runs.length === 0 ? (
              <p className="text-sm text-slate-500">
                No ingest runs yet. The Intel job wiring is ready for the VPS claw to trigger next.
              </p>
            ) : (
              <div className="space-y-3">
                {runs.slice(0, 5).map((run) => (
                  <div
                    key={run.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">
                          {run.sourceName || "Unknown source"}
                        </p>
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          {run.triggerType} · {run.status}
                        </p>
                      </div>
                      <p className="text-xs text-slate-500">{formatDateTime(run.startedAt)}</p>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      Seen {run.recordsSeen} · New {run.recordsNew} · Updated {run.recordsUpdated} · Removed{" "}
                      {run.recordsRemoved}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Last completed run:{" "}
              <span className="font-medium text-slate-900">
                {summaryLoading ? "..." : formatDateTime(summary?.lastRunAt ?? null)}
              </span>
            </div>

            {sourcesLoading ? (
              <p className="text-sm text-slate-500">Loading sources...</p>
            ) : sources.length === 0 ? (
              <p className="text-sm text-slate-500">
                No sources configured yet. Manual upload and scheduled feed sources will land here.
              </p>
            ) : (
              <div className="space-y-3">
                {sources.map((source) => (
                  <div
                    key={source.id}
                    className="rounded-xl border border-slate-200 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{source.name}</p>
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          {source.kind} · {source.slug}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          source.isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {source.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Recent Changes</CardTitle>
          </CardHeader>
          <CardContent>
            {changesLoading ? (
              <p className="text-sm text-slate-500">Loading recent changes...</p>
            ) : changes.length === 0 ? (
              <p className="text-sm text-slate-500">
                No change events yet. Seed or ingest Tool B data to populate daily diffs here.
              </p>
            ) : (
              <div className="space-y-3">
                {changes.map((change) => (
                  <div
                    key={change.id}
                    className="rounded-xl border border-slate-200 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{change.listingTitle}</p>
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          {change.sourceName || "Unknown source"} · {change.changeType}
                        </p>
                      </div>
                      <p className="text-xs text-slate-500">{formatDateTime(change.observedAt)}</p>
                    </div>
                    {change.changeSummary && (
                      <p className="mt-2 text-sm text-slate-600">{change.changeSummary}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
