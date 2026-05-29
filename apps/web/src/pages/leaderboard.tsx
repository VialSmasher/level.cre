import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ArrowUpRight, Crown, Medal, ShieldCheck, Sparkles, Target, Trophy, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'wouter';

type LeaderboardEntry = {
  user_id: string;
  display_name: string;
  level_total: number;
  xp_total: number;
};

const getLevelColor = (level: number): string => {
  if (level >= 99) return 'text-yellow-500';
  if (level >= 80) return 'text-purple-500';
  if (level >= 60) return 'text-blue-500';
  if (level >= 40) return 'text-green-500';
  if (level >= 20) return 'text-orange-500';
  return 'text-gray-500';
};

const getRankTone = (rank: number) => {
  if (rank === 1) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (rank === 2) return 'border-slate-200 bg-slate-50 text-slate-700';
  if (rank === 3) return 'border-orange-200 bg-orange-50 text-orange-700';
  return 'border-blue-100 bg-blue-50 text-blue-700';
};

const formatXp = (xp: number) => Number(xp || 0).toLocaleString();

export default function LeaderboardPage() {
  const { user } = useAuth();
  const currentUser = user;

  const { data: leaderboardResponse, isLoading, error } = useQuery({
    queryKey: ['/api/leaderboard'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/leaderboard');
      return await res.json();
    },
    enabled: !!currentUser,
    staleTime: 30000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  const leaderboard: LeaderboardEntry[] = Array.isArray(leaderboardResponse?.data) ? leaderboardResponse.data : [];
  const leader = leaderboard[0];
  const currentUserIndex = leaderboard.findIndex((entry) => entry.user_id === currentUser?.id);
  const currentUserEntry = currentUserIndex >= 0 ? leaderboard[currentUserIndex] : undefined;
  const currentRank = currentUserIndex >= 0 ? currentUserIndex + 1 : undefined;
  const nextRankEntry = currentUserIndex > 0 ? leaderboard[currentUserIndex - 1] : undefined;
  const xpToNextRank = currentUserEntry && nextRankEntry
    ? Math.max(0, Number(nextRankEntry.xp_total || 0) - Number(currentUserEntry.xp_total || 0) + 1)
    : 0;
  const topThree = leaderboard.slice(0, 3);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Badge variant="outline" className="mb-2 gap-2 rounded-full border-blue-200 bg-blue-50 px-3 py-1 text-blue-700">
              <Trophy className="h-3.5 w-3.5" />
              Market standings
            </Badge>
            <h1 className="text-3xl font-bold text-slate-950">Market Standings</h1>
            <p className="text-slate-600">See where you stand, who is leading, and the XP gap to climb.</p>
          </div>
          <Link
            href="/broker-stats"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Broker Scorecard
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Your rank</p>
                  <p className="mt-1 text-3xl font-bold text-slate-950">{currentRank ? `#${currentRank}` : '-'}</p>
                  <p className="mt-1 text-xs text-slate-500">{currentUserEntry ? `${formatXp(currentUserEntry.xp_total)} total XP` : 'Not ranked yet'}</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                  <Target className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Gap to next</p>
                  <p className="mt-1 text-3xl font-bold text-slate-950">{xpToNextRank ? formatXp(xpToNextRank) : '-'}</p>
                  <p className="mt-1 text-xs text-slate-500">{nextRankEntry ? `XP to pass ${nextRankEntry.display_name}` : 'You are at the top'}</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                  <ArrowUpRight className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Market leader</p>
                  <p className="mt-1 truncate text-2xl font-bold text-slate-950">{leader?.display_name || '-'}</p>
                  <p className="mt-1 text-xs text-slate-500">{leader ? `${formatXp(leader.xp_total)} XP` : 'No standings yet'}</p>
                </div>
                <div className="rounded-lg bg-amber-50 p-2 text-amber-600">
                  <Crown className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600">Brokers ranked</p>
                  <p className="mt-1 text-3xl font-bold text-slate-950">{leaderboard.length}</p>
                  <p className="mt-1 text-xs text-slate-500">All-time production board</p>
                </div>
                <div className="rounded-lg bg-violet-50 p-2 text-violet-600">
                  <Users className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {topThree.length > 0 && (
          <div className="grid gap-4 md:grid-cols-3">
            {topThree.map((entry, index) => {
              const rank = index + 1;
              const isCurrentUser = entry.user_id === currentUser?.id;
              return (
                <Card key={entry.user_id} className={`border shadow-sm ${getRankTone(rank)}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-4 flex items-center gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-bold shadow-sm">
                            #{rank}
                          </div>
                          {rank === 1 ? <Crown className="h-5 w-5" /> : <Medal className="h-5 w-5" />}
                        </div>
                        <p className="truncate text-lg font-bold text-slate-950">{entry.display_name}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="rounded-full bg-white/80 text-xs">Level {entry.level_total}</Badge>
                          {isCurrentUser && <Badge className="rounded-full bg-slate-950 text-xs text-white hover:bg-slate-950">You</Badge>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-slate-950">{formatXp(entry.xp_total)}</p>
                        <p className="text-xs font-medium text-slate-500">XP</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-slate-950">
                  <ShieldCheck className="h-5 w-5 text-blue-600" />
                  Full Standings
                </CardTitle>
                <p className="mt-1 text-sm text-slate-600">All-time level and XP rankings for the workspace.</p>
              </div>
              <div className="flex w-full max-w-md rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold text-slate-600 md:w-auto">
                <span className="rounded-full bg-white px-4 py-2 text-blue-700 shadow-sm">All time</span>
                <span className="px-4 py-2 text-slate-400">This week</span>
                <span className="px-4 py-2 text-slate-400">This month</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : !leaderboard || leaderboard.length === 0 ? (
              <div className="py-10 text-center text-slate-500">
                <Crown className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                <p>No teammates yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {error && (
                  <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                    Error: {(error as Error).message}
                  </div>
                )}
                <div className="grid grid-cols-12 gap-3 border-b border-slate-200 px-3 pb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <div>Rank</div>
                  <div className="col-span-5">Broker</div>
                  <div className="col-span-2 text-center">Level</div>
                  <div className="col-span-2 text-center">Total XP</div>
                  <div className="col-span-2 text-right">Status</div>
                </div>
                {leaderboard.map((entry, index) => {
                  const rank = index + 1;
                  const isCurrentUser = entry.user_id === currentUser?.id;
                  return (
                    <div
                      key={entry.user_id}
                      className={`grid grid-cols-12 gap-3 items-center rounded-2xl border p-3 transition ${
                        isCurrentUser ? 'border-blue-200 bg-blue-50 shadow-sm' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-950">#{rank}</span>
                        {rank === 1 && <Crown className="h-4 w-4 text-amber-500" />}
                      </div>
                      <div className="col-span-5 min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-950">
                          {entry.display_name}
                        </div>
                        <p className="text-xs text-slate-500">
                          {rank === 1 ? 'Market leader' : nextRankEntry?.user_id === entry.user_id ? 'Next target' : 'Workspace broker'}
                        </p>
                      </div>
                      <div className="col-span-2 text-center">
                        <span className={`text-lg font-bold ${getLevelColor(entry.level_total)}`}>
                          {entry.level_total}
                        </span>
                      </div>
                      <div className="col-span-2 text-center text-sm font-semibold text-slate-700">{formatXp(entry.xp_total)}</div>
                      <div className="col-span-2 flex justify-end">
                        {isCurrentUser ? (
                          <Badge className="rounded-full bg-slate-950 text-xs text-white hover:bg-slate-950">You</Badge>
                        ) : rank <= 3 ? (
                          <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-xs text-amber-700">Top 3</Badge>
                        ) : (
                          <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-xs text-slate-500">
                            <Sparkles className="mr-1 h-3 w-3" />
                            Ranked
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
