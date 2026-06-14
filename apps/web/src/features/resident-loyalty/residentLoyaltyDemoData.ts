import { POINT_RULES } from './residentLoyaltyLogic';
import type {
  BuildingNotice,
  Landlord,
  MaintenanceRequest,
  RenewalStatus,
  Resident,
  ResidentEvent,
  ResidentEventType,
  ResidentLoyaltyDemoState,
  ResidentTask,
  ResidentTaskType,
  ResidentUnit,
  RewardOption,
  RewardRedemption,
} from './types';

const LANDLORD_ID = 'landlord-rivergate';
const BUILDING_ID = 'building-maclaren-house';

const unitId = (unitNumber: string) => `unit-${unitNumber}`;

const landlords: Landlord[] = [
  {
    id: LANDLORD_ID,
    name: 'Rivergate Residential',
    managerName: 'Priya Shah',
  },
];

const building = {
  id: BUILDING_ID,
  landlordId: LANDLORD_ID,
  name: 'Maclaren House',
  address: '10418 122 Street NW, Edmonton',
  neighbourhood: 'Oliver',
  unitCount: 16,
};

const residentSeeds = [
  ['resident-amelia-wong', 'Amelia Wong', '101', 7, 'enabled', 'active'],
  ['resident-mateo-reyes', 'Mateo Reyes', '102', 2, 'interested', 'upcoming'],
  ['resident-sarah-fraser', 'Sarah Fraser', '103', 11, 'enabled', 'not_due'],
  ['resident-daniel-kim', 'Daniel Kim', '104', 4, 'not_set', 'active'],
  ['resident-nora-patel', 'Nora Patel', '105', 15, 'enabled', 'not_due'],
  ['resident-owen-clarke', 'Owen Clarke', '106', 1, 'not_set', 'upcoming'],
  ['resident-fatima-hassan', 'Fatima Hassan', '107', 6, 'enabled', 'active'],
  ['resident-jacob-miller', 'Jacob Miller', '108', 3, 'interested', 'not_due'],
  ['resident-lina-chen', 'Lina Chen', '201', 9, 'enabled', 'active'],
  ['resident-ben-hart', 'Ben Hart', '202', 0, 'not_set', 'upcoming'],
  ['resident-zoe-martin', 'Zoe Martin', '203', 12, 'enabled', 'not_due'],
  ['resident-aisha-ali', 'Aisha Ali', '204', 5, 'interested', 'active'],
  ['resident-noah-singh', 'Noah Singh', '205', 8, 'enabled', 'not_due'],
  ['resident-emma-brooks', 'Emma Brooks', '206', 2, 'not_set', 'upcoming'],
  ['resident-lucas-morin', 'Lucas Morin', '207', 10, 'enabled', 'active'],
  ['resident-maya-iverson', 'Maya Iverson', '208', 6, 'enabled', 'not_due'],
] as const;

const units: ResidentUnit[] = residentSeeds.map((seed, index) => {
  const unitNumber = seed[2];
  return {
    id: unitId(unitNumber),
    buildingId: BUILDING_ID,
    unitNumber,
    floor: unitNumber.startsWith('2') ? 2 : 1,
    bedrooms: index % 4 === 0 ? 2 : 1,
    residentId: seed[0],
    occupancyStatus: index === 9 ? 'notice_to_vacate' : 'occupied',
  };
});

const residents: Resident[] = residentSeeds.map((seed, index) => ({
  id: seed[0],
  buildingId: BUILDING_ID,
  unitId: unitId(seed[2]),
  name: seed[1],
  email: `${seed[1].toLowerCase().replace(/[^a-z]+/g, '.').replace(/\.$/, '')}@example.com`,
  moveInDate: new Date(Date.UTC(2024, index % 10, 3 + index)).toISOString(),
  rentStreakMonths: seed[3],
  autopayStatus: seed[4],
  renewalWindow: seed[5],
}));

const residentById = new Map(residents.map((resident) => [resident.id, resident]));

function event(
  id: string,
  residentId: string,
  eventType: ResidentEventType,
  createdAt: string,
  metadata: Record<string, unknown> = {},
): ResidentEvent {
  const resident = residentById.get(residentId);
  if (!resident) throw new Error(`Unknown resident ${residentId}`);
  return {
    id,
    residentId,
    buildingId: resident.buildingId,
    unitId: resident.unitId,
    eventType,
    pointsAwarded: POINT_RULES[eventType],
    metadata,
    createdAt,
  };
}

const streakEvents = residents
  .filter((resident) => resident.rentStreakMonths > 0)
  .slice(0, 14)
  .map((resident, index) =>
    event(
      `event-rent-streak-${index + 1}`,
      resident.id,
      'rent_streak_continued',
      new Date(Date.UTC(2026, 5, 1, 16, index)).toISOString(),
      { streakMonths: resident.rentStreakMonths },
    ),
  );

