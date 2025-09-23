import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Users, Phone, Calendar, Clock } from 'lucide-react';
import { Prospect, Submarket, ProspectStatusType } from '@shared/schema';
import { useQuery } from '@tanstack/react-query';
import { useAuth, useDemoAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { uniqueSubmarketNames } from '@/lib/submarkets';

export default function Knowledge() {
  const { user } = useAuth();
  const { demoUser } = useDemoAuth();
  const { profile } = useProfile();
  const currentUser = user || demoUser;
  
  // Load data from database APIs instead of localStorage
  const { data: prospects = [] } = useQuery<Prospect[]>({
    queryKey: ['/api/prospects'],
    refetchOnWindowFocus: true,
    staleTime: 0, // Always refetch when component mounts
    enabled: !!currentUser, // Only fetch when user is available
  });

  const { data: submarkets = [] } = useQuery<Submarket[]>({
    queryKey: ['/api/submarkets'],
    refetchOnWindowFocus: true,
    enabled: !!currentUser, // Only fetch when user is available
  });
  
  // Use normalized, de-duplicated submarkets as filter options
  const submarketOptions = uniqueSubmarketNames(profile?.submarkets || []);

  // Fetch interactions data from database instead of localStorage
  const { data: interactions = [] } = useQuery<any[]>({
    queryKey: ['/api/interactions'],
    enabled: !!currentUser, // Only fetch when user is available
  });

  // Removed requirements data for simplified dashboard

  // Reset state when user changes
  useEffect(() => {
    const handleUserChange = () => {
      setSelectedSubmarket('all');
    };
    
    window.addEventListener('userChanged', handleUserChange);
    return () => window.removeEventListener('userChanged', handleUserChange);
  }, []);
  const [selectedSubmarket, setSelectedSubmarket] = useState<string>('all');

  const filteredProspects = useMemo(() => {
    if (selectedSubmarket === 'all') return prospects;
    // For profile-based submarkets, filter by submarket name instead of ID
    return prospects.filter(p => p.submarketId === selectedSubmarket);
  }, [prospects, selectedSubmarket]);

  const analytics = useMemo(() => {
    const total = filteredProspects.length;

    // Contact coverage: % with status != 'prospect'
    const contacted = filteredProspects.filter(p => p.status !== 'prospect').length;
    const contactPercent = total > 0 ? (contacted / total) * 100 : 0;

    // Freshness: % with interaction in last 60 days
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const recentActivity = filteredProspects.filter(p => {
      const prospectInteractions = interactions.filter(i => i.prospectId === p.id);
      return prospectInteractions.some(i => new Date(i.date || i.createdAt) > sixtyDaysAgo);
    }).length;
    const freshnessPercent = total > 0 ? (recentActivity / total) * 100 : 0;

    // Lists for gaps and stale (stale relative to 60 days)
    const noTouches = filteredProspects.filter(p => !interactions.some(i => i.prospectId === p.id));
    const staleProspects = filteredProspects.filter(p => {
      const prospectInteractions = interactions.filter(i => i.prospectId === p.id);
      if (prospectInteractions.length === 0) return true;
      const latestInteraction = Math.max(
        ...prospectInteractions.map(i => new Date(i.date || i.createdAt).getTime())
      );
      return new Date(latestInteraction) <= sixtyDaysAgo;
    });

    return {
      total,
      contacted,
      recentActivity,
      contactPercent,
      freshnessPercent,
      noTouches,
      staleProspects,
    };
  }, [filteredProspects, interactions]);

  const ProgressRing = ({ progress, size = 60 }: { progress: number; size?: number }) => {
    const safeProgress = progress || 0;
    const radius = (size - 8) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDasharray = circumference;
    const strokeDashoffset = circumference - (safeProgress / 100) * circumference;

    return (
      <div className="relative inline-flex items-center justify-center">
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
            className="text-gray-300"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            className="text-blue-600 transition-all duration-300 ease-in-out"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold">
          {Math.round(safeProgress)}%
        </span>
      </div>
    );
  };

  // Removed Knowledge Score color helper

  const getStatusColor = (status: ProspectStatusType) => {
    const colors = {
      prospect: 'bg-yellow-100 text-yellow-800',
      contacted: 'bg-blue-100 text-blue-800',
      listing: 'bg-green-100 text-green-800',
      client: 'bg-purple-100 text-purple-800',
      no_go: 'bg-red-100 text-red-800'
    };
    return colors[status];
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Knowledge Dashboard</h1>
          <p className="text-gray-600">Track your prospect pipeline performance and identify opportunities</p>
        </div>

        {/* Submarket Filter */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700">Filter by Submarket:</label>
              <Select value={selectedSubmarket} onValueChange={setSelectedSubmarket}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Submarkets" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Submarkets</SelectItem>
                  {submarketOptions.map((submarket) => (
                    <SelectItem key={submarket} value={submarket}>
                      {submarket}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Filter chip */}
        {selectedSubmarket !== 'all' && (
          <div className="mb-4">
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              Filtered by: {selectedSubmarket}
            </Badge>
          </div>
        )}

        {/* Analytics Cards (simplified) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Contact Coverage</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{analytics.contacted}</div>
                <p className="text-xs text-muted-foreground">of {analytics.total}</p>
              </div>
              <ProgressRing progress={analytics.contactPercent} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Freshness</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{analytics.recentActivity}</div>
                <p className="text-xs text-muted-foreground">last 60 days</p>
              </div>
              <ProgressRing progress={analytics.freshnessPercent} />
            </CardContent>
          </Card>

          

          
        </div>



        {/* Action Lists */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Phone className="mr-2 h-4 w-4 text-green-500" />
                New Prospects ({analytics.noTouches.filter(p => p.status === 'prospect').length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {analytics.noTouches.filter(p => p.status === 'prospect').length === 0 ? (
                  <p className="text-gray-500 text-sm">All prospects contacted!</p>
                ) : (
                  analytics.noTouches
                    .filter(p => p.status === 'prospect')
                    .slice(0, 8)
                    .map((prospect) => (
                      <div key={prospect.id} className="flex justify-between items-center p-3 border rounded hover:bg-green-50 hover:border-green-200 cursor-pointer transition-colors">
                        <div className="font-medium">{prospect.name}</div>
                        <div className="text-sm text-green-600 font-medium">Call now</div>
                      </div>
                    ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="mr-2 h-4 w-4 text-orange-500" />
                Follow-ups ({analytics.staleProspects.filter(p => ['contacted', 'followup'].includes(p.status)).length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {analytics.staleProspects.filter(p => ['contacted', 'followup'].includes(p.status)).length === 0 ? (
                  <p className="text-gray-500 text-sm">All caught up!</p>
                ) : (
                  analytics.staleProspects
                    .filter(p => ['contacted', 'followup'].includes(p.status))
                    .slice(0, 8)
                    .map((prospect) => {
                      const prospectInteractions = interactions.filter(i => i.prospectId === prospect.id);
                      const latestInteraction = prospectInteractions.length > 0 
                        ? new Date(Math.max(...prospectInteractions.map(i => new Date(i.date || i.createdAt).getTime())))
                        : null;
                      
                      const daysSince = latestInteraction ? 
                        Math.floor((Date.now() - latestInteraction.getTime()) / (1000 * 60 * 60 * 24)) : 999;
                      
                      return (
                        <div key={prospect.id} className="flex justify-between items-center p-3 border rounded hover:bg-orange-50 hover:border-orange-200 cursor-pointer transition-colors">
                          <div className="font-medium">{prospect.name}</div>
                          <div className="text-sm text-orange-600 font-medium">{daysSince}d ago</div>
                        </div>
                      );
                    })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
