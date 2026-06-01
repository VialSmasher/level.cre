import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Clock3, Database, RefreshCw, TrendingUp } from "lucide-react";
import { Link } from "wouter";
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

function formatMutationError(error: unknown) {
  const raw = String((error as Error)?.message || error || "Unknown source refresh error");
  const jsonStart = raw.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart));
      return parsed.detail || parsed.message || raw;
    } catch {
      return raw;
    }
  }
  return raw;
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intel/runs"] });
    },
  });

  const cards = [
    { label: "Active listings", value: summary?.activeListings ?? 0, note: "not removed", icon: Database, tone: "blue" },
    {
      label: "New today",
      value: summary?.newListings ?? 0,
      note: "fresh inventory",
      icon: TrendingUp,
      tone: "emerald",
    },
    {
      label: "Changed today",
      value: summary?.changedListings ?? 0,
      note: "pricing or detail moves",
      icon: RefreshCw,
      tone: "amber",
    },
    {
      label: "Removed today",
      value: summary?.removedListings ?? 0,
      note: "source disappeared",
      icon: AlertTriangle,
      tone: "rose",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            <Database className="h-3.5 w-3.5" />
            Source command center
          </span>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">Industrial inventory pulse</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Watch broker and landlord inventory, review source health, and route clean listings into matching without touching live CRM records.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/tools/industrial-intel/listings"
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            Review listings
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/tools/industrial-intel/requirements"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-blue-200 hover:text-blue-700"
          >
            Requirements
          </Link>
        </div>
      </section>

      {runSourceMutation.isError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Source refresh failed: {formatMutationError(runSourceMutation.error)}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const toneClass =
            card.tone === "emerald"
              ? "bg-emerald-50 text-emerald-600"
              : card.tone === "amber"
                ? "bg-amber-50 text-amber-600"
                : card.tone === "rose"
                  ? "bg-rose-50 text-rose-600"
                  : "bg-blue-50 text-blue-600";
          return (
            <Card key={card.label}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-600">{card.label}</p>
                    <div className="mt-2 text-3xl font-semibold text-slate-950">
                      {summaryLoading ? "..." : card.value}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{card.note}</p>
                  </div>
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full ${toneClass}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Recent source runs</CardTitle>
                <p className="mt-1 text-sm text-slate-500">What changed the inventory database most recently.</p>
              </div>
            </div>
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
                No sources configured yet. Add an intake source or run an available adapter to start tracking inventory.
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
                            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Run
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                            <Clock3 className="h-3 w-3" />
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