const events: ResidentEvent[] = [
  ...streakEvents,
  event('event-rent-paid-amelia', 'resident-amelia-wong', 'rent_paid_on_time', '2026-06-01T14:10:00.000Z', { month: '2026-06' }),
  event('event-notice-amelia', 'resident-amelia-wong', 'notice_acknowledged', '2026-06-03T20:12:00.000Z', { noticeId: 'notice-fire-alarm' }),
  event('event-access-amelia', 'resident-amelia-wong', 'access_confirmed', '2026-06-04T18:45:00.000Z', { window: '2026-06-06 09:00-11:00' }),
  event('event-maint-amelia', 'resident-amelia-wong', 'maintenance_request_submitted_with_photos', '2026-06-05T02:18:00.000Z', { requestId: 'maint-amelia-sink', photoCount: 3 }),
  event('event-renewal-amelia', 'resident-amelia-wong', 'renewal_interest_submitted', '2026-06-06T17:30:00.000Z', { targetDate: '2026-09-01' }),
  event('event-notice-sarah', 'resident-sarah-fraser', 'notice_acknowledged', '2026-06-03T18:02:00.000Z', { noticeId: 'notice-fire-alarm' }),
  event('event-notice-nora', 'resident-nora-patel', 'notice_acknowledged', '2026-06-03T19:42:00.000Z', { noticeId: 'notice-fire-alarm' }),
  event('event-notice-fatima', 'resident-fatima-hassan', 'notice_acknowledged', '2026-06-03T21:20:00.000Z', { noticeId: 'notice-fire-alarm' }),
  event('event-access-fatima', 'resident-fatima-hassan', 'access_confirmed', '2026-06-05T15:30:00.000Z', { requestId: 'maint-fatima-dryer' }),
  event('event-maint-fatima', 'resident-fatima-hassan', 'maintenance_request_submitted_with_photos', '2026-06-04T03:05:00.000Z', { requestId: 'maint-fatima-dryer', photoCount: 2 }),
  event('event-maint-daniel', 'resident-daniel-kim', 'maintenance_request_submitted', '2026-06-02T23:11:00.000Z', { requestId: 'maint-daniel-light', photoCount: 0 }),
  event('event-notice-lina', 'resident-lina-chen', 'notice_acknowledged', '2026-06-04T12:04:00.000Z', { noticeId: 'notice-water-shutoff' }),
  event('event-renewal-lina', 'resident-lina-chen', 'renewal_signed_early', '2026-05-28T18:00:00.000Z', { targetDate: '2026-08-01' }),
  event('event-movein-owen', 'resident-owen-clarke', 'move_in_checklist_completed', '2026-05-24T22:15:00.000Z', { checklistId: 'movein-owen' }),
  event('event-access-lucas', 'resident-lucas-morin', 'access_confirmed', '2026-06-05T17:05:00.000Z', { inspection: 'annual' }),
  event('event-reward-sarah', 'resident-sarah-fraser', 'reward_redeemed', '2026-06-02T16:40:00.000Z', { rewardId: 'reward-grocery-25' }),
];

const maintenanceRequests: MaintenanceRequest[] = [
  {
    id: 'maint-amelia-sink',
    residentId: 'resident-amelia-wong',
    unitId: unitId('101'),
    buildingId: BUILDING_ID,
    title: 'Kitchen sink leak',
    category: 'plumbing',
    photoCount: 3,
    accessConfirmed: true,
    status: 'scheduled',
    submittedAt: '2026-06-05T02:18:00.000Z',
  },
  {
    id: 'maint-fatima-dryer',
    residentId: 'resident-fatima-hassan',
    unitId: unitId('107'),
    buildingId: BUILDING_ID,
    title: 'Dryer not heating',
    category: 'appliance',
    photoCount: 2,
    accessConfirmed: true,
    status: 'reviewed',
    submittedAt: '2026-06-04T03:05:00.000Z',
  },
  {
    id: 'maint-daniel-light',
    residentId: 'resident-daniel-kim',
    unitId: unitId('104'),
    buildingId: BUILDING_ID,
    title: 'Bathroom light flickering',
    category: 'electrical',
    photoCount: 0,
    accessConfirmed: false,
    status: 'submitted',
    submittedAt: '2026-06-02T23:11:00.000Z',
  },
  {
    id: 'maint-noah-thermostat',
    residentId: 'resident-noah-singh',
    unitId: unitId('205'),
    buildingId: BUILDING_ID,
    title: 'Thermostat reading high',
    category: 'hvac',
    photoCount: 1,
    accessConfirmed: false,
    status: 'submitted',
    submittedAt: '2026-06-06T15:08:00.000Z',
  },
  {
    id: 'maint-common-bike-room',
    residentId: 'resident-maya-iverson',
    unitId: unitId('208'),
    buildingId: BUILDING_ID,
    title: 'Bike room door latch loose',
    category: 'common_area',
    photoCount: 2,
    accessConfirmed: true,
    status: 'completed',
    submittedAt: '2026-05-31T19:12:00.000Z',
  },
];

