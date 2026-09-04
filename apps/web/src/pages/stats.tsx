import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  AlertCircle,
  ArrowRight,
} from 'lucide-react';

import { apiRequest } from '@/lib/queryClient';
import { buildWeeklyActivityMomentum, type DailyActivityDay } from '@/lib/dailyDeskQueues';
import { buildScorecardMapCoverage, type ScorecardProductionActivity } from '@/lib/scorecardMetrics';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScorecardPageHeader, ScorecardPageShell } from '@/components/scorecard/ScorecardPageHeader';
import { cn } from '@/lib/utils';

const EDMONTON_TZ = 'America/Edmonton';

type HeaderStats = {
  totalLevel: number;
  assetsTracked: number;
  followupsLogged: number;
  streakDays: number;
};

type ActivityPulseResponse = {
  generatedAt: string;
  days: number;
  total: number;
  activeDays: number;
  streakDays: number;
  automated: number;
  manual: number;
  inboundEmail?: number;
  currentPeriodTotal: number;
  previousPeriodTotal: number;
  trendPercent: number;
  series: DailyActivityDay[];
};

type MetricCardProps = {
  label: string;
  value: React.ReactNode;
  detail: string;
  tone?: keyof typeof METRIC_TONES;
};

const METRIC_TONES = {
  orange: 'bg-orange-50/50 [&>p:first-child]:text-orange-700',
  emerald: 'bg-emerald-50/50 [&>p:first-child]:text-emerald-700',
  blue: 'bg-blue-50/50 [&>p:first-child]:text-blue-700',
  amber: 'bg-amber-50/50 [&>p:first-child]:text-amber-700',
} as const;

const ACTIVITY_CHART_CONFIG = {
  call: { label: 'Calls', color: '#059669' },
  email: { label: 'Emails', color: '#2563eb' },
  meeting: { label: 'Meetings', color: '#d97706' },
} as const;

const ACTIVITY_CHART_KEYS = Object.keys(ACTIVITY_CHART_CONFIG) as Array<keyof typeof ACTIVITY_CHART_CONFIG>;
const DAY_OF_WEEK_FORMATTER = new Intl.DateTimeFormat('en-CA', { weekday: 'short', timeZone: 'UTC' });

