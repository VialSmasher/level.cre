import fs from 'fs';
import path from 'path';

type DemoData = {
  prospects: Record<string, any[]>;
  profiles: Record<string, any>;
  interactions?: Record<string, any[]>;
  requirements?: Record<string, any[]>;
  submarkets?: Record<string, any[]>;
  marketComps?: Record<string, any[]>;
  listings?: Record<string, any[]>; // workspaces
  listingLinks?: Record<string, { listingId: string; prospectId: string }[]>; // links
};

const dataPath = path.resolve(import.meta.dirname, 'demo-data.json');
let cache: DemoData | null = null;
let loading: Promise<void> | null = null;

async function load(): Promise<void> {
  try {
    const raw = await fs.promises.readFile(dataPath, 'utf8');
    cache = JSON.parse(raw) as DemoData;
  } catch (e: any) {
    cache = { prospects: {}, profiles: {}, interactions: {}, requirements: {}, submarkets: {}, marketComps: {}, listings: {}, listingLinks: {} };
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
  const list = cache!.prospects[userId] || [];
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const updated = { ...list[idx], ...updates };
  list[idx] = updated;
  cache!.prospects[userId] = list;
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
  cache = { prospects: {}, profiles: {}, interactions: {}, requirements: {}, submarkets: {}, marketComps: {}, listings: {}, listingLinks: {} };
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
