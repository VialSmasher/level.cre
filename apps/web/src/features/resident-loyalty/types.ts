export type ResidentEventType =
  | 'rent_paid_on_time'
  | 'rent_streak_continued'
  | 'maintenance_request_submitted'
  | 'maintenance_request_submitted_with_photos'
  | 'access_confirmed'
  | 'notice_acknowledged'
  | 'renewal_interest_submitted'
  | 'renewal_signed_early'
  | 'move_in_checklist_completed'
  | 'reward_redeemed';

export type ResidentTaskType =
  | 'acknowledge_notice'
  | 'submit_maintenance_with_photos'
  | 'confirm_access'
  | 'submit_renewal_interest'
  | 'complete_move_in_checklist';

export type ResidentTaskStatus = 'available' | 'completed' | 'manager_review';
export type RewardStatus = 'available' | 'pending' | 'approved' | 'issued';
export type MaintenanceStatus = 'submitted' | 'reviewed' | 'scheduled' | 'completed';
export type RenewalInterestStatus = 'not_yet' | 'interested' | 'pending' | 'signed' | 'declined';
export type LeaseDocumentStatus = 'missing' | 'uploaded' | 'acknowledged' | 'signed';
export type SecurityDepositStatus = 'not_requested' | 'requested' | 'received' | 'confirmed';
export type RentDueStatus = 'not_due' | 'upcoming' | 'paid' | 'overdue';
export type MoveInInspectionStatus = 'not_started' | 'in_progress' | 'submitted' | 'manager_review' | 'completed';
export type OnboardingStepStatus = 'todo' | 'in_progress' | 'submitted' | 'manager_review' | 'complete';
export type OnboardingStepType =
  | 'tenant_invite_sent'
  | 'lease_acknowledged'
  | 'security_deposit_confirmed'
  | 'move_in_inspection_completed'
  | 'building_rules_acknowledged'
  | 'utility_setup_confirmed'
  | 'first_rent_status_reviewed';

export type Landlord = {
  id: string;
  name: string;
  managerName: string;
};

export type ResidentBuilding = {
  id: string;
  landlordId: string;
  name: string;
  address: string;
  neighbourhood: string;
  unitCount: number;
};

export type ResidentUnit = {
  id: string;
  buildingId: string;
  unitNumber: string;
  floor: number;
  bedrooms: number;
  residentId?: string;
  occupancyStatus: 'occupied' | 'vacant' | 'notice_to_vacate';
};

export type Resident = {
  id: string;
  buildingId: string;
  unitId: string;
  name: string;
  email: string;
  moveInDate: string;
  rentStreakMonths: number;
  autopayStatus: 'not_set' | 'interested' | 'enabled';
  renewalWindow: 'not_due' | 'upcoming' | 'active';
};

export type ResidentEvent = {
  id: string;
  residentId: string;
  buildingId: string;
  unitId: string;
  eventType: ResidentEventType;
  pointsAwarded: number;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type MaintenanceRequest = {
  id: string;
  residentId: string;
  unitId: string;
  buildingId: string;
  title: string;
  category: 'plumbing' | 'appliance' | 'electrical' | 'hvac' | 'common_area' | 'other';
  photoCount: number;
  accessConfirmed: boolean;
  status: MaintenanceStatus;
  submittedAt: string;
};

export type BuildingNotice = {
  id: string;
  buildingId: string;
  title: string;
  sentAt: string;
  dueAt: string;
  acknowledgedResidentIds: string[];
};

export type RenewalStatus = {
  id: string;
  residentId: string;
  unitId: string;
  buildingId: string;
  status: RenewalInterestStatus;
  targetDate: string;
};

export type TenantLifecycleRecord = {
  id: string;
  residentId: string;
  buildingId: string;
  unitId: string;
  inviteStatus: 'draft' | 'sent' | 'accepted';
  portalSlug: string;
  lease: {
    documentName: string;
    status: LeaseDocumentStatus;
    startDate: string;
    endDate: string;
    acknowledgedAt?: string;
  };
  securityDeposit: {
    amountLabel: string;
    status: SecurityDepositStatus;
    confirmedAt?: string;
  };
  nextRent: {
    amountLabel: string;
    dueDate: string;
    status: RentDueStatus;
  };
  moveInInspection: {
    status: MoveInInspectionStatus;
    photoCount: number;
    issueCount: number;
    submittedAt?: string;
  };
};

export type ResidentOnboardingStep = {
  id: string;
  residentId: string;
  buildingId: string;
  unitId: string;
  type: OnboardingStepType;
  title: string;
  description: string;
  status: OnboardingStepStatus;
  points?: number;
  dueAt?: string;
  completedAt?: string;
};

export type RewardOption = {
  id: string;
  label: string;
  category:
    | 'rent_credit'
    | 'gift_card'
    | 'perk'
    | 'fee_waiver'
    | 'travel'
    | 'dining'
    | 'fitness'
    | 'home'
    | 'internet'
    | 'transit'
    | 'community';
  pointCost?: number;
  milestoneMonths?: number;
  valueLabel: string;
};

export type RewardRedemption = {
  id: string;
  residentId: string;
  buildingId: string;
  rewardId: string;
  status: Exclude<RewardStatus, 'available'>;
  pointCost?: number;
  valueLabel: string;
  requestedAt: string;
  approvedAt?: string;
};

export type ResidentTask = {
  id: string;
  residentId: string;
  buildingId: string;
  unitId: string;
  type: ResidentTaskType;
  title: string;
  points: number;
  dueAt?: string;
  status: ResidentTaskStatus;
};

export type ResidentLoyaltyDemoState = {
  landlords: Landlord[];
  buildings: ResidentBuilding[];
  units: ResidentUnit[];
  residents: Resident[];
  events: ResidentEvent[];
  tasks: ResidentTask[];
  rewards: RewardOption[];
  rewardRedemptions: RewardRedemption[];
  maintenanceRequests: MaintenanceRequest[];
  notices: BuildingNotice[];
  renewals: RenewalStatus[];
  tenantLifecycles: TenantLifecycleRecord[];
  onboardingSteps: ResidentOnboardingStep[];
};
