import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

type DemoData = {
  prospects: Record<string, any[]>;
  profiles: Record<string, any>;
  interactions?: Record<string, any[]>;
  requirements?: Record<string, any[]>;
  submarkets?: Record<string, any[]>;
  marketComps?: Record<string, any[]>;
  listings?: Record<string, any[]>; // workspaces
  listingLinks?: Record<string, { listingId: string; prospectId: string }[]>; // links
  listingMembers?: Record<string, { userId: string; role: 'viewer'|'editor' }[]>; // by listingId
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.resolve(__dirname, 'demo-data.json');
let cache: DemoData | null = null;
let loading: Promise<void> | null = null;

async function load(): Promise<void> {
  try {
    const raw = await fs.promises.readFile(dataPath, 'utf8');
    cache = JSON.parse(raw) as DemoData;
  } catch (e: any) {
    cache = { prospects: {}, profiles: {}, interactions: {}, requirements: {}, submarkets: {}, marketComps: {}, listings: {}, listingLinks: {}, listingMembers: {} };
    await save();
  }
}

async function ensureLoaded(): Promise<void> {
  if (cache) return;
  if (!loading) loading = load().finally(() => { loading = null; });
  return loading;
}

async function save(): Promise<void> {
  if (!cache) return;
  const tmp = dataPath + '.tmp';
  await fs.promises.writeFile(tmp, JSON.stringify(cache, null, 2), 'utf8');
  await fs.promises.rename(tmp, dataPath);
}

export async function getProspects(userId: string): Promise<any[]> {
  await ensureLoaded();
  return cache!.prospects[userId] || [];
}

export async function addProspect(userId: string, prospect: any): Promise<any> {
  await ensureLoaded();
  const list = cache!.prospects[userId] || [];
  list.push(prospect);
  cache!.prospects[userId] = list;
  await save();
  return prospect;
}

export async function updateProspect(userId: string, id: string, updates: any): Promise<any | null> {
  await ensureLoaded();
  // 1) Try to update if prospect owned by caller
  {
    const list = cache!.prospects[userId] || [];
    const idx = list.findIndex((p) => p.id === id);
    if (idx !== -1) {
      const updated = { ...list[idx], ...updates };
      list[idx] = updated;
      cache!.prospects[userId] = list;
      await save();
      return updated;
    }
  }

  // 2) Find the actual owner of this prospect
  let ownerId: string | null = null;
  let ownerIdx = -1;
  for (const uid of Object.keys(cache!.prospects || {})) {
    const list = cache!.prospects[uid] || [];
    const idx = list.findIndex((p) => p.id === id);
    if (idx !== -1) {
      ownerId = uid;
      ownerIdx = idx;
      break;
    }
  }
  if (!ownerId || ownerIdx === -1) return null;

  // 3) Determine if caller has edit rights via any linked workspace (listing)
  // Scan all listingLinks (across all users in demo store) for this prospect
  const byUser = cache!.listingLinks || {};
  const linkedListingIds = new Set<string>();
  for (const uid of Object.keys(byUser)) {
    for (const link of byUser[uid] || []) {
      if (link.prospectId === id) linkedListingIds.add(link.listingId);
    }
  }
  let canEdit = false;
  for (const listingId of Array.from(linkedListingIds)) {
    // Owner of listing can edit
    const owner = await getListingOwner(listingId);
    if (owner?.userId === userId) { canEdit = true; break; }
    // Editors can edit
    const role = await getListingMemberRole(listingId, userId);
    if (role === 'editor') { canEdit = true; break; }
  }
  if (!canEdit) return null;

  // 4) Apply update to the owner's prospect record
  const ownerList = cache!.prospects[ownerId] || [];
  const updated = { ...ownerList[ownerIdx], ...updates };
  ownerList[ownerIdx] = updated;
  cache!.prospects[ownerId] = ownerList;
  await save();
  return updated;
}

export async function deleteProspect(userId: string, id: string): Promise<boolean> {
  await ensureLoaded();
  const list = cache!.prospects[userId] || [];
  const next = list.filter((p) => p.id !== id);
  cache!.prospects[userId] = next;
  const changed = next.length !== list.length;
  if (changed) await save();
  return changed;
}

export async function getProfile(userId: string): Promise<any | null> {
  await ensureLoaded();
  return cache!.profiles[userId] || null;
}

export async function setProfile(userId: string, profile: any): Promise<any> {
  await ensureLoaded();
  cache!.profiles[userId] = profile;
  await save();
  return profile;
}

export async function updateProfile(userId: string, patch: any): Promise<any> {
  await ensureLoaded();
  const current = cache!.profiles[userId] || { id: userId };
  const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
  cache!.profiles[userId] = updated;
  await save();
  return updated;
}

// Contact interactions (demo)
export async function getInteractions(userId: string, prospectId?: string): Promise<any[]> {
  await ensureLoaded();
  const list = (cache!.interactions?.[userId] || []);
  if (!prospectId) return list;
  return list.filter((i) => i.prospectId === prospectId);
}

export async function addInteraction(userId: string, interaction: any): Promise<any> {
  await ensureLoaded();
  if (!cache!.interactions) cache!.interactions = {} as Record<string, any[]>;
  const list = cache!.interactions[userId] || [];
  list.push(interaction);
  cache!.interactions[userId] = list;
  await save();
  return interaction;
}

export async function deleteInteraction(userId: string, id: string): Promise<boolean> {
  await ensureLoaded();
  if (!cache!.interactions) return false;
  const list = cache!.interactions[userId] || [];
  const next = list.filter((i) => i.id !== id);
  cache!.interactions[userId] = next;
  const changed = next.length !== list.length;
  if (changed) await save();
  return changed;
}

// Requirements (demo)
export async function getRequirements(userId: string): Promise<any[]> {
  await ensureLoaded();
  return cache!.requirements?.[userId] || [];
}

export async function addRequirement(userId: string, req: any): Promise<any> {
  await ensureLoaded();
  if (!cache!.requirements) cache!.requirements = {} as Record<string, any[]>;
  const list = cache!.requirements[userId] || [];
  list.push(req);
  cache!.requirements[userId] = list;
  await save();
  return req;
}

export async function updateRequirement(userId: string, id: string, updates: any): Promise<any | null> {
  await ensureLoaded();
  const list = cache!.requirements?.[userId] || [];
  const idx = list.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const updated = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
  list[idx] = updated;
  cache!.requirements![userId] = list;
  await save();
  return updated;
}

export async function deleteRequirement(userId: string, id: string): Promise<boolean> {
  await ensureLoaded();
  const list = cache!.requirements?.[userId] || [];
  const next = list.filter((r) => r.id !== id);
  cache!.requirements![userId] = next;
  const changed = next.length !== list.length;
  if (changed) await save();
  return changed;
}

export async function reset(): Promise<void> {
  cache = { prospects: {}, profiles: {}, interactions: {}, requirements: {}, submarkets: {}, marketComps: {}, listings: {}, listingLinks: {}, listingMembers: {} };
  await save();
}

// Submarkets (demo)
export async function getSubmarkets(userId: string): Promise<any[]> {
  await ensureLoaded();
  return cache!.submarkets?.[userId] || [];
}

export async function addSubmarket(userId: string, sub: any): Promise<any> {
  await ensureLoaded();
  if (!cache!.submarkets) cache!.submarkets = {} as Record<string, any[]>;
  const list = cache!.submarkets[userId] || [];
  list.push(sub);
  cache!.submarkets[userId] = list;
  await save();
  return sub;
}

export async function updateSubmarket(userId: string, id: string, patch: any): Promise<any | null> {
  await ensureLoaded();
  const list = cache!.submarkets?.[userId] || [];
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const updated = { ...list[idx], ...patch };
  list[idx] = updated;
  cache!.submarkets![userId] = list;
  await save();
  return updated;
}

export async function deleteSubmarket(userId: string, id: string): Promise<boolean> {
  await ensureLoaded();
  const list = cache!.submarkets?.[userId] || [];
  const next = list.filter((s) => s.id !== id);
  cache!.submarkets![userId] = next;
  const changed = next.length !== list.length;
  if (changed) await save();
  return changed;
}

// Market Comps (demo)
export async function getMarketComps(userId: string): Promise<any[]> {
  await ensureLoaded();
  return cache!.marketComps?.[userId] || [];
}

export async function addMarketComp(userId: string, comp: any): Promise<any> {
  await ensureLoaded();
  if (!cache!.marketComps) cache!.marketComps = {} as Record<string, any[]>;
  const list = cache!.marketComps[userId] || [];
  list.push(comp);
  cache!.marketComps[userId] = list;
  await save();
  return comp;
}

export async function updateMarketComp(userId: string, id: string, patch: any): Promise<any | null> {
  await ensureLoaded();
  const list = cache!.marketComps?.[userId] || [];
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const updated = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
  list[idx] = updated;
  cache!.marketComps![userId] = list;
  await save();
  return updated;
}

export async function deleteMarketComp(userId: string, id: string): Promise<boolean> {
  await ensureLoaded();
  const list = cache!.marketComps?.[userId] || [];
  const next = list.filter((c) => c.id !== id);
  cache!.marketComps![userId] = next;
  const changed = next.length !== list.length;
  if (changed) await save();
  return changed;
}

// Listings / Workspaces (demo)
export async function getListings(userId: string): Promise<any[]> {
  await ensureLoaded();
  return cache!.listings?.[userId] || [];
}

export async function addListing(userId: string, listing: any): Promise<any> {
  await ensureLoaded();
  if (!cache!.listings) cache!.listings = {} as Record<string, any[]>;
  const list = cache!.listings[userId] || [];
  list.push(listing);
  cache!.listings[userId] = list;
  await save();
  return listing;
}

export async function getListing(userId: string, id: string): Promise<any | null> {
  await ensureLoaded();
  const list = cache!.listings?.[userId] || [];
  return list.find((l) => l.id === id) || null;
}

export async function getListingAny(id: string): Promise<any | null> {
  await ensureLoaded();
  const maps = cache!.listings || {};
  for (const uid of Object.keys(maps)) {
    const list = maps[uid] || [];
    const found = list.find((l) => l.id === id);
    if (found) return found;
  }
  return null;
}

export async function archiveListing(userId: string, id: string): Promise<boolean> {
  await ensureLoaded();
  const list = cache!.listings?.[userId] || [];
  const idx = list.findIndex((l) => l.id === id);
  if (idx === -1) return false;
  list[idx].archivedAt = new Date().toISOString();
  cache!.listings![userId] = list;
  await save();
  return true;
}

export async function deleteListing(userId: string, id: string): Promise<boolean> {
  await ensureLoaded();
  const list = cache!.listings?.[userId] || [];
  const next = list.filter((l) => l.id !== id);
  const changed = next.length !== list.length;
  if (!cache!.listings) cache!.listings = {} as Record<string, any[]>;
  cache!.listings[userId] = next;
  // also drop any listing links for this listing
  if (cache!.listingLinks && cache!.listingLinks[userId]) {
    cache!.listingLinks[userId] = cache!.listingLinks[userId].filter((x) => x.listingId !== id);
  }
  if (changed) await save();
  return changed;
}

export async function getListingLinks(userId: string, listingId: string): Promise<{ listingId: string; prospectId: string }[]> {
  await ensureLoaded();
  const all = cache!.listingLinks?.[userId] || [];
  return all.filter((x) => x.listingId === listingId);
}

export async function getListingLinksAll(listingId: string): Promise<{ listingId: string; prospectId: string }[]> {
  await ensureLoaded();
  const byUser = cache!.listingLinks || {};
  const merged: { listingId: string; prospectId: string }[] = [];
  for (const uid of Object.keys(byUser)) {
    const arr = (byUser[uid] || []).filter((x) => x.listingId === listingId);
    merged.push(...arr);
  }
  const seen = new Set<string>();
  return merged.filter((x) => {
    const key = `${x.listingId}:${x.prospectId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function linkProspect(userId: string, listingId: string, prospectId: string): Promise<void> {
  await ensureLoaded();
  if (!cache!.listingLinks) cache!.listingLinks = {} as Record<string, { listingId: string; prospectId: string }[]>;
  const all = cache!.listingLinks[userId] || [];
  if (!all.find((x) => x.listingId === listingId && x.prospectId === prospectId)) {
    all.push({ listingId, prospectId });
    cache!.listingLinks[userId] = all;
    await save();
  }
}

export async function unlinkProspect(userId: string, listingId: string, prospectId: string): Promise<boolean> {
  await ensureLoaded();
  const all = cache!.listingLinks?.[userId] || [];
  const next = all.filter((x) => !(x.listingId === listingId && x.prospectId === prospectId));
  cache!.listingLinks![userId] = next;
  const changed = next.length !== all.length;
  if (changed) await save();
  return changed;
}

export async function getListingsSharedWith(userId: string): Promise<any[]> {
  await ensureLoaded();
  const result: any[] = [];
  const lm = cache!.listingMembers || {};
  for (const listingId of Object.keys(lm)) {
    const arr = lm[listingId] || [];
    if (arr.find((m) => m.userId === userId)) {
      const listing = await getListingAny(listingId);
      if (listing && !listing.archivedAt) result.push({ ...listing, prospectCount: 0 });
    }
  }
  return result;
}

// Members (sharing)
export async function getListingMembers(listingId: string): Promise<{ userId: string; role: string; email?: string }[]> {
  await ensureLoaded();
  const arr = cache!.listingMembers?.[listingId] || [];
  return arr.map((m) => ({ userId: m.userId, role: m.role, email: cache!.profiles?.[m.userId]?.email })) as any;
}

export async function addListingMember(listingId: string, userId: string, role: 'viewer'|'editor'): Promise<void> {
  await ensureLoaded();
  if (!cache!.listingMembers) cache!.listingMembers = {} as any;
  const arr = cache!.listingMembers[listingId] || [];
  const idx = arr.findIndex((m) => m.userId === userId);
  if (idx === -1) arr.push({ userId, role }); else arr[idx].role = role;
  cache!.listingMembers[listingId] = arr;
  await save();
}

export async function updateListingMember(listingId: string, userId: string, role: 'viewer'|'editor'|'owner'): Promise<void> {
  await ensureLoaded();
  if (!cache!.listingMembers) cache!.listingMembers = {} as any;
  const arr = cache!.listingMembers[listingId] || [];
  const idx = arr.findIndex((m) => m.userId === userId);
  if (idx !== -1) {
    if (role === 'owner') return; // owner role derived from creator
    arr[idx].role = role as any;
    cache!.listingMembers[listingId] = arr;
    await save();
  }
}

export async function removeListingMember(listingId: string, userId: string): Promise<void> {
  await ensureLoaded();
  const arr = cache!.listingMembers?.[listingId] || [];
  cache!.listingMembers![listingId] = arr.filter((m) => m.userId !== userId);
  await save();
}

export async function getListingMemberRole(listingId: string, userId: string): Promise<'viewer'|'editor'|null> {
  await ensureLoaded();
  const arr = cache!.listingMembers?.[listingId] || [];
  const m = arr.find((x) => x.userId === userId);
  return (m?.role as any) || null;
}

export async function getListingOwner(listingId: string): Promise<{ userId: string; email?: string } | null> {
  await ensureLoaded();
  const maps = cache!.listings || {};
  for (const uid of Object.keys(maps)) {
    const list = maps[uid] || [];
    if (list.find((l) => l.id === listingId)) {
      const email = cache!.profiles?.[uid]?.email;
      return { userId: uid, email };
    }
  }
  return null;
}

export async function getProspectsAll(): Promise<any[]> {
  await ensureLoaded();
  const byUser = cache!.prospects || {};
  const out: any[] = [];
  for (const uid of Object.keys(byUser)) {
    out.push(...(byUser[uid] || []));
  }
  return out;
}
