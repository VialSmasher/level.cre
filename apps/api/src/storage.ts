import { 
  type Prospect, type InsertProspect, 
  type User, type UpsertUser, 
  type Requirement, type InsertRequirement,
  type Submarket, type InsertSubmarket,
  type Touch, type InsertTouch,
  type Profile, type InsertProfile, type UpdateProfile,
  type ContactInteractionRow, type InsertContactInteraction,
  type BrokerSkillsRow, type InsertBrokerSkills,
  type SkillActivityRow, type InsertSkillActivity,
  type MarketComp, type InsertMarketComp,
  type Listing, type InsertListing,
  type InsertListingProspect,
  prospects, requirements, submarkets, touches, users, profiles, contactInteractions, brokerSkills, skillActivities, marketComps,
  listings, listingProspects
} from "@level-cre/shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, ne, sql, between } from "drizzle-orm";
import { randomUUID } from "crypto";

// Updated interface with user-specific CRUD methods
export interface IStorage {
  // Listings (workspace)
  getListings(userId: string): Promise<(Listing & { prospectCount: number })[]>;
  getListing(id: string, userId: string): Promise<Listing | undefined>;
  createListing(listing: InsertListing & { userId: string }): Promise<Listing>;
  archiveListing(id: string, userId: string): Promise<boolean>;
  deleteListing(id: string, userId: string): Promise<boolean>;
  getListingProspects(listingId: string, userId: string): Promise<Prospect[]>;
  linkProspectToListing(params: { listingId: string; prospectId: string; userId: string }): Promise<{ ok: true }>;
  unlinkProspectFromListing(params: { listingId: string; prospectId: string; userId: string }): Promise<boolean>;

  // Prospects operations with user filtering
  getProspect(id: string, userId: string): Promise<Prospect | undefined>;
  getAllProspects(userId: string): Promise<Prospect[]>;
  createProspect(prospect: InsertProspect & { userId: string }): Promise<Prospect>;
  updateProspect(id: string, userId: string, prospect: Partial<Prospect>): Promise<Prospect | undefined>;
  deleteProspect(id: string, userId: string): Promise<boolean>;
  
  // User operations for Replit Auth
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Requirements operations with user filtering
  getRequirement(id: string, userId: string): Promise<Requirement | undefined>;
  getAllRequirements(userId: string): Promise<Requirement[]>;
  createRequirement(requirement: InsertRequirement & { userId: string }): Promise<Requirement>;
  updateRequirement(id: string, userId: string, requirement: Partial<Requirement>): Promise<Requirement | undefined>;
  deleteRequirement(id: string, userId: string): Promise<boolean>;

  // Market comps operations with user filtering
  getMarketComp(id: string, userId: string): Promise<MarketComp | undefined>;
  getAllMarketComps(userId: string): Promise<MarketComp[]>;
  createMarketComp(comp: InsertMarketComp & { userId: string }): Promise<MarketComp>;
  updateMarketComp(id: string, userId: string, comp: Partial<MarketComp>): Promise<MarketComp | undefined>;
  deleteMarketComp(id: string, userId: string): Promise<boolean>;
  
  // Submarkets operations with user filtering
  getSubmarket(id: string, userId: string): Promise<Submarket | undefined>;
  getAllSubmarkets(userId: string): Promise<Submarket[]>;
  createSubmarket(submarket: InsertSubmarket & { userId: string }): Promise<Submarket>;
  updateSubmarket(id: string, userId: string, submarket: Partial<Submarket>): Promise<Submarket | undefined>;
  deleteSubmarket(id: string, userId: string): Promise<boolean>;
  
  // Touches operations with user filtering
  getTouch(id: string, userId: string): Promise<Touch | undefined>;
  getAllTouches(userId: string): Promise<Touch[]>;
  getTouchesByProspect(prospectId: string, userId: string): Promise<Touch[]>;
  createTouch(touch: InsertTouch & { userId: string }): Promise<Touch>;
  updateTouch(id: string, userId: string, touch: Partial<Touch>): Promise<Touch | undefined>;
  deleteTouch(id: string, userId: string): Promise<boolean>;
  
  // Profile operations
  getProfile(userId: string): Promise<Profile | undefined>;
  createProfile(profile: InsertProfile): Promise<Profile>;
  updateProfile(userId: string, profile: UpdateProfile): Promise<Profile | undefined>;

  // Contact interaction operations with user filtering
  getContactInteractions(userId: string, prospectId?: string, listingId?: string, start?: string, end?: string): Promise<ContactInteractionRow[]>;
  createContactInteraction(interaction: InsertContactInteraction & { userId: string; listingId?: string | null }): Promise<ContactInteractionRow>;
  deleteContactInteraction(id: string, userId: string): Promise<boolean>;

  // Broker Skills operations
  getBrokerSkills(userId: string): Promise<BrokerSkillsRow>;
  addSkillActivity(activity: InsertSkillActivity & { userId: string }): Promise<SkillActivityRow>;
  getSkillActivities(userId: string, limit?: number): Promise<SkillActivityRow[]>;
  getLeaderboard(params: { userId: string, orgId?: string, since?: Date }): Promise<any[]>;
}

