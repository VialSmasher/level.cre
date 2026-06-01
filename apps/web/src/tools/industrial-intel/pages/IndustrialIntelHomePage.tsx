import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

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

function formatRunStatus(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : "Unknown";
}

function formatSourceKind(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

function statusClassName(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "failed") return "bg-rose-100 text-rose-700";
  if (normalized === "running") return "bg-blue-100 text-blue-700";
  return "bg-emerald-100 text-emerald-700";
}

export default function IndustrialIntelHomePage() {
  const queryClient = useQueryClient();
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
  const runSourceMutation = useMutation({
    mutationFn: async (slug: string) => {
      const response = await apiRequest("POST", `/api/intel/sources/${slug}/run`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intel/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/changes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intel/listings"] });
    },
  });

  const cards = [
    { label: "Active Listings", value: summary?.activeListings ?? 0 },
    { label: "New Today", value: summary?.newListings ?? 0 },
    { label: "Changed Today", value: summary?.changedListings ?? 0 },
    { label: "Removed Today", value: summary?.removedListings ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-4xl font-semibold tracking-tight text-slate-950">Overview</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Track external inventory, monitor source runs, and review fresh listing changes without
            touching the live Tool A workflow.
          </p>
        </div>
        <button
          type="button"
          onClick={() => runSourceMutation.mutate("cwedm")}
          disabled={runSourceMutation.isPending}
          className="w-fit rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {runSourceMutation.isPending ? "Refreshing..." : "Refresh CW EDM"}
        </button>
      </section>

      {runSourceMutation.isError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Source refresh failed. The failed run is logged so it can be reviewed.
        </div>
      )}

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
                No source runs yet. Once a source or manual intake completes, the latest activity will show here.
              </p>
            ) : (
              <div className="space-y-3">
                {runs.slice(0, 5).map((run) => (
                  <div
                    key={run.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">
                          {run.sourceName || "Unknown source"}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                            {run.triggerType}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClassName(run.status)}`}>
                            {formatRunStatus(run.status)}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500">{formatDateTime(run.completedAt || run.startedAt)}</p>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      Seen {run.recordsSeen} - New {run.recordsNew} - Updated {run.recordsUpdated} - Removed{" "}
                      {run.recordsRemoved}
                    </p>
                    {run.errorMessage && (
                      <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {run.errorMessage}
                      </p>
                    )}
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
                No sources configured yet. Use Refresh CW EDM to create the first source and run the first ingest.
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
                          {formatSourceKind(source.kind)} - {source.slug}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            source.isActive
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {source.isActive ? "Active" : "Inactive"}
                        </span>
                        {source.slug === "cwedm" ? (
                          <button
                            type="button"
                            onClick={() => runSourceMutation.mutate(source.slug)}
                            disabled={runSourceMutation.isPending}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Run
                          </button>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                            Adapter pending
                          </span>
                        )}
                      </div>
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
                No recent changes yet. New, updated, and removed listing events will appear here after source runs.
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
                          {change.sourceName || "Unknown source"} - {change.changeType}
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