function MetricCard({ label, value, detail, tone }: MetricCardProps) {
  return (
    <div className={cn(
      'border-b border-slate-200 p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:border-r xl:last:border-r-0',
      tone ? METRIC_TONES[tone] : undefined,
    )}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold leading-none tabular-nums text-slate-950">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function dayOfWeekLabel(day: DailyActivityDay, index: number) {
  if (!day.date) return `D${index + 1}`;
  const date = new Date(`${day.date}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? DAY_OF_WEEK_FORMATTER.format(date) : `D${index + 1}`;
}

function SevenDayActivityChart({ series, isLoading }: { series: DailyActivityDay[]; isLoading: boolean }) {
  const days = series.slice(-7);
  const maxDailyActivity = Math.max(1, ...days.map((day) => day.total));
  const accessibleSummary = days
    .map((day, index) => `${dayOfWeekLabel(day, index)} ${day.total}`)
    .join(', ');

  return (
    <section className="border-b border-slate-100 bg-slate-50/60 px-5 py-4" aria-labelledby="seven-day-activity-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 id="seven-day-activity-title" className="text-sm font-semibold text-slate-950">Last 7 days</h3>
          <p className="mt-0.5 text-xs text-slate-500">Daily outbound production by activity type.</p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600" aria-label="Activity types">
          {ACTIVITY_CHART_KEYS.map((key) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: ACTIVITY_CHART_CONFIG[key].color }} aria-hidden="true" />
              {ACTIVITY_CHART_CONFIG[key].label}
            </span>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="mt-3 h-28 animate-pulse rounded-lg bg-slate-100" aria-label="Loading seven-day activity" />
      ) : (
        <div
          className="mt-3 grid h-28 grid-cols-7 gap-2 border-b border-slate-200 px-1"
          role="img"
          aria-label={`Stacked outbound calls, emails, and meetings for the last seven days: ${accessibleSummary || 'no activity available'}`}
        >
          {days.map((day, index) => {
            const label = dayOfWeekLabel(day, index);
            return (
              <div
                key={day.date || index}
                className="flex min-w-0 flex-col items-center justify-end"
                title={`${label}: ${day.total} outbound action${day.total === 1 ? '' : 's'}`}
              >
                <div className="flex min-h-0 w-full flex-1 items-end justify-center">
                  <div
                    className={cn(
                      'flex w-full max-w-9 flex-col-reverse overflow-hidden rounded-t-sm',
                      day.total === 0 && 'bg-slate-200',
                    )}
                    style={{ height: day.total === 0 ? 3 : `${Math.max(12, (day.total / maxDailyActivity) * 100)}%` }}
                  >
                    {ACTIVITY_CHART_KEYS.map((key) => {
                      const count = day[key];
                      return count > 0 ? (
                        <span
                          key={key}
                          style={{ backgroundColor: ACTIVITY_CHART_CONFIG[key].color, flexGrow: count }}
                          aria-hidden="true"
                        />
                      ) : null;
                    })}
                  </div>
                </div>
                <span className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ContextMetric({ label, value, detail }: MetricCardProps) {
  return (
    <div className="px-4 py-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-950">{value}</p>
      <p className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

export default function StatsPage() {
  const headerQuery = useQuery<HeaderStats>({
    queryKey: ['/api/stats/header', 'scorecard'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/stats/header?userId=me');
      if (!response.ok) throw new Error('Failed to load scorecard context');
      return response.json();
    },
    staleTime: 60_000,
  });

  const pulseQuery = useQuery<ActivityPulseResponse>({
    queryKey: ['/api/automation/activity-pulse', 28, 'scorecard'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/automation/activity-pulse?days=28');
      if (!response.ok) throw new Error('Failed to load outbound production');
      return response.json();
    },
    staleTime: 60_000,
    refetchOnMount: 'always',
  });

  const productionQuery = useQuery<ScorecardProductionActivity[]>({
    queryKey: ['/api/automation/production-activities', 'scorecard'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/automation/production-activities?limit=5000');
      if (!response.ok) throw new Error('Failed to load mapped production');
      const payload = await response.json();
      return payload.rows || [];
    },
    staleTime: 60_000,
    refetchOnMount: 'always',
  });

  const weekly = React.useMemo(
    () => buildWeeklyActivityMomentum(pulseQuery.data?.series || []),
    [pulseQuery.data?.series],
  );
  const coverage = React.useMemo(
    () => buildScorecardMapCoverage(productionQuery.data || [], { timeZone: EDMONTON_TZ }),
    [productionQuery.data],
  );

  const isProductionLoading = pulseQuery.isLoading;
  const productionFailed = pulseQuery.isError;
  const metric = (value: number) => isProductionLoading ? '—' : value.toLocaleString();
  const comparison = weekly.thisWeek.total - weekly.lastWeek.total;
  const benchmarkLabel = weekly.lastWeek.total > 0 ? 'last week' : 'recent baseline';
  const paceMultiple = weekly.target > 0 ? weekly.thisWeek.total / weekly.target : null;
  const automaticShare = pulseQuery.data?.total
    ? Math.round((pulseQuery.data.automated / pulseQuery.data.total) * 100)
    : 0;
  const momentumMessage = weekly.target === 0
    ? 'Every useful call, outbound email, or meeting builds the baseline.'
    : weekly.remaining > 0
      ? `${weekly.remaining} more outbound action${weekly.remaining === 1 ? '' : 's'} to match the ${benchmarkLabel}.`
      : comparison > 0
        ? `You are ${comparison} outbound action${comparison === 1 ? '' : 's'} ahead of last week.`
        : 'Last week’s production is matched. Keep going if the conversations are there.';
  const paceLabel = weekly.target === 0
    ? null
    : weekly.remaining > 0
      ? `${weekly.remaining} to match ${benchmarkLabel}`
      : comparison > 0 && paceMultiple !== null
        ? `${paceMultiple.toFixed(paceMultiple >= 2 ? 1 : 2)}x ${benchmarkLabel}`
        : `${benchmarkLabel} matched`;

  return (
    <ScorecardPageShell>
      <ScorecardPageHeader
        activeView="overview"
        title="Performance Overview"
        description="Outbound calls, emails, meetings, and map coverage, captured automatically."
      />

        {productionFailed ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>Some production totals could not be loaded. Refresh before relying on this week’s scorecard.</p>
          </div>
        ) : null}

        <section className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:grid-cols-4" aria-label="This week's outbound production">
          <MetricCard
            label="Outbound this week"
            value={metric(weekly.thisWeek.total)}
            detail={`Across ${weekly.activeDaysThisWeek} active day${weekly.activeDaysThisWeek === 1 ? '' : 's'}`}
            tone="orange"
          />
          <MetricCard
            label="Calls"
            value={metric(weekly.thisWeek.call)}
            detail="Confirmed outbound calls"
            tone="emerald"
          />
          <MetricCard
            label="Emails sent"
            value={metric(weekly.thisWeek.email)}
            detail="Inbound replies excluded"
            tone="blue"
          />
          <MetricCard
            label="Meetings"
            value={metric(weekly.thisWeek.meeting)}
            detail="Meetings, tours, and showings"
            tone="amber"
          />
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-orange-100 bg-orange-50/40 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Weekly momentum</p>
                  <CardTitle className="mt-1 text-lg text-slate-950">Keep creating conversations</CardTitle>
                  <p className="mt-1 text-sm text-slate-600">Last week sets the starting line. This page measures production, not inbox chores.</p>
                </div>
                {paceLabel ? (
                  <Badge variant="outline" className="w-fit border-orange-200 bg-orange-50 text-orange-700">
                    {paceLabel}
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <dl className="grid border-b border-slate-100 sm:grid-cols-3">
                <div className="border-b border-slate-100 px-5 py-5 sm:border-b-0 sm:border-r">
                  <dt className="text-xs font-medium text-slate-500">This week</dt>
                  <dd className="mt-1 text-3xl font-bold tabular-nums text-slate-950">{metric(weekly.thisWeek.total)}</dd>
                  <p className="mt-1 text-xs text-slate-500">outbound actions</p>
                </div>
                <div className="border-b border-slate-100 px-5 py-5 sm:border-b-0 sm:border-r">
                  <dt className="text-xs font-medium text-slate-500">Last week</dt>
                  <dd className="mt-1 text-3xl font-bold tabular-nums text-slate-950">{metric(weekly.lastWeek.total)}</dd>
                  <p className="mt-1 text-xs text-slate-500">outbound actions</p>
                </div>
                <div className="px-5 py-5">
                  <dt className="text-xs font-medium text-slate-500">Current pace</dt>
                  <dd className={`mt-1 text-3xl font-bold tabular-nums ${comparison >= 0 ? 'text-emerald-700' : 'text-slate-950'}`}>
                    {isProductionLoading ? '—' : `${comparison >= 0 ? '+' : ''}${comparison}`}
                  </dd>
                  <p className="mt-1 text-xs text-slate-500">actions versus last week</p>
                </div>
              </dl>
              <SevenDayActivityChart series={pulseQuery.data?.series || []} isLoading={isProductionLoading} />
              <div className="p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium text-slate-900">{momentumMessage}</p>
                  {weekly.target > 0 && weekly.remaining > 0 ? (
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">{weekly.thisWeek.total}/{weekly.target} {benchmarkLabel}</span>
                  ) : null}
                </div>
                {weekly.target > 0 && weekly.remaining > 0 ? (
                  <Progress
                    value={weekly.progressPercent}
                    aria-label={`Progress toward ${benchmarkLabel}`}
                    className="mt-3 h-2 bg-slate-100 [&>div]:bg-orange-500"
                  />
                ) : null}
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Calls, outbound emails, and meetings count. Inbound email and internal notes do not receive production credit.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-emerald-100 bg-emerald-50/40 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Map signal</p>
              <CardTitle className="mt-1 text-lg text-slate-950">Activity coverage</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <p className="text-4xl font-bold tabular-nums text-slate-950">
                {productionQuery.isLoading || productionQuery.isError ? '—' : `${coverage.mappedPercent}%`}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {productionQuery.isError
                  ? 'Map linkage could not be loaded. Production totals are still available.'
                  : coverage.totalActions > 0
                  ? `${coverage.mappedActions} of ${coverage.totalActions} outbound actions are linked to the map.`
                  : 'Map coverage will appear as outbound activity is captured.'}
              </p>
              <Progress
                value={coverage.mappedPercent}
                aria-label="Outbound activity linked to mapped prospects"
                className="mt-4 h-2 bg-slate-100 [&>div]:bg-emerald-500"
              />
              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                <div>
                  <dt className="text-xs text-slate-500">Prospects reached</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{productionQuery.isError ? '—' : coverage.uniqueProspects}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Unmatched actions</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{productionQuery.isError ? '—' : coverage.unmappedActions}</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs leading-5 text-slate-500">Unmatched activity still counts. Codex can improve the map linkage in the background.</p>
              <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                <Link href="/app/inbox">
                  Open activity map
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex-row items-center justify-between gap-4 border-b border-slate-100 p-5">
            <div>
              <CardTitle className="text-base font-semibold text-slate-950">Long-term context</CardTitle>
              <p className="mt-1 text-sm text-slate-600">Useful background, kept secondary to actual sales production.</p>
            </div>
            <Badge variant="outline" className="bg-slate-50 text-slate-600">Secondary</Badge>
          </CardHeader>
          <CardContent className="grid divide-y divide-slate-100 p-0 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
            <ContextMetric
              label="Broker level"
              value={headerQuery.isLoading ? '—' : (headerQuery.data?.totalLevel ?? 0)}
              detail="Milestone layer"
            />
            <ContextMetric
              label="28-day outbound"
              value={pulseQuery.isLoading ? '—' : (pulseQuery.data?.total ?? 0)}
              detail={`Across ${pulseQuery.data?.activeDays ?? 0} active days`}
            />
            <ContextMetric
              label="Production rhythm"
              value={pulseQuery.isLoading ? '—' : `${pulseQuery.data?.streakDays ?? 0}d`}
              detail="Current active-day streak"
            />
            <ContextMetric
              label="CRM map base"
              value={headerQuery.isLoading ? '—' : (headerQuery.data?.assetsTracked ?? 0)}
              detail={`${automaticShare}% of 28-day production auto-captured`}
            />
          </CardContent>
        </Card>
    </ScorecardPageShell>
  );
}
