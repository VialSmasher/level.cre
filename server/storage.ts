import { 
  type Prospect, type InsertProspect, 
  type User, type UpsertUser, 
  type Requirement, type InsertRequirement,
  type Comp, type InsertComp,
  type Submarket, type InsertSubmarket,
  type Touch, type InsertTouch,
  type Profile, type InsertProfile, type UpdateProfile,
  type ContactInteractionRow, type InsertContactInteraction,
  type BrokerSkillsRow, type InsertBrokerSkills,
  type SkillActivityRow, type InsertSkillActivity,
  prospects, requirements, comps, submarkets, touches, users, profiles, contactInteractions, brokerSkills, skillActivities
} from "@shared/schema";
import { getDb } from "./db";
import { eq, and, desc, gte, ne, sql, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

// Updated interface with user-specific CRUD methods
export interface IStorage {
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
  
  // Comps operations with user filtering
  getComp(id: string, userId: string): Promise<Comp | undefined>;
  getAllComps(userId: string): Promise<Comp[]>;
  createComp(comp: InsertComp & { userId: string }): Promise<Comp>;
  updateComp(id: string, userId: string, comp: Partial<Comp>): Promise<Comp | undefined>;
  deleteComp(id: string, userId: string): Promise<boolean>;
  
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
  getContactInteractions(userId: string, prospectId?: string): Promise<ContactInteractionRow[]>;
  createContactInteraction(interaction: InsertContactInteraction & { userId: string }): Promise<ContactInteractionRow>;
  deleteContactInteraction(id: string, userId: string): Promise<boolean>;

  // Broker Skills operations
  getBrokerSkills(userId: string): Promise<BrokerSkillsRow>;
  addSkillActivity(activity: InsertSkillActivity & { userId: string }): Promise<SkillActivityRow>;
  getSkillActivities(userId: string, limit?: number): Promise<SkillActivityRow[]>;
  getLeaderboard(params: { userId: string, orgId?: string, since?: Date }): Promise<any[]>;
}

export class DatabaseStorage implements IStorage {
  private get db() {
    return getDb();
  }

  // User operations for Replit Auth
  async getUser(id: string): Promise<User | undefined> {
    const [result] = await this.db.select().from(users).where(eq(users.id, id));
    return result;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [result] = await this.db
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
    const [result] = await this.db.select().from(requirements).where(and(eq(requirements.id, id), eq(requirements.userId, userId)));
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
    const results = await this.db.select().from(requirements).where(eq(requirements.userId, userId));
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
    const [result] = await this.db.insert(requirements).values({
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
    const [result] = await this.db.update(requirements)
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
    const result = await this.db.delete(requirements).where(and(eq(requirements.id, id), eq(requirements.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Comps operations with user filtering
  async getComp(id: string, userId: string): Promise<Comp | undefined> {
    const [result] = await this.db.select().from(comps).where(and(eq(comps.id, id), eq(comps.userId, userId)));
    if (!result) return undefined;
    return {
      id: result.id,
      userId: result.userId,
      tenantPurchaserName: result.tenantPurchaserName,
      source: result.source as any,
      tags: (result.tags as string[]) || [],
      transactionType: result.transactionType as any,
      leaseRate: result.leaseRate || undefined,
      term: result.term || undefined,
      salePrice: result.salePrice || undefined,
      notes: result.notes || undefined,
      createdAt: result.createdAt?.toISOString(),
      updatedAt: result.updatedAt?.toISOString()
    };
  }

  async getAllComps(userId: string): Promise<Comp[]> {
    const results = await this.db.select().from(comps).where(eq(comps.userId, userId));
    return results.map(result => ({
      id: result.id,
      userId: result.userId,
      tenantPurchaserName: result.tenantPurchaserName,
      source: result.source as any,
      tags: (result.tags as string[]) || [],
      transactionType: result.transactionType as any,
      leaseRate: result.leaseRate || undefined,
      term: result.term || undefined,
      salePrice: result.salePrice || undefined,
      notes: result.notes || undefined,
      createdAt: result.createdAt?.toISOString(),
      updatedAt: result.updatedAt?.toISOString()
    }));
  }

  async createComp(insertComp: InsertComp & { userId: string }): Promise<Comp> {
    const [result] = await this.db.insert(comps).values({
      userId: insertComp.userId,
      tenantPurchaserName: insertComp.tenantPurchaserName,
      source: insertComp.source,
      tags: insertComp.tags || [],
      transactionType: insertComp.transactionType,
      leaseRate: insertComp.leaseRate,
      term: insertComp.term,
      salePrice: insertComp.salePrice,
      notes: insertComp.notes
    }).returning();
    
    // Award 20 XP for Market Knowledge
    await this.addSkillActivity({
      userId: insertComp.userId,
      skillType: 'marketKnowledge',
      action: 'add_comp',
      xpGained: 20,
      relatedId: result.id,
      multiplier: 1
    });
    
    return {
      id: result.id,
      userId: result.userId,
      tenantPurchaserName: result.tenantPurchaserName,
      source: result.source as any,
      tags: (result.tags as string[]) || [],
      transactionType: result.transactionType as any,
      leaseRate: result.leaseRate || undefined,
      term: result.term || undefined,
      salePrice: result.salePrice || undefined,
      notes: result.notes || undefined,
      createdAt: result.createdAt?.toISOString(),
      updatedAt: result.updatedAt?.toISOString()
    };
  }

  async updateComp(id: string, userId: string, updates: Partial<Comp>): Promise<Comp | undefined> {
    const [result] = await this.db.update(comps)
      .set({
        ...(updates.tenantPurchaserName && { tenantPurchaserName: updates.tenantPurchaserName }),
        ...(updates.source && { source: updates.source }),
        ...(updates.tags && { tags: updates.tags }),
        ...(updates.transactionType && { transactionType: updates.transactionType }),
        ...(updates.leaseRate !== undefined && { leaseRate: updates.leaseRate }),
        ...(updates.term !== undefined && { term: updates.term }),
        ...(updates.salePrice !== undefined && { salePrice: updates.salePrice }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
        updatedAt: new Date()
      })
      .where(and(eq(comps.id, id), eq(comps.userId, userId)))
      .returning();
    
    if (!result) return undefined;
    return {
      id: result.id,
      userId: result.userId,
      tenantPurchaserName: result.tenantPurchaserName,
      source: result.source as any,
      tags: (result.tags as string[]) || [],
      transactionType: result.transactionType as any,
      leaseRate: result.leaseRate || undefined,
      term: result.term || undefined,
      salePrice: result.salePrice || undefined,
      notes: result.notes || undefined,
      createdAt: result.createdAt?.toISOString(),
      updatedAt: result.updatedAt?.toISOString()
    };
  }

  async deleteComp(id: string, userId: string): Promise<boolean> {
    const result = await this.db.delete(comps).where(and(eq(comps.id, id), eq(comps.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Prospects operations with user filtering
  async getProspect(id: string, userId: string): Promise<Prospect | undefined> {
    const [result] = await this.db.select().from(prospects).where(and(eq(prospects.id, id), eq(prospects.userId, userId)));
    if (!result) return undefined;
    return {
      id: result.id,
      name: result.name,
      status: result.status as any,
      notes: result.notes || "",
      geometry: result.geometry as any,
      submarketId: result.submarketId || undefined,
      lastContactDate: result.lastContactDate || undefined,
      lastContactedDate: result.lastContactedDate?.toISOString() || undefined,
      followUpDueDate: result.followUpDueDate?.toISOString() || undefined,
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

  async getAllProspects(userId: string): Promise<Prospect[]> {
    const results = await this.db.select().from(prospects).where(eq(prospects.userId, userId));
    return results.map(result => ({
      id: result.id,
      name: result.name,
      status: result.status as any,
      notes: result.notes || "",
      geometry: result.geometry as any,
      submarketId: result.submarketId || undefined,
      lastContactDate: result.lastContactDate || undefined,
      lastContactedDate: result.lastContactedDate?.toISOString() || undefined,
      followUpDueDate: result.followUpDueDate?.toISOString() || undefined,
      followUpTimeframe: result.followUpTimeframe as any || undefined,
      contactName: result.contactName || undefined,
      contactEmail: result.contactEmail || undefined,
      contactPhone: result.contactPhone || undefined,
      contactCompany: result.contactCompany || undefined,
      size: result.size || undefined,
      acres: result.acres || undefined,
      createdDate: result.createdAt?.toISOString() || new Date().toISOString()
    }));
  }

  async createProspect(insertProspect: InsertProspect & { userId: string }): Promise<Prospect> {
    const [result] = await this.db.insert(prospects).values({
      userId: insertProspect.userId,
      name: insertProspect.name,
      status: insertProspect.status,
      notes: insertProspect.notes,
      geometry: insertProspect.geometry,
      ...(insertProspect.submarketId && { submarketId: insertProspect.submarketId }),
      ...(insertProspect.lastContactDate && { lastContactDate: insertProspect.lastContactDate }),
      ...(insertProspect.followUpTimeframe && { followUpTimeframe: insertProspect.followUpTimeframe }),
      ...(insertProspect.contactName && { contactName: insertProspect.contactName }),
      ...(insertProspect.contactEmail && { contactEmail: insertProspect.contactEmail }),
      ...(insertProspect.contactPhone && { contactPhone: insertProspect.contactPhone }),
      ...(insertProspect.contactCompany && { contactCompany: insertProspect.contactCompany }),
      ...(insertProspect.size && { size: insertProspect.size }),
      ...(insertProspect.acres && { acres: insertProspect.acres })
    }).returning();
    
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
      geometry: result.geometry as any,
      submarketId: result.submarketId || undefined,
      lastContactDate: result.lastContactDate || undefined,
      lastContactedDate: result.lastContactedDate?.toISOString() || undefined,
      followUpDueDate: result.followUpDueDate?.toISOString() || undefined,
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

  // Helper function to calculate follow-up due date
  private calculateFollowUpDueDate(timeframe: string): Date {
    const now = new Date();
    switch (timeframe) {
      case '1_month':
        return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
      case '3_month':
        return new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());
      case '6_month':
        return new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
      case '1_year':
        return new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
      default:
        return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()); // Default to 1 month
    }
  }

  async updateProspect(id: string, userId: string, updates: Partial<Prospect>): Promise<Prospect | undefined> {
    // Calculate new date fields if follow-up timeframe is being updated
    let lastContactedDate: Date | undefined;
    let followUpDueDate: Date | undefined;
    
    if (updates.followUpTimeframe) {
      lastContactedDate = new Date(); // Set to current date
      followUpDueDate = this.calculateFollowUpDueDate(updates.followUpTimeframe);
    }

    const [result] = await this.db.update(prospects)
      .set({
        ...(updates.name && { name: updates.name }),
        ...(updates.status && { status: updates.status }),
        ...(updates.notes !== undefined && { notes: updates.notes }),
        ...(updates.geometry && { geometry: updates.geometry }),
        ...(updates.submarketId !== undefined && { submarketId: updates.submarketId }),
        ...(updates.lastContactDate !== undefined && { lastContactDate: updates.lastContactDate }),
        ...(updates.followUpTimeframe !== undefined && { followUpTimeframe: updates.followUpTimeframe }),
        ...(lastContactedDate && { lastContactedDate }),
        ...(followUpDueDate && { followUpDueDate }),
        ...(updates.contactName !== undefined && { contactName: updates.contactName }),
        ...(updates.contactEmail !== undefined && { contactEmail: updates.contactEmail }),
        ...(updates.contactPhone !== undefined && { contactPhone: updates.contactPhone }),
        ...(updates.contactCompany !== undefined && { contactCompany: updates.contactCompany }),
        ...(updates.size !== undefined && { size: updates.size }),
        ...(updates.acres !== undefined && { acres: updates.acres }),
        updatedAt: new Date()
      })
      .where(and(eq(prospects.id, id), eq(prospects.userId, userId)))
      .returning();
    
    if (!result) return undefined;
    return {
      id: result.id,
      name: result.name,
      status: result.status as any,
      notes: result.notes || "",
      geometry: result.geometry as any,
      submarketId: result.submarketId || undefined,
      lastContactDate: result.lastContactDate || undefined,
      lastContactedDate: result.lastContactedDate?.toISOString() || undefined,
      followUpDueDate: result.followUpDueDate?.toISOString() || undefined,
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
    const result = await this.db.delete(prospects).where(and(eq(prospects.id, id), eq(prospects.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getSubmarket(id: string, userId: string): Promise<Submarket | undefined> {
    const [result] = await this.db.select().from(submarkets).where(and(eq(submarkets.id, id), eq(submarkets.userId, userId)));
    if (!result) return undefined;
    return {
      id: result.id,
      name: result.name,
      color: result.color || undefined,
      isActive: result.isActive === 'true'
    };
  }

  async getAllSubmarkets(userId: string): Promise<Submarket[]> {
    const results = await this.db.select().from(submarkets).where(eq(submarkets.userId, userId));
    return results.map(result => ({
      id: result.id,
      name: result.name,
      color: result.color || undefined,
      isActive: result.isActive === 'true'
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
    const [result] = await this.db.insert(submarkets).values(newSubmarket).returning();
    return {
      id: result.id,
      name: result.name,
      color: result.color || undefined,
      isActive: result.isActive === 'true'
    };
  }

  // Create default submarkets for new users
  async createDefaultSubmarkets(userId: string): Promise<void> {
    const defaultSubmarkets = [
      { name: 'NW', color: '#e74c3c' },
      { name: 'NE', color: '#3498db' },
      { name: 'SW', color: '#f39c12' },
      { name: 'SE', color: '#27ae60' }
    ];

    for (const submarket of defaultSubmarkets) {
      await this.createSubmarket({
        userId,
        name: submarket.name,
        color: submarket.color,
        isActive: true
      });
    }
  }

  async updateSubmarket(id: string, userId: string, submarket: Partial<Submarket>): Promise<Submarket | undefined> {
    const updateData: any = { updatedAt: new Date() };
    if (submarket.name) updateData.name = submarket.name;
    if (submarket.color) updateData.color = submarket.color;
    if (typeof submarket.isActive === 'boolean') updateData.isActive = submarket.isActive ? 'true' : 'false';
    
    const [result] = await this.db
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
    const result = await this.db
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
    const [result] = await this.db.select().from(profiles).where(eq(profiles.id, userId));
    return result;
  }

  async createProfile(profile: InsertProfile): Promise<Profile> {
    const [result] = await this.db.insert(profiles).values(profile).returning();
    return result;
  }

  async updateProfile(userId: string, profile: UpdateProfile): Promise<Profile | undefined> {
    const [result] = await this.db.update(profiles)
      .set({ ...profile, updatedAt: new Date() })
      .where(eq(profiles.id, userId))
      .returning();
    return result;
  }

  // Contact interaction operations with user filtering
  async getContactInteractions(userId: string, prospectId?: string): Promise<ContactInteractionRow[]> {
    if (prospectId) {
      const results = await this.db.select().from(contactInteractions)
        .where(and(eq(contactInteractions.userId, userId), eq(contactInteractions.prospectId, prospectId)))
        .orderBy(contactInteractions.createdAt);
      return results;
    } else {
      const results = await this.db.select().from(contactInteractions)
        .where(eq(contactInteractions.userId, userId))
        .orderBy(contactInteractions.createdAt);
      return results;
    }
  }

  async createContactInteraction(interactionData: InsertContactInteraction & { userId: string }): Promise<ContactInteractionRow> {
    const [result] = await this.db.insert(contactInteractions)
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
    const result = await this.db
      .delete(contactInteractions)
      .where(and(eq(contactInteractions.id, id), eq(contactInteractions.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  // Broker Skills operations
  async getBrokerSkills(userId: string): Promise<BrokerSkillsRow> {
    // Try to get existing skills record
    const [existing] = await this.db.select().from(brokerSkills).where(eq(brokerSkills.userId, userId));
    
    if (existing) {
      return existing;
    }
    
    // Create default skills record if none exists
    const [newSkills] = await this.db.insert(brokerSkills)
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
    const [activity] = await this.db.insert(skillActivities)
      .values({
        ...activityData,
        id: randomUUID()
      })
      .returning();

    // Then update the corresponding skill XP and handle streak logic
    const currentSkills = await this.getBrokerSkills(activityData.userId);
    const updateData: any = {};
    
    // Calculate streak logic for meaningful activities
    const isMeaningfulActivity = ['prospecting', 'followUp', 'marketKnowledge'].includes(activityData.skillType);
    let streakXpAwarded = 0;
    
    if (isMeaningfulActivity) {
      const streakResult = this.calculateStreakUpdate(currentSkills.lastActivity, currentSkills.streakDays || 0);
      updateData.lastActivity = new Date();
      updateData.streakDays = streakResult.newStreakDays;
      
      // Award consistency XP if streak was incremented
      if (streakResult.streakIncremented) {
        streakXpAwarded = 10;
        updateData.consistency = (currentSkills.consistency || 0) + streakXpAwarded;
      }
    }
    
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

    // Update the skills record
    await this.db.update(brokerSkills)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(brokerSkills.userId, activityData.userId));

    // If we awarded streak XP, log it as a separate activity
    if (streakXpAwarded > 0) {
      await this.db.insert(skillActivities)
        .values({
          id: randomUUID(),
          userId: activityData.userId,
          skillType: 'consistency',
          action: 'daily_streak',
          xpGained: streakXpAwarded,
          relatedId: null,
          multiplier: 1,
          timestamp: new Date()
        });
    }

    return activity;
  }

  private calculateStreakUpdate(lastActivity: Date | null, currentStreakDays: number): { newStreakDays: number, streakIncremented: boolean } {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    
    if (!lastActivity) {
      // First activity ever
      return { newStreakDays: 1, streakIncremented: true };
    }
    
    const lastActivityDate = new Date(lastActivity);
    lastActivityDate.setHours(0, 0, 0, 0); // Start of last activity day
    
    const daysDifference = Math.floor((today.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDifference === 0) {
      // Same day - no change to streak
      return { newStreakDays: currentStreakDays, streakIncremented: false };
    } else if (daysDifference === 1) {
      // Next consecutive day - increment streak
      return { newStreakDays: currentStreakDays + 1, streakIncremented: true };
    } else {
      // Gap in activity - reset streak to 1 for today
      return { newStreakDays: 1, streakIncremented: true };
    }
  }

  async getSkillActivities(userId: string, limit: number = 50): Promise<SkillActivityRow[]> {
    const results = await this.db.select().from(skillActivities)
      .where(eq(skillActivities.userId, userId))
      .orderBy(desc(skillActivities.timestamp))
      .limit(limit);
    return results;
  }

  async getLeaderboard({ userId, orgId }: { userId: string, orgId?: string }): Promise<any[]> {
    // Helper function to calculate level from XP (same as stats page)
    const getLevel = (xp: number): number => {
      if (xp === 0) return 1;
      return Math.min(99, Math.floor(Math.sqrt(xp / 100) + 1));
    };

    try {
      // All-time query: read from broker_skills
      const results = await this.db.select({
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
      const leaderboard = results.map(row => ({
        user_id: row.userId,
        user_email: row.userEmail || '',
        display_name: row.displayName || row.userEmail?.split('@')[0] || 'Unknown',
        level_total: getLevel(row.prospectingXp || 0) + getLevel(row.followUpXp || 0) + getLevel(row.consistencyXp || 0) + getLevel(row.marketKnowledgeXp || 0), // Sum of individual skill levels (matching main stats)
        xp_total: (row.prospectingXp || 0) + (row.followUpXp || 0) + (row.consistencyXp || 0) + (row.marketKnowledgeXp || 0),
      }));

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
