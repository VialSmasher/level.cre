import { STATUS_META, type ProspectStatusType } from '@level-cre/shared/schema';

export const MAP_STATUS_KEYS = Object.keys(STATUS_META) as ProspectStatusType[];

export type StatusCounts = Record<ProspectStatusType, number>;

export type StatusFilterPreset = {
  id: string;
  label: string;
  statuses: ProspectStatusType[];
};

export const STATUS_FILTER_PRESETS: StatusFilterPreset[] = [
  { id: 'all', label: 'All', statuses: MAP_STATUS_KEYS },
  { id: 'active', label: 'Active', statuses: ['prospect', 'contacted', 'listing', 'development'] },
  { id: 'follow_up', label: 'Needs Follow-Up', statuses: ['prospect', 'contacted'] },
  { id: 'listings', label: 'Listings', statuses: ['listing'] },
  { id: 'development', label: 'Development', statuses: ['development'] },
  { id: 'hide_no_go', label: 'Hide No Go', statuses: MAP_STATUS_KEYS.filter((status) => status !== 'no_go') },
];

export function isMapStatus(value: unknown): value is ProspectStatusType {
  return typeof value === 'string' && MAP_STATUS_KEYS.includes(value as ProspectStatusType);
}

export function createAllStatusFilterSet(): Set<ProspectStatusType> {
  return new Set(MAP_STATUS_KEYS);
}

export function createStatusFilterSet(value: unknown, fallbackToAll = true): Set<ProspectStatusType> {
  if (!Array.isArray(value)) {
    return fallbackToAll ? createAllStatusFilterSet() : new Set();
  }

  return new Set(value.filter(isMapStatus));
}

export function getStatusCounts(items: Array<{ status?: string | null }>): StatusCounts {
  const counts = Object.fromEntries(MAP_STATUS_KEYS.map((status) => [status, 0])) as StatusCounts;

  for (const item of items) {
    if (isMapStatus(item.status)) {
      counts[item.status] += 1;
    }
  }

  return counts;
}
