import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Modal, ModalContent, ModalHeader, ModalTitle } from '@/components/primitives/Modal';
import { Calendar, MapPin, Phone, Mail, Building2, Clock, Filter, Plus, MessageSquare, X, PhoneCall, Zap, CheckCircle, Undo2 } from 'lucide-react';
import { Prospect, ProspectStatusType, FollowUpTimeframeType, Submarket, ContactInteractionType, ContactInteractionRow } from '@level-cre/shared/schema';
import { apiRequest } from '@/lib/queryClient';

const FOLLOW_UP_LABELS: Record<FollowUpTimeframeType, string> = {
  '1_month': '1 Month',
  '3_month': '3 Months',
  '6_month': '6 Months',
  '1_year': '1 Year'
};

const STATUS_COLORS: Record<ProspectStatusType, string> = {
  prospect: '#FBBF24',
  contacted: '#3B82F6',
  listing: '#10B981',
  client: '#8B5CF6',
  no_go: '#EF4444'
};

// Helpers to compute due dates when missing or for client-side fallback
const timeframeToMonths: Record<FollowUpTimeframeType, number> = {
  '1_month': 1,
  '3_month': 3,
  '6_month': 6,
  '1_year': 12,
};

function addMonthsSafe(d: Date, months: number) {
  const date = new Date(d);
  const day = date.getDate();
  date.setMonth(date.getMonth() + months);
  if (date.getDate() < day) date.setDate(0);
  return date;
}

function computeFollowUpDue(anchorIso?: string, timeframe?: FollowUpTimeframeType) {
  if (!timeframe) return undefined;
  const months = timeframeToMonths[timeframe] ?? 3;
  const anchor = anchorIso ? new Date(anchorIso) : new Date();
  return addMonthsSafe(anchor, months).toISOString();
}

// Simple date helper used for due-soon windows and snoozing
function addDays(d: Date, days: number) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + days);
  return nd;
}

