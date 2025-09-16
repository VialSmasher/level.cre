import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calendar, MapPin, Phone, Mail, Building2, Clock, Filter, Plus, MessageSquare, X, PhoneCall, Zap, CheckCircle, Undo2 } from 'lucide-react';
import { Prospect, ProspectStatusType, FollowUpTimeframeType, Submarket, ContactInteractionType, ContactInteractionRow } from '@shared/schema';
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

// Contact Interaction Modal Component
function ContactInteractionModal({ prospect, onClose }: { prospect: Prospect; onClose: () => void }) {
  const [interactionType, setInteractionType] = useState<string>('call');
  const [outcome, setOutcome] = useState<string>('contacted');
  const [notes, setNotes] = useState<string>('');
  const [nextFollowUp, setNextFollowUp] = useState<string>('');
  const queryClient = useQueryClient();

  const addInteractionMutation = useMutation({
    mutationFn: async (interaction: any) => {
      return fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospectId: prospect.id,
          date: new Date().toISOString(),
          type: interaction.type,
          outcome: interaction.outcome,
          notes: interaction.notes,
          nextFollowUp: interaction.nextFollowUp || undefined
        })
      }).then(res => res.json());
    },
    onSuccess: () => {
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
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Log Contact Interaction
          </DialogTitle>
          <p className="text-sm text-gray-600">{prospect.name}</p>
        </DialogHeader>
        
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
      </DialogContent>
    </Dialog>
  );
}

// Quick Engagement Component
function QuickEngagement({ prospect, allInteractions }: { prospect: Prospect; allInteractions: ContactInteractionRow[] }) {
  const [engagingType, setEngagingType] = useState<string | null>(null);
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
        notes: `Quick ${type} engagement`
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/interactions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/skills'] });
      queryClient.invalidateQueries({ queryKey: ['/api/skill-activities'] });
      setEngagingType(null);
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

export default function FollowUpPage() {
  const [selectedSubmarket, setSelectedSubmarket] = useState<string>('all');
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [showEngagementFilter, setShowEngagementFilter] = useState<string>('all'); // 'all', 'no_engagement', 'has_engagement'
  
  const { data: prospects = [], isLoading } = useQuery<Prospect[]>({
    queryKey: ['/api/prospects'],
  });

  const { data: submarkets = [] } = useQuery<Submarket[]>({
    queryKey: ['/api/submarkets'],
  });

  // Get interaction counts for all prospects
  const { data: allInteractions = [] } = useQuery<ContactInteractionRow[]>({
    queryKey: ['/api/interactions'],
  });

  // Filter prospects that have follow-up timeframes OR show those with no engagement
  const baseProspects = showEngagementFilter === 'no_engagement' 
    ? prospects // Show all prospects when filtering by engagement
    : prospects.filter((prospect: Prospect) => prospect.followUpTimeframe);

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

  // Sort by follow-up timeframe (shortest first)
  const sortedProspects = [...filteredProspects].sort((a, b) => {
    const timeframeOrder: Record<FollowUpTimeframeType, number> = { '1_month': 1, '3_month': 2, '6_month': 3, '1_year': 4 };
    return timeframeOrder[a.followUpTimeframe!] - timeframeOrder[b.followUpTimeframe!];
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
                        <Badge 
                          variant="outline" 
                          className="bg-blue-50 text-blue-700 border-blue-200"
                        >
                          <Clock className="h-3 w-3 mr-1" />
                          {FOLLOW_UP_LABELS[prospect.followUpTimeframe!]}
                        </Badge>
                      </div>
                      
                      {/* Quick Engagement Actions */}
                      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                        <QuickEngagement prospect={prospect} allInteractions={allInteractions} />
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