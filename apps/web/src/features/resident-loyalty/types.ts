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

export type RewardOption = {
  id: string;
  label: string;
  category: 'rent_credit' | 'gift_card' | 'perk' | 'fee_waiver' | 'travel' | 'dining' | 'fitness' | 'home';
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
};
