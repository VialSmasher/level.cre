import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Modal, ModalContent, ModalHeader, ModalTitle } from '@/components/primitives/Modal';
import { ArrowRight, Calendar, MapPin, Phone, Mail, Building2, Clock, Filter, Plus, MessageSquare, X, PhoneCall, Zap, CheckCircle, Undo2, Users } from 'lucide-react';
import { Prospect, ProspectStatusType, FollowUpTimeframeType, Submarket, ContactInteractionType, ContactInteractionRow } from '@level-cre/shared/schema';
import { apiRequest } from '@/lib/queryClient';
import { getProspectDisplayName, getProspectSecondaryName } from '@/lib/prospectDisplay';
import { VoiceDictationButton } from '@/components/VoiceDictationButton';
import { logBrokerActivity, type BrokerActivityOutcome } from '@/lib/brokerActions';

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

function daysBetweenCalendarDates(from: Date, to: Date) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDueBadgeLabel(dueDate: Date | null, now = new Date()) {
  if (!dueDate) return 'No follow-up set';
  const daysUntil = daysBetweenCalendarDates(now, dueDate);
  if (daysUntil < 0) return `Overdue by ${Math.abs(daysUntil)}d`;
  if (daysUntil === 0) return 'Due today';
  if (daysUntil === 1) return 'Due tomorrow';
  return `Due in ${daysUntil}d`;
}

function toNoonUtcIso(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0)).toISOString();
}

function addDaysIsoFromNow(days: number) {
  return toNoonUtcIso(addDays(new Date(), days));
}

function appendTranscript(existing: string, text: string) {
  return existing ? `${existing.trimEnd()} ${text}` : text;
}

function latestInteractionDate(interactions: ContactInteractionRow[]) {
  const timestamps = interactions
    .map((interaction) => new Date(interaction.date || interaction.createdAt || '').getTime())
    .filter((timestamp) => Number.isFinite(timestamp));
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

function formatLastTouch(date: Date | null) {
  if (!date) return 'No activity';
  const days = daysBetweenCalendarDates(date, new Date());
  if (days <= 0) return 'Touched today';
  if (days === 1) return 'Last touch yesterday';
  return `Last touch ${days}d ago`;
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
        const patch: Record<string, string> = {
          lastContactDate: new Date().toISOString(),
        };
        if (nextFollowUp) {
          const iso = toIsoAtNoonUtc(nextFollowUp);
          if (iso) {
            patch.followUpDueDate = iso;
          }
        }
        await apiRequest('PATCH', `/api/prospects/${prospect.id}`, patch);
      } catch {}
      queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/interactions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/skills'] });
      queryClient.invalidateQueries({ queryKey: ['/api/skill-activities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats/header'] });
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
          <p className="text-sm text-gray-600">{getProspectDisplayName(prospect)}</p>
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
            <div className="mb-1 flex items-center justify-between gap-2">
              <Label htmlFor="notes">Notes</Label>
              <VoiceDictationButton
                className="h-7 w-7 p-0"
                disabled={addInteractionMutation.isPending}
                onTranscript={(text) => setNotes((prev) => prev ? `${prev.trimEnd()} ${text}` : text)}
              />
            </div>
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
type QuickActionType = 'call' | 'email' | 'meeting' | 'note';
type QuickOutcome = 'contacted' | 'no_answer' | 'left_message' | 'scheduled_meeting' | 'not_interested' | 'follow_up_later';
type NextStepKey = 'tomorrow' | '3d' | '1w' | '1m' | 'custom' | 'none';

const QUICK_OUTCOMES: Array<{ value: QuickOutcome; label: string }> = [
  { value: 'contacted', label: 'Connected' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'left_message', label: 'Left VM' },
  { value: 'scheduled_meeting', label: 'Meeting set' },
  { value: 'follow_up_later', label: 'Later' },
  { value: 'not_interested', label: 'Bad fit' },
];

const NEXT_STEPS: Array<{ value: NextStepKey; label: string }> = [
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: '3d', label: '3d' },
  { value: '1w', label: '1w' },
  { value: '1m', label: '1mo' },
  { value: 'custom', label: 'Custom' },
  { value: 'none', label: 'No follow-up' },
];

function nextStepToIso(nextStep: NextStepKey, customDate: string) {
  if (nextStep === 'none') return null;
  if (nextStep === 'custom') {
    return customDate ? new Date(`${customDate}T12:00:00Z`).toISOString() : undefined;
  }
  if (nextStep === 'tomorrow') return addDaysIsoFromNow(1);
  if (nextStep === '3d') return addDaysIsoFromNow(3);
  if (nextStep === '1w') return addDaysIsoFromNow(7);
  if (nextStep === '1m') return toNoonUtcIso(addMonthsSafe(new Date(), 1));
  return undefined;
}

