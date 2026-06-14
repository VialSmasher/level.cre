import { useMemo, useState, type ComponentType } from 'react';
import { Link } from 'wouter';
import {
  ArrowLeft,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Gift,
  Home,
  KeyRound,
  ShieldCheck,
  Trophy,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const taskIcons: Record<ResidentTask['type'], ComponentType<{ className?: string }>> = {
  acknowledge_notice: Bell,
  submit_maintenance_with_photos: Wrench,
  confirm_access: KeyRound,
  submit_renewal_interest: CalendarClock,
  complete_move_in_checklist: ClipboardCheck,
};

const formatDate = (iso?: string) =>
  iso ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso)) : 'Open';

function ResidentMetric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
          </div>
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function rewardRequirementLabel(reward: RewardOption) {
  if (typeof reward.pointCost === 'number') return `${reward.pointCost.toLocaleString()} points`;
  if (typeof reward.milestoneMonths === 'number') return `${reward.milestoneMonths} month rent streak`;
  return 'Available';
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
  const residentEvents = [...demo.events]
    .filter((event) => event.residentId === resident.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const completeTask = (task: ResidentTask) => {
    setDemo((current) => {
      const eventType = TASK_EVENT_MAP[task.type];
      const created = buildResidentEvent(current, task.residentId, eventType, { taskId: task.id, source: 'resident_demo_action' });
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

  return (
    <div className="min-h-screen bg-[#f8f7f4] p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                Resident demo
              </Badge>
              <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                Mock rewards
              </Badge>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 md:text-3xl">Living Rewards</h1>
            <p className="mt-1 text-sm text-slate-600">{building.name} - {building.address}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={resident.id} onValueChange={setSelectedResidentId}>
              <SelectTrigger className="w-[260px] bg-white">
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
            <Button variant="outline" asChild>
              <Link href="/resident-loyalty">
                <ArrowLeft className="h-4 w-4" />
                Manager dashboard
              </Link>
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <div className="grid gap-5 lg:grid-cols-[1fr_320px] lg:items-center">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-950 text-white">
                  <Home className="h-7 w-7" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-500">Unit {getResidentUnitLabel(demo, resident)}</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">{resident.name}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {resident.rentStreakMonths} month on-time rent streak
                    {currentMilestone ? ` - ${currentMilestone.rewardLabel} earned` : ''}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next milestone</p>
                    <p className="mt-2 text-lg font-black text-slate-950">
                      {nextMilestone ? `${nextMilestone.months} months for ${nextMilestone.valueLabel}` : 'Top milestone reached'}
                    </p>
                  </div>
                  <Trophy className="h-6 w-6 text-amber-600" />
                </div>
                <Progress value={progressToNextMilestone} className="mt-3 h-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-4">
          <ResidentMetric label="Current points" value={currentPoints.toLocaleString()} detail={`${lifetimePoints.toLocaleString()} lifetime points`} icon={Gift} />
          <ResidentMetric label="Rent streak" value={`${resident.rentStreakMonths} mo`} detail={resident.autopayStatus === 'enabled' ? 'Autopay/PAD enabled' : 'Autopay/PAD not active'} icon={ShieldCheck} />
          <ResidentMetric label="Available tasks" value={availableTasks.length} detail={`${completedTasks.length} completed in demo`} icon={ClipboardCheck} />
          <ResidentMetric label="Rewards" value={residentRedemptions.length} detail={`${residentRedemptions.filter((item) => item.status === 'pending').length} pending approval`} icon={Trophy} />
        </div>

        <Tabs defaultValue="tasks" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 bg-white md:w-fit">
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="rewards">Rewards</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="tasks">
            <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ClipboardCheck className="h-5 w-5 text-emerald-600" />
                    Available Tasks
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {availableTasks.length === 0 ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
                      No open tasks for this resident.
                    </div>
                  ) : (
                    availableTasks.map((task) => {
                      const Icon = taskIcons[task.type];
                      return (
                        <div key={task.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_auto] md:items-center">
                          <div className="flex items-start gap-3">
                            <div className="rounded-lg bg-slate-100 p-2 text-slate-700">
                              <Icon className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-950">{task.title}</p>
                              <p className="mt-1 text-sm text-slate-500">
                                {taskTypeLabel(task.type)} - due {formatDate(task.dueAt)}
                              </p>
                            </div>
                          </div>
                          <Button onClick={() => completeTask(task)}>
                            +{task.points}
                          </Button>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CheckCircle2 className="h-5 w-5 text-blue-600" />
                    Completed
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {completedTasks.length === 0 ? (
                    <p className="text-sm text-slate-500">No completed tasks in this demo session.</p>
                  ) : (
                    completedTasks.map((task) => (
                      <div key={task.id} className="rounded-lg border border-slate-200 p-3">
                        <p className="font-semibold text-slate-950">{task.title}</p>
                        <p className="mt-1 text-sm text-emerald-700">+{task.points} points</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="rewards">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Gift className="h-5 w-5 text-violet-600" />
                    Available Rewards
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {availableRewards.length === 0 ? (
                    <p className="text-sm text-slate-500">No rewards currently available.</p>
                  ) : (
                    availableRewards.map((reward) => (
                      <div key={reward.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-950">{reward.label}</p>
                            <p className="mt-1 text-sm text-slate-500">{rewardCategoryLabel(reward.category)} - {reward.valueLabel}</p>
                          </div>
                          <Badge variant="outline">{rewardRequirementLabel(reward)}</Badge>
                        </div>
                        <Button className="mt-3 w-full" variant="outline" onClick={() => redeemReward(reward)}>
                          Request
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Trophy className="h-5 w-5 text-amber-600" />
                    Reward Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {residentRedemptions.length === 0 ? (
                    <p className="text-sm text-slate-500">No reward requests for this resident.</p>
                  ) : (
                    residentRedemptions.map((redemption) => {
                      const reward = demo.rewards.find((item) => item.id === redemption.rewardId);
                      return (
                        <div key={redemption.id} className="rounded-lg border border-slate-200 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-950">{reward?.label ?? 'Reward'} - {redemption.valueLabel}</p>
                              <p className="mt-1 text-sm text-slate-500">Requested {formatDate(redemption.requestedAt)}</p>
                            </div>
                            <Badge variant="outline" className="capitalize">{redemption.status}</Badge>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="activity">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  Points Ledger
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-3 pr-4">Date</th>
                      <th className="py-3 pr-4">Event</th>
                      <th className="py-3 pr-4">Points</th>
                      <th className="py-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {residentEvents.map((event) => (
                      <tr key={event.id}>
                        <td className="py-3 pr-4 text-slate-500">{formatDate(event.createdAt)}</td>
                        <td className="py-3 pr-4 font-semibold text-slate-950">{eventTypeLabel(event.eventType)}</td>
                        <td className="py-3 pr-4 font-semibold text-emerald-700">+{event.pointsAwarded}</td>
                        <td className="py-3 text-xs text-slate-500">{Object.keys(event.metadata).join(', ') || 'none'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
