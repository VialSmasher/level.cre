import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, AlertTriangle, Clipboard, RefreshCcw } from "lucide-react";
import { useState } from "react";

type DiagSummary = {
  routes: { brokerStats: boolean | null; leaderboard: boolean | null };
  apis: { statsHeader: boolean | null };
  db: { events: boolean; assets: boolean };
  eventTypes90d: Array<{ type: string; count: number }>;
  indexes: { events_user_type_created_at: boolean; events_user_asset: boolean };
  samples: { assetsTracked: number; followupsLogged: number; lastActivityISO: string | null };
  tz: string | null;
  weekStartISO?: string | null;
};

function StatBadge({ ok }: { ok: boolean | null | undefined }) {
  if (ok === true) {
    return (
      <span className="inline-flex items-center text-green-600"><CheckCircle2 className="h-4 w-4 mr-1" /> OK</span>
    );
  }
  if (ok === false) {
    return (
      <span className="inline-flex items-center text-amber-600"><AlertTriangle className="h-4 w-4 mr-1" /> Missing</span>
    );
  }
  return <span className="text-gray-500">unknown</span>;
}

export default function AdminDiagPage() {
  const [copied, setCopied] = useState(false);
  const { data, isLoading, isError, refetch, isFetching } = useQuery<DiagSummary>({
    queryKey: ["/api/diag/summary"],
    queryFn: async () => {
      const res = await fetch('/api/diag/summary');
      if (!res.ok) throw new Error('diag disabled or failed');
      return res.json();
    },
    staleTime: 5_000,
  });

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data ?? {}, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admin Diagnostics</h1>
            <p className="text-gray-600">Read-only checks. No writes or migrations.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCcw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button onClick={copyJson}>
              <Clipboard className="h-4 w-4 mr-2" /> {copied ? 'Copied' : 'Copy JSON'}
            </Button>
          </div>
        </div>

        {/* Routes & APIs */}
        <Card>
          <CardHeader>
            <CardTitle>Routes & APIs</CardTitle>
            <CardDescription>Detects availability by source scanning; may show unknown in dev.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center justify-between">
                  <span>/broker-stats</span>
                  <StatBadge ok={data?.routes?.brokerStats} />
                </div>
                <div className="flex items-center justify-between">
                  <span>/leaderboard</span>
                  <StatBadge ok={data?.routes?.leaderboard} />
                </div>
                <div className="flex items-center justify-between">
                  <span>API /api/stats/header</span>
                  <StatBadge ok={data?.apis?.statsHeader} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Database */}
        <Card>
          <CardHeader>
            <CardTitle>Database</CardTitle>
            <CardDescription>Tables, event types (90d), and indexes.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="flex items-center justify-between">
                    <span>events</span>
                    <StatBadge ok={data?.db?.events} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>assets</span>
                    <StatBadge ok={data?.db?.assets} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>idx events(user_id,type,created_at)</span>
                    <StatBadge ok={data?.indexes?.events_user_type_created_at} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>idx events(user_id,asset_id)</span>
                    <StatBadge ok={data?.indexes?.events_user_asset} />
                  </div>
                </div>

                <div>
                  <p className="text-sm text-gray-600 mb-2">Event types (last 90 days)</p>
                  {isError ? (
                    <p className="text-gray-500">unknown</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(data?.eventTypes90d || []).map((e) => (
                        <Badge key={e.type} variant="secondary">{e.type}: {e.count}</Badge>
                      ))}
                      {(!data || data.eventTypes90d?.length === 0) && (
                        <span className="text-gray-500">none</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Samples & TZ */}
        <Card>
          <CardHeader>
            <CardTitle>Samples & Time</CardTitle>
            <CardDescription>Best-effort samples for current user; streak uses last activity.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Assets Tracked</p>
                  <p className="text-xl font-semibold">{data?.samples?.assetsTracked ?? 0}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Follow-Ups Logged</p>
                  <p className="text-xl font-semibold">{data?.samples?.followupsLogged ?? 0}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Last Activity</p>
                  <p className="text-sm">{data?.samples?.lastActivityISO || <span className="text-gray-500">unknown</span>}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Timezone</p>
                  <p className="text-sm">{data?.tz || <span className="text-gray-500">unknown</span>}</p>
                  {data?.weekStartISO && (
                    <p className="text-xs text-gray-500">Week start: {data.weekStartISO}</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

