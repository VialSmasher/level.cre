import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Link } from 'wouter';
import {
  ArrowLeft,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Coffee,
  FileText,
  Gift,
  Home,
  KeyRound,
  MapPin,
  Megaphone,
  MessageSquare,
  Plane,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Store,
  Trophy,
  TrainFront,
  Utensils,
  WalletCards,
  Wifi,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createResidentLoyaltyDemoState } from './residentLoyaltyDemoData';
import {
  buildResidentEvent,
  calculateOnboardingProgress,
  calculateLifetimePoints,
  calculateResidentPoints,
  eventTypeLabel,
  getAvailableRewards,
  getCurrentStreakMilestone,
  getNextStreakMilestone,
  getResidentUnitLabel,
  getTenantLifecycle,
  rewardCategoryLabel,
  TASK_EVENT_MAP,
  taskTypeLabel,
} from './residentLoyaltyLogic';
import { loadResidentLoyaltyState, mergeResidentLoyaltyPortalState } from './residentLoyaltyApi';
import type { ResidentTask, RewardOption } from './types';

type IconType = ComponentType<{ className?: string }>;

const taskIcons: Record<ResidentTask['type'], IconType> = {
  acknowledge_notice: Bell,
  submit_maintenance_with_photos: Wrench,
  confirm_access: KeyRound,
  submit_renewal_interest: CalendarClock,
  complete_move_in_checklist: ClipboardCheck,
};

const communityIcons = [Megaphone, Coffee, Store, MessageSquare] as const;

const rewardIcons: Record<RewardOption['category'], IconType> = {
  rent_credit: Home,
  gift_card: Gift,
  perk: Sparkles,
  fee_waiver: KeyRound,
  travel: Plane,
  dining: Utensils,
  fitness: Trophy,
  home: Store,
  internet: Wifi,
  transit: TrainFront,
  community: MessageSquare,
};

const toDisplayDate = (iso: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(iso);
};

const formatDate = (iso?: string) =>
  iso ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(toDisplayDate(iso)) : 'Open';

const readableStatus = (status: string) => status.replace(/_/g, ' ');

function rewardRequirementLabel(reward: RewardOption) {
  if (typeof reward.pointCost === 'number') return `${reward.pointCost.toLocaleString()} pts`;
  if (typeof reward.milestoneMonths === 'number') return `${reward.milestoneMonths} mo streak`;
  return 'Available';
}

function PhoneCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`rounded-lg border border-stone-200 bg-white p-4 ${className}`}>{children}</div>;
}