function QuickEngagement({ prospect, prospectInteractions }: { prospect: Prospect; prospectInteractions: ContactInteractionRow[] }) {
  const [activeAction, setActiveAction] = useState<QuickActionType | null>(null);
  const [outcome, setOutcome] = useState<QuickOutcome>('contacted');
  const [nextStep, setNextStep] = useState<NextStepKey>('1w');
  const [customDate, setCustomDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [savedMessage, setSavedMessage] = useState<string>('');
  const queryClient = useQueryClient();

  // Calculate interaction counts by type
  const callCount = prospectInteractions.filter(i => i.type === 'call').length;
  const emailCount = prospectInteractions.filter(i => i.type === 'email').length;
  const meetingCount = prospectInteractions.filter(i => i.type === 'meeting').length;
  const lastInteraction = prospectInteractions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  const quickEngageMutation = useMutation({
    mutationFn: async () => {
      if (!activeAction) return null;
      const nextFollowUpIso = nextStepToIso(nextStep, customDate);
      const actionLabel = activeAction === 'call'
        ? 'Call'
        : activeAction === 'email'
          ? 'Email'
          : activeAction === 'meeting'
            ? 'Meeting'
            : 'Note';
      const outcomeLabel = QUICK_OUTCOMES.find(item => item.value === outcome)?.label ?? outcome;
      const response = await apiRequest('POST', '/api/interactions', {
        prospectId: prospect.id,
        date: new Date().toISOString(),
        type: activeAction,
        outcome,
        notes: notes.trim() || `${actionLabel} logged: ${outcomeLabel}`,
        nextFollowUp: nextFollowUpIso || undefined,
      });
      const interaction = await response.json();
      const patch: Record<string, string | null> = {
        lastContactDate: new Date().toISOString(),
      };
      if (nextFollowUpIso !== undefined) {
        patch.followUpDueDate = nextFollowUpIso;
      }
      await apiRequest('PATCH', `/api/prospects/${prospect.id}`, patch);
      return { interaction, nextFollowUpIso, actionLabel };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/prospects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/interactions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/skills'] });
      queryClient.invalidateQueries({ queryKey: ['/api/skill-activities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats/header'] });
      const nextLabel = result?.nextFollowUpIso
        ? `Next touch: ${new Date(result.nextFollowUpIso).toLocaleDateString()}`
        : nextStep === 'none'
          ? 'Follow-up cleared'
          : 'Activity logged';
      setSavedMessage(`${result?.actionLabel ?? 'Activity'} logged. ${nextLabel}.`);
      setActiveAction(null);
      setOutcome('contacted');
      setNextStep('1w');
      setCustomDate('');
      setNotes('');
      window.setTimeout(() => setSavedMessage(''), 3200);
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
      queryClient.invalidateQueries({ queryKey: ['/api/stats/header'] });
    }
  });

  const startAction = (e: React.MouseEvent, type: QuickActionType) => {
    e.stopPropagation();
    setSavedMessage('');
    setActiveAction(type);
    setOutcome(type === 'meeting' ? 'scheduled_meeting' : 'contacted');
    setNextStep(type === 'note' ? '3d' : '1w');
  };

  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation();
    undoMutation.mutate();
  };

  return (
    <div className="w-full max-w-[280px] space-y-2">
      <div className="flex items-center justify-end gap-1">
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => startAction(e, 'call')}
          disabled={quickEngageMutation.isPending}
          className="flex items-center gap-1 px-2 transition-all hover:bg-blue-50 hover:border-blue-300"
          title="Log call"
        >
          <PhoneCall className="h-3 w-3" />
          <span className="text-xs font-semibold">{callCount}</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => startAction(e, 'email')}
          disabled={quickEngageMutation.isPending}
          className="flex items-center gap-1 px-2 transition-all hover:bg-orange-50 hover:border-orange-300"
          title="Log email"
        >
          <Mail className="h-3 w-3" />
          <span className="text-xs font-semibold">{emailCount}</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => startAction(e, 'meeting')}
          disabled={quickEngageMutation.isPending}
          className="flex items-center gap-1 px-2 transition-all hover:bg-violet-50 hover:border-violet-300"
          title="Log meeting"
        >
          <Users className="h-3 w-3" />
          <span className="text-xs font-semibold">{meetingCount}</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => startAction(e, 'note')}
          disabled={quickEngageMutation.isPending}
          className="px-2 transition-all hover:bg-slate-50 hover:border-slate-300"
          title="Add note"
        >
          <MessageSquare className="h-3 w-3" />
        </Button>
        {prospectInteractions.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleUndo}
            disabled={undoMutation.isPending}
            className="px-2 transition-all hover:bg-red-50 hover:border-red-300"
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

      {savedMessage && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-800 shadow-sm animate-in fade-in zoom-in-95">
          <CheckCircle className="mr-1 inline h-3 w-3" />
          {savedMessage}
        </div>
      )}

      {activeAction && (
        <div className="rounded-md border border-blue-100 bg-white p-3 text-left shadow-sm animate-in fade-in slide-in-from-top-1">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {activeAction === 'call' ? 'Log call' : activeAction === 'email' ? 'Log email' : activeAction === 'meeting' ? 'Log meeting' : 'Add note'}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2"
              onClick={(e) => { e.stopPropagation(); setActiveAction(null); }}
              title="Close"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>

          <div className="mb-3 flex flex-wrap gap-1">
            {QUICK_OUTCOMES.map(item => (
              <Button
                key={item.value}
                size="sm"
                variant={outcome === item.value ? 'default' : 'outline'}
                className="h-7 px-2 text-[11px]"
                onClick={(e) => { e.stopPropagation(); setOutcome(item.value); }}
              >
                {item.label}
              </Button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap gap-1">
            {NEXT_STEPS.map(item => (
              <Button
                key={item.value}
                size="sm"
                variant={nextStep === item.value ? 'default' : 'outline'}
                className="h-7 px-2 text-[11px]"
                onClick={(e) => { e.stopPropagation(); setNextStep(item.value); }}
              >
                {item.label}
              </Button>
            ))}
          </div>

          {nextStep === 'custom' && (
            <Input
              type="date"
              value={customDate}
              onChange={(e) => { e.stopPropagation(); setCustomDate(e.target.value); }}
              onClick={(e) => e.stopPropagation()}
              className="mb-3 h-8 text-xs"
            />
          )}

          <div className="mb-3 flex gap-2">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Optional note"
              className="h-8 text-xs"
            />
            <VoiceDictationButton
              className="h-8 w-8 shrink-0 p-0"
              disabled={quickEngageMutation.isPending}
              onTranscript={(text) => setNotes((prev) => prev ? `${prev.trimEnd()} ${text}` : text)}
            />
          </div>

          <Button
            size="sm"
            className="h-8 w-full"
            disabled={quickEngageMutation.isPending || (nextStep === 'custom' && !customDate)}
            onClick={(e) => { e.stopPropagation(); quickEngageMutation.mutate(); }}
          >
            {quickEngageMutation.isPending ? (
              <>
                <Zap className="h-3 w-3 animate-spin" />
                Saving
              </>
            ) : (
              <>
                <CheckCircle className="h-3 w-3" />
                Log and move forward
              </>
            )}
          </Button>
        </div>
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

type SmartCallCandidate = {
  prospect: Prospect;
  score: number;
  reasons: string[];
  interactions: ContactInteractionRow[];
  dueDate: Date | null;
  dueStatus: 'overdue' | 'today' | 'soon' | 'future' | null;
  latestTouch: Date | null;
};

function SmartCallQueue({
  candidates,
  selectedSubmarketLabel,
}: {
  candidates: SmartCallCandidate[];
  selectedSubmarketLabel: string | null;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [outcome, setOutcome] = useState<BrokerActivityOutcome>('contacted');
  const [nextStep, setNextStep] = useState<NextStepKey>('1w');
  const [customDate, setCustomDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lastSaved, setLastSaved] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(candidates.length - 1, 0)));
  }, [candidates.length]);

  const active = candidates[activeIndex] ?? null;
  const prospect = active?.prospect ?? null;

  const callMutation = useMutation({
    mutationFn: async () => {
      if (!prospect) return null;
      const nextFollowUpIso = nextStepToIso(nextStep, customDate);
      const result = await logBrokerActivity({
        prospect,
        type: 'call',
        outcome,
        notes: notes.trim() || `Smart queue call: ${QUICK_OUTCOMES.find(item => item.value === outcome)?.label ?? outcome}`,
        nextFollowUp: nextFollowUpIso,
      });
      return { ...result, nextFollowUpIso };
    },
    onSuccess: async () => {
      if (!prospect) return;
      setLastSaved(`${getProspectDisplayName(prospect)} logged`);
      setNotes('');
      setOutcome('contacted');
      setNextStep('1w');
      setCustomDate('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/prospects'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/interactions'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/skills'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/skill-activities'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/stats/header'] }),
      ]);
      setActiveIndex((index) => Math.min(index + 1, Math.max(candidates.length - 1, 0)));
      window.setTimeout(() => setLastSaved(''), 2800);
    },
  });

  const skip = () => {
    setNotes('');
    setActiveIndex((index) => Math.min(index + 1, Math.max(candidates.length - 1, 0)));
  };

  const previous = () => {
    setActiveIndex((index) => Math.max(index - 1, 0));
  };

  if (!active || !prospect) {
    return (
      <section className="mb-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <PhoneCall className="h-4 w-4 text-blue-600" />
          Smart Call Queue
        </div>
        <p className="mt-2 text-sm text-slate-500">No callable prospects match the current filters.</p>
      </section>
    );
  }

  return (
    <section className="mb-5 rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Badge variant="outline" className="mb-2 gap-2 rounded-full border-blue-200 bg-blue-50 px-3 py-1 text-blue-700">
                <PhoneCall className="h-3.5 w-3.5" />
                Smart Call Queue
              </Badge>
              <h2 className="text-xl font-bold text-slate-950">{getProspectDisplayName(prospect)}</h2>
              {getProspectSecondaryName(prospect) && (
                <p className="mt-1 text-sm text-slate-500">{getProspectSecondaryName(prospect)}</p>
              )}
            </div>
            <div className="text-sm font-medium text-slate-500">
              {activeIndex + 1} / {candidates.length}
              {selectedSubmarketLabel ? ` in ${selectedSubmarketLabel}` : ''}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {active.reasons.map((reason) => (
              <Badge key={reason} variant="outline" className="bg-slate-50 text-slate-700">{reason}</Badge>
            ))}
            <Badge variant="outline" className="bg-white text-slate-600">{active.interactions.length} touches</Badge>
            <Badge variant="outline" className="bg-white text-slate-600">{formatLastTouch(active.latestTouch)}</Badge>
          </div>

          <div className="mb-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold uppercase text-slate-500">Contact</div>
              <div className="mt-1 font-medium text-slate-900">{prospect.contactName || prospect.contactCompany || 'Missing contact'}</div>
              <div className="mt-2 flex flex-wrap gap-3">
                {prospect.contactPhone ? (
                  <a className="inline-flex items-center gap-1 text-blue-600 hover:underline" href={`tel:${prospect.contactPhone}`}>
                    <Phone className="h-3.5 w-3.5" />
                    {prospect.contactPhone}
                  </a>
                ) : <span className="text-slate-500">No phone</span>}
                {prospect.contactEmail ? (
                  <a className="inline-flex items-center gap-1 text-blue-600 hover:underline" href={`mailto:${prospect.contactEmail}`}>
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </a>
                ) : <span className="text-slate-500">No email</span>}
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold uppercase text-slate-500">Asset</div>
              <div className="mt-1 font-medium text-slate-900">{prospect.contactCompany || prospect.businessName || prospect.status.replace('_', ' ')}</div>
              <div className="mt-2 text-slate-600">
                {active.dueDate ? formatDueBadgeLabel(active.dueDate) : 'No scheduled follow-up'}
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
            <div>
              <Label className="text-xs font-medium text-slate-700">Outcome</Label>
              <Select value={outcome} onValueChange={(value) => setOutcome(value as BrokerActivityOutcome)}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUICK_OUTCOMES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <Label className="text-xs font-medium text-slate-700">Call note</Label>
                <VoiceDictationButton
                  className="h-8 w-8 p-0"
                  disabled={callMutation.isPending}
                  onTranscript={(text) => setNotes((prev) => appendTranscript(prev, text))}
                />
              </div>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="Dictate or type the useful bit from the call..."
                className="resize-none"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1">
              {NEXT_STEPS.map((item) => (
                <Button
                  key={item.value}
                  type="button"
                  size="sm"
                  variant={nextStep === item.value ? 'default' : 'outline'}
                  className="h-8 px-2 text-xs"
                  onClick={() => setNextStep(item.value)}
                >
                  {item.label}
                </Button>
              ))}
              {nextStep === 'custom' && (
                <Input
                  type="date"
                  value={customDate}
                  onChange={(event) => setCustomDate(event.target.value)}
                  className="h-8 w-[150px] text-xs"
                />
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={previous} disabled={activeIndex === 0 || callMutation.isPending}>
                Previous
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={skip} disabled={activeIndex >= candidates.length - 1 || callMutation.isPending}>
                Skip
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={callMutation.isPending || (nextStep === 'custom' && !customDate)}
                onClick={() => callMutation.mutate()}
              >
                {callMutation.isPending ? 'Saving...' : 'Log call + next'}
              </Button>
            </div>
          </div>
          {lastSaved && (
            <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-800">
              <CheckCircle className="mr-1 inline h-3.5 w-3.5" />
              {lastSaved}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 bg-slate-50 p-3 lg:border-l lg:border-t-0">
          <div className="mb-2 px-1 text-xs font-semibold uppercase text-slate-500">Next up</div>
          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {candidates.slice(0, 8).map((candidate, index) => (
              <button
                key={candidate.prospect.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`w-full rounded-md border p-3 text-left transition-colors ${index === activeIndex ? 'border-blue-300 bg-white shadow-sm' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-slate-950">{getProspectDisplayName(candidate.prospect)}</span>
                  <span className="shrink-0 text-xs font-medium text-blue-600">{candidate.score}</span>
                </div>
                <div className="mt-1 truncate text-xs text-slate-500">{candidate.reasons.slice(0, 2).join(' • ')}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function FollowUpPage() {
  const [selectedSubmarket, setSelectedSubmarket] = useState<string>('all');
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [showEngagementFilter, setShowEngagementFilter] = useState<string>('all'); // 'all', 'no_engagement', 'has_engagement'
  const [dueFilter, setDueFilter] = useState<'due_soon' | 'due_only' | 'all'>('due_soon');
  const [dueSoonDays, setDueSoonDays] = useState<number>(7);
  const [activeQueue, setActiveQueue] = useState<'overdue' | 'today' | 'week' | 'no_activity' | 'no_contact'>('overdue');
  
  const apiKey = '/api/prospects';
  const { data: prospects = [], isLoading } = useQuery<Prospect[]>({
    queryKey: [apiKey],
  });

  const { data: submarkets = [] } = useQuery<Submarket[]>({
    queryKey: ['/api/submarkets'],
  });

  const normalizeSubmarketValue = (value: string | null | undefined) =>
    (value ?? '').toString().trim().toLowerCase();

  const resolveSubmarketName = (value: string | null | undefined) => {
    if (!value) return null;
    const normalizedValue = normalizeSubmarketValue(value);
    if (!normalizedValue || normalizedValue === 'none') return null;
    const byId = submarkets.find((s) => String(s.id) === String(value));
    if (byId) return byId.name;
    const byName = submarkets.find((s) => normalizeSubmarketValue(s.name) === normalizedValue);
    return byName?.name ?? value;
  };

  // Get interaction counts for all prospects
  const { data: allInteractions = [] } = useQuery<ContactInteractionRow[]>({
    queryKey: ['/api/interactions'],
  });

  const safeInteractions = useMemo(
    () => Array.isArray(allInteractions) ? allInteractions : [],
    [allInteractions],
  );
  const safeProspects = useMemo(() => Array.isArray(prospects) ? prospects : [], [prospects]);

  const interactionsByProspectId = useMemo(() => {
    const grouped = new Map<string, ContactInteractionRow[]>();
    for (const interaction of safeInteractions) {
      const list = grouped.get(interaction.prospectId) ?? [];
      list.push(interaction);
      grouped.set(interaction.prospectId, list);
    }
    return grouped;
  }, [safeInteractions]);

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

  // Base list respecting selected due filter
  const hasContact = (p: Prospect) => Boolean(p.contactName || p.contactCompany || p.contactEmail || p.contactPhone);

  const queueCounts = useMemo(() => {
    const counts = {
      overdue: 0,
      today: 0,
      week: 0,
      no_activity: 0,
      no_contact: 0,
    };
    for (const prospect of safeProspects) {
      const status = getDueStatus(prospect);
      if (status === 'overdue') counts.overdue += 1;
      if (status === 'today') counts.today += 1;
      if (status === 'overdue' || status === 'today' || status === 'soon') counts.week += 1;
      if (!(interactionsByProspectId.get(prospect.id)?.length)) counts.no_activity += 1;
      if (!hasContact(prospect)) counts.no_contact += 1;
    }
    return counts;
  }, [safeProspects, interactionsByProspectId, dueSoonDays]);

  const baseProspects = safeProspects.filter((p) => {
    if (dueFilter === 'all') return true;
    const status = getDueStatus(p);
    if (!status) return false;
    if (dueFilter === 'due_only') return status === 'overdue' || status === 'today';
    // dueFilter === 'due_soon'
    return status === 'overdue' || status === 'today' || status === 'soon';
  });

  // Apply engagement filter
  const engagementFilteredProspects = baseProspects.filter((prospect: Prospect) => {
    const prospectInteractions = interactionsByProspectId.get(prospect.id) ?? [];
    
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
    const prospectSubmarketId = prospect.submarketId ? String(prospect.submarketId) : null;
    if (selectedSubmarket === 'none') return prospectSubmarketId === null;
    if (!prospectSubmarketId) return false;

    const normalizedProspect = normalizeSubmarketValue(prospectSubmarketId);
    const normalizedSelectedId = normalizeSubmarketValue(selectedSubmarket);
    const resolvedSelectedName = resolveSubmarketName(selectedSubmarket);
    const normalizedSelectedName = resolvedSelectedName ? normalizeSubmarketValue(resolvedSelectedName) : null;

    if (normalizedProspect === normalizedSelectedId) return true;
    if (normalizedSelectedName && normalizedProspect === normalizedSelectedName) return true;
    return false;
  });

  const selectedSubmarketLabel = (() => {
    if (selectedSubmarket === 'all') return null;
    if (selectedSubmarket === 'none') return 'no submarket';
    return resolveSubmarketName(selectedSubmarket) ?? selectedSubmarket;
  })();

  const smartCallCandidates = useMemo<SmartCallCandidate[]>(() => {
    const submarketScopedProspects = safeProspects.filter((prospect) => {
      if (prospect.status === 'no_go') return false;
      if (selectedSubmarket === 'all') return true;
      const prospectSubmarketId = prospect.submarketId ? String(prospect.submarketId) : null;
      if (selectedSubmarket === 'none') return prospectSubmarketId === null;
      if (!prospectSubmarketId) return false;

      const normalizedProspect = normalizeSubmarketValue(prospectSubmarketId);
      const normalizedSelectedId = normalizeSubmarketValue(selectedSubmarket);
      const resolvedSelectedName = resolveSubmarketName(selectedSubmarket);
      const normalizedSelectedName = resolvedSelectedName ? normalizeSubmarketValue(resolvedSelectedName) : null;

      return normalizedProspect === normalizedSelectedId || Boolean(normalizedSelectedName && normalizedProspect === normalizedSelectedName);
    });

    return submarketScopedProspects
      .map((prospect) => {
        const interactions = interactionsByProspectId.get(prospect.id) ?? [];
        const dueDate = getDueDate(prospect);
        const dueStatus = getDueStatus(prospect);
        const latestTouch = latestInteractionDate(interactions);
        const reasons: string[] = [];
        let score = 0;

        if (dueStatus === 'overdue') {
          score += 80;
          reasons.push('Overdue');
        } else if (dueStatus === 'today') {
          score += 70;
          reasons.push('Due today');
        } else if (dueStatus === 'soon') {
          score += 40;
          reasons.push('Due soon');
        } else if (!dueDate) {
          score += 18;
          reasons.push('No schedule');
        }

        if (interactions.length === 0) {
          score += 35;
          reasons.push('No activity');
        } else if (latestTouch) {
          const daysSinceTouch = daysBetweenCalendarDates(latestTouch, now);
          if (daysSinceTouch >= 60) {
            score += 28;
            reasons.push('Stale');
          } else if (daysSinceTouch >= 30) {
            score += 16;
            reasons.push('Aging');
          }
        }

        if (!prospect.contactPhone) {
          score += 8;
          reasons.push('Needs phone');
        }
        if (!hasContact(prospect)) {
          score += 12;
          reasons.push('Missing contact');
        }
        if (prospect.status === 'listing') {
          score += 20;
          reasons.push('Listing');
        } else if (prospect.status === 'contacted') {
          score += 14;
          reasons.push('Warm');
        } else if (prospect.status === 'prospect') {
          score += 10;
          reasons.push('Prospect');
        }

        return {
          prospect,
          score,
          reasons: reasons.length ? reasons : ['Review'],
          interactions,
          dueDate,
          dueStatus,
          latestTouch,
        };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const ad = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
        const bd = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return getProspectDisplayName(a.prospect).localeCompare(getProspectDisplayName(b.prospect));
      });
  }, [safeProspects, selectedSubmarket, interactionsByProspectId, dueSoonDays, submarkets]);

  // Sort by due date (soonest first)
  const sortedProspects = [...filteredProspects].sort((a, b) => {
    const ad = getDueDate(a)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bd = getDueDate(b)?.getTime() ?? Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return a.name.localeCompare(b.name);
  });

  const applyQueue = (queue: typeof activeQueue) => {
    setActiveQueue(queue);
    if (queue === 'overdue' || queue === 'today') {
      setDueFilter('due_only');
      setShowEngagementFilter('all');
      return;
    }
    if (queue === 'week') {
      setDueFilter('due_soon');
      setShowEngagementFilter('all');
      return;
    }
    if (queue === 'no_activity') {
      setDueFilter('all');
      setShowEngagementFilter('no_engagement');
      return;
    }
    if (queue === 'no_contact') {
      setDueFilter('all');
      setShowEngagementFilter('all');
    }
  };

  const queueFilteredProspects = sortedProspects.filter((prospect) => {
    const status = getDueStatus(prospect);
    if (activeQueue === 'overdue') return status === 'overdue';
    if (activeQueue === 'today') return status === 'today';
    if (activeQueue === 'week') return status === 'overdue' || status === 'today' || status === 'soon';
    if (activeQueue === 'no_activity') return !(interactionsByProspectId.get(prospect.id)?.length);
    if (activeQueue === 'no_contact') return !hasContact(prospect);
    return true;
  });

  const openProspectDrawer = (prospect: Prospect) => {
    setSelectedProspect(prospect);
    setIsDetailDrawerOpen(true);
  };

  const selectedProspectInteractions = selectedProspect
    ? interactionsByProspectId.get(selectedProspect.id) ?? []
    : [];

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
      <div className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Badge variant="outline" className="mb-2 gap-2 rounded-full border-blue-200 bg-blue-50 px-3 py-1 text-blue-700">
                <PhoneCall className="h-3.5 w-3.5" />
                Follow-up queue
              </Badge>
              <h1 className="text-2xl font-bold text-slate-950">Follow-Up Schedule</h1>
              <p className="mt-1 text-sm text-slate-600">
                {queueFilteredProspects.length} prospects
                {showEngagementFilter === 'no_engagement' && ' with no engagement'}
                {showEngagementFilter === 'has_engagement' && ' with logged activity'}
                {showEngagementFilter === 'all' && ' scheduled for follow-up'}
                {selectedSubmarketLabel && (
                  <span className="ml-1">
                    in {selectedSubmarketLabel}
                  </span>
                )}
              </p>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
              <Calendar className="h-4 w-4 text-blue-600" />
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-2 shadow-sm lg:flex-row lg:flex-wrap lg:items-center">
            <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-100">
              <MessageSquare className="h-4 w-4 text-slate-500" />
              <Select value={showEngagementFilter} onValueChange={setShowEngagementFilter}>
                <SelectTrigger className="h-8 w-[170px] border-0 bg-transparent px-0 shadow-none focus:ring-0">
                  <SelectValue placeholder="Filter by engagement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Prospects</SelectItem>
                  <SelectItem value="no_engagement">No Engagement</SelectItem>
                  <SelectItem value="has_engagement">Has Engagement</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-100">
              <span className="text-sm font-medium text-slate-500">Show</span>
              <Select value={dueFilter} onValueChange={(v) => setDueFilter(v as 'due_soon' | 'due_only' | 'all')}>
                <SelectTrigger className="h-8 w-[150px] border-0 bg-transparent px-0 shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="due_soon">Due &amp; upcoming</SelectItem>
                  <SelectItem value="due_only">Due today / overdue</SelectItem>
                  <SelectItem value="all">All prospects</SelectItem>
                </SelectContent>
              </Select>
              {dueFilter === 'due_soon' && (
                <>
                  <div className="h-6 w-px bg-slate-200" />
                  <Select value={String(dueSoonDays)} onValueChange={(v) => setDueSoonDays(Number(v))}>
                    <SelectTrigger className="h-8 w-[86px] border-0 bg-transparent px-0 shadow-none focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 days</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-100">
              <Filter className="h-4 w-4 text-slate-500" />
              <Select value={selectedSubmarket} onValueChange={setSelectedSubmarket}>
                <SelectTrigger className="h-8 w-[150px] border-0 bg-transparent px-0 shadow-none focus:ring-0">
                  <SelectValue placeholder="Filter by submarket" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Submarkets</SelectItem>
                  <SelectItem value="none">No Submarket</SelectItem>
                  {submarkets.map((submarket) => (
                    <SelectItem key={submarket.id} value={String(submarket.id)}>
                      <div className="flex items-center gap-2">
                        {submarket.color && (
                          <div
                            className="h-3 w-3 rounded-full border"
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
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <SmartCallQueue candidates={smartCallCandidates} selectedSubmarketLabel={selectedSubmarketLabel} />

        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-5">
          {[
            { key: 'overdue' as const, label: 'Overdue', count: queueCounts.overdue, tone: 'red' },
            { key: 'today' as const, label: 'Due today', count: queueCounts.today, tone: 'amber' },
            { key: 'week' as const, label: 'This week', count: queueCounts.week, tone: 'blue' },
            { key: 'no_activity' as const, label: 'No activity', count: queueCounts.no_activity, tone: 'slate' },
            { key: 'no_contact' as const, label: 'No contact', count: queueCounts.no_contact, tone: 'sky' },
          ].map((queue) => {
            const active = activeQueue === queue.key;
            const activeClass = queue.tone === 'red'
              ? 'border-red-300 bg-red-50 text-red-950'
              : queue.tone === 'amber'
                ? 'border-amber-300 bg-amber-50 text-amber-950'
                : queue.tone === 'blue'
                  ? 'border-blue-300 bg-blue-50 text-blue-950'
                  : queue.tone === 'sky'
                    ? 'border-sky-300 bg-sky-50 text-sky-950'
                    : 'border-slate-300 bg-slate-50 text-slate-950';
            return (
              <button
                key={queue.key}
                type="button"
                onClick={() => applyQueue(queue.key)}
                className={`rounded-lg border p-4 text-left transition-colors ${active ? activeClass : 'border-slate-200 bg-white hover:bg-slate-50'}`}
              >
                <div className="text-sm font-semibold">{queue.label}</div>
                <div className="mt-2 text-3xl font-bold">{queue.count}</div>
              </button>
            );
          })}
        </div>

        {queueFilteredProspects.length === 0 ? (
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
            {queueFilteredProspects.map((prospect) => {
              const dueStatus = getDueStatus(prospect);
              const dueDate = getDueDate(prospect);
              const dueClasses = dueStatus === 'overdue'
                ? 'bg-red-50 text-red-700 border-red-200'
                : (dueStatus === 'today' || dueStatus === 'soon')
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-green-50 text-green-700 border-green-200';
              const prospectInteractions = interactionsByProspectId.get(prospect.id) ?? [];
              return (
                <Card 
                  key={prospect.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer border-slate-200"
                  onClick={() => openProspectDrawer(prospect)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <CardTitle className="text-lg font-semibold text-gray-900 mb-2">
                          {getProspectDisplayName(prospect)}
                        </CardTitle>
                        {getProspectSecondaryName(prospect) && (
                          <p className="mb-2 text-sm text-gray-500">{getProspectSecondaryName(prospect)}</p>
                        )}
                        <div className="flex items-center gap-2 mb-2">
                          <div 
                            className="w-3 h-3 rounded-full border"
                            style={{ backgroundColor: STATUS_COLORS[prospect.status] }}
                          />
                          <span className="text-sm capitalize text-gray-600">
                            {prospect.status.replace('_', ' ')}
                          </span>
                        </div>
                        <Badge variant="outline" className={dueClasses}>
                          <Clock className="h-3 w-3 mr-1" />
                          {formatDueBadgeLabel(dueDate, now)}
                        </Badge>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant="outline" className="bg-white text-slate-600">
                          {prospectInteractions.length} touches
                        </Badge>
                        {!hasContact(prospect) && (
                          <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                            No contact
                          </Badge>
                        )}
                      </div>
                    </div>
                </CardHeader>
                
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {/* Submarket */}
                    {(() => {
                      const name = resolveSubmarketName(prospect.submarketId);
                      if (!name) return null;
                      return (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <MapPin className="h-4 w-4" />
                          <span className="capitalize">{name}</span>
                        </div>
                      );
                    })()}

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

                    <div className="flex items-center justify-between gap-3 border-t pt-3">
                      <div className="text-xs text-gray-500">
                        Added {new Date(prospect.createdDate).toLocaleDateString()}
                        {dueDate ? ` - Due ${dueDate.toLocaleDateString()}` : ''}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 shrink-0"
                        onClick={(event) => {
                          event.stopPropagation();
                          openProspectDrawer(prospect);
                        }}
                      >
                        Log follow-up
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
            })}
          </div>
        )}
      </div>

      <Sheet open={isDetailDrawerOpen && Boolean(selectedProspect)} onOpenChange={(open) => {
        setIsDetailDrawerOpen(open);
        if (!open) setSelectedProspect(null);
      }}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
          {selectedProspect && (
            <div className="flex min-h-full flex-col">
              <SheetHeader className="border-b p-6 pr-12">
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge variant="outline" className="bg-slate-50 text-slate-700">
                    {selectedProspect.status.replace('_', ' ')}
                  </Badge>
                  <Badge variant="outline" className={(() => {
                    const status = getDueStatus(selectedProspect);
                    return status === 'overdue'
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : (status === 'today' || status === 'soon')
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-slate-200 bg-slate-50 text-slate-700';
                  })()}>
                    {formatDueBadgeLabel(getDueDate(selectedProspect), now)}
                  </Badge>
                </div>
                <SheetTitle className="text-2xl font-bold">
                  {getProspectDisplayName(selectedProspect)}
                </SheetTitle>
                <SheetDescription>
                  Log the touch, snooze the task, or open the full contact modal for detailed notes.
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-5 p-6">
                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-3 text-sm font-semibold text-slate-900">Move it forward</div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <QuickEngagement prospect={selectedProspect} prospectInteractions={selectedProspectInteractions} />
                    <SnoozeButtons prospect={selectedProspect} />
                  </div>
                  <Button
                    type="button"
                    className="mt-4 w-full"
                    onClick={() => setIsLogModalOpen(true)}
                  >
                    Open full log form
                  </Button>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-3 text-sm font-semibold text-slate-900">Contact</div>
                  <div className="grid gap-2 text-sm text-slate-700">
                    <div><span className="font-medium">Name:</span> {selectedProspect.contactName || 'Missing'}</div>
                    <div><span className="font-medium">Company:</span> {selectedProspect.contactCompany || 'Missing'}</div>
                    <div className="flex flex-wrap gap-3">
                      {selectedProspect.contactPhone ? (
                        <a className="text-blue-600 hover:underline" href={`tel:${selectedProspect.contactPhone}`}>Call {selectedProspect.contactPhone}</a>
                      ) : <span className="text-slate-500">No phone</span>}
                      {selectedProspect.contactEmail ? (
                        <a className="text-blue-600 hover:underline" href={`mailto:${selectedProspect.contactEmail}`}>Email</a>
                      ) : <span className="text-slate-500">No email</span>}
                    </div>
                  </div>
                </section>

                {selectedProspect.notes && (
                  <section className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="mb-2 text-sm font-semibold text-slate-900">Notes</div>
                    <p className="whitespace-pre-wrap text-sm text-slate-600">{selectedProspect.notes}</p>
                  </section>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {selectedProspect && isLogModalOpen && (
        <ContactInteractionModal 
          prospect={selectedProspect} 
          onClose={() => setIsLogModalOpen(false)} 
        />
      )}
    </div>
  );
}
