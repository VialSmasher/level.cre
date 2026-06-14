import { useMemo, useState, type ComponentType } from 'react';
import { Link } from 'wouter';
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Building2,
  CalendarClock,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Coffee,
  Gift,
  Home,
  KeyRound,
  MapPin,
  Plane,
  Sparkles,
  Store,
  TicketPercent,
  Trophy,
  Users,
  Utensils,
  WalletCards,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createResidentLoyaltyDemoState } from './residentLoyaltyDemoData';
import {
  buildResidentEvent,
  calculateBuildingStats,
  calculateResidentPoints,
  eventTypeLabel,
  getNextStreakMilestone,
  getResidentName,
  getResidentUnitNumber,
  rewardCategoryLabel,
} from './residentLoyaltyLogic';
import type { MaintenanceRequest, Resident, ResidentEventType, ResidentLoyaltyDemoState, ResidentTaskType } from './types';

type IconType = ComponentType<{ className?: string }>;

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));

const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

function StatusBadge({ value }: { value: string }) {
  const lower = value.toLowerCase();
  const className = lower.includes('pending') || lower.includes('submitted')
    ? 'border-amber-300 bg-amber-50 text-amber-800'
    : lower.includes('reviewed') || lower.includes('scheduled') || lower.includes('interested')
      ? 'border-sky-200 bg-sky-50 text-sky-800'
      : lower.includes('issued') || lower.includes('approved') || lower.includes('signed') || lower.includes('completed')
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-stone-200 bg-stone-50 text-stone-700';
  return (
    <Badge variant="outline" className={`capitalize ${className}`}>
      {value.replace(/_/g, ' ')}
    </Badge>
  );
}

