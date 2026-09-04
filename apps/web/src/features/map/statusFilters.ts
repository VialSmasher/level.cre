import { STATUS_META, type ProspectStatusType } from '@level-cre/shared/schema';

export const MAP_STATUS_KEYS = Object.keys(STATUS_META) as ProspectStatusType[];

export type StatusCounts = Record<ProspectStatusType, number>;

export const RELATIONSHIP_DESCRIPTIONS: Record<ProspectStatusType, string> = {
  prospect: 'Target with no confirmed outreach yet.',
  contacted: 'Outreach recorded; interest is not implied.',
  listing: 'Brokerage listing or mandate; advertised availability is a separate research signal.',
  client: 'Established client relationship.',
  no_go: 'Retained decision and history. Hidden by default.',
  development: 'Legacy project category awaiting review. Does not determine property type.',
};

export function isMapStatus(value: unknown): value is ProspectStatusType {
  return typeof value === 'string' && MAP_STATUS_KEYS.includes(value as ProspectStatusType);
}

export function createAllStatusFilterSet(): Set<ProspectStatusType> {
  return new Set(MAP_STATUS_KEYS);
}

export function createDefaultStatusFilterSet(): Set<ProspectStatusType> {
  return new Set(MAP_STATUS_KEYS.filter(status => status !== 'no_go'));
}

export function createStatusFilterSet(value: unknown, fallbackToDefault = true): Set<ProspectStatusType> {
  if (!Array.isArray(value)) {
    return fallbackToDefault ? createDefaultStatusFilterSet() : new Set();
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

/** Migrate old selections once, then preserve an explicit No Go opt-in. */
export function readRelationshipFilters(value: unknown, legacy?: unknown): Set<ProspectStatusType> {
  if (Array.isArray(value)) return createStatusFilterSet(value);
  const filters = createStatusFilterSet(legacy);
  filters.delete('no_go');
  return filters;
}

