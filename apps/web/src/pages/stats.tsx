import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, BarChart3, Brain, CalendarCheck, CheckCircle2, MapPin, Phone, Sparkles, Target, Trophy, Users, Zap } from 'lucide-react';
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

const getLevelColor = (level: number): string => {
  if (level >= 99) return 'text-yellow-500'; // Gold for maxed
  if (level >= 80) return 'text-purple-500'; // Purple for high level
  if (level >= 60) return 'text-blue-500'; // Blue for advanced
  if (level >= 40) return 'text-green-500'; // Green for intermediate
  if (level >= 20) return 'text-orange-500'; // Orange for beginner
  return 'text-gray-500'; // Gray for novice
};

const SKILL_TONES = {
  prospecting: {
    iconBg: 'bg-blue-50',
    iconText: 'text-blue-600',
    fill: 'bg-blue-500',
    ring: 'border-blue-100',
  },
  followUp: {
    iconBg: 'bg-emerald-50',
    iconText: 'text-emerald-600',
    fill: 'bg-emerald-500',
    ring: 'border-emerald-100',
  },
  consistency: {
    iconBg: 'bg-orange-50',
    iconText: 'text-orange-600',
    fill: 'bg-orange-500',
    ring: 'border-orange-100',
  },
  marketKnowledge: {
    iconBg: 'bg-violet-50',
    iconText: 'text-violet-600',
    fill: 'bg-violet-500',
    ring: 'border-violet-100',
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

interface SkillCardProps {
  name: string;
  xp: number;
  icon: React.ComponentType<any>;
  description: string;
  skillKey: 'prospecting' | 'followUp' | 'consistency' | 'marketKnowledge';
  progressPercentOverride?: number;
  progressLabelOverride?: string;
}

function SkillCard({ name, xp, icon: Icon, description, skillKey, progressPercentOverride, progressLabelOverride }: SkillCardProps) {
  const level = getLevel(xp);
  const progress = typeof progressPercentOverride === 'number' ? progressPercentOverride : getProgressToNextLevel(xp);
  const xpToNext = getXpToNextLevel(xp);
  const levelColor = getLevelColor(level);
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
    <Card className={`relative overflow-hidden border-slate-200 bg-white shadow-sm ${tone.ring}`}>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${tone.iconBg}`}>
              <Icon className={`h-5 w-5 ${tone.iconText}`} />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base md:text-lg text-slate-950">{name}</CardTitle>
              <p className="text-xs md:text-sm text-slate-600 truncate">{description}</p>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${levelColor}`}>
              {level}
            </div>
            <div className="text-xs text-gray-500">
              {xp.toLocaleString()} XP
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-1 pb-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-slate-700">
            <span>Level {level + 1} progress</span>
            <span className="font-semibold">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${tone.fill}`} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </div>
          <div className="h-4 text-xs text-slate-600 truncate">
            {xpToNext > 0 ? actionsToNext : ''}
          </div>
        </div>
      </CardContent>
      
      {level >= 99 && (
        <div className="absolute top-2 right-2">
          <Badge className="bg-yellow-500 text-white">
            <Sparkles className="h-3 w-3 mr-1" />
            MAX
          </Badge>
        </div>
      )}
    </Card>
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
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-slate-950">
                <Trophy className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Weekly command center
                </div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-950">Broker Performance</h1>
                <p className="mt-1 text-sm text-slate-600">Weekly activity, CRM momentum, and market knowledge progress.</p>
              </div>
            </div>
            <Link
              href="/leaderboard"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 transition-colors shrink-0"
            >
              <Trophy className="h-4 w-4" />
              <span>Standings</span>
            </Link>
          </div>

          {/* Overall Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Level</p>
                    <p className="text-3xl font-bold text-slate-950">{headerLoading || headerError ? 0 : totalLevel}</p>
                    <p className="mt-1 text-xs text-slate-500">Across all skills</p>
                  </div>
                  <Trophy className="h-6 w-6 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Assets tracked</p>
                    <p className="text-3xl font-bold text-violet-600">{headerLoading || headerError ? 0 : (header?.assetsTracked ?? 0)}</p>
                    <p className="mt-1 text-xs text-slate-500">Market coverage base</p>
                  </div>
                  <MapPin className="h-6 w-6 text-violet-400" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Follow-ups this week</p>
                    <p className="text-3xl font-bold text-emerald-600">{weeklyFollowupsCount}</p>
                    <p className="mt-1 text-xs text-slate-500">{followupsToTarget > 0 ? `${followupsToTarget} to weekly target` : 'Target hit'}</p>
                  </div>
                  <Phone className="h-6 w-6 text-emerald-400" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Streak days</p>
                    <p className="text-3xl font-bold text-orange-600">{headerLoading || headerError ? 0 : (header?.streakDays ?? 0)}</p>
                    <p className="mt-1 text-xs text-slate-500">{streakToTarget > 0 ? `${streakToTarget} to 5-day rhythm` : '5-day rhythm hit'}</p>
                  </div>
                  <Zap className="h-6 w-6 text-orange-400" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1.9fr]">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-blue-600" />
                Next Best Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {nextActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.label}
                    href={action.href}
                    className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50"
                  >
                    <div className="flex items-start gap-3">
                      <span className="rounded-lg bg-slate-50 p-2">
                        <Icon className="h-4 w-4 text-slate-700" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-slate-950">{action.label}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{action.description}</span>
                      </span>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between gap-3 text-lg">
                <span>This Week</span>
                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                  {weeklyXpTotal} XP
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {weeklyRings.map((r) => {
                const pct = Math.min(100, Math.floor((r.value / Math.max(1, r.goal)) * 100));
                return (
                  <div key={r.key} className="grid gap-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-800">{r.label}</span>
                      <span className="text-slate-500">{r.value} / {r.goal} XP</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${r.color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Skill Progress</h2>
              <p className="text-sm text-slate-600">Broker-specific XP paths and what moves each one forward.</p>
            </div>
            <CalendarCheck className="h-5 w-5 text-slate-400" />
          </div>
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SkillCard
                name="Prospecting"
                xp={skills?.prospecting || 0}
                icon={MapPin}
                description="Adding prospects, mapping areas, discovering opportunities"
                skillKey="prospecting"
              />
              
              <SkillCard
                name="Follow Up"
                xp={skills?.followUp || 0}
                icon={Phone}
                description="Calls, emails, meetings, and consistent communication"
                skillKey="followUp"
              />
              
              <SkillCard
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
              
              <SkillCard
                name="Market Knowledge"
                xp={skills?.marketKnowledge || 0}
                icon={Brain}
                description="Requirements tracking, market research, and industry insights"
                skillKey="marketKnowledge"
              />
            </div>
          </div>
        </div>

        {/* Bricks removed (quarantined) */}
      </div>
    </div>
  );
}
