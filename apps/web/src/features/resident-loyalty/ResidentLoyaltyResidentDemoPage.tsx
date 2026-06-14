import { useMemo, useState, type ComponentType } from 'react';
import { Link } from 'wouter';
import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Coffee,
  Gift,
  Home,
  KeyRound,
  MapPin,
  Plane,
  ShieldCheck,
  Sparkles,
  Store,
  TicketPercent,
  Trophy,
  Utensils,
  WalletCards,
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
  calculateLifetimePoints,
  calculateResidentPoints,
  eventTypeLabel,
  getAvailableRewards,
  getCurrentStreakMilestone,
  getNextStreakMilestone,
  getResidentUnitLabel,
  rewardCategoryLabel,
  TASK_EVENT_MAP,
  taskTypeLabel,
} from './residentLoyaltyLogic';
import type { ResidentTask, RewardOption } from './types';

type IconType = ComponentType<{ className?: string }>;

const taskIcons: Record<ResidentTask['type'], IconType> = {
  acknowledge_notice: Bell,
  submit_maintenance_with_photos: Wrench,
  confirm_access: KeyRound,
  submit_renewal_interest: CalendarClock,
  complete_move_in_checklist: ClipboardCheck,
};

const formatDate = (iso?: string) =>
  iso ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso)) : 'Open';

function rewardRequirementLabel(reward: RewardOption) {
  if (typeof reward.pointCost === 'number') return `${reward.pointCost.toLocaleString()} pts`;
  if (typeof reward.milestoneMonths === 'number') return `${reward.milestoneMonths} mo streak`;
  return 'Available';
}

function AppMetric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: IconType;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.07] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-white/55">{label}</p>
          <p className="mt-2 text-2xl font-black text-white">{value}</p>
          <p className="mt-1 text-xs leading-5 text-white/60">{detail}</p>
        </div>
        <div className="rounded-lg bg-[#f6c451] p-2 text-stone-950">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <div>
      <Badge variant="outline" className="border-white/15 bg-white/10 text-white">
        {eyebrow}
      </Badge>
      <h2 className="mt-3 text-2xl font-black text-white">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">{detail}</p>
    </div>
  );
}

