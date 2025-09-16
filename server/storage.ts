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
  prospects, requirements, submarkets, touches, users, profiles, contactInteractions, brokerSkills, skillActivities
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, ne, sql } from "drizzle-orm";
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

  // Prospects operations with user filtering
  async getProspect(id: string, userId: string): Promise<Prospect | undefined> {
    const [result] = await db.select().from(prospects).where(and(eq(prospects.id, id), eq(prospects.userId, userId)));
    if (!result) return undefined;
    return {
      id: result.id,
      name: result.name,
      status: result.status as any,
      notes: result.notes || "",
      geometry: result.geometry as any,
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

  async getAllProspects(userId: string): Promise<Prospect[]> {
    const results = await db.select().from(prospects).where(eq(prospects.userId, userId));
    return results.map(result => ({
      id: result.id,
      name: result.name,
      status: result.status as any,
      notes: result.notes || "",
      geometry: result.geometry as any,
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
    }));
  }

  async createProspect(insertProspect: InsertProspect & { userId: string }): Promise<Prospect> {
    const [result] = await db.insert(prospects).values({
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
        ...(updates.geometry && { geometry: updates.geometry }),
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
    const results = await db.select().from(submarkets).where(eq(submarkets.userId, userId));
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
  async getContactInteractions(userId: string, prospectId?: string): Promise<ContactInteractionRow[]> {
    if (prospectId) {
      const results = await db.select().from(contactInteractions)
        .where(and(eq(contactInteractions.userId, userId), eq(contactInteractions.prospectId, prospectId)))
        .orderBy(contactInteractions.createdAt);
      return results;
    } else {
      const results = await db.select().from(contactInteractions)
        .where(eq(contactInteractions.userId, userId))
        .orderBy(contactInteractions.createdAt);
      return results;
    }
  }

  async createContactInteraction(interactionData: InsertContactInteraction & { userId: string }): Promise<ContactInteractionRow> {
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

    // Then update the corresponding skill XP
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

    // Update the skills record
    await db.update(brokerSkills)
      .set({ ...updateData, updatedAt: new Date() })
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
      if (xp === 0) return 1;
      return Math.min(99, Math.floor(Math.sqrt(xp / 100) + 1));
    };

    try {
      if (since) {
        // Time-based query: aggregate from skill_activities within window
        const results = await db.select({
          userId: skillActivities.userId,
          userEmail: users.email,
          displayName: profiles.name,
          xpProspect: sql<number>`COALESCE(SUM(CASE WHEN ${skillActivities.skillType} = 'prospecting' THEN ${skillActivities.xpGained} ELSE 0 END), 0)`,
          xpFollowup: sql<number>`COALESCE(SUM(CASE WHEN ${skillActivities.skillType} = 'followUp' THEN ${skillActivities.xpGained} ELSE 0 END), 0)`,
        })
        .from(skillActivities)
        .innerJoin(users, eq(skillActivities.userId, users.id))
        .leftJoin(profiles, eq(users.id, profiles.id))
        .where(and(
          gte(skillActivities.timestamp, since),
          ne(users.id, 'demo-user') // Exclude demo user
        ))
        .groupBy(skillActivities.userId, users.email, profiles.name);

        // Calculate levels and sort
        const leaderboard = results.map(row => ({
          user_id: row.userId,
          user_email: row.userEmail || '',
          display_name: row.displayName || row.userEmail?.split('@')[0] || 'Unknown',
          level_total: getLevel((row.xpProspect || 0) + (row.xpFollowup || 0)),
          xp_total: (row.xpProspect || 0) + (row.xpFollowup || 0),
        }));

        // Sort by level_total DESC, then by xp_total DESC
        return leaderboard.sort((a, b) => {
          if (a.level_total !== b.level_total) return b.level_total - a.level_total;
          return b.xp_total - a.xp_total;
        });
      } else {
        // Total query: read from broker_skills
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
        const leaderboard = results.map(row => ({
          user_id: row.userId,
          user_email: row.userEmail || '',
          display_name: row.displayName || row.userEmail?.split('@')[0] || 'Unknown',
          level_total: getLevel((row.prospectingXp || 0) + (row.followUpXp || 0) + (row.consistencyXp || 0) + (row.marketKnowledgeXp || 0)),
          xp_total: (row.prospectingXp || 0) + (row.followUpXp || 0),
        }));

        // Sort by level_total DESC, then by xp_total DESC
        return leaderboard.sort((a, b) => {
          if (a.level_total !== b.level_total) return b.level_total - a.level_total;
          return b.xp_total - a.xp_total;
        });
      }
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      return [];
    }
  }
}

export const storage = new DatabaseStorage();
