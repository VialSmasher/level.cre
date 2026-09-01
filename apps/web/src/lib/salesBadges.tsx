import React from 'react';
import {
  Award,
  Brain,
  CalendarCheck,
  ClipboardList,
  Crown,
  Flame,
  Gauge,
  Handshake,
  Mail,
  Medal,
  MessageCircle,
  NotebookPen,
  Phone,
  Rocket,
  Send,
  Star,
  Target,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type SalesActivityKind = 'call' | 'email' | 'meeting' | 'note' | 'touch';

export type SalesBadgeDefinition = {
  id: string;
  title: string;
  description: string;
  metric: SalesActivityKind;
  threshold: number;
  window: 'day' | 'tracked';
  icon: React.ComponentType<any>;
  tone: 'blue' | 'emerald' | 'orange' | 'violet' | 'slate';
};

export type SalesBadgeView = SalesBadgeDefinition & {
  value: number;
  unlocked: boolean;
};

export const SALES_BADGE_DEFINITIONS: SalesBadgeDefinition[] = [
  { id: 'daily_5_calls', title: 'Warm Line', description: 'Make 5 calls in a day', metric: 'call', threshold: 5, window: 'day', icon: Phone, tone: 'emerald' },
  { id: 'daily_10_calls', title: 'Call Flow', description: 'Make 10 calls in a day', metric: 'call', threshold: 10, window: 'day', icon: Gauge, tone: 'emerald' },
  { id: 'daily_15_calls', title: 'Power Dialer', description: 'Make 15 calls in a day', metric: 'call', threshold: 15, window: 'day', icon: Phone, tone: 'emerald' },
  { id: 'daily_30_calls', title: 'Call Blitz', description: 'Make 30 calls in a day', metric: 'call', threshold: 30, window: 'day', icon: Flame, tone: 'orange' },
  { id: 'daily_50_calls', title: 'Dialing Machine', description: 'Make 50 calls in a day', metric: 'call', threshold: 50, window: 'day', icon: Rocket, tone: 'orange' },
  { id: 'daily_5_emails', title: 'Quick Send', description: 'Send 5 emails in a day', metric: 'email', threshold: 5, window: 'day', icon: Send, tone: 'blue' },
  { id: 'daily_10_emails', title: 'Inbox Push', description: 'Send 10 emails in a day', metric: 'email', threshold: 10, window: 'day', icon: Mail, tone: 'blue' },
  { id: 'daily_25_emails', title: 'Campaign Day', description: 'Send 25 emails in a day', metric: 'email', threshold: 25, window: 'day', icon: Mail, tone: 'blue' },
  { id: 'daily_50_emails', title: 'Outreach Wave', description: 'Send 50 emails in a day', metric: 'email', threshold: 50, window: 'day', icon: Rocket, tone: 'blue' },
  { id: 'daily_1_meeting', title: 'In the Room', description: 'Log 1 meeting in a day', metric: 'meeting', threshold: 1, window: 'day', icon: Handshake, tone: 'violet' },
  { id: 'daily_3_meetings', title: 'Meeting Streak', description: 'Log 3 meetings in a day', metric: 'meeting', threshold: 3, window: 'day', icon: CalendarCheck, tone: 'violet' },
  { id: 'daily_5_meetings', title: 'Calendar Commander', description: 'Log 5 meetings in a day', metric: 'meeting', threshold: 5, window: 'day', icon: Crown, tone: 'violet' },
  { id: 'daily_5_notes', title: 'Field Notes', description: 'Add 5 notes in a day', metric: 'note', threshold: 5, window: 'day', icon: NotebookPen, tone: 'slate' },
  { id: 'daily_10_notes', title: 'Intel Drop', description: 'Add 10 notes in a day', metric: 'note', threshold: 10, window: 'day', icon: Brain, tone: 'slate' },
  { id: 'daily_20_notes', title: 'Deal Scribe', description: 'Add 20 notes in a day', metric: 'note', threshold: 20, window: 'day', icon: ClipboardList, tone: 'slate' },
  { id: 'daily_10_touches', title: 'On the Board', description: 'Log 10 calls, emails, meetings, or notes in a day', metric: 'touch', threshold: 10, window: 'day', icon: Target, tone: 'orange' },
  { id: 'daily_20_touches', title: 'Touchpoint Sprint', description: 'Log 20 calls, emails, meetings, or notes in a day', metric: 'touch', threshold: 20, window: 'day', icon: Zap, tone: 'orange' },
  { id: 'daily_40_touches', title: 'Full-Court Press', description: 'Log 40 calls, emails, meetings, or notes in a day', metric: 'touch', threshold: 40, window: 'day', icon: Flame, tone: 'orange' },
  { id: 'daily_75_touches', title: 'Market Marathon', description: 'Log 75 calls, emails, meetings, or notes in a day', metric: 'touch', threshold: 75, window: 'day', icon: Trophy, tone: 'orange' },
  { id: 'tracked_50_calls', title: 'Phone Habit', description: 'Log 50 calls in tracked history', metric: 'call', threshold: 50, window: 'tracked', icon: Star, tone: 'emerald' },
  { id: 'tracked_100_calls', title: 'Century Caller', description: 'Log 100 calls in tracked history', metric: 'call', threshold: 100, window: 'tracked', icon: Medal, tone: 'emerald' },
  { id: 'tracked_250_calls', title: 'Rainmaker Rhythm', description: 'Log 250 calls in tracked history', metric: 'call', threshold: 250, window: 'tracked', icon: Trophy, tone: 'orange' },
  { id: 'tracked_500_calls', title: 'Call Authority', description: 'Log 500 calls in tracked history', metric: 'call', threshold: 500, window: 'tracked', icon: Crown, tone: 'orange' },
  { id: 'tracked_50_emails', title: 'Message Builder', description: 'Log 50 emails in tracked history', metric: 'email', threshold: 50, window: 'tracked', icon: MessageCircle, tone: 'blue' },
  { id: 'tracked_100_emails', title: 'Email Engine', description: 'Log 100 emails in tracked history', metric: 'email', threshold: 100, window: 'tracked', icon: Medal, tone: 'blue' },
  { id: 'tracked_250_emails', title: 'Outreach Operator', description: 'Log 250 emails in tracked history', metric: 'email', threshold: 250, window: 'tracked', icon: Award, tone: 'blue' },
  { id: 'tracked_500_emails', title: 'Inbox Veteran', description: 'Log 500 emails in tracked history', metric: 'email', threshold: 500, window: 'tracked', icon: Crown, tone: 'blue' },
  { id: 'tracked_10_meetings', title: 'Face Time', description: 'Log 10 meetings in tracked history', metric: 'meeting', threshold: 10, window: 'tracked', icon: Handshake, tone: 'violet' },
  { id: 'tracked_25_meetings', title: 'Meeting Maker', description: 'Log 25 meetings in tracked history', metric: 'meeting', threshold: 25, window: 'tracked', icon: Users, tone: 'violet' },
  { id: 'tracked_50_meetings', title: 'Relationship Builder', description: 'Log 50 meetings in tracked history', metric: 'meeting', threshold: 50, window: 'tracked', icon: Award, tone: 'violet' },
  { id: 'tracked_25_notes', title: 'Memory Bank', description: 'Add 25 notes in tracked history', metric: 'note', threshold: 25, window: 'tracked', icon: NotebookPen, tone: 'slate' },
  { id: 'tracked_50_notes', title: 'Intel Keeper', description: 'Add 50 notes in tracked history', metric: 'note', threshold: 50, window: 'tracked', icon: Brain, tone: 'slate' },
  { id: 'tracked_100_notes', title: 'Market Historian', description: 'Add 100 notes in tracked history', metric: 'note', threshold: 100, window: 'tracked', icon: Trophy, tone: 'slate' },
];

export const BADGE_TONES = {
  blue: {
    unlocked: 'border-blue-200 bg-blue-50 text-blue-800',
    icon: 'bg-blue-600 text-white',
    progress: 'bg-blue-500',
  },
  emerald: {
    unlocked: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icon: 'bg-emerald-600 text-white',
    progress: 'bg-emerald-500',
  },
  orange: {
    unlocked: 'border-orange-200 bg-orange-50 text-orange-800',
    icon: 'bg-orange-500 text-white',
    progress: 'bg-orange-500',
  },
  violet: {
    unlocked: 'border-violet-200 bg-violet-50 text-violet-800',
    icon: 'bg-violet-600 text-white',
    progress: 'bg-violet-500',
  },
  slate: {
    unlocked: 'border-slate-200 bg-slate-50 text-slate-800',
    icon: 'bg-slate-800 text-white',
    progress: 'bg-slate-500',
  },
} as const;

export function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: 'year' | 'month' | 'day') => Number(parts.find((p) => p.type === type)?.value || '0');
  return { year: get('year'), month: get('month'), day: get('day') };
}

