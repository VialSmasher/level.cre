import { useState, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRight, Building2, Calendar, CheckCircle2, Clock, Mail, MapPin, MessageSquare, Phone, Target, Users, Wrench } from 'lucide-react';
import { Prospect, Submarket } from '@level-cre/shared/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useLocation } from 'wouter';
import { uniqueSubmarketNames } from '@/lib/submarkets';
import { getProspectDisplayName, getProspectSecondaryName } from '@/lib/prospectDisplay';
import { apiRequest } from '@/lib/queryClient';

function getInteractionDate(interaction: any) {
  const parsed = new Date(interaction?.date || interaction?.createdAt || '');
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getLatestInteractionDate(interactions: any[]) {
  const timestamps = interactions
    .map(getInteractionDate)
    .filter((date): date is Date => Boolean(date))
    .map(date => date.getTime());

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

function formatLastTouchLabel(date: Date | null) {
  if (!date) return 'Untouched';
  const daysSince = Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
  if (daysSince === 0) return 'Touched today';
  if (daysSince === 1) return 'Touched yesterday';
  return `${daysSince}d since touch`;
}

type FocusQueue = 'new' | 'missing' | 'stale' | 'followups';

function formatStatusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function addDaysIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)).toISOString();
}

type DrawerForm = {
  businessName: string;
  contactName: string;
  contactCompany: string;
  contactPhone: string;
  contactEmail: string;
  submarketId: string;
  buildingSf: string;
  lotSizeAcres: string;
};

const EMPTY_DRAWER_FORM: DrawerForm = {
  businessName: '',
  contactName: '',
  contactCompany: '',
  contactPhone: '',
  contactEmail: '',
  submarketId: '',
  buildingSf: '',
  lotSizeAcres: '',
};