const notices: BuildingNotice[] = [
  {
    id: 'notice-fire-alarm',
    buildingId: BUILDING_ID,
    title: 'Annual fire alarm test',
    sentAt: '2026-06-03T15:00:00.000Z',
    dueAt: '2026-06-07T23:59:00.000Z',
    acknowledgedResidentIds: [
      'resident-amelia-wong',
      'resident-sarah-fraser',
      'resident-nora-patel',
      'resident-fatima-hassan',
      'resident-jacob-miller',
      'resident-lina-chen',
      'resident-zoe-martin',
      'resident-noah-singh',
      'resident-lucas-morin',
      'resident-maya-iverson',
      'resident-aisha-ali',
      'resident-mateo-reyes',
    ],
  },
  {
    id: 'notice-water-shutoff',
    buildingId: BUILDING_ID,
    title: 'Planned water shutoff',
    sentAt: '2026-06-05T16:00:00.000Z',
    dueAt: '2026-06-09T23:59:00.000Z',
    acknowledgedResidentIds: [
      'resident-lina-chen',
      'resident-sarah-fraser',
      'resident-amelia-wong',
      'resident-fatima-hassan',
      'resident-noah-singh',
      'resident-lucas-morin',
      'resident-maya-iverson',
    ],
  },
];

const renewals: RenewalStatus[] = [
  { id: 'renewal-amelia', residentId: 'resident-amelia-wong', unitId: unitId('101'), buildingId: BUILDING_ID, status: 'interested', targetDate: '2026-09-01' },
  { id: 'renewal-daniel', residentId: 'resident-daniel-kim', unitId: unitId('104'), buildingId: BUILDING_ID, status: 'pending', targetDate: '2026-08-01' },
  { id: 'renewal-fatima', residentId: 'resident-fatima-hassan', unitId: unitId('107'), buildingId: BUILDING_ID, status: 'interested', targetDate: '2026-09-01' },
  { id: 'renewal-lina', residentId: 'resident-lina-chen', unitId: unitId('201'), buildingId: BUILDING_ID, status: 'signed', targetDate: '2026-08-01' },
  { id: 'renewal-lucas', residentId: 'resident-lucas-morin', unitId: unitId('207'), buildingId: BUILDING_ID, status: 'not_yet', targetDate: '2026-10-01' },
  { id: 'renewal-ben', residentId: 'resident-ben-hart', unitId: unitId('202'), buildingId: BUILDING_ID, status: 'declined', targetDate: '2026-07-01' },
];

const taskPoints: Record<ResidentTaskType, number> = {
  acknowledge_notice: POINT_RULES.notice_acknowledged,
  submit_maintenance_with_photos: POINT_RULES.maintenance_request_submitted_with_photos,
  confirm_access: POINT_RULES.access_confirmed,
  submit_renewal_interest: POINT_RULES.renewal_interest_submitted,
  complete_move_in_checklist: POINT_RULES.move_in_checklist_completed,
};

const tasks: ResidentTask[] = [
  {
    id: 'task-amelia-notice',
    residentId: 'resident-amelia-wong',
    buildingId: BUILDING_ID,
    unitId: unitId('101'),
    type: 'acknowledge_notice',
    title: 'Acknowledge planned water shutoff',
    points: taskPoints.acknowledge_notice,
    dueAt: '2026-06-09T23:59:00.000Z',
    status: 'available',
  },
  {
    id: 'task-amelia-access',
    residentId: 'resident-amelia-wong',
    buildingId: BUILDING_ID,
    unitId: unitId('101'),
    type: 'confirm_access',
    title: 'Confirm access for sink repair',
    points: taskPoints.confirm_access,
    dueAt: '2026-06-10T16:00:00.000Z',
    status: 'available',
  },
  {
    id: 'task-amelia-renewal',
    residentId: 'resident-amelia-wong',
    buildingId: BUILDING_ID,
    unitId: unitId('101'),
    type: 'submit_renewal_interest',
    title: 'Share early renewal interest',
    points: taskPoints.submit_renewal_interest,
    dueAt: '2026-06-20T23:59:00.000Z',
    status: 'available',
  },
  {
    id: 'task-mateo-movein',
    residentId: 'resident-mateo-reyes',
    buildingId: BUILDING_ID,
    unitId: unitId('102'),
    type: 'complete_move_in_checklist',
    title: 'Complete move-in condition checklist',
    points: taskPoints.complete_move_in_checklist,
    dueAt: '2026-06-12T23:59:00.000Z',
    status: 'available',
  },
  {
    id: 'task-daniel-maint-photos',
    residentId: 'resident-daniel-kim',
    buildingId: BUILDING_ID,
    unitId: unitId('104'),
    type: 'submit_maintenance_with_photos',
    title: 'Add photos to bathroom light request',
    points: taskPoints.submit_maintenance_with_photos,
    dueAt: '2026-06-10T23:59:00.000Z',
    status: 'available',
  },
  {
    id: 'task-noah-access',
    residentId: 'resident-noah-singh',
    buildingId: BUILDING_ID,
    unitId: unitId('205'),
    type: 'confirm_access',
    title: 'Confirm access for thermostat repair',
    points: taskPoints.confirm_access,
    dueAt: '2026-06-11T16:00:00.000Z',
    status: 'available',
  },
];

