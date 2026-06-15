import type {
  MaintenanceRequest,
  OnboardingStepStatus,
  Resident,
  ResidentEvent,
  ResidentEventType,
  ResidentLoyaltyDemoState,
  ResidentTaskType,
  RewardOption,
  RewardRedemption,
} from './types';

export const POINT_RULES: Record<ResidentEventType, number> = {
  rent_paid_on_time: 0,
  rent_streak_continued: 100,
  maintenance_request_submitted: 25,
  maintenance_request_submitted_with_photos: 100,
  access_confirmed: 150,
  notice_acknowledged: 25,
  renewal_interest_submitted: 500,
  renewal_signed_early: 500,
  move_in_checklist_completed: 250,
  reward_redeemed: 0,
};

export const STREAK_MILESTONES = [
  { months: 3, valueLabel: '$10', rewardLabel: '3-month rent streak milestone' },
  { months: 6, valueLabel: '$25', rewardLabel: '6-month rent streak milestone' },
  { months: 12, valueLabel: '$100', rewardLabel: '12-month rent streak milestone' },
] as const;

export const TASK_EVENT_MAP: Record<ResidentTaskType, ResidentEventType> = {
  acknowledge_notice: 'notice_acknowledged',
  submit_maintenance_with_photos: 'maintenance_request_submitted_with_photos',
  confirm_access: 'access_confirmed',
  submit_renewal_interest: 'renewal_interest_submitted',
  complete_move_in_checklist: 'move_in_checklist_completed',
};

const FOLLOW_UP_AVOIDED_WEIGHTS: Partial<Record<ResidentEventType, number>> = {
  notice_acknowledged: 0.5,
  access_confirmed: 1,
  maintenance_request_submitted_with_photos: 1.5,
  renewal_interest_submitted: 2,
  renewal_signed_early: 2,
  move_in_checklist_completed: 1,
  rent_streak_continued: 0.25,
};

export type BuildingStats = {
  healthScore: number;
  unitCount: number;
  occupiedUnits: number;
  residentCount: number;
  onTimeStreakCount: number;
  averageRentStreakMonths: number;
  maintenanceRequestCount: number;
  maintenanceWithPhotosCount: number;
  maintenancePhotoRate: number;
  accessConfirmations: number;
  noticeAcknowledgementRate: number;
  renewalInterestCount: number;
  rewardsPending: number;
  rewardsIssued: number;
  estimatedFollowUpsAvoided: number;
  openTaskCount: number;
  onboardingCompletionRate: number;
  moveInReviewCount: number;
};

export function eventTypeLabel(eventType: ResidentEventType) {
  const labels: Record<ResidentEventType, string> = {
    rent_paid_on_time: 'Rent paid on time',
    rent_streak_continued: 'Rent streak continued',
    maintenance_request_submitted: 'Maintenance request submitted',
    maintenance_request_submitted_with_photos: 'Maintenance request with photos',
    access_confirmed: 'Access confirmed',
    notice_acknowledged: 'Notice acknowledged',
    renewal_interest_submitted: 'Renewal interest submitted',
    renewal_signed_early: 'Renewal signed early',
    move_in_checklist_completed: 'Move-in checklist completed',
    reward_redeemed: 'Reward redeemed',
  };
  return labels[eventType];
}

export function taskTypeLabel(taskType: ResidentTaskType) {
  const labels: Record<ResidentTaskType, string> = {
    acknowledge_notice: 'Acknowledge notice',
    submit_maintenance_with_photos: 'Submit request with photos',
    confirm_access: 'Confirm access',
    submit_renewal_interest: 'Submit renewal interest',
    complete_move_in_checklist: 'Complete move-in checklist',
  };
  return labels[taskType];
}

export function rewardCategoryLabel(category: RewardOption['category']) {
  const labels: Record<RewardOption['category'], string> = {
    rent_credit: 'Rent credit',
    gift_card: 'Gift card',
    perk: 'Community reward',
    fee_waiver: 'Fee waiver',
    travel: 'Travel',
    dining: 'Dining',
    fitness: 'Fitness',
    home: 'Home',
    internet: 'Internet credit',
    transit: 'Transit',
    community: 'Community',
  };
  return labels[category];
}