export default function ResidentLoyaltyResidentDemoPage() {
  const [demo, setDemo] = useState(createResidentLoyaltyDemoState);
  const [selectedResidentId, setSelectedResidentId] = useState('resident-amelia-wong');
  const [lastAction, setLastAction] = useState<{ title: string; detail: string; tone: 'earned' | 'reward' } | null>(null);
  const [isDatabaseBacked, setIsDatabaseBacked] = useState(false);
  const resident = demo.residents.find((item) => item.id === selectedResidentId) ?? demo.residents[0];
  const building = demo.buildings[0];
  const currentPoints = calculateResidentPoints(resident.id, demo.events, demo.rewardRedemptions);
  const lifetimePoints = calculateLifetimePoints(resident.id, demo.events);
  const nextMilestone = getNextStreakMilestone(resident.rentStreakMonths);
  const currentMilestone = getCurrentStreakMilestone(resident.rentStreakMonths);
  const progressToNextMilestone = nextMilestone
    ? Math.min(100, Math.round((resident.rentStreakMonths / nextMilestone.months) * 100))
    : 100;
  const availableTasks = demo.tasks.filter((task) => task.residentId === resident.id && task.status === 'available');
  const completedTasks = demo.tasks.filter((task) => task.residentId === resident.id && task.status === 'completed');
  const residentRedemptions = demo.rewardRedemptions.filter((redemption) => redemption.residentId === resident.id);
  const availableRewards = useMemo(() => {
    const redeemedRewardIds = new Set(residentRedemptions.map((redemption) => redemption.rewardId));
    return getAvailableRewards(resident, currentPoints, demo.rewards).filter((reward) => !redeemedRewardIds.has(reward.id));
  }, [currentPoints, demo.rewards, resident, residentRedemptions]);
  const lockedRewards = demo.rewards
    .filter((reward) => !availableRewards.some((available) => available.id === reward.id))
    .slice(0, 4);
  const residentEvents = [...demo.events]
    .filter((event) => event.residentId === resident.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const lifecycle = getTenantLifecycle(demo, resident.id);
  const onboardingProgress = calculateOnboardingProgress(demo, resident.id);

  useEffect(() => {
    let cancelled = false;

    async function loadPersistedState() {
      try {
        const payload = await loadResidentLoyaltyState();
        if (cancelled || !payload.state) return;
        setDemo((current) => mergeResidentLoyaltyPortalState(current, payload.state));
        setIsDatabaseBacked(payload.source === 'database');
        const loadedResidents = createResidentLoyaltyDemoState().residents;
        const preferred = loadedResidents.find((item) => item.name === 'Amelia Wong') || loadedResidents[0];
        if (preferred) setSelectedResidentId(preferred.id);
      } catch (_error) {
        if (!cancelled) setIsDatabaseBacked(false);
      }
    }

    loadPersistedState();
    return () => {
      cancelled = true;
    };
  }, []);

  const completeTask = (task: ResidentTask) => {
    setLastAction({
      title: 'Mission complete',
      detail: `${task.points.toLocaleString()} points added for ${taskTypeLabel(task.type).toLowerCase()}.`,
      tone: 'earned',
    });
    setDemo((current) => {
      const eventType = TASK_EVENT_MAP[task.type];
      const created = buildResidentEvent(current, task.residentId, eventType, { taskId: task.id, source: 'resident_wallet_demo' });
      return {
        ...current,
        events: [created, ...current.events],
        tasks: current.tasks.map((item) => (item.id === task.id ? { ...item, status: 'completed' } : item)),
        notices: task.type === 'acknowledge_notice'
          ? current.notices.map((notice) =>
              notice.acknowledgedResidentIds.includes(task.residentId)
                ? notice
                : { ...notice, acknowledgedResidentIds: [...notice.acknowledgedResidentIds, task.residentId] },
            )
          : current.notices,
        maintenanceRequests: task.type === 'confirm_access' || task.type === 'submit_maintenance_with_photos'
          ? current.maintenanceRequests.map((request) =>
              request.residentId === task.residentId
                ? {
                    ...request,
                    accessConfirmed: task.type === 'confirm_access' ? true : request.accessConfirmed,
                    photoCount: task.type === 'submit_maintenance_with_photos' ? Math.max(request.photoCount, 3) : request.photoCount,
                  }
                : request,
            )
          : current.maintenanceRequests,
        renewals: task.type === 'submit_renewal_interest'
          ? current.renewals.map((renewal) =>
              renewal.residentId === task.residentId ? { ...renewal, status: 'interested' } : renewal,
            )
          : current.renewals,
      };
    });
  };

  const redeemReward = (reward: RewardOption) => {
    setLastAction({
      title: 'Reward request queued',
      detail: `${reward.label} ${reward.valueLabel} is waiting for manager approval in this demo.`,
      tone: 'reward',
    });
    setDemo((current) => {
      const redemption = {
        id: `redemption-${reward.id}-${Date.now()}`,
        residentId: resident.id,
        buildingId: resident.buildingId,
        rewardId: reward.id,
        status: 'pending' as const,
        pointCost: reward.pointCost,
        valueLabel: reward.valueLabel,
        requestedAt: new Date().toISOString(),
      };
      const event = buildResidentEvent(current, resident.id, 'reward_redeemed', {
        rewardId: reward.id,
        valueLabel: reward.valueLabel,
      });
      return {
        ...current,
        rewardRedemptions: [redemption, ...current.rewardRedemptions],
        events: [event, ...current.events],
      };
    });
  };

  const communityFeed = [
    {
      title: 'June resident drop',
      benefit: '$25 grocery wallet draw for residents who complete this week\'s building notice.',
      detail: 'Ends Friday',
      image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=500&q=80',
    },
    {
      title: 'Lobby coffee morning',
      benefit: 'Free coffee bar for residents after the annual fire alarm test is acknowledged.',
      detail: 'Saturday 9:30 AM',
      image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=500&q=80',
    },
    {
      title: 'Move-out marketplace',
      benefit: 'Residents are sharing shelves, desks, boxes, and move-out items with the building.',
      detail: '12 active posts',
      image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=500&q=80',
    },
    {
      title: 'Ask management',
      benefit: 'Vote on bike room storage, package room hours, and summer patio rules.',
      detail: '3 open polls',
      image: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=500&q=80',
    },
  ];

  return (
    <div className="min-h-screen overflow-hidden bg-[#f6f1e7] text-stone-950">
      <div
        className="absolute inset-x-0 top-0 h-[430px] bg-cover bg-center opacity-25"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1800&q=80')",
        }}
      />
      <div className="relative min-h-screen bg-gradient-to-b from-stone-950 via-stone-950/95 to-[#f6f1e7]">
        <header className="border-b border-white/10 px-4 py-4 md:px-6">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3 text-white">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f6c451] text-stone-950">
                <Home className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-black">Living Rewards</p>
                <p className="text-xs text-white/55">Resident wallet demo</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={resident.id}
                onValueChange={(value) => {
                  setSelectedResidentId(value);
                  setLastAction(null);
                }}
              >
                <SelectTrigger className="w-[260px] border-white/15 bg-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {demo.residents.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      Unit {getResidentUnitLabel(demo, item)} - {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" asChild className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white">
                <Link href="/resident-loyalty">
                  <ArrowLeft className="h-4 w-4" />
                  Product demo
                </Link>
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:px-6 lg:grid-cols-[430px_1fr] lg:items-start">
          <section className="mx-auto w-full max-w-[430px] rounded-lg border border-white/20 bg-stone-950 p-3 shadow-2xl">
            <div className="overflow-hidden rounded-lg bg-[#fbf7ee]">
              <div className="bg-stone-950 p-5 text-white">
                <div className="mb-4 flex items-center justify-between text-[11px] font-semibold text-white/60">
                  <span>9:41</span>
                  <span>Living Rewards</span>
                  <span>5G</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-white/55">{building.name}</p>
                    <h1 className="mt-1 text-2xl font-black">{resident.name}</h1>
                    <p className="mt-1 text-sm text-white/60">Unit {getResidentUnitLabel(demo, resident)} - {building.neighbourhood}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge className="bg-white/10 text-white hover:bg-white/10">Gold resident</Badge>
                      <Badge variant="outline" className="border-white/15 bg-white/5 text-white">
                        {isDatabaseBacked ? 'Database-backed' : 'Demo'}
                      </Badge>
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#f6c451] p-2 text-stone-950">
                    <WalletCards className="h-5 w-5" />
                  </div>
                </div>

                {lastAction && (
                  <div
                    className={`mt-4 rounded-lg border p-3 ${
                      lastAction.tone === 'earned'
                        ? 'border-emerald-300/25 bg-emerald-400/10'
                        : 'border-[#f6c451]/30 bg-[#f6c451]/10'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className={lastAction.tone === 'earned' ? 'mt-0.5 h-4 w-4 text-emerald-300' : 'mt-0.5 h-4 w-4 text-[#f6c451]'} />
                      <div>
                        <p className="text-sm font-black">{lastAction.title}</p>
                        <p className="mt-1 text-xs leading-5 text-white/65">{lastAction.detail}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-5 rounded-lg bg-[#f6c451] p-5 text-stone-950">
                  <p className="text-xs font-semibold uppercase">Available points</p>
                  <p className="mt-1 text-5xl font-black">{currentPoints.toLocaleString()}</p>
                  <p className="mt-2 text-sm text-stone-700">{lifetimePoints.toLocaleString()} lifetime points</p>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-white/10 bg-white/10 p-3">
                    <p className="text-xs text-white/55">Rent streak</p>
                    <p className="mt-1 text-2xl font-black">{resident.rentStreakMonths} mo</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/10 p-3">
                    <p className="text-xs text-white/55">Next reward</p>
                    <p className="mt-1 text-2xl font-black">{nextMilestone?.valueLabel ?? 'Unlocked'}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-4">
                <PhoneCard className="bg-[#fff3ce]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-[#7a4c00]">Monthly drop</p>
                      <p className="mt-1 text-lg font-black">First-of-month rewards</p>
                      <p className="mt-1 text-sm text-stone-700">Internet credits, grocery wallet drops, and building-wide rewards.</p>
                    </div>
                    <Sparkles className="h-5 w-5 text-[#8a5a00]" />
                  </div>
                </PhoneCard>

                <PhoneCard>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-stone-500">Milestone progress</p>
                      <p className="mt-1 font-black">
                        {nextMilestone ? `${nextMilestone.months} month reward` : 'Top milestone reached'}
                      </p>
                    </div>
                    <Trophy className="h-5 w-5 text-[#b77a00]" />
                  </div>
                  <Progress value={progressToNextMilestone} className="mt-3 h-2" />
                  <p className="mt-2 text-xs text-stone-500">
                    {currentMilestone ? `${currentMilestone.rewardLabel} earned` : 'Keep the streak going.'}
                  </p>
                </PhoneCard>

                {lifecycle && (
                  <PhoneCard>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase text-stone-500">Move-in portal</p>
                        <p className="mt-1 text-lg font-black">{onboardingProgress.percent}% ready</p>
                        <p className="mt-1 text-sm text-stone-600">
                          Lease, deposit, inspection, and rent status. No payments are collected here.
                        </p>
                      </div>
                      <KeyRound className="h-5 w-5 text-[#8a5a00]" />
                    </div>
                    <Progress value={onboardingProgress.percent} className="mt-3 h-2" />
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                        <FileText className="h-4 w-4 text-stone-700" />
                        <p className="mt-2 text-xs font-semibold text-stone-500">Lease</p>
                        <p className="mt-1 text-sm font-black capitalize">{readableStatus(lifecycle.lease.status)}</p>
                      </div>
                      <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                        <ShieldCheck className="h-4 w-4 text-emerald-700" />
                        <p className="mt-2 text-xs font-semibold text-stone-500">Deposit</p>
                        <p className="mt-1 text-sm font-black capitalize">{readableStatus(lifecycle.securityDeposit.status)}</p>
                      </div>
                      <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                        <ClipboardCheck className="h-4 w-4 text-sky-700" />
                        <p className="mt-2 text-xs font-semibold text-stone-500">Inspection</p>
                        <p className="mt-1 text-sm font-black capitalize">{readableStatus(lifecycle.moveInInspection.status)}</p>
                      </div>
                      <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                        <ReceiptText className="h-4 w-4 text-amber-700" />
                        <p className="mt-2 text-xs font-semibold text-stone-500">Next rent</p>
                        <p className="mt-1 text-sm font-black">{formatDate(lifecycle.nextRent.dueDate)}</p>
                      </div>
                    </div>
                  </PhoneCard>
                )}

                <Tabs defaultValue="earn" className="space-y-3">
                  <TabsContent value="earn" className="space-y-3">
                    {availableTasks.length === 0 ? (
                      <PhoneCard className="bg-emerald-50">
                        <p className="font-bold text-emerald-950">No open missions.</p>
                        <p className="mt-1 text-sm text-emerald-800">{completedTasks.length} completed in this demo.</p>
                      </PhoneCard>
                    ) : (
                      availableTasks.map((task) => {
                        const Icon = taskIcons[task.type];
                        return (
                          <PhoneCard key={task.id}>
                            <div className="flex items-start gap-3">
                              <div className="rounded-lg bg-stone-950 p-2 text-[#f6c451]">
                                <Icon className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="font-black leading-5">{task.title}</p>
                                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">+{task.points}</Badge>
                                </div>
                                <p className="mt-1 text-sm text-stone-500">
                                  {taskTypeLabel(task.type)} - due {formatDate(task.dueAt)}
                                </p>
                              </div>
                            </div>
                            <Button className="mt-4 w-full bg-stone-950 text-white hover:bg-stone-800" onClick={() => completeTask(task)}>
                              Complete mission
                            </Button>
                          </PhoneCard>
                        );
                      })
                    )}
                  </TabsContent>

                  <TabsContent value="community" className="space-y-3">
                    {communityFeed.map((benefit, index) => {
                      const Icon = communityIcons[index % communityIcons.length];
                      return (
                        <div key={benefit.title} className="overflow-hidden rounded-lg border border-stone-200 bg-white">
                          <img src={benefit.image} alt="" className="h-24 w-full object-cover" />
                          <div className="flex items-start gap-3 p-4">
                            <div className="rounded-lg bg-[#fff3ce] p-2 text-[#7a4c00]">
                              <Icon className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-black">{benefit.title}</p>
                              <p className="mt-1 text-sm text-stone-600">{benefit.benefit}</p>
                              <p className="mt-2 text-xs font-semibold text-stone-500">{benefit.detail}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </TabsContent>

                  <TabsContent value="redeem" className="space-y-3">
                    <PhoneCard className="border-[#f6c451]/50 bg-[#fff3ce]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase text-[#7a4c00]">June feature reward</p>
                          <p className="mt-1 text-lg font-black">Internet + grocery credit week</p>
                          <p className="mt-1 text-sm text-stone-700">Mock credits tied to useful resident actions, not a payment product.</p>
                        </div>
                        <Gift className="h-5 w-5 text-[#8a5a00]" />
                      </div>
                    </PhoneCard>
                    {availableRewards.length === 0 ? (
                      <PhoneCard>
                        <p className="font-bold">No rewards unlocked yet.</p>
                        <p className="mt-1 text-sm text-stone-500">Complete missions or keep your rent streak alive.</p>
                      </PhoneCard>
                    ) : (
                      availableRewards.map((reward) => (
                        <PhoneCard key={reward.id}>
                          {(() => {
                            const RewardIcon = rewardIcons[reward.category];
                            return (
                              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-stone-950 text-[#f6c451]">
                                <RewardIcon className="h-5 w-5" />
                              </div>
                            );
                          })()}
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-black">{reward.label}</p>
                              <p className="mt-1 text-sm text-stone-600">{rewardCategoryLabel(reward.category)} - {reward.valueLabel}</p>
                            </div>
                            <Badge variant="outline">{rewardRequirementLabel(reward)}</Badge>
                          </div>
                          <Button className="mt-4 w-full" variant="outline" onClick={() => redeemReward(reward)}>
                            Request reward
                          </Button>
                        </PhoneCard>
                      ))
                    )}
                    {lockedRewards.length > 0 && (
                      <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                        <p className="text-xs font-semibold uppercase text-stone-500">Unlock next</p>
                        <div className="mt-3 space-y-2">
                          {lockedRewards.map((reward) => {
                            const RewardIcon = rewardIcons[reward.category];
                            return (
                              <div key={reward.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-3">
                                <div className="flex items-center gap-3">
                                  <div className="rounded-lg bg-stone-100 p-2 text-stone-700">
                                    <RewardIcon className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-black">{reward.label}</p>
                                    <p className="text-xs text-stone-500">{reward.valueLabel}</p>
                                  </div>
                                </div>
                                <Badge variant="outline">{rewardRequirementLabel(reward)}</Badge>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="activity" className="space-y-3">
                    {residentEvents.slice(0, 8).map((event) => (
                      <PhoneCard key={event.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black">{eventTypeLabel(event.eventType)}</p>
                            <p className="mt-1 text-sm text-stone-500">{formatDate(event.createdAt)}</p>
                          </div>
                          <Badge className="bg-emerald-700 text-white hover:bg-emerald-700">+{event.pointsAwarded}</Badge>
                        </div>
                      </PhoneCard>
                    ))}
                  </TabsContent>

                  <TabsList className="sticky bottom-0 grid h-auto w-full grid-cols-4 rounded-lg border border-stone-200 bg-white p-1 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
                    <TabsTrigger value="earn" className="flex h-14 flex-col gap-1 text-xs data-[state=active]:bg-stone-950 data-[state=active]:text-white">
                      <ClipboardCheck className="h-4 w-4" />
                      Earn
                    </TabsTrigger>
                    <TabsTrigger value="community" className="flex h-14 flex-col gap-1 text-xs data-[state=active]:bg-stone-950 data-[state=active]:text-white">
                      <MessageSquare className="h-4 w-4" />
                      Community
                    </TabsTrigger>
                    <TabsTrigger value="redeem" className="flex h-14 flex-col gap-1 text-xs data-[state=active]:bg-stone-950 data-[state=active]:text-white">
                      <Gift className="h-4 w-4" />
                      Redeem
                    </TabsTrigger>
                    <TabsTrigger value="activity" className="flex h-14 flex-col gap-1 text-xs data-[state=active]:bg-stone-950 data-[state=active]:text-white">
                      <WalletCards className="h-4 w-4" />
                      Activity
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </section>

          <section className="space-y-4 text-white">
            <div className="rounded-lg border border-white/10 bg-white/10 p-5 md:p-7">
              <Badge className="bg-[#f6c451] text-stone-950 hover:bg-[#f6c451]">Resident app view</Badge>
              <h2 className="mt-4 max-w-2xl text-4xl font-black leading-none md:text-6xl">
                A resident wallet for home, community, and real rewards.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/70">
                The manager benefits are downstream. The resident sees a wallet, a rent streak, a monthly drop,
                resident credits, monthly drops, building updates, and simple ways to earn.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/10 p-4">
                <ShieldCheck className="h-5 w-5 text-[#f6c451]" />
                <p className="mt-3 text-xl font-black">Rent streak</p>
                <p className="mt-1 text-sm leading-6 text-white/65">A positive habit loop, not a tenant score.</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/10 p-4">
                <MapPin className="h-5 w-5 text-rose-300" />
                <p className="mt-3 text-xl font-black">Community value</p>
                <p className="mt-1 text-sm leading-6 text-white/65">Useful updates, polls, events, and resident marketplace posts.</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/10 p-4">
                <Gift className="h-5 w-5 text-emerald-300" />
                <p className="mt-3 text-xl font-black">Flexible rewards</p>
                <p className="mt-1 text-sm leading-6 text-white/65">Internet, grocery, transit, dining, rent, and community drops.</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/10 p-4">
                <CheckCircle2 className="h-5 w-5 text-sky-300" />
                <p className="mt-3 text-xl font-black">Operational lift</p>
                <p className="mt-1 text-sm leading-6 text-white/65">The resident experience creates cleaner records for managers.</p>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/10 p-5">
              <div className="flex items-center gap-2">
                <Plane className="h-5 w-5 text-[#f6c451]" />
                <p className="text-xl font-black">Still mocked</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-white/65">
                No payments, card rails, banking, credit reporting, real gift cards, or travel transfers are integrated.
                This is a visual and workflow prototype for feedback.
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