export default function ResidentLoyaltyResidentDemoPage() {
  const [demo, setDemo] = useState(createResidentLoyaltyDemoState);
  const [selectedResidentId, setSelectedResidentId] = useState('resident-amelia-wong');
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
  const lockedRewards = demo.rewards.filter((reward) => !availableRewards.some((available) => available.id === reward.id)).slice(0, 6);
  const residentEvents = [...demo.events]
    .filter((event) => event.residentId === resident.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const completeTask = (task: ResidentTask) => {
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

  const nearbyBenefits = [
    { icon: Coffee, merchant: 'Credo Coffee', benefit: 'Free size upgrade', detail: 'Resident wallet perk', tone: 'bg-[#fff3ce] text-[#7a4c00]' },
    { icon: Utensils, merchant: 'Oliver Exchange', benefit: '$15 dinner drop', detail: 'Monthly drop', tone: 'bg-rose-50 text-rose-800' },
    { icon: Store, merchant: 'Corner Market', benefit: 'Grocery points boost', detail: 'Linked wallet offer', tone: 'bg-emerald-50 text-emerald-800' },
    { icon: TicketPercent, merchant: 'Studio Pass', benefit: 'First class free', detail: 'Move-in welcome', tone: 'bg-sky-50 text-sky-800' },
  ];

  return (
    <div className="min-h-screen bg-[#111412] text-white">
      <header className="border-b border-white/10 bg-[#111412]/95 px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f6c451] text-stone-950">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-black">Living Rewards</p>
              <p className="text-xs text-white/55">{building.name} - Unit {getResidentUnitLabel(demo, resident)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={resident.id} onValueChange={setSelectedResidentId}>
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

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:px-6 lg:grid-cols-[390px_1fr]">
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-lg border border-white/10 bg-white/[0.06] p-3 shadow-2xl">
            <div className="rounded-lg bg-[#fbf7ee] p-4 text-stone-950">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-stone-500">Welcome back</p>
                  <h1 className="mt-1 text-2xl font-black">{resident.name}</h1>
                </div>
                <div className="rounded-lg bg-stone-950 p-2 text-[#f6c451]">
                  <WalletCards className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-5 rounded-lg bg-stone-950 p-5 text-white">
                <p className="text-xs text-white/55">Available points</p>
                <p className="mt-2 text-5xl font-black">{currentPoints.toLocaleString()}</p>
                <p className="mt-2 text-sm text-white/65">{lifetimePoints.toLocaleString()} lifetime points</p>
              </div>

              <div className="mt-3 rounded-lg border border-stone-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase text-stone-500">Connected home</p>
                    <p className="mt-1 font-black">{building.name}</p>
                    <p className="text-sm text-stone-600">Unit {getResidentUnitLabel(demo, resident)} - {building.neighbourhood}</p>
                  </div>
                  <BadgeCheck className="h-5 w-5 text-emerald-700" />
                </div>
              </div>

              <div className="mt-3 rounded-lg bg-[#fff3ce] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase text-[#7a4c00]">Monthly drop</p>
                    <p className="mt-1 font-black">First-of-month rewards</p>
                  </div>
                  <Sparkles className="h-5 w-5 text-[#8a5a00]" />
                </div>
                <p className="mt-2 text-sm text-stone-700">Dining credits, free-rent draw, and bonus neighborhood points.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-white/10 bg-white/[0.07] p-3 text-center">
              <Home className="mx-auto h-4 w-4 text-[#f6c451]" />
              <p className="mt-1 text-xs font-semibold text-white/75">Rent</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.07] p-3 text-center">
              <MapPin className="mx-auto h-4 w-4 text-rose-300" />
              <p className="mt-1 text-xs font-semibold text-white/75">Nearby</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.07] p-3 text-center">
              <Gift className="mx-auto h-4 w-4 text-emerald-300" />
              <p className="mt-1 text-xs font-semibold text-white/75">Redeem</p>
            </div>
          </div>
        </aside>

        <section className="space-y-5">
          <div className="rounded-lg border border-white/10 bg-white/[0.06] p-5 md:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <Badge className="bg-[#f6c451] text-stone-950 hover:bg-[#f6c451]">Resident wallet demo</Badge>
                <h2 className="mt-4 max-w-3xl text-4xl font-black leading-none md:text-5xl">
                  Turn rent, home tasks, and local perks into one rewards loop.
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-white/65">
                  The landlord gets fewer chases and better records. The resident gets a points wallet, useful perks,
                  and a positive reason to engage with the building.
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#f6c451] p-4 text-stone-950 lg:w-[260px]">
                <p className="text-xs font-semibold uppercase">Next milestone</p>
                <p className="mt-2 text-xl font-black">
                  {nextMilestone ? `${nextMilestone.months} months for ${nextMilestone.valueLabel}` : 'Top milestone reached'}
                </p>
                <Progress value={progressToNextMilestone} className="mt-3 h-2 bg-white/60" />
                <p className="mt-2 text-xs text-stone-700">
                  {currentMilestone ? `${currentMilestone.rewardLabel} earned` : `${resident.rentStreakMonths} months completed`}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <AppMetric label="Rent streak" value={`${resident.rentStreakMonths} mo`} detail={resident.autopayStatus === 'enabled' ? 'Autopay/PAD enabled' : 'Autopay/PAD not active'} icon={ShieldCheck} />
            <AppMetric label="Missions" value={availableTasks.length} detail={`${completedTasks.length} completed in demo`} icon={ClipboardCheck} />
            <AppMetric label="Rewards" value={residentRedemptions.length} detail={`${residentRedemptions.filter((item) => item.status === 'pending').length} pending`} icon={Trophy} />
            <AppMetric label="Neighborhood" value="4" detail="Local benefits nearby" icon={MapPin} />
          </div>

          <Tabs defaultValue="earn" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4 border border-white/10 bg-white/[0.07] text-white">
              <TabsTrigger value="earn">Earn</TabsTrigger>
              <TabsTrigger value="nearby">Nearby</TabsTrigger>
              <TabsTrigger value="redeem">Redeem</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="earn" className="space-y-4">
              <SectionHeading
                eyebrow="Home missions"
                title="Earn points for useful resident actions"
                detail="These are operational tasks, but they are framed as positive earn moments: confirm access, add photos, acknowledge notices, and share renewal interest."
              />
              <div className="grid gap-3 md:grid-cols-2">
                {availableTasks.length === 0 ? (
                  <div className="rounded-lg border border-emerald-300/30 bg-emerald-400/10 p-4 text-sm font-medium text-emerald-100">
                    No open missions for this resident.
                  </div>
                ) : (
                  availableTasks.map((task) => {
                    const Icon = taskIcons[task.type];
                    return (
                      <div key={task.id} className="rounded-lg border border-white/10 bg-white/[0.07] p-4">
                        <div className="flex items-start gap-3">
                          <div className="rounded-lg bg-white p-2 text-stone-950">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-black text-white">{task.title}</p>
                              <Badge className="bg-emerald-500 text-emerald-950 hover:bg-emerald-500">+{task.points}</Badge>
                            </div>
                            <p className="mt-1 text-sm text-white/60">
                              {taskTypeLabel(task.type)} - due {formatDate(task.dueAt)}
                            </p>
                          </div>
                        </div>
                        <Button className="mt-4 w-full bg-[#f6c451] text-stone-950 hover:bg-[#ffd76a]" onClick={() => completeTask(task)}>
                          Claim points
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.07] p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                  <p className="font-black text-white">Completed in this demo</p>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {completedTasks.length === 0 ? (
                    <p className="text-sm text-white/55">No completed missions yet.</p>
                  ) : (
                    completedTasks.map((task) => (
                      <div key={task.id} className="rounded-lg bg-white/10 p-3">
                        <p className="font-semibold text-white">{task.title}</p>
                        <p className="mt-1 text-sm text-emerald-200">+{task.points} points</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="nearby" className="space-y-4">
              <SectionHeading
                eyebrow="Neighborhood benefits"
                title="Make the neighborhood part of the amenity stack"
                detail="The strongest product lesson is that resident loyalty is broader than rent. This demo adds a local-benefits surface without adding payments or card rails."
              />
              <div className="grid gap-3 md:grid-cols-2">
                {nearbyBenefits.map((benefit) => {
                  const Icon = benefit.icon;
                  return (
                    <div key={benefit.merchant} className="rounded-lg border border-white/10 bg-white p-4 text-stone-950">
                      <div className="flex items-start gap-3">
                        <div className={`rounded-lg p-2 ${benefit.tone}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-black">{benefit.merchant}</p>
                          <p className="mt-1 text-sm text-stone-600">{benefit.benefit}</p>
                          <p className="mt-3 text-xs font-semibold text-stone-500">{benefit.detail}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="redeem" className="space-y-4">
              <SectionHeading
                eyebrow="Reward marketplace"
                title="Redeem for rent, everyday spend, travel, or building perks"
                detail="Fulfillment is mocked. The important prototype behavior is that the resident sees flexible value, not just a manager task queue."
              />
              <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
                <div className="rounded-lg border border-white/10 bg-white/[0.07] p-4">
                  <div className="flex items-center gap-2">
                    <Gift className="h-5 w-5 text-[#f6c451]" />
                    <p className="font-black text-white">Available now</p>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {availableRewards.length === 0 ? (
                      <p className="text-sm text-white/55">No rewards currently available.</p>
                    ) : (
                      availableRewards.map((reward) => (
                        <div key={reward.id} className="rounded-lg bg-white p-4 text-stone-950">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-black">{reward.label}</p>
                              <p className="mt-1 text-sm text-stone-600">{rewardCategoryLabel(reward.category)} - {reward.valueLabel}</p>
                            </div>
                            <Badge variant="outline">{rewardRequirementLabel(reward)}</Badge>
                          </div>
                          <Button className="mt-4 w-full" variant="outline" onClick={() => redeemReward(reward)}>
                            Request
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.07] p-4">
                  <div className="flex items-center gap-2">
                    <Plane className="h-5 w-5 text-sky-300" />
                    <p className="font-black text-white">Unlock next</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {lockedRewards.map((reward) => (
                      <div key={reward.id} className="rounded-lg border border-white/10 bg-white/10 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{reward.label}</p>
                            <p className="mt-1 text-sm text-white/55">{rewardCategoryLabel(reward.category)} - {reward.valueLabel}</p>
                          </div>
                          <Badge variant="outline" className="border-white/15 text-white">
                            {rewardRequirementLabel(reward)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.07] p-4">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-[#f6c451]" />
                  <p className="font-black text-white">Reward requests</p>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {residentRedemptions.length === 0 ? (
                    <p className="text-sm text-white/55">No reward requests for this resident.</p>
                  ) : (
                    residentRedemptions.map((redemption) => {
                      const reward = demo.rewards.find((item) => item.id === redemption.rewardId);
                      return (
                        <div key={redemption.id} className="rounded-lg bg-white/10 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{reward?.label ?? 'Reward'} - {redemption.valueLabel}</p>
                              <p className="mt-1 text-sm text-white/55">Requested {formatDate(redemption.requestedAt)}</p>
                            </div>
                            <Badge variant="outline" className="border-white/15 capitalize text-white">{redemption.status}</Badge>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="activity" className="space-y-4">
              <SectionHeading
                eyebrow="Points ledger"
                title="Transparent event history"
                detail="Every rewardable action lands in the same kind of event ledger Level CRE already had, but scoped to resident trust and transparency."
              />
              <div className="rounded-lg border border-white/10 bg-white/[0.07] p-4">
                <div className="space-y-3">
                  {residentEvents.map((event) => (
                    <div key={event.id} className="rounded-lg bg-white p-4 text-stone-950">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black">{eventTypeLabel(event.eventType)}</p>
                          <p className="mt-1 text-sm text-stone-600">{formatDate(event.createdAt)}</p>
                        </div>
                        <Badge className="bg-emerald-700 text-white hover:bg-emerald-700">+{event.pointsAwarded}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-stone-500">{Object.keys(event.metadata).join(', ') || 'No metadata'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </section>
      </main>
    </div>
  );
}