export function onboardingStatusLabel(status: OnboardingStepStatus) {
  const labels: Record<OnboardingStepStatus, string> = {
    todo: 'To do',
    in_progress: 'In progress',
    submitted: 'Submitted',
    manager_review: 'Manager review',
    complete: 'Complete',
  };
  return labels[status];
}

export function calculateOnboardingProgress(state: ResidentLoyaltyDemoState, residentId: string) {
  const steps = state.onboardingSteps.filter((step) => step.residentId === residentId);
  if (steps.length === 0) {
    return { completed: 0, total: 0, percent: 0 };
  }
  const completed = steps.filter((step) => step.status === 'complete').length;
  return {
    completed,
    total: steps.length,
    percent: Math.round((completed / steps.length) * 100),
  };
}

export function getTenantLifecycle(state: ResidentLoyaltyDemoState, residentId: string) {
  return state.tenantLifecycles.find((record) => record.residentId === residentId) ?? null;
}

export function calculateResidentPoints(
  residentId: string,
  events: ResidentEvent[],
  redemptions: RewardRedemption[],
) {
  const earned = events
    .filter((event) => event.residentId === residentId)
    .reduce((sum, event) => sum + event.pointsAwarded, 0);
  const reservedOrSpent = redemptions
    .filter((redemption) => redemption.residentId === residentId && redemption.pointCost)
    .reduce((sum, redemption) => sum + Number(redemption.pointCost || 0), 0);
  return Math.max(0, earned - reservedOrSpent);
}

export function calculateLifetimePoints(residentId: string, events: ResidentEvent[]) {
  return events
    .filter((event) => event.residentId === residentId)
    .reduce((sum, event) => sum + event.pointsAwarded, 0);
}

export function getResidentUnitLabel(state: ResidentLoyaltyDemoState, resident: Pick<Resident, 'unitId'>) {
  return state.units.find((unit) => unit.id === resident.unitId)?.unitNumber ?? 'Unknown';
}

export function getResidentName(state: ResidentLoyaltyDemoState, residentId: string) {
  return state.residents.find((resident) => resident.id === residentId)?.name ?? 'Resident';
}

export function getResidentUnitNumber(state: ResidentLoyaltyDemoState, residentId: string) {
  const resident = state.residents.find((item) => item.id === residentId);
  if (!resident) return 'Unknown';
  return getResidentUnitLabel(state, resident);
}

export function getNextStreakMilestone(rentStreakMonths: number) {
  return STREAK_MILESTONES.find((milestone) => milestone.months > rentStreakMonths) ?? null;
}

export function getCurrentStreakMilestone(rentStreakMonths: number) {
  return [...STREAK_MILESTONES].reverse().find((milestone) => rentStreakMonths >= milestone.months) ?? null;
}

export function getAvailableRewards(
  resident: Resident,
  points: number,
  rewards: RewardOption[],
) {
  return rewards.filter((reward) => {
    if (typeof reward.pointCost === 'number') return points >= reward.pointCost;
    if (typeof reward.milestoneMonths === 'number') return resident.rentStreakMonths >= reward.milestoneMonths;
    return false;
  });
}

export function maintenancePhotoRate(requests: MaintenanceRequest[]) {
  if (requests.length === 0) return 0;
  const withPhotos = requests.filter((request) => request.photoCount > 0).length;
  return Math.round((withPhotos / requests.length) * 100);
}

export function calculateEstimatedFollowUpsAvoided(events: ResidentEvent[]) {
  const total = events.reduce((sum, event) => {
    return sum + (FOLLOW_UP_AVOIDED_WEIGHTS[event.eventType] ?? 0);
  }, 0);
  return Math.round(total);
}