export function getDayKeyInTimeZone(date: Date, timeZone: string) {
  const { year, month, day } = getDatePartsInTimeZone(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function activityKind(actionValue: unknown): SalesActivityKind | null {
  const action = String(actionValue || '').toLowerCase();
  if (action === 'call' || action === 'phone_call') return 'call';
  if (action === 'email' || action === 'email_sent') return 'email';
  if (action === 'meeting' || action === 'meeting_held') return 'meeting';
  if (action === 'note' || action === 'note_added') return 'note';
  return null;
}

function isInboundActivity(row: Record<string, any>): boolean {
  const metadata = row.sourceMetadata && typeof row.sourceMetadata === 'object'
    ? row.sourceMetadata as Record<string, unknown>
    : {};
  const direction = String(
    row.direction
    || metadata.direction
    || metadata.captureDirection
    || metadata.emailDirection
    || '',
  ).trim().toLowerCase();
  return direction === 'received' || direction === 'inbound';
}

export function buildSalesBadgeSummary(activities: unknown[], timeZone: string) {
  const dailyBuckets = new Map<string, Record<SalesActivityKind, number>>();
  const bestDayCounts: Record<SalesActivityKind, number> = { call: 0, email: 0, meeting: 0, note: 0, touch: 0 };
  const trackedCounts: Record<SalesActivityKind, number> = { call: 0, email: 0, meeting: 0, note: 0, touch: 0 };

  for (const activity of activities || []) {
    const row = activity as any;
    if (isInboundActivity(row)) continue;
    const kind = activityKind(row.action || row.type);
    if (!kind) continue;
    const activityDate = new Date(row.timestamp || row.date || row.createdAt || Date.now());
    trackedCounts[kind] += 1;
    trackedCounts.touch += 1;
    const dayKey = getDayKeyInTimeZone(activityDate, timeZone);
    const dayCounts = dailyBuckets.get(dayKey) || { call: 0, email: 0, meeting: 0, note: 0, touch: 0 };
    dayCounts[kind] += 1;
    dayCounts.touch += 1;
    dailyBuckets.set(dayKey, dayCounts);
  }

  for (const dayCounts of Array.from(dailyBuckets.values())) {
    bestDayCounts.call = Math.max(bestDayCounts.call, dayCounts.call);
    bestDayCounts.email = Math.max(bestDayCounts.email, dayCounts.email);
    bestDayCounts.meeting = Math.max(bestDayCounts.meeting, dayCounts.meeting);
    bestDayCounts.note = Math.max(bestDayCounts.note, dayCounts.note);
    bestDayCounts.touch = Math.max(bestDayCounts.touch, dayCounts.touch);
  }

  const badges = SALES_BADGE_DEFINITIONS.map((definition): SalesBadgeView => {
    const value = definition.window === 'day' ? bestDayCounts[definition.metric] : trackedCounts[definition.metric];
    return { ...definition, value, unlocked: value >= definition.threshold };
  });

  const unlocked = badges.filter((badge) => badge.unlocked);
  const next = badges
    .filter((badge) => !badge.unlocked)
    .sort((a, b) => ((b.value / b.threshold) - (a.value / a.threshold)) || (a.threshold - b.threshold))[0] || null;

  return { badges, unlocked, next, bestDayCounts, trackedCounts };
}

export function SalesBadgeCard({ badge, compact = false }: { badge: SalesBadgeView; compact?: boolean }) {
  const Icon = badge.icon;
  const tone = BADGE_TONES[badge.tone];
  const progress = Math.min(100, Math.floor((badge.value / Math.max(1, badge.threshold)) * 100));
  const cardClass = badge.unlocked
    ? tone.unlocked
    : 'border-slate-200 bg-slate-50 text-slate-500';
  const iconClass = badge.unlocked
    ? tone.icon
    : 'bg-white text-slate-400';

  return (
    <div className={`rounded-xl border p-4 shadow-sm transition ${cardClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`rounded-lg p-2 ${iconClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        {badge.unlocked ? (
          <Badge className="bg-slate-950 text-white">Unlocked</Badge>
        ) : (
          <Badge variant="outline" className="bg-white text-slate-600">Locked</Badge>
        )}
      </div>
      <p className="mt-4 text-base font-bold text-slate-950">{badge.title}</p>
      <p className={`${compact ? 'mt-1' : 'mt-1 min-h-[2rem]'} text-xs leading-4 text-slate-600`}>{badge.description}</p>
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span>{badge.window === 'day' ? 'Best day' : 'Tracked total'}</span>
          <span>{badge.value} / {badge.threshold}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white">
          <div className={`h-full rounded-full ${badge.unlocked ? tone.progress : 'bg-slate-300'}`} style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}
