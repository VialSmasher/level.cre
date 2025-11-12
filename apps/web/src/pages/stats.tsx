import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trophy, TrendingUp, Phone, MapPin, Target, Brain, Zap, Star, ArrowRight } from 'lucide-react';
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

const getSkillIcon = (skill: string) => {
  switch (skill) {
    case 'prospecting': return MapPin;
    case 'followUp': return Phone;
    case 'consistency': return Zap;
    case 'marketKnowledge': return Brain;
    default: return Target;
  }
};

const getSkillName = (skill: string): string => {
  switch (skill) {
    case 'prospecting': return 'Prospecting';
    case 'followUp': return 'Follow Up';
    case 'consistency': return 'Consistency';
    case 'marketKnowledge': return 'Market Knowledge';
    default: return skill;
  }
};

const LEAD_AGENT_BONUS_XP = 80;

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
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50">
              <Icon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-lg">{name}</CardTitle>
              <p className="text-sm text-gray-600">{description}</p>
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
      
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress to level {level + 1}</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          {xpToNext > 0 && (
            <div className="text-xs text-gray-600 text-center">
              {actionsToNext}
            </div>
          )}
        </div>
      </CardContent>
      
      {level >= 99 && (
        <div className="absolute top-2 right-2">
          <Badge className="bg-yellow-500 text-white">
            <Star className="h-3 w-3 mr-1" />
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

  const weekStartTs = React.useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const d = new Date(now);
    d.setDate(now.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const weeklySummary = React.useMemo(() => {
    const sums: Record<string, number> = {};
    let followups = 0;

    for (const activity of recentActivities || []) {
      const timestamp = new Date((activity as any).timestamp || (activity as any).date || (activity as any).createdAt || Date.now()).getTime();
      if (timestamp < weekStartTs) continue;

      const key = String(activity.skillType || '');
      if (!key) continue;

      let xp = Number(activity.xpGained || 0) || 0;
      const action = String(activity.action || '').toLowerCase();

      if (key === 'followUp' && ['phone_call','email_sent','meeting_held','followup_logged'].includes(action)) {
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
  }, [recentActivities, weekStartTs, requirementsById]);

  const weeklyFollowupsCount = weeklySummary.followups;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600">
              <Trophy className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Broker Stats</h1>
              <p className="text-gray-600">Track your progress and level up your broker skills</p>
            </div>
          </div>

          {/* Overall Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Level</p>
                    <p className="text-4xl font-bold text-blue-600">{headerLoading || headerError ? 0 : totalLevel}</p>
                  </div>
                  <TrendingUp className="h-7 w-7 text-blue-400" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Assets Tracked</p>
                    <p className="text-4xl font-bold text-purple-600">{headerLoading || headerError ? 0 : (header?.assetsTracked ?? 0)}</p>
                  </div>
                  <MapPin className="h-7 w-7 text-purple-400" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Follow-Ups Logged</p>
                    <p className="text-4xl font-bold text-green-600">{weeklyFollowupsCount}</p>
                    <p className="text-xs text-gray-500 mt-1">This week</p>
                  </div>
                  <Target className="h-7 w-7 text-green-400" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Streak Days</p>
                    <p className="text-4xl font-bold text-orange-600">{headerLoading || headerError ? 0 : (header?.streakDays ?? 0)}</p>
                  </div>
                  <Zap className="h-7 w-7 text-orange-400" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Simple page tabs */}
          <div className="mt-2 mb-4 border-b border-gray-200">
            <div className="flex gap-6 text-sm">
              <span className="pb-3 -mb-px border-b-[3px] border-blue-600 text-blue-600 font-semibold">Broker Stats</span>
              <Link
                href="/leaderboard"
                className="pb-3 -mb-px border-b-[3px] border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300"
              >
                Leaderboard
              </Link>
            </div>
          </div>

          {/* Weekly Rings */}
          {(() => {
            const sums = weeklySummary.sums;
            const rings = [
              { key: 'prospecting', label: 'Prospecting', color: '#3B82F6', value: sums['prospecting'] || 0, goal: 250 },
              { key: 'followUp', label: 'Follow-Up', color: '#10B981', value: sums['followUp'] || 0, goal: 400 },
              { key: 'marketKnowledge', label: 'Knowledge', color: '#8B5CF6', value: sums['marketKnowledge'] || 0, goal: 200 },
            ];

            return (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Weekly Goals</CardTitle>
                  <CardDescription>Your weekly goals reset every Monday. Keep your momentum going!</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {rings.map((r) => {
                      const pct = Math.min(100, Math.floor((r.value / Math.max(1, r.goal)) * 100));
                      const deg = Math.round((pct / 100) * 360);
                      return (
                        <div key={r.key} className="flex items-center gap-4">
                          <div className="relative w-20 h-20">
                            <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${r.color} ${deg}deg, #E5E7EB ${deg}deg)` }} />
                            <div className="absolute inset-2 rounded-full bg-white flex items-center justify-center">
                              <div className="flex flex-col items-center text-[11px] font-semibold leading-tight">
                                <span>{r.value} XP</span>
                                <span className="text-gray-500">of {r.goal}</span>
                              </div>
                            </div>
                          </div>
                          <div>
                            <div className="text-sm font-medium">{r.label}</div>
                            <div className="text-xs text-gray-600">{r.value} XP this week</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 gap-6 mb-8 mt-8">
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