export class DatabaseStorage implements IStorage {
  // Listings (workspace)
  async getListings(userId: string): Promise<(Listing & { prospectCount: number })[]> {
    // Fetch listings and counts of linked prospects
    const rows = await db
      .select({
        id: listings.id,
        userId: listings.userId,
        title: listings.title,
        address: listings.address,
        lat: listings.lat,
        lng: listings.lng,
        submarket: listings.submarket,
        createdAt: listings.createdAt,
        archivedAt: listings.archivedAt,
        prospectCount: sql<number>`COALESCE((SELECT COUNT(*)::int FROM ${listingProspects} lp WHERE lp.listing_id = ${listings.id}), 0)`,
      })
      .from(listings)
      .where(and(eq(listings.userId, userId), eq(sql`COALESCE(${listings.archivedAt} IS NULL, TRUE)`, true))) as any;

    return rows.map((r: any) => ({
      id: r.id,
      userId: r.userId,
      title: r.title,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      submarket: r.submarket,
      createdAt: r.createdAt,
      archivedAt: r.archivedAt,
      prospectCount: r.prospectCount ?? 0,
    }));
  }

  async getListing(id: string, userId: string): Promise<Listing | undefined> {
    const [row] = await db.select().from(listings).where(and(eq(listings.id, id), eq(listings.userId, userId)));
    return row;
  }

  // Fetch listing by id regardless of owner (route layer must authorize)
  async getListingAny(id: string): Promise<Listing | undefined> {
    const [row] = await db.select().from(listings).where(eq(listings.id, id));
    return row;
  }

  async createListing(insert: InsertListing & { userId: string }): Promise<Listing> {
    const [row] = await db.insert(listings).values({
      id: insert.id ?? randomUUID(),
      userId: insert.userId,
      title: insert.title,
      address: insert.address,
      lat: (insert.lat ?? '') as any,
      lng: (insert.lng ?? '') as any,
      submarket: insert.submarket ?? null,
      dealType: (insert as any).dealType ?? null,
      size: (insert as any).size ?? null,
      price: (insert as any).price ?? null,
    }).returning();
    return row;
  }

  async archiveListing(id: string, userId: string): Promise<boolean> {
    const [row] = await db.update(listings).set({ archivedAt: new Date() }).where(and(eq(listings.id, id), eq(listings.userId, userId))).returning();
    return !!row;
  }

  async deleteListing(id: string, userId: string): Promise<boolean> {
    // Delete listing; cascades remove listingProspects via FK
    const [row] = await db.delete(listings).where(and(eq(listings.id, id), eq(listings.userId, userId))).returning();
    return !!row;
  }

