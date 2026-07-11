import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { ArrowRight, Brain, MapPin, Medal, Phone, Sparkles, Target, Trophy, Zap } from 'lucide-react';
import { BrokerSkillsRow, SkillActivityRow, Requirement } from '@level-cre/shared/schema';
import { Link } from 'wouter';

// XP calculation helpers
const getLevel = (xp: number): number => {
  // Level 0 at 0 XP; Level 1 at 100 XP
  return Math.min(99, Math.floor(Math.sqrt(xp / 100)));
};

const getXpForLevel = (level: number): number => {
  // Threshold XP for reaching a given level (L^2 * 100)
  return Math.floor((level ** 2) * 100);
};

const getXpToNextLevel = (currentXp: number): number => {
  const currentLevel = getLevel(currentXp);
  if (currentLevel >= 99) return 0;
  return getXpForLevel(currentLevel + 1) - currentXp;
};

const getProgressToNextLevel = (currentXp: number): number => {
  const currentLevel = getLevel(currentXp);
  if (currentLevel >= 99) return 100;
  const currentLevelXp = getXpForLevel(currentLevel);
  const nextLevelXp = getXpForLevel(currentLevel + 1);
  const progressXp = Math.max(0, currentXp - currentLevelXp);
  const totalNeeded = Math.max(1, nextLevelXp - currentLevelXp);
  return Math.floor((progressXp / totalNeeded) * 100);
};

const SKILL_TONES = {
  prospecting: {
    accent: 'bg-blue-500',
    text: 'text-blue-600',
    fill: 'bg-blue-500',
  },
  followUp: {
    accent: 'bg-emerald-500',
    text: 'text-emerald-600',
    fill: 'bg-emerald-500',
  },
  consistency: {
    accent: 'bg-orange-500',
    text: 'text-orange-600',
    fill: 'bg-orange-500',
  },
  marketKnowledge: {
    accent: 'bg-violet-500',
    text: 'text-violet-600',
    fill: 'bg-violet-500',
  },
} as const;

const LEAD_AGENT_BONUS_XP = 80;
const EDMONTON_TZ = 'America/Edmonton';
const FOLLOW_UP_COUNT_ACTIONS = new Set([
  'call',
  'email',
  'meeting',
  'phone_call',
  'email_sent',
  'meeting_held',
  'followup_logged',
  'interaction',
  'note_added',
]);

const getDatePartsInTimeZone = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: 'year' | 'month' | 'day') => Number(parts.find((p) => p.type === type)?.value || '0');
  return { year: get('year'), month: get('month'), day: get('day') };
};

const getWeekKeyInTimeZone = (date: Date, timeZone: string) => {
  const { year, month, day } = getDatePartsInTimeZone(date, timeZone);
  const localDateAsUtc = new Date(Date.UTC(year, month - 1, day));
  const dow = localDateAsUtc.getUTCDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  localDateAsUtc.setUTCDate(localDateAsUtc.getUTCDate() + diffToMonday);
  return `${localDateAsUtc.getUTCFullYear()}-${String(localDateAsUtc.getUTCMonth() + 1).padStart(2, '0')}-${String(localDateAsUtc.getUTCDate()).padStart(2, '0')}`;
};

interface SkillTrackProps {
  name: string;
  xp: number;
  icon: React.ComponentType<any>;
  description: string;
  skillKey: 'prospecting' | 'followUp' | 'consistency' | 'marketKnowledge';
  progressPercentOverride?: number;
  progressLabelOverride?: string;
}