const rewards: RewardOption[] = [
  { id: 'reward-rent-credit-10', label: 'Rent credit', category: 'rent_credit', milestoneMonths: 3, valueLabel: '$10' },
  { id: 'reward-grocery-25', label: 'Grocery gift card', category: 'gift_card', milestoneMonths: 6, valueLabel: '$25' },
  { id: 'reward-rent-credit-100', label: 'Rent credit', category: 'rent_credit', milestoneMonths: 12, valueLabel: '$100' },
  { id: 'reward-coffee-5', label: 'Coffee gift card', category: 'gift_card', pointCost: 500, valueLabel: '$5' },
  { id: 'reward-dining-15', label: 'Neighborhood dining credit', category: 'dining', pointCost: 1000, valueLabel: '$15' },
  { id: 'reward-rideshare-15', label: 'Rideshare credit', category: 'gift_card', pointCost: 1200, valueLabel: '$15' },
  { id: 'reward-home-25', label: 'Home goods credit', category: 'home', pointCost: 1800, valueLabel: '$25' },
  { id: 'reward-travel-transfer', label: 'Mock travel transfer', category: 'travel', pointCost: 2200, valueLabel: '1:1 partner' },
  { id: 'reward-fitness-class', label: 'Fitness class pass', category: 'fitness', pointCost: 900, valueLabel: '1 class' },
  { id: 'reward-parking-perk', label: 'Reserved parking perk', category: 'perk', pointCost: 2500, valueLabel: '1 month' },
  { id: 'reward-key-fob-waiver', label: 'Extra key fob waiver', category: 'fee_waiver', pointCost: 900, valueLabel: '$35 waiver' },
  { id: 'reward-elevator-priority', label: 'Priority elevator booking', category: 'perk', pointCost: 700, valueLabel: '1 booking' },
];

const rewardRedemptions: RewardRedemption[] = [
  {
    id: 'redemption-sarah-grocery',
    residentId: 'resident-sarah-fraser',
    buildingId: BUILDING_ID,
    rewardId: 'reward-grocery-25',
    status: 'issued',
    valueLabel: '$25',
    requestedAt: '2026-06-02T16:40:00.000Z',
    approvedAt: '2026-06-03T15:10:00.000Z',
  },
  {
    id: 'redemption-amelia-coffee',
    residentId: 'resident-amelia-wong',
    buildingId: BUILDING_ID,
    rewardId: 'reward-coffee-5',
    status: 'pending',
    pointCost: 500,
    valueLabel: '$5',
    requestedAt: '2026-06-06T18:04:00.000Z',
  },
  {
    id: 'redemption-lina-rent-25',
    residentId: 'resident-lina-chen',
    buildingId: BUILDING_ID,
    rewardId: 'reward-grocery-25',
    status: 'approved',
    valueLabel: '$25',
    requestedAt: '2026-05-29T17:30:00.000Z',
    approvedAt: '2026-06-01T15:20:00.000Z',
  },
];

export function createResidentLoyaltyDemoState(): ResidentLoyaltyDemoState {
  return {
    landlords: [...landlords],
    buildings: [{ ...building }],
    units: units.map((unit) => ({ ...unit })),
    residents: residents.map((resident) => ({ ...resident })),
    events: events.map((item) => ({ ...item, metadata: { ...item.metadata } })),
    tasks: tasks.map((task) => ({ ...task })),
    rewards: rewards.map((reward) => ({ ...reward })),
    rewardRedemptions: rewardRedemptions.map((redemption) => ({ ...redemption })),
    maintenanceRequests: maintenanceRequests.map((request) => ({ ...request })),
    notices: notices.map((notice) => ({ ...notice, acknowledgedResidentIds: [...notice.acknowledgedResidentIds] })),
    renewals: renewals.map((renewal) => ({ ...renewal })),
  };
}