  async getListingProspects(listingId: string, userId: string): Promise<Prospect[]> {
    // join link table to prospects, enforce user's prospects
    const rows = await db
      .select({
        id: prospects.id,
        name: prospects.name,
        status: prospects.status,
        notes: prospects.notes,
        geometryJson: sql<string>`ST_AsGeoJSON(${prospects.geometry})`,
        submarketId: prospects.submarketId,
        lastContactDate: prospects.lastContactDate,
        followUpTimeframe: prospects.followUpTimeframe,
        contactName: prospects.contactName,
        contactEmail: prospects.contactEmail,
        contactPhone: prospects.contactPhone,
        contactCompany: prospects.contactCompany,
        size: prospects.size,
        acres: prospects.acres,
        createdAt: prospects.createdAt,
      })
      .from(listingProspects)
      .innerJoin(prospects, eq(listingProspects.prospectId, prospects.id))
      .innerJoin(listings, eq(listingProspects.listingId, listings.id))
      .where(and(eq(listingProspects.listingId, listingId), eq(listings.userId, userId)));
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status as any,
      notes: p.notes || "",
      geometry: JSON.parse(p.geometryJson as any),
      submarketId: p.submarketId || undefined,
      lastContactDate: p.lastContactDate || undefined,
      followUpTimeframe: p.followUpTimeframe as any || undefined,
      contactName: p.contactName || undefined,
      contactEmail: p.contactEmail || undefined,
      contactPhone: p.contactPhone || undefined,
      contactCompany: p.contactCompany || undefined,
      size: p.size || undefined,
      acres: p.acres || undefined,
      createdDate: p.createdAt?.toISOString() || new Date().toISOString(),
    }));
  }

  // Fetch all prospects linked to a listing id regardless of owner
  async getListingProspectsAny(listingId: string): Promise<Prospect[]> {
    const rows = await db
      .select({
        id: prospects.id,
        name: prospects.name,
        status: prospects.status,
        notes: prospects.notes,
        geometryJson: sql<string>`ST_AsGeoJSON(${prospects.geometry})`,
        submarketId: prospects.submarketId,
        lastContactDate: prospects.lastContactDate,
        followUpTimeframe: prospects.followUpTimeframe,
        contactName: prospects.contactName,
        contactEmail: prospects.contactEmail,
        contactPhone: prospects.contactPhone,
        contactCompany: prospects.contactCompany,
        size: prospects.size,
        acres: prospects.acres,
        createdAt: prospects.createdAt,
      })
      .from(listingProspects)
      .innerJoin(prospects, eq(listingProspects.prospectId, prospects.id))
      .where(eq(listingProspects.listingId, listingId));
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status as any,
      notes: p.notes || "",
      geometry: JSON.parse(p.geometryJson as any),
      submarketId: p.submarketId || undefined,
      lastContactDate: p.lastContactDate || undefined,
      followUpTimeframe: p.followUpTimeframe as any || undefined,
      contactName: p.contactName || undefined,
      contactEmail: p.contactEmail || undefined,
      contactPhone: p.contactPhone || undefined,
      contactCompany: p.contactCompany || undefined,
      size: p.size || undefined,
      acres: p.acres || undefined,
      createdDate: p.createdAt?.toISOString() || new Date().toISOString(),
    }));
  }

  async linkProspectToListing(params: { listingId: string; prospectId: string; userId: string }): Promise<{ ok: true }> {
    // Ensure listing belongs to user
    const listing = await this.getListing(params.listingId, params.userId);
    if (!listing) throw new Error('Listing not found');
    // Insert link idempotently
    await db.insert(listingProspects)
      .values({ id: randomUUID(), listingId: params.listingId, prospectId: params.prospectId, role: 'target' })
      .onConflictDoNothing({ target: [listingProspects.listingId, listingProspects.prospectId] });
    return { ok: true };
  }

  // Link prospect to listing without owner check (route must authorize via membership)
  async linkProspectToListingAny(params: { listingId: string; prospectId: string }): Promise<{ ok: true }> {
    await db.insert(listingProspects)
      .values({ id: randomUUID(), listingId: params.listingId, prospectId: params.prospectId, role: 'target' })
      .onConflictDoNothing({ target: [listingProspects.listingId, listingProspects.prospectId] });
    return { ok: true };
  }

  async unlinkProspectFromListing(params: { listingId: string; prospectId: string; userId: string }): Promise<boolean> {
    const listing = await this.getListing(params.listingId, params.userId);
    if (!listing) return false;
    const result = await db.delete(listingProspects).where(and(eq(listingProspects.listingId, params.listingId), eq(listingProspects.prospectId, params.prospectId)));
    return (result.rowCount ?? 0) > 0;
  }

  async unlinkProspectFromListingAny(params: { listingId: string; prospectId: string }): Promise<boolean> {
    const result = await db.delete(listingProspects).where(and(eq(listingProspects.listingId, params.listingId), eq(listingProspects.prospectId, params.prospectId)));
    return (result.rowCount ?? 0) > 0;
  }
  // User operations for Replit Auth
  async getUser(id: string): Promise<User | undefined> {
    const [result] = await db.select().from(users).where(eq(users.id, id));
    return result;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [result] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  // Requirements operations with user filtering
  async getRequirement(id: string, userId: string): Promise<Requirement | undefined> {
    const [result] = await db.select().from(requirements).where(and(eq(requirements.id, id), eq(requirements.userId, userId)));
    if (!result) return undefined;
    return {
      id: result.id,
      userId: result.userId,
      title: result.title,
      source: result.source as any,
      location: result.location || undefined,
      contactName: result.contactName || undefined,
      contactEmail: result.contactEmail || undefined,
      contactPhone: result.contactPhone || undefined,
      spaceSize: result.spaceSize as any,
      timeline: result.timeline as any,
      status: (result.status as any) || "active",
      tags: (result.tags as string[]) || [],
      notes: result.notes || undefined,
      createdAt: result.createdAt?.toISOString(),
      updatedAt: result.updatedAt?.toISOString()
    };
  }

  async getAllRequirements(userId: string): Promise<Requirement[]> {
    const results = await db.select().from(requirements).where(eq(requirements.userId, userId));
    return results.map(result => ({
      id: result.id,
      userId: result.userId,
      title: result.title,
      source: result.source as any,
      location: result.location || undefined,
      contactName: result.contactName || undefined,
      contactEmail: result.contactEmail || undefined,
      contactPhone: result.contactPhone || undefined,
      spaceSize: result.spaceSize as any,
      timeline: result.timeline as any,
      status: (result.status as any) || "active",
      tags: (result.tags as string[]) || [],
      notes: result.notes || undefined,
      createdAt: result.createdAt?.toISOString(),
      updatedAt: result.updatedAt?.toISOString()
    }));
  }

  async createRequirement(insertRequirement: InsertRequirement & { userId: string }): Promise<Requirement> {
    const [result] = await db.insert(requirements).values({
      userId: insertRequirement.userId,
      title: insertRequirement.title,
      source: insertRequirement.source,
      location: insertRequirement.location,
      contactName: insertRequirement.contactName,
      contactEmail: insertRequirement.contactEmail, 
      contactPhone: insertRequirement.contactPhone,
      spaceSize: insertRequirement.spaceSize,
      timeline: insertRequirement.timeline,
      status: insertRequirement.status || "active",
      tags: insertRequirement.tags || [],
      notes: insertRequirement.notes
    }).returning();
    
    // Award XP for market knowledge
    await this.addSkillActivity({
      userId: insertRequirement.userId,
      skillType: 'marketKnowledge',
      action: 'add_requirement',
      xpGained: 20,
      relatedId: result.id,
      multiplier: 1
    });
    
    return {
      id: result.id,
      userId: result.userId,
      title: result.title,
      source: result.source as any,
      location: result.location || undefined,
      contactName: result.contactName || undefined,
      contactEmail: result.contactEmail || undefined,
      contactPhone: result.contactPhone || undefined,
      spaceSize: result.spaceSize as any,
      timeline: result.timeline as any,
      status: (result.status as any) || "active",
      tags: (result.tags as string[]) || [],
      notes: result.notes || undefined,
      createdAt: result.createdAt?.toISOString(),
      updatedAt: result.updatedAt?.toISOString()
    };
  }

  async updateRequirement(id: string, userId: string, updates: Partial<Requirement>): Promise<Requirement | undefined> {
    const [result] = await db.update(requirements)
      .set({
        ...(updates.title && { title: updates.title }),
        ...(updates.source && { source: updates.source }),
        ...(updates.location !== undefined && { location: updates.location }),
        ...(updates.contactName !== undefined && { contactName: updates.contactName }),
        ...(updates.contactEmail !== undefined && { contactEmail: updates.contactEmail }),
        ...(updates.contactPhone !== undefined && { contactPhone: updates.contactPhone }),
        ...(updates.spaceSize && { spaceSize: updates.spaceSize }),
        ...(updates.timeline && { timeline: updates.timeline }),
        ...(updates.status && { status: updates.status }),
        ...(updates.tags && { tags: updates.tags }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
        updatedAt: new Date()
      })
      .where(and(eq(requirements.id, id), eq(requirements.userId, userId)))
      .returning();
    
    if (!result) return undefined;
    return {
      id: result.id,
      userId: result.userId,
      title: result.title,
      source: result.source as any,
      location: result.location || undefined,
      contactName: result.contactName || undefined,
      contactEmail: result.contactEmail || undefined,
      contactPhone: result.contactPhone || undefined,
      spaceSize: result.spaceSize as any,
      timeline: result.timeline as any,
      status: (result.status as any) || "active",
      tags: (result.tags as string[]) || [],
      notes: result.notes || undefined,
      createdAt: result.createdAt?.toISOString(),
      updatedAt: result.updatedAt?.toISOString()
    };
  }

  async deleteRequirement(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(requirements).where(and(eq(requirements.id, id), eq(requirements.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Market comps operations with user filtering
  async getMarketComp(id: string, userId: string): Promise<MarketComp | undefined> {
    const [result] = await db.select().from(marketComps).where(and(eq(marketComps.id, id), eq(marketComps.userId, userId)));
    if (!result) return undefined;
    return {
      id: result.id,
      userId: result.userId,
      address: result.address,
      submarket: result.submarket || undefined,
      assetType: result.assetType as any,
      buildingSize: result.buildingSize || undefined,
      landSize: result.landSize || undefined,
      sourceLink: result.sourceLink || undefined,
      notes: result.notes || undefined,
      dealType: result.dealType as any,
      tenant: result.tenant || undefined,
      termMonths: result.termMonths || undefined,
      rate: result.rate || undefined,
      rateType: result.rateType as any || undefined,
      commencement: result.commencement || undefined,
      concessions: result.concessions || undefined,
      saleDate: result.saleDate || undefined,
      buyer: result.buyer || undefined,
      seller: result.seller || undefined,
      price: result.price || undefined,
      pricePerSf: result.pricePerSf || undefined,
      pricePerAcre: result.pricePerAcre || undefined,
      createdAt: result.createdAt?.toISOString(),
      updatedAt: result.updatedAt?.toISOString(),
    };
  }

  async getAllMarketComps(userId: string): Promise<MarketComp[]> {
    const results = await db.select().from(marketComps).where(eq(marketComps.userId, userId));
    return results.map(result => ({
      id: result.id,
      userId: result.userId,
      address: result.address,
      submarket: result.submarket || undefined,
      assetType: result.assetType as any,
      buildingSize: result.buildingSize || undefined,
      landSize: result.landSize || undefined,
      sourceLink: result.sourceLink || undefined,
      notes: result.notes || undefined,
      dealType: result.dealType as any,
      tenant: result.tenant || undefined,
      termMonths: result.termMonths || undefined,
      rate: result.rate || undefined,
      rateType: result.rateType as any || undefined,
      commencement: result.commencement || undefined,
      concessions: result.concessions || undefined,
      saleDate: result.saleDate || undefined,
      buyer: result.buyer || undefined,
      seller: result.seller || undefined,
      price: result.price || undefined,
      pricePerSf: result.pricePerSf || undefined,
      pricePerAcre: result.pricePerAcre || undefined,
      createdAt: result.createdAt?.toISOString(),
      updatedAt: result.updatedAt?.toISOString(),
    }));
  }

  async createMarketComp(insertComp: InsertMarketComp & { userId: string }): Promise<MarketComp> {
    const [result] = await db.insert(marketComps).values({
      userId: insertComp.userId,
      address: insertComp.address,
      submarket: insertComp.submarket,
      assetType: insertComp.assetType,
      buildingSize: insertComp.buildingSize,
      landSize: insertComp.landSize,
      sourceLink: insertComp.sourceLink,
      notes: insertComp.notes,
      dealType: insertComp.dealType,
      tenant: insertComp.tenant,
      termMonths: insertComp.termMonths,
      rate: insertComp.rate,
      rateType: insertComp.rateType,
      commencement: insertComp.commencement,
      concessions: insertComp.concessions,
      saleDate: insertComp.saleDate,
      buyer: insertComp.buyer,
      seller: insertComp.seller,
      price: insertComp.price,
      pricePerSf: insertComp.pricePerSf,
      pricePerAcre: insertComp.pricePerAcre,
    }).returning();

    // Award XP for market knowledge
    await this.addSkillActivity({
      userId: insertComp.userId,
      skillType: 'marketKnowledge',
      action: 'add_market_comp',
      xpGained: 20,
      relatedId: result.id,
      multiplier: 1,
    });

    return {
      id: result.id,
      userId: result.userId,
      address: result.address,
      submarket: result.submarket || undefined,
      assetType: result.assetType as any,
      buildingSize: result.buildingSize || undefined,
      landSize: result.landSize || undefined,
      sourceLink: result.sourceLink || undefined,
      notes: result.notes || undefined,
      dealType: result.dealType as any,
      tenant: result.tenant || undefined,
      termMonths: result.termMonths || undefined,
      rate: result.rate || undefined,
      rateType: result.rateType as any || undefined,
      commencement: result.commencement || undefined,
      concessions: result.concessions || undefined,
      saleDate: result.saleDate || undefined,
      buyer: result.buyer || undefined,
      seller: result.seller || undefined,
      price: result.price || undefined,
      pricePerSf: result.pricePerSf || undefined,
      pricePerAcre: result.pricePerAcre || undefined,
      createdAt: result.createdAt?.toISOString(),
      updatedAt: result.updatedAt?.toISOString(),
    };
  }

  async updateMarketComp(id: string, userId: string, updates: Partial<MarketComp>): Promise<MarketComp | undefined> {
    const [result] = await db.update(marketComps)
      .set({
        ...(updates.address !== undefined && { address: updates.address }),
        ...(updates.submarket !== undefined && { submarket: updates.submarket }),
        ...(updates.assetType !== undefined && { assetType: updates.assetType }),
        ...(updates.buildingSize !== undefined && { buildingSize: updates.buildingSize }),
        ...(updates.landSize !== undefined && { landSize: updates.landSize }),
        ...(updates.sourceLink !== undefined && { sourceLink: updates.sourceLink }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
        ...(updates.dealType !== undefined && { dealType: updates.dealType }),
        ...(updates.tenant !== undefined && { tenant: updates.tenant }),
        ...(updates.termMonths !== undefined && { termMonths: updates.termMonths }),
        ...(updates.rate !== undefined && { rate: updates.rate }),
        ...(updates.rateType !== undefined && { rateType: updates.rateType }),
        ...(updates.commencement !== undefined && { commencement: updates.commencement }),
        ...(updates.concessions !== undefined && { concessions: updates.concessions }),
        ...(updates.saleDate !== undefined && { saleDate: updates.saleDate }),
        ...(updates.buyer !== undefined && { buyer: updates.buyer }),
        ...(updates.seller !== undefined && { seller: updates.seller }),
        ...(updates.price !== undefined && { price: updates.price }),
        ...(updates.pricePerSf !== undefined && { pricePerSf: updates.pricePerSf }),
        ...(updates.pricePerAcre !== undefined && { pricePerAcre: updates.pricePerAcre }),
        updatedAt: new Date(),
      })
      .where(and(eq(marketComps.id, id), eq(marketComps.userId, userId)))
      .returning();

    if (!result) return undefined;
    return {
      id: result.id,
      userId: result.userId,
      address: result.address,
      submarket: result.submarket || undefined,
      assetType: result.assetType as any,
      buildingSize: result.buildingSize || undefined,
      landSize: result.landSize || undefined,
      sourceLink: result.sourceLink || undefined,
      notes: result.notes || undefined,
      dealType: result.dealType as any,
      tenant: result.tenant || undefined,
      termMonths: result.termMonths || undefined,
      rate: result.rate || undefined,
      rateType: result.rateType as any || undefined,
      commencement: result.commencement || undefined,
      concessions: result.concessions || undefined,
      saleDate: result.saleDate || undefined,
      buyer: result.buyer || undefined,
      seller: result.seller || undefined,
      price: result.price || undefined,
      pricePerSf: result.pricePerSf || undefined,
      pricePerAcre: result.pricePerAcre || undefined,
      createdAt: result.createdAt?.toISOString(),
      updatedAt: result.updatedAt?.toISOString(),
    };
  }

  async deleteMarketComp(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(marketComps).where(and(eq(marketComps.id, id), eq(marketComps.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Prospects operations with user filtering
  async getProspect(id: string, userId: string): Promise<Prospect | undefined> {
    const [row] = await db
      .select({
        id: prospects.id,
        name: prospects.name,
        status: prospects.status,
        notes: prospects.notes,
        geometryJson: sql<string>`ST_AsGeoJSON(${prospects.geometry})`,
        submarketId: prospects.submarketId,
        lastContactDate: prospects.lastContactDate,
        followUpTimeframe: prospects.followUpTimeframe,
        contactName: prospects.contactName,
        contactEmail: prospects.contactEmail,
        contactPhone: prospects.contactPhone,
        contactCompany: prospects.contactCompany,
        size: prospects.size,
        acres: prospects.acres,
        createdAt: prospects.createdAt,
      })
      .from(prospects)
      .where(and(eq(prospects.id, id), eq(prospects.userId, userId)));
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      status: row.status as any,
      notes: row.notes || "",
      geometry: JSON.parse(row.geometryJson as any),
      submarketId: row.submarketId || undefined,
      lastContactDate: row.lastContactDate || undefined,
      followUpTimeframe: row.followUpTimeframe as any || undefined,
      contactName: row.contactName || undefined,
      contactEmail: row.contactEmail || undefined,
      contactPhone: row.contactPhone || undefined,
      contactCompany: row.contactCompany || undefined,
      size: row.size || undefined,
      acres: row.acres || undefined,
      createdDate: row.createdAt?.toISOString() || new Date().toISOString()
    };
  }

  async getAllProspects(userId: string): Promise<Prospect[]> {
    const rows = await db
      .select({
        id: prospects.id,
        name: prospects.name,
        status: prospects.status,
        notes: prospects.notes,
        geometryJson: sql<string>`ST_AsGeoJSON(${prospects.geometry})`,
        submarketId: prospects.submarketId,
        lastContactDate: prospects.lastContactDate,
        followUpTimeframe: prospects.followUpTimeframe,
        contactName: prospects.contactName,
        contactEmail: prospects.contactEmail,
        contactPhone: prospects.contactPhone,
        contactCompany: prospects.contactCompany,
        size: prospects.size,
        acres: prospects.acres,
        createdAt: prospects.createdAt,
      })
      .from(prospects)
      .where(eq(prospects.userId, userId));
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      status: r.status as any,
      notes: r.notes || "",
      geometry: JSON.parse(r.geometryJson as any),
      submarketId: r.submarketId || undefined,
      lastContactDate: r.lastContactDate || undefined,
      followUpTimeframe: r.followUpTimeframe as any || undefined,
      contactName: r.contactName || undefined,
      contactEmail: r.contactEmail || undefined,
      contactPhone: r.contactPhone || undefined,
      contactCompany: r.contactCompany || undefined,
      size: r.size || undefined,
      acres: r.acres || undefined,
      createdDate: r.createdAt?.toISOString() || new Date().toISOString()
    }));
  }

  async createProspect(insertProspect: InsertProspect & { userId: string }): Promise<Prospect> {
    const [result] = await db.insert(prospects).values({
      userId: insertProspect.userId,
      name: insertProspect.name,
      status: insertProspect.status,
      notes: insertProspect.notes,
      // Wrap GeoJSON with PostGIS constructor, cast param to text, and set SRID=4326
      geometry: sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(insertProspect.geometry)}::text), 4326)` as any,
      ...(insertProspect.submarketId && { submarketId: insertProspect.submarketId }),
      ...(insertProspect.lastContactDate && { lastContactDate: insertProspect.lastContactDate }),
      ...(insertProspect.followUpTimeframe && { followUpTimeframe: insertProspect.followUpTimeframe }),
      ...(insertProspect.contactName && { contactName: insertProspect.contactName }),
      ...(insertProspect.contactEmail && { contactEmail: insertProspect.contactEmail }),
      ...(insertProspect.contactPhone && { contactPhone: insertProspect.contactPhone }),
      ...(insertProspect.contactCompany && { contactCompany: insertProspect.contactCompany }),
      ...(insertProspect.size && { size: insertProspect.size }),
      ...(insertProspect.acres && { acres: insertProspect.acres })
    }).returning({
      id: prospects.id,
      name: prospects.name,
      status: prospects.status,
      notes: prospects.notes,
      geometryJson: sql<string>`ST_AsGeoJSON(${prospects.geometry})`,
      submarketId: prospects.submarketId,
      lastContactDate: prospects.lastContactDate,
      followUpTimeframe: prospects.followUpTimeframe,
      contactName: prospects.contactName,
      contactEmail: prospects.contactEmail,
      contactPhone: prospects.contactPhone,
      contactCompany: prospects.contactCompany,
      size: prospects.size,
      acres: prospects.acres,
      createdAt: prospects.createdAt,
    });
    
    // Award XP for prospecting
    await this.addSkillActivity({
      userId: insertProspect.userId,
      skillType: 'prospecting',
      action: 'add_prospect',
      xpGained: 25,
      relatedId: result.id,
      multiplier: 1
    });
    
    return {
      id: result.id,
      name: result.name,
      status: result.status as any,
      notes: result.notes || "",
      geometry: JSON.parse(result.geometryJson as any),
      submarketId: result.submarketId || undefined,
      lastContactDate: result.lastContactDate || undefined,
      followUpTimeframe: result.followUpTimeframe as any || undefined,
      contactName: result.contactName || undefined,
      contactEmail: result.contactEmail || undefined,
      contactPhone: result.contactPhone || undefined,
      contactCompany: result.contactCompany || undefined,
      size: result.size || undefined,
      acres: result.acres || undefined,
      createdDate: result.createdAt?.toISOString() || new Date().toISOString()
    };
  }

  async updateProspect(id: string, userId: string, updates: Partial<Prospect>): Promise<Prospect | undefined> {
    const [result] = await db.update(prospects)
      .set({
        ...(updates.name && { name: updates.name }),
        ...(updates.status && { status: updates.status }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
        // Convert incoming GeoJSON to PostGIS geometry, cast param to text, and set SRID=4326
        ...(updates.geometry && { geometry: sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(updates.geometry)}::text), 4326)` as any }),
        ...(updates.submarketId !== undefined && { submarketId: updates.submarketId }),
        ...(updates.lastContactDate !== undefined && { lastContactDate: updates.lastContactDate }),
        ...(updates.followUpTimeframe !== undefined && { followUpTimeframe: updates.followUpTimeframe }),
        ...(updates.contactName !== undefined && { contactName: updates.contactName }),
        ...(updates.contactEmail !== undefined && { contactEmail: updates.contactEmail }),
        ...(updates.contactPhone !== undefined && { contactPhone: updates.contactPhone }),
        ...(updates.contactCompany !== undefined && { contactCompany: updates.contactCompany }),
        ...(updates.size !== undefined && { size: updates.size }),
        ...(updates.acres !== undefined && { acres: updates.acres }),
        updatedAt: new Date()
      })
      .where(and(eq(prospects.id, id), eq(prospects.userId, userId)))
      .returning({
        id: prospects.id,
        name: prospects.name,
        status: prospects.status,
        notes: prospects.notes,
        geometryJson: sql<string>`ST_AsGeoJSON(${prospects.geometry})`,
        submarketId: prospects.submarketId,
        lastContactDate: prospects.lastContactDate,
        followUpTimeframe: prospects.followUpTimeframe,
        contactName: prospects.contactName,
        contactEmail: prospects.contactEmail,
        contactPhone: prospects.contactPhone,
        contactCompany: prospects.contactCompany,
        size: prospects.size,
        acres: prospects.acres,
        createdAt: prospects.createdAt,
      });
    
    if (!result) return undefined;
    return {
      id: result.id,
      name: result.name,
      status: result.status as any,
      notes: result.notes || "",
      geometry: JSON.parse(result.geometryJson as any),
      submarketId: result.submarketId || undefined,
      lastContactDate: result.lastContactDate || undefined,
      followUpTimeframe: result.followUpTimeframe as any || undefined,
      contactName: result.contactName || undefined,
      contactEmail: result.contactEmail || undefined,
      contactPhone: result.contactPhone || undefined,
      contactCompany: result.contactCompany || undefined,
      size: result.size || undefined,
      acres: result.acres || undefined,
      createdDate: result.createdAt?.toISOString() || new Date().toISOString()
    };
  }

  async deleteProspect(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(prospects).where(and(eq(prospects.id, id), eq(prospects.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getSubmarket(id: string, userId: string): Promise<Submarket | undefined> {
    const [result] = await db.select().from(submarkets).where(and(eq(submarkets.id, id), eq(submarkets.userId, userId)));
    if (!result) return undefined;
    return {
      id: result.id,
      name: result.name,
      color: result.color || undefined,
      isActive: result.isActive === 'true'
    };
  }

  async getAllSubmarkets(userId: string): Promise<Submarket[]> {
    // Return unique submarkets for the user (by name, case-insensitive),
    // preferring active and most recently updated rows.
    // Use DISTINCT ON to collapse duplicates by lower(name).
    const rows: any = await db.execute(sql`
      SELECT DISTINCT ON (LOWER(name)) id, name, color, is_active, updated_at, created_at
      FROM submarkets
      WHERE user_id = ${userId} AND (is_active = 'true' OR is_active IS NULL)
      ORDER BY LOWER(name), is_active DESC, updated_at DESC, created_at DESC
    `);

    const list: any[] = (rows?.rows ?? rows) as any[];
    return (list || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      color: r.color || undefined,
      isActive: String(r.is_active ?? r.isActive ?? 'true') === 'true'
    }));
  }

  async createSubmarket(submarket: InsertSubmarket & { userId: string }): Promise<Submarket> {
    const newSubmarket = {
      id: randomUUID(),
      userId: submarket.userId,
      name: submarket.name,
      color: submarket.color || null,
      isActive: submarket.isActive ? 'true' : 'false',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const [result] = await db.insert(submarkets).values(newSubmarket).returning();
    return {
      id: result.id,
      name: result.name,
      color: result.color || undefined,
      isActive: result.isActive === 'true'
    };
  }

  async updateSubmarket(id: string, userId: string, submarket: Partial<Submarket>): Promise<Submarket | undefined> {
    const updateData: any = { updatedAt: new Date() };
    if (submarket.name) updateData.name = submarket.name;
    if (submarket.color) updateData.color = submarket.color;
    if (typeof submarket.isActive === 'boolean') updateData.isActive = submarket.isActive ? 'true' : 'false';
    
    const [result] = await db
      .update(submarkets)
      .set(updateData)
      .where(and(eq(submarkets.id, id), eq(submarkets.userId, userId)))
      .returning();
    
    if (!result) return undefined;
    return {
      id: result.id,
      name: result.name,
      color: result.color || undefined,
      isActive: result.isActive === 'true'
    };
  }

  async deleteSubmarket(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(submarkets)
      .where(and(eq(submarkets.id, id), eq(submarkets.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getTouch(id: string, userId: string): Promise<Touch | undefined> {
    return undefined;
  }

  async getAllTouches(userId: string): Promise<Touch[]> {
    return [];
  }

  async getTouchesByProspect(prospectId: string, userId: string): Promise<Touch[]> {
    return [];
  }

  async createTouch(touch: InsertTouch & { userId: string }): Promise<Touch> {
    throw new Error("Not implemented");
  }

  async updateTouch(id: string, userId: string, touch: Partial<Touch>): Promise<Touch | undefined> {
    return undefined;
  }

  async deleteTouch(id: string, userId: string): Promise<boolean> {
    return false;
  }
  
  // Profile operations
  async getProfile(userId: string): Promise<Profile | undefined> {
    const [result] = await db.select().from(profiles).where(eq(profiles.id, userId));
    return result;
  }

  async createProfile(profile: InsertProfile): Promise<Profile> {
    const [result] = await db.insert(profiles).values(profile).returning();
    return result;
  }

  async updateProfile(userId: string, profile: UpdateProfile): Promise<Profile | undefined> {
    const [result] = await db.update(profiles)
      .set({ ...profile, updatedAt: new Date() })
      .where(eq(profiles.id, userId))
      .returning();
    return result;
  }

  // Contact interaction operations with user filtering
  async getContactInteractions(userId: string, prospectId?: string, listingId?: string, start?: string, end?: string): Promise<ContactInteractionRow[]> {
    const whereClauses: any[] = [eq(contactInteractions.userId, userId)];
    if (prospectId) whereClauses.push(eq(contactInteractions.prospectId, prospectId));
    if (listingId) whereClauses.push(eq(contactInteractions.listingId, listingId));
    if (start && end) whereClauses.push(between(contactInteractions.date, start, end));
    const results = await db.select().from(contactInteractions)
      .where(and(...whereClauses))
      .orderBy(contactInteractions.createdAt);
    return results;
  }

  async createContactInteraction(interactionData: InsertContactInteraction & { userId: string; listingId?: string | null }): Promise<ContactInteractionRow> {
    const [result] = await db.insert(contactInteractions)
      .values({
        ...interactionData,
        id: randomUUID()
      })
      .returning();
    
    // Award XP for follow-up activities
    let xpGained = 10; // Base XP for interaction
    let action = 'interaction';
    
    if (interactionData.type === 'call') {
      xpGained = 15;
      action = 'phone_call';
    } else if (interactionData.type === 'email') {
      xpGained = 10;
      action = 'email_sent';
    } else if (interactionData.type === 'meeting') {
      xpGained = 25;
      action = 'meeting_held';
    }
    
    await this.addSkillActivity({
      userId: interactionData.userId,
      skillType: 'followUp',
      action,
      xpGained,
      relatedId: result.id,
      multiplier: 1
    });
    
    return result;
  }

  async deleteContactInteraction(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(contactInteractions)
      .where(and(eq(contactInteractions.id, id), eq(contactInteractions.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Broker Skills operations
  async getBrokerSkills(userId: string): Promise<BrokerSkillsRow> {
    // Try to get existing skills record
    const [existing] = await db.select().from(brokerSkills).where(eq(brokerSkills.userId, userId));
    
    if (existing) {
      return existing;
    }
    
    // Create default skills record if none exists
    const [newSkills] = await db.insert(brokerSkills)
      .values({
        id: randomUUID(),
        userId,
        prospecting: 0,
        followUp: 0,
        consistency: 0,
        marketKnowledge: 0,
        streakDays: 0
      })
      .returning();
    
    return newSkills;
  }

  async addSkillActivity(activityData: InsertSkillActivity & { userId: string }): Promise<SkillActivityRow> {
    // First, add the activity record
    const [activity] = await db.insert(skillActivities)
      .values({
        ...activityData,
        id: randomUUID()
      })
      .returning();

    // Then update the corresponding skill XP and streaks
    const currentSkills = await this.getBrokerSkills(activityData.userId);
    const updateData: any = {};
    
    switch (activityData.skillType) {
      case 'prospecting':
        updateData.prospecting = (currentSkills.prospecting || 0) + activityData.xpGained;
        break;
      case 'followUp':
        updateData.followUp = (currentSkills.followUp || 0) + activityData.xpGained;
        break;
      case 'consistency':
        updateData.consistency = (currentSkills.consistency || 0) + activityData.xpGained;
        break;
      case 'marketKnowledge':
        updateData.marketKnowledge = (currentSkills.marketKnowledge || 0) + activityData.xpGained;
        break;
    }

    // Daily streak update (consistency) – increment when crossing day boundary
    const now = new Date();
    const last = currentSkills.lastActivity ? new Date(currentSkills.lastActivity) : null;
    let streakDays = currentSkills.streakDays || 0;
    if (!last) {
      streakDays = 1;
    } else {
      const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate());
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diffDays = Math.floor((today.getTime() - lastDay.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        streakDays += 1;
      } else if (diffDays > 1) {
        streakDays = 1;
      }
    }

    await db.update(brokerSkills)
      .set({ ...updateData, lastActivity: now, streakDays, updatedAt: now })
      .where(eq(brokerSkills.userId, activityData.userId));

    return activity;
  }

  async getSkillActivities(userId: string, limit: number = 50): Promise<SkillActivityRow[]> {
    const results = await db.select().from(skillActivities)
      .where(eq(skillActivities.userId, userId))
      .orderBy(desc(skillActivities.timestamp))
      .limit(limit);
    return results;
  }

  async getLeaderboard({ userId, orgId, since }: { userId: string, orgId?: string, since?: Date }): Promise<any[]> {
    // Helper function to calculate level from XP (same as stats page)
    const getLevel = (xp: number): number => {
      // Match client logic: Level 0 at 0 XP; Level 1 at 100 XP
      return Math.min(99, Math.floor(Math.sqrt(xp / 100)));
    };

    try {
      // All-time leaderboard: read from broker_skills only
      const results = await db.select({
        userId: users.id,
        userEmail: users.email,
        displayName: profiles.name,
        prospectingXp: brokerSkills.prospecting,
        followUpXp: brokerSkills.followUp,
        consistencyXp: brokerSkills.consistency,
        marketKnowledgeXp: brokerSkills.marketKnowledge,
      })
      .from(users)
      .leftJoin(brokerSkills, eq(users.id, brokerSkills.userId))
      .leftJoin(profiles, eq(users.id, profiles.id))
      .where(ne(users.id, 'demo-user')); // Exclude demo user

      // Calculate levels and sort
      const leaderboard = results.map(row => {
        const lPros = getLevel(row.prospectingXp || 0);
        const lFup = getLevel(row.followUpXp || 0);
        const lCons = getLevel(row.consistencyXp || 0);
        const lMk = getLevel(row.marketKnowledgeXp || 0);
        return {
          user_id: row.userId,
          user_email: row.userEmail || '',
          display_name: row.displayName || row.userEmail?.split('@')[0] || 'Unknown',
          level_total: lPros + lFup + lCons + lMk,
          xp_total: (row.prospectingXp || 0) + (row.followUpXp || 0),
        };
      });

      // Sort by level_total DESC, then by xp_total DESC
      return leaderboard.sort((a, b) => {
        if (a.level_total !== b.level_total) return b.level_total - a.level_total;
        return b.xp_total - a.xp_total;
      });
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      return [];
    }
  }
}

export const storage = new DatabaseStorage();