function SkillTrackRow({ name, xp, icon: Icon, description, skillKey, progressPercentOverride, progressLabelOverride }: SkillTrackProps) {
  const level = getLevel(xp);
  const progress = typeof progressPercentOverride === 'number' ? progressPercentOverride : getProgressToNextLevel(xp);
  const xpToNext = getXpToNextLevel(xp);
  const tone = SKILL_TONES[skillKey];
  const actionsToNext = (() => {
    if (typeof progressLabelOverride === 'string') return progressLabelOverride;
    if (xpToNext <= 0) return '';
    const ceilDiv = (a: number, b: number) => Math.ceil(a / b);
    switch (skillKey) {
      case 'prospecting': {
        const items = ceilDiv(xpToNext, 25);
        return `${items} prospect${items === 1 ? '' : 's'} to next level`;
      }
      case 'followUp': {
        const calls = ceilDiv(xpToNext, 15);
        const emails = ceilDiv(xpToNext, 10);
        const greedyCalls = Math.floor(xpToNext / 15);
        const remainder = xpToNext - greedyCalls * 15;
        const greedyEmails = remainder > 0 ? ceilDiv(remainder, 10) : 0;
        const example = `${greedyCalls} call${greedyCalls === 1 ? '' : 's'}${greedyEmails ? ` + ${greedyEmails} email${greedyEmails === 1 ? '' : 's'}` : ''}`;
        return `${calls} call${calls === 1 ? '' : 's'} or ${emails} email${emails === 1 ? '' : 's'} (e.g., ${example})`;
      }
      case 'consistency': {
        const days = ceilDiv(xpToNext, 100);
        return `${days} active day${days === 1 ? '' : 's'}`;
      }
      case 'marketKnowledge': {
        const reqs = ceilDiv(xpToNext, 20);
        return `${reqs} requirement${reqs === 1 ? '' : 's'} logged`;
      }
    }
  })();

  return (
    <div className="grid gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0 lg:grid-cols-[minmax(190px,1fr)_90px_minmax(210px,1.2fr)_minmax(150px,0.8fr)] lg:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 rounded-md bg-slate-950 p-2 text-white">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-950">{name}</h3>
            <div className={`h-2 w-2 rounded-full ${tone.accent}`} />
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 lg:block lg:text-right">
        <p className="text-lg font-black leading-none text-slate-950">Lv {level}</p>
        <p className="mt-0.5 text-xs font-medium text-slate-500">{xp.toLocaleString()} XP</p>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-500">Progress</span>
          <span className={`font-bold ${tone.text}`}>{progress}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${tone.fill}`} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      </div>
      <div className="text-xs leading-5 text-slate-600">
        {xpToNext > 0 ? actionsToNext : 'Max level reached'}
      </div>
    </div>
  );
}

// Leaderboard moved to its own page

export default function StatsPage() {
  const { data: skills } = useQuery<BrokerSkillsRow>({
    queryKey: ['/api/skills'],
  });

  const { data: header, isLoading: headerLoading, isError: headerError } = useQuery<{ totalLevel: number; assetsTracked: number; followupsLogged: number; streakDays: number }>({
    queryKey: ['/api/stats/header', 'me'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/stats/header?userId=me');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 30000,
  });

  const { data: recentActivities = [] } = useQuery<SkillActivityRow[]>({
    queryKey: ['/api/skill-activities', 'weekly'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/skill-activities?limit=1000');
      return res.json();
    }
  });

  const { data: requirements = [] } = useQuery<Requirement[]>({
    queryKey: ['/api/requirements'],
    staleTime: 5 * 60 * 1000,
  });

  const totalLevel = header?.totalLevel ?? 0;

  const requirementsById = React.useMemo(() => {
    const map = new Map<string, Requirement>();
    (requirements || []).forEach(req => {
      if (req?.id) {
        map.set(req.id, req);
      }
    });
    return map;
  }, [requirements]);

  const currentEdmontonWeekKey = React.useMemo(() => {
    return getWeekKeyInTimeZone(new Date(), EDMONTON_TZ);
  }, []);

  const weeklySummary = React.useMemo(() => {
    const sums: Record<string, number> = {};
    let followups = 0;

    for (const activity of recentActivities || []) {
      const activityDate = new Date((activity as any).timestamp || (activity as any).date || (activity as any).createdAt || Date.now());
      if (getWeekKeyInTimeZone(activityDate, EDMONTON_TZ) !== currentEdmontonWeekKey) continue;

      const key = String(activity.skillType || '');
      if (!key) continue;

      let xp = Number(activity.xpGained || 0) || 0;
      const action = String(activity.action || '').toLowerCase();

      if (key === 'followUp' && FOLLOW_UP_COUNT_ACTIONS.has(action)) {
        followups += 1;
      }

      if (key === 'marketKnowledge' && action === 'add_requirement') {
        const relatedId = (activity as any).relatedId as string | undefined;
        const requirement = relatedId ? requirementsById.get(relatedId) : undefined;
        const tagIndicatesLead = Array.isArray(requirement?.tags) && requirement!.tags.some(tag => {
          const lower = String(tag || '').toLowerCase();
          return lower.includes('lead') && (lower.includes('agent') || lower.includes('primary'));
        });
        const isLeadAgent = Boolean(
          requirement && (
            (requirement as any).isLeadAgent === true ||
            (requirement as any).leadAgent === true ||
            tagIndicatesLead
          )
        );
        if (isLeadAgent) {
          xp += LEAD_AGENT_BONUS_XP;
        }
      }

      sums[key] = (sums[key] || 0) + xp;
    }

    return { sums, followups };
  }, [recentActivities, currentEdmontonWeekKey, requirementsById]);

  const weeklyFollowupsCount = weeklySummary.followups;
  const weeklyXpTotal = Object.values(weeklySummary.sums).reduce((sum, value) => sum + Number(value || 0), 0);
  const followupsToTarget = Math.max(0, 5 - weeklyFollowupsCount);
  const streakToTarget = Math.max(0, 5 - (header?.streakDays ?? 0));

  const nextActions = [
    {
      label: followupsToTarget > 0 ? `Log ${followupsToTarget} more follow-up${followupsToTarget === 1 ? '' : 's'} this week` : 'Weekly follow-up target hit',
      description: followupsToTarget > 0 ? 'Keep the relationship engine moving.' : 'Nice. Bank the momentum or push for a bigger week.',
      href: '/app/followup',
      icon: Phone,
      tone: 'emerald',
    },
    {
      label: 'Review stale prospects',
      description: 'Use Knowledge to find records that need a touch or cleanup.',
      href: '/app/knowledge',
      icon: Brain,
      tone: 'blue',
    },
    {
      label: 'Add a requirement or comp',
      description: 'Feed market knowledge so matching gets smarter.',
      href: '/app/requirements',
      icon: Target,
      tone: 'violet',
    },
  ];

  const weeklyRings = [
    { key: 'prospecting', label: 'Prospecting', color: 'bg-blue-500', value: weeklySummary.sums['prospecting'] || 0, goal: 250 },
    { key: 'followUp', label: 'Follow-up', color: 'bg-emerald-500', value: weeklySummary.sums['followUp'] || 0, goal: 400 },
    { key: 'marketKnowledge', label: 'Knowledge', color: 'bg-violet-500', value: weeklySummary.sums['marketKnowledge'] || 0, goal: 200 },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          label="Performance"
          title="Scorecard"
          description="Weekly activity, CRM momentum, and market knowledge progress."
          icon={Trophy}
          actions={(
            <div className="flex w-fit items-center rounded-md border border-slate-200 bg-white p-0.5">
              <span className="inline-flex h-8 items-center gap-2 rounded-sm bg-slate-950 px-3 text-sm font-medium text-white">
                <Trophy className="h-4 w-4" />
                Overview
              </span>
              <Link
                href="/badges"
                className="inline-flex h-8 items-center gap-2 rounded-sm px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
              >
                <Medal className="h-4 w-4" />
                Badges
              </Link>
              <Link
                href="/leaderboard"
                className="inline-flex h-8 items-center gap-2 rounded-sm px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
              >
                <Trophy className="h-4 w-4" />
                Standings
              </Link>
            </div>
          )}
        />

        <section className="grid overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4" aria-label="Scorecard totals">
            <div className="border-b border-slate-200 sm:border-r lg:border-b-0">
              <div className="flex items-start justify-between gap-4 p-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Broker level</p>
                    <p className="mt-1 text-2xl font-semibold leading-none text-slate-950">{headerLoading || headerError ? 0 : totalLevel}</p>
                    <p className="mt-1 text-xs text-slate-500">Across all skills</p>
                  </div>
                  <div className="rounded-md bg-blue-50 p-2">
                    <Trophy className="h-5 w-5 text-blue-600" />
                  </div>
              </div>
            </div>
            
            <div className="border-b border-slate-200 sm:border-r-0 lg:border-b-0 lg:border-r">
              <div className="flex items-start justify-between gap-4 p-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Assets tracked</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-950">{headerLoading || headerError ? 0 : (header?.assetsTracked ?? 0)}</p>
                    <p className="mt-1 text-xs text-slate-500">Market coverage base</p>
                  </div>
                  <div className="rounded-md bg-violet-50 p-2">
                    <MapPin className="h-5 w-5 text-violet-600" />
                  </div>
              </div>
            </div>
            
            <div className="border-b border-slate-200 sm:border-b-0 sm:border-r">
              <div className="flex items-start justify-between gap-4 p-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Follow-ups</p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-700">{weeklyFollowupsCount}</p>
                    <p className="mt-1 text-xs text-slate-500">{followupsToTarget > 0 ? `${followupsToTarget} to weekly target` : 'Target hit'}</p>
                  </div>
                  <div className="rounded-md bg-emerald-50 p-2">
                    <Phone className="h-5 w-5 text-emerald-600" />
                  </div>
              </div>
            </div>

            <div>
              <div className="flex items-start justify-between gap-4 p-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Streak</p>
                    <p className="mt-1 text-2xl font-semibold text-orange-700">{headerLoading || headerError ? 0 : (header?.streakDays ?? 0)}</p>
                    <p className="mt-1 text-xs text-slate-500">{streakToTarget > 0 ? `${streakToTarget} to 5-day rhythm` : '5-day rhythm hit'}</p>
                  </div>
                  <div className="rounded-md bg-orange-50 p-2">
                    <Zap className="h-5 w-5 text-orange-600" />
                  </div>
              </div>
            </div>
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.05fr_1.95fr]">
          <Card className="border-slate-200 bg-white">
            <CardHeader className="border-b border-slate-100 p-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="rounded-md bg-blue-50 p-1.5">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                </span>
                Next best actions
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-slate-100 p-0">
              {nextActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.label}
                    href={action.href}
                    className="group flex items-start justify-between gap-3 p-4 transition hover:bg-slate-50"
                  >
                    <div className="flex items-start gap-3">
                      <span className="rounded-md border border-slate-200 bg-white p-2">
                        <Icon className="h-4 w-4 text-slate-700 group-hover:text-blue-700" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-slate-950">{action.label}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{action.description}</span>
                      </span>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-700" />
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200 bg-white">
            <CardHeader className="border-b border-slate-100 p-4">
              <CardTitle className="flex items-center justify-between gap-3 text-base">
                <span>This week</span>
                <Badge variant="outline" className="border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">
                  {weeklyXpTotal} XP
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 p-4">
              {weeklyRings.map((r) => {
                const pct = Math.min(100, Math.floor((r.value / Math.max(1, r.goal)) * 100));
                return (
                  <div key={r.key} className="grid gap-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-800">{r.label}</span>
                      <span className="text-slate-500">{r.value} / {r.goal} XP</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${r.color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden border-slate-200 bg-white">
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-slate-950">Performance tracks</CardTitle>
                <p className="mt-1 text-sm text-slate-600">Progress by prospecting, follow-up, consistency, and market knowledge.</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                {weeklyXpTotal} XP this week
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="hidden gap-4 border-b border-slate-100 bg-slate-50 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid lg:grid-cols-[minmax(190px,1fr)_90px_minmax(210px,1.2fr)_minmax(150px,0.8fr)]">
              <span>Track</span>
              <span className="text-right">Level</span>
              <span>Progress</span>
              <span>Next action</span>
            </div>
            <SkillTrackRow
              name="Prospecting"
              xp={skills?.prospecting || 0}
              icon={MapPin}
              description="Adding prospects, mapping areas, discovering opportunities"
              skillKey="prospecting"
            />
            <SkillTrackRow
              name="Follow Up"
              xp={skills?.followUp || 0}
              icon={Phone}
              description="Calls, emails, meetings, and consistent communication"
              skillKey="followUp"
            />
            <SkillTrackRow
              name="Consistency"
              xp={skills?.consistency || 0}
              icon={Zap}
              description="Daily activity streaks and regular engagement patterns"
              skillKey="consistency"
              progressPercentOverride={(() => {
                const sd = header?.streakDays ?? 0;
                return Math.min(100, Math.floor((Math.min(sd, 5) / 5) * 100));
              })()}
              progressLabelOverride={`${header?.streakDays ?? 0}/5 active days`}
            />
            <SkillTrackRow
              name="Market Knowledge"
              xp={skills?.marketKnowledge || 0}
              icon={Brain}
              description="Requirements tracking, market research, and industry insights"
              skillKey="marketKnowledge"
            />
          </CardContent>
        </Card>

        {/* Bricks removed (quarantined) */}
      </div>
    </div>
  );
}
