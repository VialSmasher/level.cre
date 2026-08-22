import { randomBytes } from 'node:crypto';

type ListingShareRow = {
  title?: unknown;
  address?: unknown;
  submarket?: unknown;
  lat?: unknown;
  lng?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  owner_first_name?: unknown;
  owner_last_name?: unknown;
};

type ProspectShareRow = {
  id?: unknown;
  name?: unknown;
  business_name?: unknown;
  contact_company?: unknown;
  address?: unknown;
  status?: unknown;
  location_lat?: unknown;
  location_lng?: unknown;
};

type InteractionShareRow = {
  id?: unknown;
  prospect_id?: unknown;
  date?: unknown;
  type?: unknown;
  outcome?: unknown;
};

const cleanText = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text || null;
};

const cleanNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const cleanDate = (value: unknown): string | null => {
  const text = cleanText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

export function createPursuitShareToken(): string {
  return randomBytes(32).toString('base64url');
}

export function isValidPursuitShareToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32,96}$/.test(value);
}

export function buildPublicPursuitSnapshot(params: {
  listing: ListingShareRow;
  prospects: ProspectShareRow[];
  interactions: InteractionShareRow[];
  generatedAt?: string;
}) {
  const activityByProspectId = new Map<string, { count: number; lastActivityAt: string | null }>();
  const activityByType: Record<string, number> = {};
  let lastActivityAt: string | null = null;

  const activities = params.interactions.map((row) => {
    const prospectId = cleanText(row.prospect_id);
    const date = cleanDate(row.date);
    const type = cleanText(row.type) || 'activity';
    const current = prospectId ? activityByProspectId.get(prospectId) : undefined;
    if (prospectId) {
      activityByProspectId.set(prospectId, {
        count: (current?.count || 0) + 1,
        lastActivityAt: !current?.lastActivityAt || (date && date > current.lastActivityAt)
          ? date
          : current.lastActivityAt,
      });
    }
    activityByType[type] = (activityByType[type] || 0) + 1;
    if (date && (!lastActivityAt || date > lastActivityAt)) lastActivityAt = date;
    return {
      id: cleanText(row.id),
      prospectId,
      date,
      type,
      outcome: cleanText(row.outcome),
    };
  });

  const prospects = params.prospects.map((row) => {
    const id = cleanText(row.id);
    const activity = id ? activityByProspectId.get(id) : undefined;
    return {
      id,
      label: cleanText(row.business_name)
        || cleanText(row.contact_company)
        || cleanText(row.name)
        || 'Prospect',
      address: cleanText(row.address),
      status: cleanText(row.status) || 'prospect',
      lat: cleanNumber(row.location_lat),
      lng: cleanNumber(row.location_lng),
      activityCount: activity?.count || 0,
      lastActivityAt: activity?.lastActivityAt || null,
    };
  });

  const ownerName = [
    cleanText(params.listing.owner_first_name),
    cleanText(params.listing.owner_last_name),
  ].filter(Boolean).join(' ') || null;

  return {
    pursuit: {
      title: cleanText(params.listing.title) || 'Prospecting activity',
      address: cleanText(params.listing.address),
      submarket: cleanText(params.listing.submarket),
      lat: cleanNumber(params.listing.lat),
      lng: cleanNumber(params.listing.lng),
      createdAt: cleanDate(params.listing.created_at ?? params.listing.createdAt),
      preparedBy: ownerName,
    },
    summary: {
      prospectCount: prospects.length,
      activityCount: activities.length,
      lastActivityAt,
      activityByType,
    },
    prospects,
    activities,
    generatedAt: params.generatedAt || new Date().toISOString(),
  };
}
