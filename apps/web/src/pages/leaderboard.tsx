import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Crown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'wouter';

const getLevelColor = (level: number): string => {
  if (level >= 99) return 'text-yellow-500';
  if (level >= 80) return 'text-purple-500';
  if (level >= 60) return 'text-blue-500';
  if (level >= 40) return 'text-green-500';
  if (level >= 20) return 'text-orange-500';
  return 'text-gray-500';
};

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

  const leaderboard = leaderboardResponse?.data || [];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Leaderboard</h1>
          <p className="text-gray-600">Rankings by total level and XP</p>
        </div>

        {/* Simple page tabs */}
        <div className="-mt-4 mb-4 border-b border-gray-200">
          <div className="flex gap-6 text-sm">
            <Link
              href="/broker-stats"
              className="pb-3 -mb-px border-b-[3px] border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300"
            >
              Broker Stats
            </Link>
            <span className="pb-3 -mb-px border-b-[3px] border-blue-600 text-blue-600 font-semibold">Leaderboard</span>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-yellow-500" />
              Market Leader
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 bg-gray-100 animate-pulse rounded" />
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
                    Error: {(error as Error).message}
                  </div>
                )}
                <div className="grid grid-cols-5 gap-2 text-xs font-medium text-gray-500 pb-2 border-b">
                  <div>Rank</div>
                  <div className="col-span-2">Name</div>
                  <div className="text-center">Level</div>
                  <div className="text-center">XP</div>
                </div>
                {leaderboard.map((entry: any, index: number) => {
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
                          <Badge variant="secondary" className="text-xs px-1 py-0">You</Badge>
                        )}
                      </div>
                      <div className="text-center">
                        <span className={`text-sm font-bold ${getLevelColor(entry.level_total)}`}>
                          {entry.level_total}
                        </span>
                      </div>
                      <div className="text-center text-xs text-gray-600">{entry.xp_total}</div>
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
