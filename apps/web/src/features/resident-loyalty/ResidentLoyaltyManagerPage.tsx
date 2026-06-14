import { useMemo, useState, type ComponentType } from 'react';
import { Link } from 'wouter';
import {
  ArrowRight,
  Bell,
  Building2,
  CalendarClock,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Gift,
  KeyRound,
  PlusCircle,
  ShieldCheck,
  Trophy,
  Users,
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
  calculateBuildingStats,
  calculateResidentPoints,
  eventTypeLabel,
  getNextStreakMilestone,
  getResidentName,
  getResidentUnitNumber,
  rewardCategoryLabel,
} from './residentLoyaltyLogic';
import type { MaintenanceRequest, Resident, ResidentEventType, ResidentLoyaltyDemoState, ResidentTaskType } from './types';

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));

const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  tone: 'blue' | 'green' | 'amber' | 'violet' | 'slate' | 'rose';
}) {
  const toneClasses = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
    slate: 'bg-slate-100 text-slate-700',
    rose: 'bg-rose-50 text-rose-700',
  }[tone];

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
          </div>
          <div className={`rounded-lg p-2 ${toneClasses}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ value }: { value: string }) {
  const lower = value.toLowerCase();
  const className = lower.includes('pending') || lower.includes('submitted')
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : lower.includes('reviewed') || lower.includes('scheduled') || lower.includes('interested')
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : lower.includes('issued') || lower.includes('approved') || lower.includes('signed') || lower.includes('completed')
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-slate-200 bg-slate-50 text-slate-700';
  return (
    <Badge variant="outline" className={className}>
      {value.replace(/_/g, ' ')}
    </Badge>
  );
}

function residentUnitLabel(state: ResidentLoyaltyDemoState, resident: Resident) {
  return getResidentUnitNumber(state, resident.id);
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
  const sortedEvents = [...demo.events].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const openRequests = demo.maintenanceRequests.filter((request) => request.status === 'submitted' || request.status === 'reviewed');

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
    if (!selectedResident) return;
    setDemo((current) => {
      const paid = buildResidentEvent(current, selectedResident.id, 'rent_paid_on_time', { month: '2026-06' });
      const streak = buildResidentEvent(current, selectedResident.id, 'rent_streak_continued', {
        source: 'manager_demo_action',
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
    if (!selectedResident || !selectedNotice) return;
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
    if (!selectedResident) return;
    setDemo((current) => ({
      ...current,
      maintenanceRequests: current.maintenanceRequests.map((request) =>
        request.residentId === selectedResident.id ? { ...request, accessConfirmed: true } : request,
      ),
    }));
    addEvent(selectedResident.id, 'access_confirmed', { source: 'manager_demo_action' }, 'confirm_access');
  };

  const markRenewalInterest = () => {
    if (!selectedResident) return;
    setDemo((current) => ({
      ...current,
      renewals: current.renewals.map((renewal) =>
        renewal.residentId === selectedResident.id ? { ...renewal, status: 'interested' } : renewal,
      ),
    }));
    addEvent(selectedResident.id, 'renewal_interest_submitted', { source: 'manager_demo_action' }, 'submit_renewal_interest');
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

  return (
    <div className="min-h-screen bg-[#f7f8fb] p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                Resident loyalty for operations
              </Badge>
              <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                Demo data
              </Badge>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 md:text-3xl">Living Rewards Operations</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Reward residents for behaviours that reduce property manager chasing: better maintenance requests, confirmed access,
              acknowledged notices, early renewal visibility, and consistent rent habits.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/resident-loyalty/resident-demo">
                Resident demo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <div className="grid gap-5 lg:grid-cols-[260px_1fr] lg:items-center">
              <div>
                <p className="text-sm font-semibold text-slate-600">{landlord.name}</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">{building.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{building.address}</p>
                <p className="mt-1 text-xs text-slate-500">Manager: {landlord.managerName}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-[180px_1fr] md:items-center">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Building Health Score</p>
                  <p className="mt-2 text-5xl font-black text-slate-950">{stats.healthScore}</p>
                  <Progress value={stats.healthScore} className="mt-3 h-2" />
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <StatCard label="Units" value={`${stats.occupiedUnits}/${stats.unitCount}`} detail="Occupied or on notice" icon={Building2} tone="slate" />
                  <StatCard label="Residents" value={stats.residentCount} detail={`${stats.openTaskCount} open resident tasks`} icon={Users} tone="blue" />
                  <StatCard label="Rewards" value={stats.rewardsPending} detail={`${stats.rewardsIssued} approved or issued`} icon={Gift} tone="violet" />
                  <StatCard label="Follow-ups avoided" value={stats.estimatedFollowUpsAvoided} detail="Estimated manager touches saved" icon={ShieldCheck} tone="green" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <StatCard label="Rent streaks" value={stats.onTimeStreakCount} detail={`${stats.averageRentStreakMonths} month average`} icon={Trophy} tone="amber" />
          <StatCard label="Maintenance photos" value={`${stats.maintenancePhotoRate}%`} detail={`${stats.maintenanceWithPhotosCount}/${stats.maintenanceRequestCount} requests`} icon={Camera} tone="green" />
          <StatCard label="Access confirmations" value={stats.accessConfirmations} detail="Repair and inspection windows" icon={KeyRound} tone="blue" />
          <StatCard label="Notice acknowledgement" value={`${stats.noticeAcknowledgementRate}%`} detail={`${demo.notices.length} active notices`} icon={Bell} tone="rose" />
        </div>

        <Tabs defaultValue="operations" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 bg-white md:w-fit">
            <TabsTrigger value="operations">Operations</TabsTrigger>
            <TabsTrigger value="residents">Residents</TabsTrigger>
            <TabsTrigger value="rewards">Rewards</TabsTrigger>
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
          </TabsList>

          <TabsContent value="operations" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <PlusCircle className="h-5 w-5 text-emerald-600" />
                    Manager Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Resident</p>
                      <Select value={selectedResident?.id} onValueChange={setSelectedResidentId}>
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
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Notice</p>
                      <Select value={selectedNotice?.id} onValueChange={setSelectedNoticeId}>
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

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button variant="outline" onClick={markRentPaidOnTime}>
                      <CheckCircle2 className="h-4 w-4" />
                      Mark rent on time
                    </Button>
                    <Button variant="outline" onClick={markNoticeAcknowledged}>
                      <Bell className="h-4 w-4" />
                      Mark notice acknowledged
                    </Button>
                    <Button variant="outline" onClick={markAccessConfirmed}>
                      <KeyRound className="h-4 w-4" />
                      Mark access confirmed
                    </Button>
                    <Button variant="outline" onClick={markRenewalInterest}>
                      <CalendarClock className="h-4 w-4" />
                      Renewal interest received
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Wrench className="h-5 w-5 text-blue-600" />
                    Maintenance Coordination
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {openRequests.map((request) => (
                    <div key={request.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_auto] md:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-950">{request.title}</p>
                          <StatusBadge value={request.status} />
                          {request.photoCount > 0 ? (
                            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                              {request.photoCount} photos
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                              needs photos
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          Unit {getResidentUnitNumber(demo, request.residentId)} - {getResidentName(demo, request.residentId)}
                          {request.accessConfirmed ? ' - access confirmed' : ' - access not confirmed'}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => reviewMaintenanceRequest(request)}>
                        Review
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Bell className="h-5 w-5 text-rose-600" />
                    Notice Acknowledgements
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {demo.notices.map((notice) => {
                    const pct = Math.round((notice.acknowledgedResidentIds.length / demo.residents.length) * 100);
                    return (
                      <div key={notice.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-950">{notice.title}</p>
                            <p className="text-sm text-slate-500">Due {formatDate(notice.dueAt)}</p>
                          </div>
                          <Badge variant="outline">{notice.acknowledgedResidentIds.length}/{demo.residents.length}</Badge>
                        </div>
                        <Progress value={pct} className="mt-3 h-2" />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CalendarClock className="h-5 w-5 text-violet-600" />
                    Renewal Visibility
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-slate-100">
                    {demo.renewals.map((renewal) => (
                      <div key={renewal.id} className="flex items-center justify-between gap-3 py-3">
                        <div>
                          <p className="font-semibold text-slate-950">Unit {getResidentUnitNumber(demo, renewal.residentId)}</p>
                          <p className="text-sm text-slate-500">{getResidentName(demo, renewal.residentId)} - target {formatDate(renewal.targetDate)}</p>
                        </div>
                        <StatusBadge value={renewal.status} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="residents">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5 text-blue-600" />
                  Units And Residents
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-3 pr-4">Unit</th>
                      <th className="py-3 pr-4">Resident</th>
                      <th className="py-3 pr-4">Points</th>
                      <th className="py-3 pr-4">Rent streak</th>
                      <th className="py-3 pr-4">Renewal</th>
                      <th className="py-3 pr-4">Open tasks</th>
                      <th className="py-3">Next milestone</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {demo.residents.map((resident) => {
                      const points = calculateResidentPoints(resident.id, demo.events, demo.rewardRedemptions);
                      const renewal = demo.renewals.find((item) => item.residentId === resident.id);
                      const openTaskCount = demo.tasks.filter((task) => task.residentId === resident.id && task.status === 'available').length;
                      const nextMilestone = getNextStreakMilestone(resident.rentStreakMonths);
                      return (
                        <tr key={resident.id}>
                          <td className="py-3 pr-4 font-semibold text-slate-950">{residentUnitLabel(demo, resident)}</td>
                          <td className="py-3 pr-4 text-slate-700">{resident.name}</td>
                          <td className="py-3 pr-4 font-semibold text-emerald-700">{points.toLocaleString()}</td>
                          <td className="py-3 pr-4">{resident.rentStreakMonths} months</td>
                          <td className="py-3 pr-4">{renewal ? <StatusBadge value={renewal.status} /> : <span className="text-slate-400">not due</span>}</td>
                          <td className="py-3 pr-4">{openTaskCount}</td>
                          <td className="py-3 text-slate-600">{nextMilestone ? `${nextMilestone.months} months for ${nextMilestone.valueLabel}` : 'Top milestone reached'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rewards">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Gift className="h-5 w-5 text-violet-600" />
                    Pending And Issued Rewards
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {demo.rewardRedemptions.map((redemption) => {
                    const reward = demo.rewards.find((item) => item.id === redemption.rewardId);
                    return (
                      <div key={redemption.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_auto] md:items-center">
                        <div>
                          <p className="font-semibold text-slate-950">{reward?.label ?? 'Reward'} - {redemption.valueLabel}</p>
                          <p className="text-sm text-slate-500">
                            Unit {getResidentUnitNumber(demo, redemption.residentId)} - {getResidentName(demo, redemption.residentId)}
                          </p>
                        </div>
                        {redemption.status === 'pending' ? (
                          <Button size="sm" onClick={() => approveReward(redemption.id)}>
                            Approve
                          </Button>
                        ) : (
                          <StatusBadge value={redemption.status} />
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Trophy className="h-5 w-5 text-amber-600" />
                    Mock Reward Catalog
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {demo.rewards.map((reward) => (
                    <div key={reward.id} className="rounded-lg border border-slate-200 p-3">
                      <p className="font-semibold text-slate-950">{reward.label}</p>
                      <p className="mt-1 text-sm text-slate-500">{rewardCategoryLabel(reward.category)} - {reward.valueLabel}</p>
                      <Badge variant="outline" className="mt-2">
                        {reward.pointCost ? `${reward.pointCost.toLocaleString()} points` : `${reward.milestoneMonths} month streak`}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="ledger">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ClipboardCheck className="h-5 w-5 text-emerald-600" />
                  Resident Behaviour Event Ledger
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-3 pr-4">Created</th>
                      <th className="py-3 pr-4">Resident</th>
                      <th className="py-3 pr-4">Unit</th>
                      <th className="py-3 pr-4">Event</th>
                      <th className="py-3 pr-4">Points</th>
                      <th className="py-3">Metadata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedEvents.slice(0, 28).map((event) => (
                      <tr key={event.id}>
                        <td className="py-3 pr-4 text-slate-500">{formatDateTime(event.createdAt)}</td>
                        <td className="py-3 pr-4 font-semibold text-slate-950">{getResidentName(demo, event.residentId)}</td>
                        <td className="py-3 pr-4">{getResidentUnitNumber(demo, event.residentId)}</td>
                        <td className="py-3 pr-4">{eventTypeLabel(event.eventType)}</td>
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