// Contact Interaction Modal Component
function ContactInteractionModal({ prospect, onClose }: { prospect: Prospect; onClose: () => void }) {
  const [interactionType, setInteractionType] = useState<string>('call');
  const [outcome, setOutcome] = useState<string>('contacted');
  const [notes, setNotes] = useState<string>('');
  const [nextFollowUp, setNextFollowUp] = useState<string>('');
  const queryClient = useQueryClient();

  const toIsoAtNoonUtc = (dateStr: string) => {
    // dateStr is expected as 'YYYY-MM-DD' from <input type="date" />
    if (!dateStr) return undefined;
    const iso = new Date(`${dateStr}T12:00:00Z`).toISOString();
    return iso;
  };

  const addInteractionMutation = useMutation({
    mutationFn: async (interaction: any) => {
      const res = await apiRequest('POST', '/api/interactions', {
        prospectId: prospect.id,
        date: new Date().toISOString(),
        type: interaction.type,
        outcome: interaction.outcome,
        notes: interaction.notes,
        nextFollowUp: interaction.nextFollowUp || undefined
      });
      return res.json();
    },
    onSuccess: async () => {
      try {
        if (nextFollowUp) {
          const iso = toIsoAtNoonUtc(nextFollowUp);
          if (iso) {
            await apiRequest('PATCH', `/api/prospects/${prospect.id}`, {
              followUpDueDate: iso,
            });
          }
        }
      } catch {}
      queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/interactions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/skills'] });
      queryClient.invalidateQueries({ queryKey: ['/api/skill-activities'] });
      onClose();
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addInteractionMutation.mutate({
      type: interactionType,
      outcome,
      notes,
      nextFollowUp
    });
  };

  return (
    <Modal open onOpenChange={onClose}>
      <ModalContent className="max-w-lg">
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Log Contact Interaction
          </ModalTitle>
          <p className="text-sm text-gray-600">{prospect.name}</p>
        </ModalHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="type">Contact Type</Label>
              <Select value={interactionType} onValueChange={setInteractionType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Phone Call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="outcome">Outcome</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="no_answer">No Answer</SelectItem>
                  <SelectItem value="left_message">Left Message</SelectItem>
                  <SelectItem value="scheduled_meeting">Scheduled Meeting</SelectItem>
                  <SelectItem value="not_interested">Not Interested</SelectItem>
                  <SelectItem value="follow_up_later">Follow Up Later</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe the interaction, key points discussed, etc."
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="nextFollowUp">Next Follow-Up Date (Optional)</Label>
            <Input
              id="nextFollowUp"
              type="date"
              value={nextFollowUp}
              onChange={(e) => setNextFollowUp(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={addInteractionMutation.isPending}
            >
              {addInteractionMutation.isPending ? 'Saving...' : 'Save Interaction'}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}

// Quick Engagement Component
function QuickEngagement({ prospect, allInteractions }: { prospect: Prospect; allInteractions: ContactInteractionRow[] }) {
  const [engagingType, setEngagingType] = useState<string | null>(null);
  const [showNextFollow, setShowNextFollow] = useState<boolean>(false);
  const [nextFollowUpDate, setNextFollowUpDate] = useState<string>(''); // YYYY-MM-DD
  const queryClient = useQueryClient();

  // Calculate interaction counts by type
  const prospectInteractions = allInteractions.filter(i => i.prospectId === prospect.id);
  const callCount = prospectInteractions.filter(i => i.type === 'call').length;
  const emailCount = prospectInteractions.filter(i => i.type === 'email').length;
  const lastInteraction = prospectInteractions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  const quickEngageMutation = useMutation({
    mutationFn: async (type: 'call' | 'email') => {
      const response = await apiRequest('POST', '/api/interactions', {
        prospectId: prospect.id,
        date: new Date().toISOString(),
        type,
        outcome: 'contacted',
        notes: `Quick ${type} engagement`,
        nextFollowUp: nextFollowUpDate || undefined,
      });
      return response.json();
    },
    onSuccess: async () => {
      try {
        if (nextFollowUpDate) {
          // Normalize to noon UTC to avoid TZ off-by-one
          const iso = new Date(`${nextFollowUpDate}T12:00:00Z`).toISOString();
          await apiRequest('PATCH', `/api/prospects/${prospect.id}`, { followUpDueDate: iso });
        }
      } catch {}
      queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/interactions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/skills'] });
      queryClient.invalidateQueries({ queryKey: ['/api/skill-activities'] });
      setEngagingType(null);
      setShowNextFollow(false);
      setNextFollowUpDate('');
    }
  });

  const undoMutation = useMutation({
    mutationFn: async () => {
      if (!lastInteraction) return;
      return apiRequest('DELETE', `/api/interactions/${lastInteraction.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/interactions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/skills'] });
      queryClient.invalidateQueries({ queryKey: ['/api/skill-activities'] });
    }
  });

  const handleQuickCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEngagingType('call');
    quickEngageMutation.mutate('call');
  };

  const handleQuickEmail = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEngagingType('email');
    quickEngageMutation.mutate('email');
  };

  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation();
    undoMutation.mutate();
  };

  return (
    <div className="flex items-center gap-1">
      {/* Toggle next follow-up date input */}
      <Button
        size="sm"
        variant="outline"
        onClick={(e) => { e.stopPropagation(); setShowNextFollow((s) => !s); }}
        className="flex items-center gap-1 transition-all px-2 hover:bg-amber-50 hover:border-amber-300"
        title="Set next follow-up date"
      >
        <Clock className="h-3 w-3" />
      </Button>

      {showNextFollow && (
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={nextFollowUpDate}
            onChange={(e) => { e.stopPropagation(); setNextFollowUpDate(e.target.value); }}
            className="h-7 text-xs"
          />
          {nextFollowUpDate && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => { e.stopPropagation(); setNextFollowUpDate(''); }}
              className="px-2"
              title="Clear date"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}

      {/* Phone Button with Call Count */}
      <Button
        size="sm"
        variant="outline"
        onClick={handleQuickCall}
        disabled={quickEngageMutation.isPending}
        className={`flex items-center gap-1 transition-all px-2 ${
          engagingType === 'call' ? 'bg-green-100 border-green-300' : 'hover:bg-blue-50 hover:border-blue-300'
        }`}
      >
        {quickEngageMutation.isPending && engagingType === 'call' ? (
          <Zap className="h-3 w-3 animate-spin" />
        ) : (
          <PhoneCall className="h-3 w-3" />
        )}
        <span className={`text-xs font-semibold px-1 py-0.5 rounded-full min-w-[16px] text-center ${
          callCount > 0 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
        }`}>
          {callCount}
        </span>
      </Button>
      
      {/* Email Button with Email Count */}
      <Button
        size="sm"
        variant="outline"
        onClick={handleQuickEmail}
        disabled={quickEngageMutation.isPending}
        className={`flex items-center gap-1 transition-all px-2 ${
          engagingType === 'email' ? 'bg-green-100 border-green-300' : 'hover:bg-orange-50 hover:border-orange-300'
        }`}
      >
        {quickEngageMutation.isPending && engagingType === 'email' ? (
          <Zap className="h-3 w-3 animate-spin" />
        ) : (
          <Mail className="h-3 w-3" />
        )}
        <span className={`text-xs font-semibold px-1 py-0.5 rounded-full min-w-[16px] text-center ${
          emailCount > 0 ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600'
        }`}>
          {emailCount}
        </span>
      </Button>

      {/* Undo Button - only show if there are interactions */}
      {prospectInteractions.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleUndo}
          disabled={undoMutation.isPending}
          className="flex items-center gap-1 transition-all px-2 hover:bg-red-50 hover:border-red-300"
          title="Undo last interaction"
        >
          {undoMutation.isPending ? (
            <Zap className="h-3 w-3 animate-spin" />
          ) : (
            <Undo2 className="h-3 w-3 text-red-600" />
          )}
        </Button>
      )}
    </div>
  );
}

function SnoozeButtons({ prospect }: { prospect: Prospect }) {
  const queryClient = useQueryClient();
  const snoozeMutation = useMutation({
    mutationFn: async (days: number) => {
      const d = addDays(new Date(), days);
      // Normalize to noon UTC
      const iso = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0)).toISOString();
      const res = await apiRequest('PATCH', `/api/prospects/${prospect.id}`, { followUpDueDate: iso });
      return res.json?.() ?? null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
    }
  });

  const btn = (label: string, days: number) => (
    <Button
      key={label}
      size="sm"
      variant="outline"
      className="px-2 text-[11px]"
      disabled={snoozeMutation.isPending}
      onClick={(e) => { e.stopPropagation(); snoozeMutation.mutate(days); }}
      title={`Snooze ${label}`}
    >
      {label}
    </Button>
  );

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-gray-500">Snooze:</span>
      {btn('1d', 1)}
      {btn('3d', 3)}
      {btn('1w', 7)}
    </div>
  );
}

export default function FollowUpPage() {
  const [selectedSubmarket, setSelectedSubmarket] = useState<string>('all');
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [showEngagementFilter, setShowEngagementFilter] = useState<string>('all'); // 'all', 'no_engagement', 'has_engagement'
  const [filterMode, setFilterMode] = useState<'client' | 'server'>('client'); // toggle between client vs server due filtering
  const [includeDueSoon, setIncludeDueSoon] = useState<boolean>(true);
  const [dueSoonDays, setDueSoonDays] = useState<number>(7);
  
  const effectiveMode = includeDueSoon ? 'client' : filterMode;
  const apiKey = effectiveMode === 'server' ? '/api/prospects?dueOnly=1' : '/api/prospects';
  const { data: prospects = [], isLoading } = useQuery<Prospect[]>({
    queryKey: [apiKey],
  });

  const { data: submarkets = [] } = useQuery<Submarket[]>({
    queryKey: ['/api/submarkets'],
  });

  // Get interaction counts for all prospects
  const { data: allInteractions = [] } = useQuery<ContactInteractionRow[]>({
    queryKey: ['/api/interactions'],
  });

  // Compute due date (prefer stored followUpDueDate; fall back to timeframe-based)
  const now = new Date();
  const getDueDate = (p: Prospect) => {
    const stored = p.followUpDueDate as string | undefined;
    if (stored) {
      const d = new Date(stored);
      if (!isNaN(d.getTime())) return d;
    }
    if (p.followUpTimeframe) {
      const anchor = p.lastContactDate || p.createdDate;
      const iso = computeFollowUpDue(anchor, p.followUpTimeframe);
      if (iso) {
        const d = new Date(iso);
        if (!isNaN(d.getTime())) return d;
      }
    }
    return null;
  };

  const getDueStatus = (p: Prospect): 'overdue' | 'today' | 'soon' | 'future' | null => {
    const due = getDueDate(p);
    if (!due) return null;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    if (due.getTime() < start.getTime()) return 'overdue';
    if (due.getTime() <= end.getTime()) return 'today';
    const soonCutoff = addDays(end, dueSoonDays).getTime();
    if (due.getTime() <= soonCutoff) return 'soon';
    return 'future';
  };

  // Base list: due today/overdue, plus optional due-soon
  const baseProspects = prospects.filter((p) => {
    const status = getDueStatus(p);
    return status === 'overdue' || status === 'today' || (includeDueSoon && status === 'soon');
  });

  // Apply engagement filter
  const engagementFilteredProspects = baseProspects.filter((prospect: Prospect) => {
    const prospectInteractions = allInteractions.filter(i => i.prospectId === prospect.id);
    
    if (showEngagementFilter === 'no_engagement') {
      return prospectInteractions.length === 0; // Only prospects with no interactions
    }
    if (showEngagementFilter === 'has_engagement') {
      return prospectInteractions.length > 0; // Only prospects with interactions
    }
    return true; // 'all' - show everything
  });

  // Apply submarket filter
  const filteredProspects = engagementFilteredProspects.filter((prospect: Prospect) => {
    if (selectedSubmarket === 'all') return true;
    if (selectedSubmarket === 'none') return !prospect.submarketId;
    return prospect.submarketId === selectedSubmarket;
  });

  // Sort by due date (soonest first)
  const sortedProspects = [...filteredProspects].sort((a, b) => {
    const ad = getDueDate(a)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bd = getDueDate(b)?.getTime() ?? Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return a.name.localeCompare(b.name);
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-lg text-gray-600">Loading follow-ups...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Follow-Up Schedule</h1>
            <p className="text-gray-600 mt-1">
              {filteredProspects.length} prospects 
              {showEngagementFilter === 'no_engagement' && ' with no engagement'}
              {showEngagementFilter === 'has_engagement' && ' with logged activity'}
              {showEngagementFilter === 'all' && ' scheduled for follow-up'}
              {selectedSubmarket !== 'all' && (
                <span className="ml-2">
                  in {selectedSubmarket === 'none' ? 'no submarket' : submarkets.find(s => s.id === selectedSubmarket)?.name || selectedSubmarket}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Filter Mode (Client vs Server) */}
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <Select value={filterMode} onValueChange={(v) => setFilterMode(v as 'client' | 'server')}>
                <SelectTrigger className="h-8 w-[170px]">
                  <SelectValue placeholder="Filter mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client filter</SelectItem>
                  <SelectItem value="server">Server filter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Engagement Filter */}
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-gray-500" />
              <Select value={showEngagementFilter} onValueChange={setShowEngagementFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by engagement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Prospects</SelectItem>
                  <SelectItem value="no_engagement">No Engagement</SelectItem>
                  <SelectItem value="has_engagement">Has Engagement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Due Soon Controls */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Due soon</span>
              <Select value={includeDueSoon ? 'on' : 'off'} onValueChange={(v) => setIncludeDueSoon(v === 'on')}>
                <SelectTrigger className="h-8 w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">On</SelectItem>
                  <SelectItem value="off">Off</SelectItem>
                </SelectContent>
              </Select>
              {includeDueSoon && (
                <Select value={String(dueSoonDays)} onValueChange={(v) => setDueSoonDays(Number(v))}>
                  <SelectTrigger className="h-8 w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 days</SelectItem>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            
            {/* Submarket Filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <Select value={selectedSubmarket} onValueChange={setSelectedSubmarket}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter by submarket" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Submarkets</SelectItem>
                  <SelectItem value="none">No Submarket</SelectItem>
                  {submarkets.map((submarket) => (
                    <SelectItem key={submarket.id} value={submarket.id}>
                      <div className="flex items-center gap-2">
                        {submarket.color && (
                          <div 
                            className="w-3 h-3 rounded-full border" 
                            style={{ backgroundColor: submarket.color }}
                          />
                        )}
                        {submarket.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              <span className="text-sm text-gray-600">
                {new Date().toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredProspects.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {baseProspects.length === 0 ? 'No Prospects Found' : 'No Results for Current Filters'}
            </h3>
            <p className="text-gray-600">
              {showEngagementFilter === 'no_engagement' 
                ? 'All prospects have some form of engagement recorded.'
                : baseProspects.length === 0 
                  ? 'Add follow-up timeframes to your prospects to see them here.'
                  : 'Try adjusting your filters to view other prospects.'
              }
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sortedProspects.map((prospect) => (
                <Card 
                  key={prospect.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedProspect(prospect)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg font-semibold text-gray-900 mb-2">
                          {prospect.name}
                        </CardTitle>
                        <div className="flex items-center gap-2 mb-2">
                          <div 
                            className="w-3 h-3 rounded-full border"
                            style={{ backgroundColor: STATUS_COLORS[prospect.status] }}
                          />
                          <span className="text-sm capitalize text-gray-600">
                            {prospect.status.replace('_', ' ')}
                          </span>
                        </div>
                        {(() => {
                          const status = getDueStatus(prospect);
                          const classes = status === 'overdue'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : (status === 'today' || status === 'soon')
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-green-50 text-green-700 border-green-200';
                          const label = prospect.followUpTimeframe
                            ? FOLLOW_UP_LABELS[prospect.followUpTimeframe]
                            : status === 'overdue'
                              ? 'Overdue'
                              : status === 'today'
                                ? 'Due Today'
                                : status === 'soon'
                                  ? 'Due Soon'
                                  : 'Upcoming';
                          return (
                            <Badge variant="outline" className={classes}>
                              <Clock className="h-3 w-3 mr-1" />
                              {label}
                            </Badge>
                          );
                        })()}
                      </div>
                      
                      {/* Quick Engagement & Snooze */}
                      <div className="flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <QuickEngagement prospect={prospect} allInteractions={allInteractions} />
                        <SnoozeButtons prospect={prospect} />
                      </div>
                    </div>
                </CardHeader>
                
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {/* Submarket */}
                    {prospect.submarketId && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <MapPin className="h-4 w-4" />
                        <span className="capitalize">{prospect.submarketId}</span>
                      </div>
                    )}

                    {/* Contact Information */}
                    {(prospect.contactName || prospect.contactEmail || prospect.contactPhone || prospect.contactCompany) && (
                      <div className="border-t pt-3 space-y-2">
                        {prospect.contactName && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <span className="font-medium">Contact:</span>
                            <span>{prospect.contactName}</span>
                          </div>
                        )}
                        
                        {prospect.contactCompany && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Building2 className="h-4 w-4" />
                            <span>{prospect.contactCompany}</span>
                          </div>
                        )}
                        
                        <div className="flex gap-4">
                          {prospect.contactEmail && (
                            <a 
                              href={`mailto:${prospect.contactEmail}`}
                              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                            >
                              <Mail className="h-4 w-4" />
                              <span>Email</span>
                            </a>
                          )}
                          
                          {prospect.contactPhone && (
                            <a 
                              href={`tel:${prospect.contactPhone}`}
                              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                            >
                              <Phone className="h-4 w-4" />
                              <span>Call</span>
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Notes Preview */}
                    {prospect.notes && (
                      <div className="border-t pt-3">
                        <p className="text-sm text-gray-600 line-clamp-3">
                          {prospect.notes}
                        </p>
                      </div>
                    )}

                    {/* Created Date */}
                    <div className="text-xs text-gray-500 border-t pt-2">
                      Added: {new Date(prospect.createdDate).toLocaleDateString()}
                      {(() => {
                        const d = getDueDate(prospect);
                        return d ? ` · Due: ${d.toLocaleDateString()}` : '';
                      })()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Contact Interaction Modal */}
      {selectedProspect && (
        <ContactInteractionModal 
          prospect={selectedProspect} 
          onClose={() => setSelectedProspect(null)} 
        />
      )}
    </div>
  );
}
