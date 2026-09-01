import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Flame, Phone, Rocket, Trophy, Zap } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScorecardPageHeader, ScorecardPageShell } from '@/components/scorecard/ScorecardPageHeader';
import { BADGE_TONES, buildSalesBadgeSummary, SalesBadgeCard } from '@/lib/salesBadges';

const EDMONTON_TZ = 'America/Edmonton';

export default function BadgesPage() {
  const { data: recentActivities = [] } = useQuery<any[]>({
    queryKey: ['/api/automation/production-activities', 'badges'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/automation/production-activities?limit=5000');
      const payload = await res.json();
      return payload.rows || [];
    },
  });

  const salesBadgeSummary = React.useMemo(
    () => buildSalesBadgeSummary(recentActivities || [], EDMONTON_TZ),
    [recentActivities],
  );

  const next = salesBadgeSummary.next;
  const nextProgress = next ? Math.min(100, Math.floor((next.value / Math.max(1, next.threshold)) * 100)) : 100;
  const touchTotal = salesBadgeSummary.trackedCounts.touch;
  const activityAchievements = salesBadgeSummary.badges.filter((badge) => badge.series !== '10x');
  const tenXChallenges = salesBadgeSummary.badges.filter((badge) => badge.series === '10x');

  return (
    <ScorecardPageShell>
      <ScorecardPageHeader
        activeView="badges"
        title="Achievement Diary"
        description="Daily wins, career milestones, and a few unapologetically ambitious challenges."
      />

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Unlocked</p>
                  <p className="mt-1 text-3xl font-bold text-slate-950">
                    {salesBadgeSummary.unlocked.length}
                    <span className="text-base text-slate-400"> / {salesBadgeSummary.badges.length}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Sales achievements earned</p>
                </div>
                <div className="rounded-lg bg-orange-50 p-2 text-orange-600">
                  <Trophy className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm md:col-span-2">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-600">Next achievement</p>
                  <p className="mt-1 truncate text-2xl font-bold text-slate-950">{next?.title || 'Diary complete'}</p>
                  <p className="mt-1 text-xs text-slate-500">{next?.description || 'Every tracked achievement is unlocked.'}</p>
                </div>
                <Badge variant="outline" className="shrink-0 rounded-full border-blue-200 bg-blue-50 text-blue-700">
                  {next ? `${next.value} / ${next.threshold}` : 'Done'}
                </Badge>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${next ? BADGE_TONES[next.tone].progress : 'bg-emerald-500'}`}
                  style={{ width: `${nextProgress}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Best call day</p>
                  <p className="mt-1 text-3xl font-bold text-emerald-600">{salesBadgeSummary.bestDayCounts.call}</p>
                  <p className="mt-1 text-xs text-slate-500">{touchTotal} tracked touches</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                  <Phone className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold text-slate-950">
                  <Flame className="h-5 w-5 text-orange-500" />
                  Sales Activity Achievements
                </h2>
                <p className="mt-1 text-sm text-slate-600">Calls, emails, meetings, notes, and daily touchpoint pushes.</p>
              </div>
              <Badge variant="outline" className="w-fit rounded-full border-slate-200 bg-slate-50 text-slate-700">
                <Zap className="mr-1 h-3.5 w-3.5" />
                {touchTotal} tracked touches
              </Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {activityAchievements.map((badge) => (
                <SalesBadgeCard key={badge.id} badge={badge} compact />
              ))}
            </div>

            <section className="mt-8 rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 via-white to-orange-50 p-4 sm:p-5" aria-labelledby="ten-x-challenges-heading">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-slate-950 p-2.5 text-white shadow-sm">
                    <Rocket className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 id="ten-x-challenges-heading" className="text-lg font-black tracking-tight text-slate-950">10X Challenges</h3>
                    <p className="mt-0.5 text-sm text-slate-600">Big, slightly unreasonable targets for days when normal volume is not the plan.</p>
                  </div>
                </div>
                <Badge className="w-fit shrink-0 rounded-full bg-red-600 text-white">All gas</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {tenXChallenges.map((badge) => (
                  <SalesBadgeCard key={badge.id} badge={badge} compact />
                ))}
              </div>
            </section>
          </CardContent>
        </Card>
    </ScorecardPageShell>
  );
}