function MetricTile({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: IconType;
  tone: 'gold' | 'green' | 'blue' | 'rose' | 'stone';
}) {
  const tones = {
    gold: 'bg-[#fff3ce] text-[#8a5a00]',
    green: 'bg-emerald-50 text-emerald-800',
    blue: 'bg-sky-50 text-sky-800',
    rose: 'bg-rose-50 text-rose-800',
    stone: 'bg-stone-100 text-stone-800',
  };

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-stone-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-stone-950">{value}</p>
          <p className="mt-1 text-xs leading-5 text-stone-600">{detail}</p>
        </div>
        <div className={`rounded-lg p-2 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function residentUnitLabel(state: ResidentLoyaltyDemoState, resident: Resident) {
  return getResidentUnitNumber(state, resident.id);
}

function AppPreview({
  resident,
  state,
  currentPoints,
}: {
  resident: Resident;
  state: ResidentLoyaltyDemoState;
  currentPoints: number;
}) {
  const nextMilestone = getNextStreakMilestone(resident.rentStreakMonths);
  const availableTasks = state.tasks.filter((task) => task.residentId === resident.id && task.status === 'available');

  return (
    <div className="rounded-lg border border-white/15 bg-white p-3 text-stone-950 shadow-2xl">
      <div className="rounded-lg bg-[#111412] p-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-white/60">Living Rewards</p>
            <p className="mt-1 text-lg font-black">{resident.name.split(' ')[0]}'s wallet</p>
          </div>
          <div className="rounded-lg bg-[#f6c451] p-2 text-stone-950">
            <WalletCards className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-5 rounded-lg border border-white/10 bg-white/10 p-4">
          <p className="text-xs text-white/60">Available points</p>
          <p className="mt-1 text-4xl font-black">{currentPoints.toLocaleString()}</p>
          <p className="mt-2 text-sm text-white/70">Unit {residentUnitLabel(state, resident)} at {state.buildings[0]?.name}</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-white p-3 text-stone-950">
            <p className="text-xs font-semibold text-stone-500">Rent streak</p>
            <p className="mt-1 text-xl font-black">{resident.rentStreakMonths} mo</p>
          </div>
          <div className="rounded-lg bg-[#dff6ea] p-3 text-emerald-950">
            <p className="text-xs font-semibold">Next drop</p>
            <p className="mt-1 text-xl font-black">Monthly</p>
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <div className="rounded-lg border border-stone-200 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-stone-950">June monthly drop</p>
              <p className="text-xs text-stone-600">Dining credits, free-rent draw, transfer boost</p>
            </div>
            <Sparkles className="h-5 w-5 text-[#b77a00]" />
          </div>
        </div>
        <div className="rounded-lg border border-stone-200 p-3">
          <p className="text-sm font-bold text-stone-950">Earn more this week</p>
          <p className="mt-1 text-xs text-stone-600">
            {availableTasks.length} home missions available. {nextMilestone ? `${nextMilestone.months} month milestone ahead.` : 'Top milestone unlocked.'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ResidentLoyaltyManagerPage() {
  const [demo, setDemo] = useState(createResidentLoyaltyDemoState);
  const building = demo.buildings[0];
  const landlord = demo.landlords[0];
  const [selectedResidentId, setSelectedResidentId] = useState(demo.residents[0]?.id ?? '');
  const [selectedNoticeId, setSelectedNoticeId] = useState(demo.notices[0]?.id ?? '');

  const stats = useMemo(() => calculateBuildingStats(demo, building.id), [demo, building.id]);
  const selectedResident = demo.residents.find((resident) => resident.id === selectedResidentId) ?? demo.residents[0];
  const selectedNotice = demo.notices.find((notice) => notice.id === selectedNoticeId) ?? demo.notices[0];
  const selectedResidentPoints = calculateResidentPoints(selectedResident.id, demo.events, demo.rewardRedemptions);
  const sortedEvents = [...demo.events].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const openRequests = demo.maintenanceRequests.filter((request) => request.status === 'submitted' || request.status === 'reviewed');
  const pendingRewards = demo.rewardRedemptions.filter((redemption) => redemption.status === 'pending');

  const topResidents = useMemo(
    () =>
      demo.residents
        .map((resident) => ({
          resident,
          points: calculateResidentPoints(resident.id, demo.events, demo.rewardRedemptions),
          openTasks: demo.tasks.filter((task) => task.residentId === resident.id && task.status === 'available').length,
        }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 5),
    [demo],
  );

  const addEvent = (
    residentId: string,
    eventType: ResidentEventType,
    metadata: Record<string, unknown> = {},
    completedTaskType?: ResidentTaskType,
  ) => {
    setDemo((current) => {
      const created = buildResidentEvent(current, residentId, eventType, metadata);
      return {
        ...current,
        events: [created, ...current.events],
        tasks: completedTaskType
          ? current.tasks.map((task) =>
              task.residentId === residentId && task.type === completedTaskType && task.status === 'available'
                ? { ...task, status: 'completed' }
                : task,
            )
          : current.tasks,
      };
    });
  };

  const markRentPaidOnTime = () => {
    setDemo((current) => {
      const paid = buildResidentEvent(current, selectedResident.id, 'rent_paid_on_time', { month: '2026-06' });
      const streak = buildResidentEvent(current, selectedResident.id, 'rent_streak_continued', {
        source: 'campaign_simulator',
        month: '2026-06',
      });
      return {
        ...current,
        residents: current.residents.map((resident) =>
          resident.id === selectedResident.id
            ? { ...resident, rentStreakMonths: resident.rentStreakMonths + 1 }
            : resident,
        ),
        events: [streak, paid, ...current.events],
      };
    });
  };

  const markNoticeAcknowledged = () => {
    setDemo((current) => ({
      ...current,
      notices: current.notices.map((notice) =>
        notice.id === selectedNotice.id && !notice.acknowledgedResidentIds.includes(selectedResident.id)
          ? { ...notice, acknowledgedResidentIds: [...notice.acknowledgedResidentIds, selectedResident.id] }
          : notice,
      ),
    }));
    addEvent(selectedResident.id, 'notice_acknowledged', { noticeId: selectedNotice.id }, 'acknowledge_notice');
  };

  const markAccessConfirmed = () => {
    setDemo((current) => ({
      ...current,
      maintenanceRequests: current.maintenanceRequests.map((request) =>
        request.residentId === selectedResident.id ? { ...request, accessConfirmed: true } : request,
      ),
    }));
    addEvent(selectedResident.id, 'access_confirmed', { source: 'campaign_simulator' }, 'confirm_access');
  };

  const markRenewalInterest = () => {
    setDemo((current) => ({
      ...current,
      renewals: current.renewals.map((renewal) =>
        renewal.residentId === selectedResident.id ? { ...renewal, status: 'interested' } : renewal,
      ),
    }));
    addEvent(selectedResident.id, 'renewal_interest_submitted', { source: 'campaign_simulator' }, 'submit_renewal_interest');
  };

  const reviewMaintenanceRequest = (request: MaintenanceRequest) => {
    setDemo((current) => ({
      ...current,
      maintenanceRequests: current.maintenanceRequests.map((item) =>
        item.id === request.id ? { ...item, status: item.accessConfirmed ? 'scheduled' : 'reviewed' } : item,
      ),
    }));
  };

  const approveReward = (redemptionId: string) => {
    setDemo((current) => ({
      ...current,
      rewardRedemptions: current.rewardRedemptions.map((redemption) =>
        redemption.id === redemptionId
          ? { ...redemption, status: 'approved', approvedAt: new Date().toISOString() }
          : redemption,
      ),
    }));
  };

  const neighborhoodBenefits = [
    { icon: Coffee, merchant: 'Credo Coffee', perk: 'Free drip upgrade', detail: '4 min walk', tone: 'bg-[#fff3ce] text-[#7a4c00]' },
    { icon: Utensils, merchant: 'Oliver Exchange', perk: '$15 dining drop', detail: 'First of month only', tone: 'bg-rose-50 text-rose-800' },
    { icon: Store, merchant: 'Neighborhood Market', perk: '5 percent grocery boost', detail: 'Linked wallet', tone: 'bg-emerald-50 text-emerald-800' },
    { icon: TicketPercent, merchant: 'Studio Pass', perk: 'First class free', detail: 'Resident benefit', tone: 'bg-sky-50 text-sky-800' },
  ];

  const rewardPath = [
    { icon: Home, label: 'Rent credit', detail: 'Redeem points against next month rent', value: '$10 to $100 mock credits' },
    { icon: Plane, label: 'Travel transfer', detail: 'Prototype travel partner transfer rail', value: '1:1 mock partner' },
    { icon: Gift, label: 'Everyday rewards', detail: 'Coffee, groceries, dining, rideshare', value: '500+ points' },
    { icon: KeyRound, label: 'Building perks', detail: 'Parking, elevator priority, fee waivers', value: 'Per-property perks' },
  ];

  return (
    <div className="min-h-screen bg-[#f5f1e8] text-stone-950">
      <header className="border-b border-stone-200 bg-[#fbf9f3]/95 px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-950 text-[#f6c451]">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-black">Living Rewards</p>
              <p className="text-xs text-stone-600">Resident loyalty for multifamily operators</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild className="border-stone-300 bg-white">
              <Link href="/resident-loyalty/resident-demo">
                Open resident app
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 md:px-6 md:py-8">
        <section className="grid gap-5 lg:grid-cols-[1fr_380px] lg:items-stretch">
          <div className="rounded-lg bg-[#111412] p-5 text-white shadow-xl md:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-[#f6c451] text-stone-950 hover:bg-[#f6c451]">Resident app first</Badge>
              <Badge variant="outline" className="border-white/20 bg-white/10 text-white">Demo network</Badge>
            </div>
            <h1 className="mt-6 max-w-3xl text-4xl font-black leading-none md:text-6xl">
              Rewards for the place residents already live.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/75 md:text-lg">
              This prototype shifts the product from an internal checklist into a resident rewards wallet: rent streaks,
              monthly drops, neighborhood benefits, flexible rewards, and a quiet operator console that proves the
              operational lift.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-white/10 p-4">
                <p className="text-sm font-bold text-[#f6c451]">Rent</p>
                <p className="mt-1 text-sm text-white/70">On-time streaks and milestone rewards</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/10 p-4">
                <p className="text-sm font-bold text-[#9fe6b8]">Neighborhood</p>
                <p className="mt-1 text-sm text-white/70">Local dining, fitness, grocery, and service perks</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/10 p-4">
                <p className="text-sm font-bold text-[#9bd5ff]">Rewards</p>
                <p className="mt-1 text-sm text-white/70">Rent credits, everyday rewards, and building perks</p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="bg-[#f6c451] text-stone-950 hover:bg-[#ffd76a]">
                <Link href="/resident-loyalty/resident-demo">
                  Try the resident wallet
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white" asChild>
                <a href="#partner-console">View partner console</a>
              </Button>
            </div>
          </div>

          <AppPreview resident={selectedResident} state={demo} currentPoints={selectedResidentPoints} />
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <MetricTile label="Resident members" value={stats.residentCount} detail={`${stats.occupiedUnits}/${stats.unitCount} units connected`} icon={Users} tone="stone" />
          <MetricTile label="Rent streak members" value={stats.onTimeStreakCount} detail={`${stats.averageRentStreakMonths} month average`} icon={Trophy} tone="gold" />
          <MetricTile label="Neighborhood perks" value="4" detail="Mock local offers in the demo" icon={MapPin} tone="rose" />
          <MetricTile label="Follow-ups avoided" value={stats.estimatedFollowUpsAvoided} detail="Estimated manager touches saved" icon={BadgeCheck} tone="green" />
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="border-stone-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Monthly moment</Badge>
                  <h2 className="mt-3 text-2xl font-black text-stone-950">Monthly rewards drop</h2>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    A recurring reason to open the app: bonus local dining, a mock free-rent draw, and partner perks.
                    This keeps the product from feeling like chores with points.
                  </p>
                </div>
                <div className="rounded-lg bg-[#fff3ce] p-3 text-[#8a5a00]">
                  <Sparkles className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-[#111412] p-4 text-white">
                  <p className="text-xs text-white/60">Drop</p>
                  <p className="mt-2 text-lg font-black">Win a month of rent</p>
                  <p className="mt-1 text-xs text-white/65">Mock sweepstakes, not payment processing</p>
                </div>
                <div className="rounded-lg border border-stone-200 p-4">
                  <p className="text-xs text-stone-500">Boost</p>
                  <p className="mt-2 text-lg font-black">2x neighborhood points</p>
                  <p className="mt-1 text-xs text-stone-600">Dining and coffee partner demo</p>
                </div>
                <div className="rounded-lg border border-stone-200 p-4">
                  <p className="text-xs text-stone-500">Mission</p>
                  <p className="mt-2 text-lg font-black">Home ready bonus</p>
                  <p className="mt-1 text-xs text-stone-600">Notice, access, and photos bundled</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">Neighborhood as an amenity</Badge>
                  <h2 className="mt-3 text-2xl font-black text-stone-950">{building.neighbourhood} benefits</h2>
                </div>
                <MapPin className="h-6 w-6 text-rose-700" />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {neighborhoodBenefits.map((benefit) => {
                  const Icon = benefit.icon;
                  return (
                    <div key={benefit.merchant} className="rounded-lg border border-stone-200 p-4">
                      <div className="flex items-start gap-3">
                        <div className={`rounded-lg p-2 ${benefit.tone}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-bold text-stone-950">{benefit.merchant}</p>
                          <p className="mt-1 text-sm text-stone-600">{benefit.perk}</p>
                          <p className="mt-2 text-xs font-semibold text-stone-500">{benefit.detail}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <Badge variant="outline" className="border-stone-300 bg-white text-stone-700">Redemption marketplace</Badge>
              <h2 className="mt-3 text-2xl font-black text-stone-950">Flexible rewards without real fulfillment yet</h2>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {rewardPath.map((reward) => {
              const Icon = reward.icon;
              return (
                <div key={reward.label} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="rounded-lg bg-stone-950 p-2 text-[#f6c451] w-fit">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="mt-4 font-black text-stone-950">{reward.label}</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{reward.detail}</p>
                  <p className="mt-3 text-xs font-bold text-stone-500">{reward.value}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section id="partner-console" className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <Card className="border-stone-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-800">Partner console</Badge>
              <h2 className="mt-3 text-2xl font-black text-stone-950">Operator controls</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                Use campaigns to turn useful resident actions into rewards. This is intentionally secondary to the
                resident app, but it keeps the landlord ROI visible.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-stone-500">Resident</p>
                  <Select value={selectedResident.id} onValueChange={setSelectedResidentId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {demo.residents.map((resident) => (
                        <SelectItem key={resident.id} value={resident.id}>
                          Unit {residentUnitLabel(demo, resident)} - {resident.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-stone-500">Notice</p>
                  <Select value={selectedNotice.id} onValueChange={setSelectedNoticeId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {demo.notices.map((notice) => (
                        <SelectItem key={notice.id} value={notice.id}>
                          {notice.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={markRentPaidOnTime}>
                  <CheckCircle2 className="h-4 w-4" />
                  Rent on time
                </Button>
                <Button variant="outline" onClick={markNoticeAcknowledged}>
                  <Bell className="h-4 w-4" />
                  Notice acknowledged
                </Button>
                <Button variant="outline" onClick={markAccessConfirmed}>
                  <KeyRound className="h-4 w-4" />
                  Access confirmed
                </Button>
                <Button variant="outline" onClick={markRenewalInterest}>
                  <CalendarClock className="h-4 w-4" />
                  Renewal interest
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-2">
            <MetricTile label="Building health" value={stats.healthScore} detail={`${landlord.name}, ${building.name}`} icon={Building2} tone="stone" />
            <MetricTile label="Notice acknowledgement" value={`${stats.noticeAcknowledgementRate}%`} detail={`${demo.notices.length} active notices`} icon={Bell} tone="rose" />
            <MetricTile label="Maintenance photos" value={`${stats.maintenancePhotoRate}%`} detail={`${stats.maintenanceWithPhotosCount}/${stats.maintenanceRequestCount} requests include photos`} icon={Camera} tone="green" />
            <MetricTile label="Access confirmations" value={stats.accessConfirmations} detail="Repair and inspection windows confirmed" icon={KeyRound} tone="blue" />
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="border-stone-200 bg-white shadow-sm lg:col-span-2">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-stone-950">Resident member snapshot</h2>
                  <p className="mt-1 text-sm text-stone-600">Points, streaks, and open missions for the demo building.</p>
                </div>
                <Users className="h-5 w-5 text-stone-500" />
              </div>
              <div className="mt-4 divide-y divide-stone-100">
                {topResidents.map(({ resident, points, openTasks }) => {
                  const milestone = getNextStreakMilestone(resident.rentStreakMonths);
                  return (
                    <div key={resident.id} className="grid gap-3 py-3 md:grid-cols-[1fr_110px_110px_1fr] md:items-center">
                      <div>
                        <p className="font-bold text-stone-950">{resident.name}</p>
                        <p className="text-sm text-stone-600">Unit {residentUnitLabel(demo, resident)}</p>
                      </div>
                      <p className="font-black text-emerald-800">{points.toLocaleString()} pts</p>
                      <p className="text-sm text-stone-700">{resident.rentStreakMonths} mo streak</p>
                      <p className="text-sm text-stone-600">
                        {openTasks} missions open
                        {milestone ? `, ${milestone.months} mo reward next` : ', top milestone reached'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-stone-950">Reward approvals</h2>
                  <p className="mt-1 text-sm text-stone-600">Mock fulfillment queue.</p>
                </div>
                <Gift className="h-5 w-5 text-stone-500" />
              </div>
              <div className="mt-4 space-y-3">
                {pendingRewards.length === 0 ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">
                    No pending reward approvals.
                  </div>
                ) : (
                  pendingRewards.map((redemption) => {
                    const reward = demo.rewards.find((item) => item.id === redemption.rewardId);
                    return (
                      <div key={redemption.id} className="rounded-lg border border-stone-200 p-3">
                        <p className="font-bold text-stone-950">{reward?.label ?? 'Reward'} - {redemption.valueLabel}</p>
                        <p className="mt-1 text-sm text-stone-600">
                          Unit {getResidentUnitNumber(demo, redemption.residentId)} - {getResidentName(demo, redemption.residentId)}
                        </p>
                        <Button className="mt-3 w-full" size="sm" onClick={() => approveReward(redemption.id)}>
                          Approve mock reward
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card className="border-stone-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <h2 className="text-xl font-black text-stone-950">Maintenance coordination</h2>
              <p className="mt-1 text-sm text-stone-600">Photo-first requests and access confirmations reduce manager chasing.</p>
              <div className="mt-4 space-y-3">
                {openRequests.map((request) => (
                  <div key={request.id} className="rounded-lg border border-stone-200 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-stone-950">{request.title}</p>
                      <StatusBadge value={request.status} />
                      <Badge variant="outline" className={request.photoCount > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-800'}>
                        {request.photoCount > 0 ? `${request.photoCount} photos` : 'needs photos'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-stone-600">
                      Unit {getResidentUnitNumber(demo, request.residentId)} - {getResidentName(demo, request.residentId)}
                      {request.accessConfirmed ? ' - access confirmed' : ' - access not confirmed'}
                    </p>
                    <Button className="mt-3" size="sm" variant="outline" onClick={() => reviewMaintenanceRequest(request)}>
                      Review request
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-stone-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <h2 className="text-xl font-black text-stone-950">Event ledger</h2>
              <p className="mt-1 text-sm text-stone-600">The same auditable behavior ledger from Level CRE, recast for resident actions.</p>
              <div className="mt-4 space-y-3">
                {sortedEvents.slice(0, 8).map((event) => (
                  <div key={event.id} className="rounded-lg border border-stone-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-stone-950">{eventTypeLabel(event.eventType)}</p>
                        <p className="mt-1 text-sm text-stone-600">
                          Unit {getResidentUnitNumber(demo, event.residentId)} - {getResidentName(demo, event.residentId)}
                        </p>
                      </div>
                      <Badge className="bg-emerald-700 text-white hover:bg-emerald-700">+{event.pointsAwarded}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-stone-500">
                      {formatDateTime(event.createdAt)} - {Object.keys(event.metadata).join(', ') || 'no metadata'}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-stone-950">Mock reward catalog</h2>
              <p className="mt-1 text-sm text-stone-600">Demo-only options. No payments, banking, card rewards, or gift-card fulfillment are integrated.</p>
            </div>
            <ClipboardCheck className="h-5 w-5 text-stone-500" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {demo.rewards.map((reward) => (
              <div key={reward.id} className="rounded-lg border border-stone-200 p-3">
                <p className="font-bold text-stone-950">{reward.label}</p>
                <p className="mt-1 text-sm text-stone-600">{rewardCategoryLabel(reward.category)} - {reward.valueLabel}</p>
                <Badge variant="outline" className="mt-2 border-stone-300">
                  {reward.pointCost ? `${reward.pointCost.toLocaleString()} points` : `${reward.milestoneMonths} month streak`}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
