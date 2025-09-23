import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trophy, TrendingUp, Phone, MapPin, Target, Brain, Zap, Star, Crown } from 'lucide-react';
import { BrokerSkillsRow, SkillActivityRow } from '@shared/schema';
import { useAuth } from '@/contexts/AuthContext';
import BrickWall from '@/components/BrickWall';

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

interface SkillCardProps {
  name: string;
  xp: number;
  icon: React.ComponentType<any>;
  description: string;
  skillKey: 'prospecting' | 'followUp' | 'consistency' | 'marketKnowledge';
}

function SkillCard({ name, xp, icon: Icon, description, skillKey }: SkillCardProps) {
  const level = getLevel(xp);
  const progress = getProgressToNextLevel(xp);
  const xpToNext = getXpToNextLevel(xp);
  const levelColor = getLevelColor(level);
  const actionsToNext = (() => {
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
        return `${reqs} requirement${reqs === 1 ? '' : 's'}`;
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

// Leaderboard component
function Leaderboard() {
  const { user } = useAuth();
  const currentUser = user;

  // Fetch all-time leaderboard data (no timeframe)
  const { data: leaderboardResponse, isLoading, error } = useQuery({
    queryKey: ['/api/leaderboard'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/leaderboard');
      return await res.json();
    },
    enabled: !!currentUser, // allow in demo mode too
    staleTime: 30000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  const leaderboard = leaderboardResponse?.data || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-yellow-500" />
            Market Leader
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gray-200 rounded animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded animate-pulse" />
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : !leaderboard || leaderboard.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Crown className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>No teammates yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {error && (
              <div className="text-red-500 text-sm p-2 bg-red-50 rounded">
                Error: {error.message}
              </div>
            )}
            <div className="grid grid-cols-5 gap-2 text-xs font-medium text-gray-500 pb-2 border-b">
              <div>Rank</div>
              <div className="col-span-2">User</div>
              <div className="text-center">Level</div>
              <div className="text-center">XP</div>
            </div>
            {leaderboard.slice(0, 10).map((entry: any, index: number) => {
              const isCurrentUser = entry.user_id === currentUser?.id;
              return (
                <div
                  key={entry.user_id}
                  className={`grid grid-cols-5 gap-2 items-center p-2 rounded-lg ${
                    isCurrentUser ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">#{index + 1}</span>
                    {index === 0 && <Crown className="h-4 w-4 text-yellow-500" />}
                  </div>
                  <div className="col-span-2">
                    <div className="text-sm font-medium truncate">
                      {entry.display_name}
                    </div>
                    {isCurrentUser && (
                      <Badge variant="secondary" className="text-xs px-1 py-0">
                        You
                      </Badge>
                    )}
                  </div>
                  <div className="text-center">
                    <span className={`text-sm font-bold ${getLevelColor(entry.level_total)}`}>
                      {entry.level_total}
                    </span>
                  </div>
                  <div className="text-center text-xs text-gray-600">
                    {entry.xp_total}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function StatsPage() {
  const { data: skills } = useQuery<BrokerSkillsRow>({
    queryKey: ['/api/skills'],
  });

  const { data: recentActivities = [] } = useQuery<SkillActivityRow[]>({
    queryKey: ['/api/skill-activities'],
  });

  const { data: prospects = [] } = useQuery<any[]>({
    queryKey: ['/api/prospects'],
  });

  const totalLevel = skills ? 
    getLevel(skills.prospecting || 0) + 
    getLevel(skills.followUp || 0) + 
    getLevel(skills.consistency || 0) + 
    getLevel(skills.marketKnowledge || 0) : 0;

  const averageLevel = totalLevel / 4;

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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Level</p>
                    <p className="text-2xl font-bold text-blue-600">{totalLevel}</p>
                  </div>
                  <TrendingUp className="h-6 w-6 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Average Level</p>
                    <p className="text-2xl font-bold text-green-600">{averageLevel.toFixed(1)}</p>
                  </div>
                  <Target className="h-6 w-6 text-green-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Streak Days</p>
                    <p className="text-2xl font-bold text-orange-600">{skills?.streakDays || 0}</p>
                  </div>
                  <Zap className="h-6 w-6 text-orange-500" />
                </div>
              </CardContent>
            </Card>

            {/* Data Summary - Compact */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Assets Tracked</p>
                    <p className="text-2xl font-bold text-purple-600">{prospects.length}</p>
                  </div>
                  <MapPin className="h-6 w-6 text-purple-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Skills Grid */}
          <div className="lg:col-span-2">
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

          {/* Leaderboard */}
          <div className="lg:col-span-1">
            <Leaderboard />
          </div>
        </div>

        {/* Brick Wall Progress */}
        <Card>
          <CardHeader>
            <CardTitle>Progress </CardTitle>
          </CardHeader>
          <CardContent>
            <BrickWall 
              events={recentActivities}
              unitXp={10}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
