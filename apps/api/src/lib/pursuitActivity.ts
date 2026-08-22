export type PursuitActivityLike = {
  listingId?: string | null;
  prospectId?: string | null;
  date?: string | Date | null;
};

export function filterPursuitActivity<T extends PursuitActivityLike>(params: {
  rows: T[];
  listingId: string;
  linkedProspectIds: Iterable<string>;
  start?: string | null;
  end?: string | null;
}) {
  const linkedProspectIds = new Set(params.linkedProspectIds);
  return params.rows.filter((row) => {
    const belongsToPursuit = row.listingId === params.listingId
      || Boolean(row.prospectId && linkedProspectIds.has(row.prospectId));
    if (!belongsToPursuit) return false;
    const date = row.date instanceof Date ? row.date.toISOString() : String(row.date || '');
    if (params.start && date < params.start) return false;
    if (params.end && date > params.end) return false;
    return true;
  });
}