export function calculateBuildingStats(state: ResidentLoyaltyDemoState, buildingId: string): BuildingStats {
  const units = state.units.filter((unit) => unit.buildingId === buildingId);
  const residents = state.residents.filter((resident) => resident.buildingId === buildingId);
  const events = state.events.filter((event) => event.buildingId === buildingId);
  const requests = state.maintenanceRequests.filter((request) => request.buildingId === buildingId);
  const notices = state.notices.filter((notice) => notice.buildingId === buildingId);
  const renewals = state.renewals.filter((renewal) => renewal.buildingId === buildingId);
  const redemptions = state.rewardRedemptions.filter((redemption) => redemption.buildingId === buildingId);
  const onboardingSteps = state.onboardingSteps.filter((step) => step.buildingId === buildingId);
  const occupiedUnits = units.filter((unit) => unit.occupancyStatus === 'occupied' || unit.occupancyStatus === 'notice_to_vacate').length;
  const onTimeStreakCount = residents.filter((resident) => resident.rentStreakMonths >= 3).length;
  const averageRentStreakMonths = residents.length
    ? Math.round((residents.reduce((sum, resident) => sum + resident.rentStreakMonths, 0) / residents.length) * 10) / 10
    : 0;
  const maintenanceWithPhotosCount = requests.filter((request) => request.photoCount > 0).length;
  const photoRate = maintenancePhotoRate(requests);
  const accessConfirmations = events.filter((event) => event.eventType === 'access_confirmed').length;
  const totalNoticeTargets = notices.length * Math.max(1, residents.length);
  const noticeAcknowledgementRate = totalNoticeTargets
    ? Math.round((notices.reduce((sum, notice) => sum + notice.acknowledgedResidentIds.length, 0) / totalNoticeTargets) * 100)
    : 0;
  const renewalInterestCount = renewals.filter((renewal) => renewal.status === 'interested' || renewal.status === 'signed').length;
  const renewalActiveCount = Math.max(1, renewals.filter((renewal) => renewal.status !== 'declined').length);
  const renewalVisibilityRate = Math.round((renewalInterestCount / renewalActiveCount) * 100);
  const accessCoverageRate = residents.length ? Math.min(100, Math.round((accessConfirmations / residents.length) * 100)) : 0;
  const rentStreakRate = residents.length ? Math.min(100, Math.round((onTimeStreakCount / residents.length) * 100)) : 0;
  const rewardsPending = redemptions.filter((redemption) => redemption.status === 'pending').length;
  const onboardingCompletionRate = onboardingSteps.length
    ? Math.round((onboardingSteps.filter((step) => step.status === 'complete').length / onboardingSteps.length) * 100)
    : 0;
  const moveInReviewCount = state.tenantLifecycles.filter(
    (record) => record.buildingId === buildingId && record.moveInInspection.status === 'manager_review',
  ).length;
  const healthScore = clampScore(
    Math.round(
      noticeAcknowledgementRate * 0.25 +
        photoRate * 0.2 +
        accessCoverageRate * 0.15 +
        renewalVisibilityRate * 0.2 +
        rentStreakRate * 0.2 -
        rewardsPending * 2,
    ),
  );

  return {
    healthScore,
    unitCount: units.length,
    occupiedUnits,
    residentCount: residents.length,
    onTimeStreakCount,
    averageRentStreakMonths,
    maintenanceRequestCount: requests.length,
    maintenanceWithPhotosCount,
    maintenancePhotoRate: photoRate,
    accessConfirmations,
    noticeAcknowledgementRate,
    renewalInterestCount,
    rewardsPending,
    rewardsIssued: redemptions.filter((redemption) => redemption.status === 'approved' || redemption.status === 'issued').length,
    estimatedFollowUpsAvoided: calculateEstimatedFollowUpsAvoided(events),
    openTaskCount: state.tasks.filter((task) => task.buildingId === buildingId && task.status === 'available').length,
    onboardingCompletionRate,
    moveInReviewCount,
  };
}

export function buildResidentEvent(
  state: ResidentLoyaltyDemoState,
  residentId: string,
  eventType: ResidentEventType,
  metadata: Record<string, unknown> = {},
): ResidentEvent {
  const resident = state.residents.find((item) => item.id === residentId);
  if (!resident) {
    throw new Error(`Unknown resident ${residentId}`);
  }
  return {
    id: `event-${eventType}-${residentId}-${Date.now()}`,
    residentId,
    buildingId: resident.buildingId,
    unitId: resident.unitId,
    eventType,
    pointsAwarded: POINT_RULES[eventType],
    metadata,
    createdAt: new Date().toISOString(),
  };
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}