function drawerFormFromProspect(prospect: Prospect | null): DrawerForm {
  if (!prospect) return EMPTY_DRAWER_FORM;
  return {
    businessName: prospect.businessName || '',
    contactName: prospect.contactName || '',
    contactCompany: prospect.contactCompany || '',
    contactPhone: prospect.contactPhone || '',
    contactEmail: prospect.contactEmail || '',
    submarketId: prospect.submarketId || '',
    buildingSf: prospect.buildingSf ? String(prospect.buildingSf) : '',
    lotSizeAcres: prospect.lotSizeAcres ? String(prospect.lotSizeAcres) : '',
  };
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function Knowledge() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const currentUser = user;
  
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
  const [activeQueue, setActiveQueue] = useState<FocusQueue>('new');
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [quickNote, setQuickNote] = useState('');
  const [drawerForm, setDrawerForm] = useState<DrawerForm>(EMPTY_DRAWER_FORM);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  const safeProspects = useMemo(() => Array.isArray(prospects) ? prospects : [], [prospects]);
  const safeInteractions = useMemo(() => Array.isArray(interactions) ? interactions : [], [interactions]);

  const filteredProspects = useMemo(() => {
    if (selectedSubmarket === 'all') return safeProspects;
    // For profile-based submarkets, filter by submarket name instead of ID
    return safeProspects.filter(p => p.submarketId === selectedSubmarket);
  }, [safeProspects, selectedSubmarket]);

  const analytics = useMemo(() => {
    const total = filteredProspects.length;
    const interactionsByProspectId = new Map<string, any[]>();
    for (const interaction of safeInteractions) {
      const list = interactionsByProspectId.get(interaction.prospectId) ?? [];
      list.push(interaction);
      interactionsByProspectId.set(interaction.prospectId, list);
    }

    // Contact coverage: % with status != 'prospect'
    const contacted = filteredProspects.filter(p => p.status !== 'prospect').length;
    const contactPercent = total > 0 ? (contacted / total) * 100 : 0;

    // Freshness: % with interaction in last 60 days
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const recentActivity = filteredProspects.filter(p => {
      const latestInteraction = getLatestInteractionDate(interactionsByProspectId.get(p.id) ?? []);
      return latestInteraction ? latestInteraction > sixtyDaysAgo : false;
    }).length;
    const freshnessPercent = total > 0 ? (recentActivity / total) * 100 : 0;

    // Lists for gaps and stale (stale relative to 60 days)
    const noTouches = filteredProspects.filter(p => !(interactionsByProspectId.get(p.id)?.length));
    const staleProspects = filteredProspects.filter(p => {
      const latestInteraction = getLatestInteractionDate(interactionsByProspectId.get(p.id) ?? []);
      if (!latestInteraction) return true;
      return latestInteraction <= sixtyDaysAgo;
    });
    const missingContacts = filteredProspects.filter(p =>
      !p.contactName && !p.contactEmail && !p.contactPhone && !p.contactCompany
    );
    const newProspects = noTouches.filter(p => p.status === 'prospect');
    const relationshipProspects = staleProspects.filter(p =>
      ['contacted', 'followup', 'listing', 'client', 'development'].includes(p.status)
    );

    return {
      total,
      contacted,
      recentActivity,
      contactPercent,
      freshnessPercent,
      noTouches,
      newProspects,
      missingContacts,
      staleProspects,
      relationshipProspects,
      interactionsByProspectId,
    };
  }, [filteredProspects, safeInteractions]);

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

  const getSubmarketLabel = (value?: string | null) => {
    if (!value) return 'No submarket';
    const byId = submarkets.find((submarket) => String(submarket.id) === String(value));
    return byId?.name ?? value;
  };

  const queueConfig = {
    new: {
      label: 'New prospects',
      title: 'New Prospects',
      description: 'Untouched records ready for first contact.',
      icon: Phone,
      count: analytics.newProspects.length,
      items: analytics.newProspects,
      tint: 'emerald',
      action: 'Call now',
    },
    missing: {
      label: 'Missing contacts',
      title: 'Missing Contact Info',
      description: 'Assets that need a person, company, phone, or email.',
      icon: Wrench,
      count: analytics.missingContacts.length,
      items: analytics.missingContacts,
      tint: 'sky',
      action: 'Clean up',
    },
    stale: {
      label: 'Stale records',
      title: 'Stale Records',
      description: 'Properties that have not been touched in 60+ days.',
      icon: Calendar,
      count: analytics.staleProspects.length,
      items: analytics.staleProspects,
      tint: 'amber',
      action: 'Review',
    },
    followups: {
      label: 'Follow-ups',
      title: 'Follow-up Lane',
      description: 'Relationship records that need a touch.',
      icon: Clock,
      count: analytics.relationshipProspects.length,
      items: analytics.relationshipProspects,
      tint: 'orange',
      action: 'Move forward',
    },
  } satisfies Record<FocusQueue, {
    label: string;
    title: string;
    description: string;
    icon: typeof Phone;
    count: number;
    items: Prospect[];
    tint: string;
    action: string;
  }>;

  const activeQueueConfig = queueConfig[activeQueue];
  const ActiveQueueIcon = activeQueueConfig.icon;

  const queueButtonClass = (queue: FocusQueue) => {
    const isActive = activeQueue === queue;
    const activeClasses = {
      new: 'border-emerald-300 bg-emerald-50 text-emerald-950 shadow-sm',
      missing: 'border-sky-300 bg-sky-50 text-sky-950 shadow-sm',
      stale: 'border-amber-300 bg-amber-50 text-amber-950 shadow-sm',
      followups: 'border-orange-300 bg-orange-50 text-orange-950 shadow-sm',
    };
    return isActive
      ? activeClasses[queue]
      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50';
  };

  const prospectMetaBadges = (prospect: Prospect, latestInteraction: Date | null) => {
    const badges = [
      getSubmarketLabel(prospect.submarketId),
      formatStatusLabel(prospect.status),
      formatLastTouchLabel(latestInteraction),
    ];

    if (!prospect.contactName && !prospect.contactEmail && !prospect.contactPhone && !prospect.contactCompany) {
      badges.push('No contact');
    }

    return badges;
  };

  const selectedInteractions = selectedProspect
    ? analytics.interactionsByProspectId.get(selectedProspect.id) ?? []
    : [];
  const selectedLatestInteraction = getLatestInteractionDate(selectedInteractions);
  const drawerMode: FocusQueue = selectedProspect
    ? analytics.newProspects.some((prospect) => prospect.id === selectedProspect.id)
      ? 'new'
      : analytics.missingContacts.some((prospect) => prospect.id === selectedProspect.id)
        ? 'missing'
        : analytics.relationshipProspects.some((prospect) => prospect.id === selectedProspect.id)
          ? 'followups'
          : 'stale'
    : activeQueue;
  const drawerCopy = {
    new: {
      title: 'Log first touch',
      description: 'Add the first useful activity and capture any contact intel you find.',
      primary: 'Log first call',
    },
    missing: {
      title: 'Clean up this prospect',
      description: 'Fill the missing details so this record becomes usable CRM data.',
      primary: 'Save cleanup',
    },
    stale: {
      title: 'Refresh this record',
      description: 'Confirm what changed, add a note, or schedule the next touch.',
      primary: 'Save cleanup',
    },
    followups: {
      title: 'Move this follow-up forward',
      description: 'Log the touch, snooze it, or add the next piece of relationship context.',
      primary: 'Log follow-up',
    },
  } satisfies Record<FocusQueue, { title: string; description: string; primary: string }>;

  const invalidateDashboardData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/prospects'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/interactions'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/stats/header'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/skills'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/skill-activities'] }),
    ]);
  };

  const logInteractionMutation = useMutation({
    mutationFn: async ({ prospect, type, outcome, notes }: {
      prospect: Prospect;
      type: 'call' | 'email' | 'meeting' | 'note';
      outcome: 'contacted' | 'no_answer' | 'left_message' | 'scheduled_meeting' | 'not_interested' | 'follow_up_later';
      notes?: string;
    }) => {
      await apiRequest('POST', '/api/interactions', {
        prospectId: prospect.id,
        date: new Date().toISOString(),
        type,
        outcome,
        notes: notes || '',
      });

      const patch: Record<string, string> = {
        lastContactDate: new Date().toISOString(),
      };
      if (prospect.status === 'prospect' && type !== 'note') {
        patch.status = 'contacted';
      }
      await apiRequest('PATCH', `/api/prospects/${prospect.id}`, patch);
    },
    onSuccess: async () => {
      setQuickNote('');
      await invalidateDashboardData();
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: async ({ prospect, days }: { prospect: Prospect; days: number }) => {
      await apiRequest('PATCH', `/api/prospects/${prospect.id}`, {
        followUpDueDate: addDaysIso(days),
      });
    },
    onSuccess: invalidateDashboardData,
  });

  const saveProspectMutation = useMutation({
    mutationFn: async ({ prospect, values }: { prospect: Prospect; values: DrawerForm }) => {
      const buildingSf = optionalNumber(values.buildingSf);
      const lotSizeAcres = optionalNumber(values.lotSizeAcres);
      const patch = {
        businessName: values.businessName.trim(),
        contactName: values.contactName.trim(),
        contactCompany: values.contactCompany.trim(),
        contactPhone: values.contactPhone.trim(),
        contactEmail: values.contactEmail.trim(),
        submarketId: values.submarketId.trim(),
        buildingSf,
        lotSizeAcres,
      };
      await apiRequest('PATCH', `/api/prospects/${prospect.id}`, patch);
    },
    onSuccess: invalidateDashboardData,
  });

  const openProspect = (prospect: Prospect) => {
    setSelectedProspect(prospect);
    setQuickNote('');
    setDrawerForm(drawerFormFromProspect(prospect));
  };

  const closeDrawer = () => {
    setSelectedProspect(null);
    setQuickNote('');
    setDrawerForm(EMPTY_DRAWER_FORM);
  };

  const updateDrawerForm = (key: keyof DrawerForm, value: string) => {
    setDrawerForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
              <Target className="h-3.5 w-3.5" />
              Command center
            </div>
            <h1 className="text-3xl font-bold text-slate-950 mb-2">Knowledge Dashboard</h1>
            <p className="text-slate-600">Pick a queue, clean the data, and move the next best prospects forward.</p>
          </div>

          <Button
            type="button"
            className="w-full gap-2 bg-slate-950 text-white hover:bg-slate-800 md:w-auto"
            onClick={() => setLocation('/app/followup')}
          >
            Open Follow-ups
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        <Card className="border-slate-200 bg-white/90 shadow-sm">
          <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="text-sm font-medium text-slate-700">Submarket</label>
              <Select value={selectedSubmarket} onValueChange={setSelectedSubmarket}>
                <SelectTrigger className="h-10 w-full rounded-full border-slate-200 bg-slate-50 sm:w-56">
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

            <div className="flex flex-wrap gap-2">
              {(Object.keys(queueConfig) as FocusQueue[]).map((queue) => {
                const config = queueConfig[queue];
                const Icon = config.icon;
                return (
                  <button
                    key={queue}
                    type="button"
                    className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors ${queueButtonClass(queue)}`}
                    onClick={() => setActiveQueue(queue)}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{config.label}</span>
                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-bold">{config.count}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(queueConfig) as FocusQueue[]).map((queue) => {
            const config = queueConfig[queue];
            const Icon = config.icon;
            const isActive = activeQueue === queue;
            return (
              <button
                key={queue}
                type="button"
                className={`rounded-lg border p-4 text-left transition-all ${queueButtonClass(queue)} ${isActive ? 'ring-2 ring-blue-100' : ''}`}
                onClick={() => setActiveQueue(queue)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{config.label}</div>
                    <div className="mt-2 text-3xl font-bold tracking-tight">{config.count}</div>
                  </div>
                  <span className="rounded-full bg-white/80 p-2">
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-3 min-h-10 text-sm text-slate-600">{config.description}</p>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Assets Tracked</CardTitle>
              <Users className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-950">{analytics.total}</div>
              <p className="mt-1 text-sm text-slate-500">
                {selectedSubmarket === 'all' ? 'Across all submarkets' : `Filtered to ${selectedSubmarket}`}
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Contact Coverage</CardTitle>
              <Phone className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-slate-950">{analytics.contacted}</div>
                <p className="mt-1 text-sm text-slate-500">of {analytics.total} assets</p>
              </div>
              <ProgressRing progress={analytics.contactPercent} />
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Freshness</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-slate-950">{analytics.recentActivity}</div>
                <p className="mt-1 text-sm text-slate-500">touched in 60 days</p>
              </div>
              <ProgressRing progress={analytics.freshnessPercent} />
            </CardContent>
          </Card>
        </div>



        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <ActiveQueueIcon className="h-5 w-5 text-blue-600" />
                  {activeQueueConfig.title}
                </span>
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                  {activeQueueConfig.count}
                </Badge>
              </CardTitle>
              <CardDescription>{activeQueueConfig.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {activeQueueConfig.items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                    This queue is clear.
                  </div>
                ) : (
                  activeQueueConfig.items
                    .slice(0, 8)
                    .map((prospect) => {
                      const latestInteraction = getLatestInteractionDate(analytics.interactionsByProspectId.get(prospect.id) ?? []);
                      const secondary = getProspectSecondaryName(prospect);
                      return (
                        <button
                          key={prospect.id}
                          type="button"
                          className="group w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/40 focus:outline-none focus:ring-2 focus:ring-blue-200"
                          onClick={() => openProspect(prospect)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-slate-950">{getProspectDisplayName(prospect)}</div>
                              {secondary && (
                                <div className="mt-0.5 truncate text-xs text-slate-500">{secondary}</div>
                              )}
                            </div>
                            <span className="shrink-0 text-sm font-semibold text-blue-600">{activeQueueConfig.action}</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {prospectMetaBadges(prospect, latestInteraction).slice(0, 4).map((badge) => (
                              <Badge key={badge} variant="outline" className="border-slate-200 bg-slate-50 px-2 py-0 text-xs font-medium text-slate-600">
                                {badge}
                              </Badge>
                            ))}
                          </div>
                        </button>
                      );
                    })
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-orange-500" />
                  Follow-ups
                </span>
                <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                  {analytics.relationshipProspects.length}
                </Badge>
              </CardTitle>
              <CardDescription>Relationship records that need a timely next touch.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {analytics.relationshipProspects.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                    All caught up.
                  </div>
                ) : (
                  analytics.relationshipProspects
                    .slice(0, 8)
                    .map((prospect) => {
                      const latestInteraction = getLatestInteractionDate(analytics.interactionsByProspectId.get(prospect.id) ?? []);
                      const lastTouchLabel = formatLastTouchLabel(latestInteraction);
                      const secondary = getProspectSecondaryName(prospect);
                      
                      return (
                        <button
                          key={prospect.id}
                          type="button"
                          className="group w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-orange-200 hover:bg-orange-50/40 focus:outline-none focus:ring-2 focus:ring-orange-200"
                          onClick={() => openProspect(prospect)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-slate-950">{getProspectDisplayName(prospect)}</div>
                              {secondary && (
                                <div className="mt-0.5 truncate text-xs text-slate-500">{secondary}</div>
                              )}
                            </div>
                            <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
                              {lastTouchLabel}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <Badge variant="outline" className="border-slate-200 bg-slate-50 px-2 py-0 text-xs font-medium text-slate-600">
                              <MapPin className="mr-1 h-3 w-3" />
                              {getSubmarketLabel(prospect.submarketId)}
                            </Badge>
                            <Badge variant="outline" className="border-slate-200 bg-slate-50 px-2 py-0 text-xs font-medium text-slate-600">
                              <Building2 className="mr-1 h-3 w-3" />
                              {formatStatusLabel(prospect.status)}
                            </Badge>
                          </div>
                        </button>
                      );
                    })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Sheet open={Boolean(selectedProspect)} onOpenChange={(open) => !open && closeDrawer()}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
          {selectedProspect && (
            <div className="flex min-h-full flex-col">
              <SheetHeader className="border-b border-slate-200 p-6 pr-12">
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                    {formatStatusLabel(selectedProspect.status)}
                  </Badge>
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                    {getSubmarketLabel(selectedProspect.submarketId)}
                  </Badge>
                  <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
                  {formatLastTouchLabel(selectedLatestInteraction)}
                </Badge>
              </div>
              <SheetTitle className="text-2xl font-bold text-slate-950">
                {drawerCopy[drawerMode].title}
              </SheetTitle>
              <SheetDescription>
                <span className="font-medium text-slate-900">{getProspectDisplayName(selectedProspect)}</span>
                <span className="mx-1 text-slate-400">-</span>
                {drawerCopy[drawerMode].description}
              </SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-5 p-6">
                <section className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Wrench className="h-4 w-4 text-blue-600" />
                    Cleanup fields
                  </div>
                  <div className="grid gap-3">
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium text-slate-700">Business / property name</span>
                      <Input
                        value={drawerForm.businessName}
                        onChange={(event) => updateDrawerForm('businessName', event.target.value)}
                        placeholder={getProspectDisplayName(selectedProspect)}
                      />
                    </label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="grid gap-1 text-sm">
                        <span className="font-medium text-slate-700">Contact name</span>
                        <Input
                          value={drawerForm.contactName}
                          onChange={(event) => updateDrawerForm('contactName', event.target.value)}
                          placeholder="Add contact"
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="font-medium text-slate-700">Company</span>
                        <Input
                          value={drawerForm.contactCompany}
                          onChange={(event) => updateDrawerForm('contactCompany', event.target.value)}
                          placeholder="Add company"
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="font-medium text-slate-700">Phone</span>
                        <Input
                          ref={phoneInputRef}
                          value={drawerForm.contactPhone}
                          onChange={(event) => updateDrawerForm('contactPhone', event.target.value)}
                          placeholder="Add phone"
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="font-medium text-slate-700">Email</span>
                        <Input
                          ref={emailInputRef}
                          value={drawerForm.contactEmail}
                          onChange={(event) => updateDrawerForm('contactEmail', event.target.value)}
                          placeholder="Add email"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <label className="grid gap-1 text-sm">
                        <span className="font-medium text-slate-700">Submarket</span>
                        <Input
                          value={drawerForm.submarketId}
                          onChange={(event) => updateDrawerForm('submarketId', event.target.value)}
                          placeholder="SE, NW..."
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="font-medium text-slate-700">Building SF</span>
                        <Input
                          inputMode="numeric"
                          value={drawerForm.buildingSf}
                          onChange={(event) => updateDrawerForm('buildingSf', event.target.value)}
                          placeholder="0"
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="font-medium text-slate-700">Lot acres</span>
                        <Input
                          inputMode="decimal"
                          value={drawerForm.lotSizeAcres}
                          onChange={(event) => updateDrawerForm('lotSizeAcres', event.target.value)}
                          placeholder="0.00"
                        />
                      </label>
                    </div>
                    <Button
                      type="button"
                      className="w-full"
                      disabled={saveProspectMutation.isPending}
                      onClick={() => saveProspectMutation.mutate({ prospect: selectedProspect, values: drawerForm })}
                    >
                      {saveProspectMutation.isPending ? 'Saving...' : drawerCopy[drawerMode].primary}
                    </Button>
                  </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-3 text-sm font-semibold text-slate-900">Quick actions</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      className="gap-2"
                      disabled={logInteractionMutation.isPending}
                      onClick={() => logInteractionMutation.mutate({ prospect: selectedProspect, type: 'call', outcome: 'contacted', notes: 'Call logged from Knowledge Dashboard.' })}
                    >
                      <Phone className="h-4 w-4" />
                      {drawerMode === 'new' ? 'Log first call' : 'Log call'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      disabled={logInteractionMutation.isPending}
                      onClick={() => logInteractionMutation.mutate({ prospect: selectedProspect, type: 'email', outcome: 'contacted', notes: 'Email logged from Knowledge Dashboard.' })}
                    >
                      <Mail className="h-4 w-4" />
                      Log email
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={snoozeMutation.isPending}
                      onClick={() => snoozeMutation.mutate({ prospect: selectedProspect, days: 7 })}
                    >
                      Snooze 7d
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setLocation(`/app?prospectId=${encodeURIComponent(selectedProspect.id)}`)}
                    >
                      Open map
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {selectedProspect.contactPhone ? (
                      <Button type="button" variant="secondary" className="gap-2" asChild>
                        <a href={`tel:${selectedProspect.contactPhone}`}>
                          <Phone className="h-4 w-4" />
                          Call phone
                        </a>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={() => phoneInputRef.current?.focus()}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          Add phone
                        </span>
                      </Button>
                    )}
                    {selectedProspect.contactEmail ? (
                      <Button type="button" variant="secondary" className="gap-2" asChild>
                        <a href={`mailto:${selectedProspect.contactEmail}`}>
                          <Mail className="h-4 w-4" />
                          Send email
                        </a>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={() => emailInputRef.current?.focus()}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Add email
                        </span>
                      </Button>
                    )}
                  </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <MessageSquare className="h-4 w-4 text-blue-600" />
                    Add note
                  </div>
                  <Textarea
                    value={quickNote}
                    onChange={(event) => setQuickNote(event.target.value)}
                    placeholder="Add ownership intel, call notes, cleanup context..."
                    rows={4}
                  />
                  <Button
                    type="button"
                    className="mt-3 w-full"
                    disabled={logInteractionMutation.isPending || !quickNote.trim()}
                    onClick={() => logInteractionMutation.mutate({ prospect: selectedProspect, type: 'note', outcome: 'follow_up_later', notes: quickNote.trim() })}
                  >
                    Save note
                  </Button>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-3 text-sm font-semibold text-slate-900">Record details</div>
                  <div className="grid gap-3 text-sm">
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-slate-500">Contact</span>
                      <span className="text-right font-medium text-slate-900">
                        {selectedProspect.contactName || selectedProspect.contactCompany || 'Missing'}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-slate-500">Phone</span>
                      <span className="text-right font-medium text-slate-900">{selectedProspect.contactPhone || 'Missing'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-slate-500">Email</span>
                      <span className="text-right font-medium text-slate-900">{selectedProspect.contactEmail || 'Missing'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-slate-500">Building SF</span>
                      <span className="text-right font-medium text-slate-900">{selectedProspect.buildingSf?.toLocaleString() || 'Missing'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-slate-500">Lot size</span>
                      <span className="text-right font-medium text-slate-900">
                        {selectedProspect.lotSizeAcres ? `${selectedProspect.lotSizeAcres} ac` : 'Missing'}
                      </span>
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-3 text-sm font-semibold text-slate-900">Recent activity</div>
                  {selectedInteractions.length === 0 ? (
                    <p className="text-sm text-slate-500">No activity logged yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedInteractions.slice(-4).reverse().map((interaction) => (
                        <div key={interaction.id || `${interaction.date}-${interaction.type}`} className="rounded-md bg-slate-50 p-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold text-slate-900">{formatStatusLabel(interaction.type || 'activity')}</span>
                            <span className="text-xs text-slate-500">{formatLastTouchLabel(getInteractionDate(interaction))}</span>
                          </div>
                          {interaction.notes && <p className="mt-1 text-slate-600">{interaction.notes}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
