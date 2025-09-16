import { z } from "zod";
import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  uuid,
  text,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";

// Prospect status enum
export const ProspectStatus = z.enum([
  'prospect',
  'contacted', 
  'listing',
  'client',
  'no_go'
]);

// Follow-up timeframe enum
export const FollowUpTimeframe = z.enum([
  '1_month',
  '3_month',
  '6_month',
  '1_year'
]);

// GeoJSON geometry types for the prospects
export const ProspectGeometry = z.object({
  type: z.enum(['Point', 'Polygon']),
  coordinates: z.union([
    z.tuple([z.number(), z.number()]), // Point coordinates [lng, lat]
    z.array(z.tuple([z.number(), z.number()])), // Polygon coordinates (legacy) [[lng, lat], ...]
    z.array(z.array(z.tuple([z.number(), z.number()]))) // Polygon coordinates (GeoJSON) [[[lng, lat], ...]] (array of rings)
  ])
});

export type ProspectGeometryType = z.infer<typeof ProspectGeometry>;

// Contact interaction schema
export const ContactInteraction = z.object({
  id: z.string(),
  prospectId: z.string(),
  date: z.string(),
  type: z.enum(['call', 'email', 'meeting', 'note']),
  outcome: z.enum(['contacted', 'no_answer', 'left_message', 'scheduled_meeting', 'not_interested', 'follow_up_later']),
  notes: z.string(),
  nextFollowUp: z.string().optional()
});

export type ContactInteractionType = z.infer<typeof ContactInteraction>;

// Main prospect schema
export const ProspectSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: ProspectStatus,
  notes: z.string(),
  geometry: ProspectGeometry,
  createdDate: z.string(),
  submarketId: z.string().optional(),
  lastContactDate: z.string().optional(), // Keep for backward compatibility
  lastContactedDate: z.string().optional(), // New timestamp field as ISO string
  followUpDueDate: z.string().optional(), // New due date field as ISO string
  followUpTimeframe: FollowUpTimeframe.optional(),
  // Contact information
  contactName: z.string().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  contactCompany: z.string().optional(),
  // Size and area information
  size: z.string().optional(), // Size description (e.g., "Small Office", "10,000 SF")
  acres: z.string().optional(), // Calculated acres from polygon area (stored as string)
  // Business information
  businessName: z.string().optional(), // Business name from Google Places
  websiteUrl: z.string().optional() // Business website URL
});

export const InsertProspectSchema = ProspectSchema.omit({ 
  id: true, 
  createdDate: true 
});

export type Prospect = z.infer<typeof ProspectSchema>;
export type InsertProspect = z.infer<typeof InsertProspectSchema>;
export type ProspectStatusType = z.infer<typeof ProspectStatus>;
export type FollowUpTimeframeType = z.infer<typeof FollowUpTimeframe>;

// Contact interaction types  
export type ContactInteractionRow = typeof contactInteractions.$inferSelect;
export type InsertContactInteraction = typeof contactInteractions.$inferInsert;

// Status color mapping
export const STATUS_COLORS = {
  prospect: '#e74c3c',
  contacted: '#d35400',
  listing: '#f39c12', 
  client: '#27ae60',
  no_go: '#7f8c8d'
} as const;

// Submarket schema
export const SubmarketSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
  isActive: z.boolean().default(true)
});

export const InsertSubmarketSchema = SubmarketSchema.omit({ 
  id: true 
});

export type Submarket = z.infer<typeof SubmarketSchema>;
export type InsertSubmarket = z.infer<typeof InsertSubmarketSchema>;

// Update Prospect to include submarket
export const UpdatedProspectSchema = ProspectSchema.extend({
  submarketId: z.string().optional(),
  lastContactDate: z.string().optional()
});

export const UpdatedInsertProspectSchema = UpdatedProspectSchema.omit({ 
  id: true, 
  createdDate: true 
});

export type UpdatedProspect = z.infer<typeof UpdatedProspectSchema>;
export type UpdatedInsertProspect = z.infer<typeof UpdatedInsertProspectSchema>;

// Touch/Activity schema  
export const TouchSchema = z.object({
  id: z.string(),
  prospectId: z.string(),
  kind: z.enum(['call', 'email', 'visit', 'note']),
  createdAt: z.string(),
  notes: z.string().optional()
});

export const InsertTouchSchema = TouchSchema.omit({ 
  id: true,
  createdAt: true 
});

export type Touch = z.infer<typeof TouchSchema>;
export type InsertTouch = z.infer<typeof InsertTouchSchema>;

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// User profiles table for onboarding and preferences
export const profiles = pgTable("profiles", {
  id: varchar("id").primaryKey(), // matches existing auth user id structure
  email: varchar("email"),
  firstName: varchar("first_name"), // Keep existing columns
  lastName: varchar("last_name"), // Keep existing columns
  profileImageUrl: varchar("profile_image_url"), // Keep existing columns
  name: varchar("name"),
  company: varchar("company"),
  marketCity: varchar("market_city").default("Edmonton"),
  submarkets: jsonb("submarkets").$type<string[]>().default([]),
  assetClasses: jsonb("asset_classes").$type<string[]>().default([]),
  goals: jsonb("goals").$type<{
    callsPerDay?: number;
    meetingsPerWeek?: number;
  }>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = typeof profiles.$inferInsert;
export type UpdateProfile = Partial<InsertProfile>;

// Contact interactions table
export const contactInteractions = pgTable("contact_interactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  prospectId: varchar("prospect_id").notNull().references(() => prospects.id, { onDelete: 'cascade' }),
  date: varchar("date").notNull(),
  type: varchar("type").notNull(), // call, email, meeting, note
  outcome: varchar("outcome").notNull(), // contacted, no_answer, left_message, scheduled_meeting, not_interested, follow_up_later
  notes: varchar("notes").default(""),
  nextFollowUp: varchar("next_follow_up"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Prospects table with user association
export const prospects = pgTable("prospects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: varchar("name").notNull(),
  status: varchar("status").notNull(), // prospect, contacted, listing, client, no_go
  notes: varchar("notes").default(""),
  geometry: jsonb("geometry").notNull(), // GeoJSON geometry
  submarketId: varchar("submarket_id"),
  lastContactDate: varchar("last_contact_date"), // Keep for backward compatibility
  lastContactedDate: timestamp("last_contacted_date"), // New timestamp field
  followUpDueDate: timestamp("follow_up_due_date"), // New calculated due date field
  followUpTimeframe: varchar("follow_up_timeframe"), // 1_month, 3_month, 6_month, 1_year
  contactName: varchar("contact_name"),
  contactEmail: varchar("contact_email"),
  contactPhone: varchar("contact_phone"),
  contactCompany: varchar("contact_company"),
  size: varchar("size"), // Size description
  acres: varchar("acres"), // Calculated acres (stored as string for precision)
  businessName: varchar("business_name"), // Business name from Google Places
  websiteUrl: varchar("website_url"), // Business website URL
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Submarkets table with user association
export const submarkets = pgTable("submarkets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: varchar("name").notNull(),
  color: varchar("color"),
  isActive: varchar("is_active").default("true"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Touches/Activities table with user association
export const touches = pgTable("touches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  prospectId: varchar("prospect_id").notNull(),
  kind: varchar("kind").notNull(), // call, email, visit, note
  notes: varchar("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Requirements tracking table with user association
export const requirements = pgTable("requirements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: varchar("title").notNull(),
  source: varchar("source"), // dropdown: CBRE, Colliers, LoopNet, Direct, Other
  contactName: varchar("contact_name"),
  contactEmail: varchar("contact_email"),
  contactPhone: varchar("contact_phone"),
  spaceSize: varchar("space_size"), // dropdown: <5K SF, 5K-25K SF, 25K-100K SF, 100K+ SF
  timeline: varchar("timeline"), // dropdown: ASAP, 1-3 months, 3-6 months, 6-12 months, 12+ months
  status: varchar("status").default("active"), // active, fulfilled, expired
  tags: varchar("tags").array().default(sql`ARRAY[]::varchar[]`),
  notes: varchar("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Updated schemas with user association
export const ProspectDbSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  status: ProspectStatus,
  notes: z.string(),
  geometry: ProspectGeometry,
  submarketId: z.string().optional(),
  lastContactDate: z.string().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const InsertProspectDbSchema = ProspectDbSchema.omit({ 
  id: true, 
  createdAt: true,
  updatedAt: true 
});

export const SubmarketDbSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  color: z.string().optional(),
  isActive: z.string().default("true"),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const InsertSubmarketDbSchema = SubmarketDbSchema.omit({ 
  id: true, 
  createdAt: true,
  updatedAt: true 
});

export const TouchDbSchema = z.object({
  id: z.string(),
  userId: z.string(),
  prospectId: z.string(),
  kind: z.enum(['call', 'email', 'visit', 'note']),
  notes: z.string().optional(),
  createdAt: z.date().optional(),
});

export const InsertTouchDbSchema = TouchDbSchema.omit({ 
  id: true, 
  createdAt: true 
});

export const RequirementSchema = z.object({
  id: z.string().optional(),
  userId: z.string().optional(),
  title: z.string().min(1, "Title is required"),
  source: z.enum(["CBRE", "Colliers", "LoopNet", "Direct", "Other", "Cushman", "Avison", "JLL", "Cresa", "Omada", "Remax"]).nullable().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  spaceSize: z.enum(["less_than_5k", "5k_to_25k", "25k_to_100k", "100k_plus"]).nullable().optional(),
  timeline: z.enum(["asap", "1_3_months", "3_6_months", "6_12_months", "12_plus_months"]).nullable().optional(),
  status: z.enum(["active", "fulfilled", "expired"]).default("active"),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const InsertRequirementSchema = RequirementSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Requirement = z.infer<typeof RequirementSchema>;
export type InsertRequirement = z.infer<typeof InsertRequirementSchema>;

// Comps schema with validation
export const CompSchema = z.object({
  id: z.string().optional(),
  userId: z.string().optional(),
  tenantPurchaserName: z.string().min(1, "Tenant/Purchaser Name is required"),
  source: z.enum(["CBRE", "Colliers", "LoopNet", "Direct", "Other", "Cushman", "Avison", "JLL", "Cresa", "Omada", "Remax"]).nullable().optional(),
  tags: z.array(z.string()).default([]),
  transactionType: z.enum(["Sale", "Lease"]),
  spaceSize: z.string().optional(),
  leaseRate: z.string().optional(),
  term: z.string().optional(),
  salePrice: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const InsertCompSchema = CompSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Comp = z.infer<typeof CompSchema>;
export type InsertComp = z.infer<typeof InsertCompSchema>;

// Broker Skills XP System - Runescape-style leveling (0-99)
export const brokerSkills = pgTable("broker_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  prospecting: integer("prospecting").default(0), // XP from adding prospects, mapping areas
  followUp: integer("follow_up").default(0), // XP from calls, emails, interactions
  consistency: integer("consistency").default(0), // XP from daily streaks, regular activity
  marketKnowledge: integer("market_knowledge").default(0), // XP from requirements, prospect details
  lastActivity: timestamp("last_activity").defaultNow(),
  streakDays: integer("streak_days").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const skillActivities = pgTable("skill_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  skillType: varchar("skill_type").notNull(), // 'prospecting', 'followUp', 'consistency', 'marketKnowledge'
  action: varchar("action").notNull(), // 'add_prospect', 'phone_call', 'daily_streak', etc.
  xpGained: integer("xp_gained").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  relatedId: varchar("related_id"), // prospect_id, interaction_id, etc.
  multiplier: integer("multiplier").default(1), // Streak multipliers
});

// Comps table for tracking sale and lease comparables
export const comps = pgTable("comps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tenantPurchaserName: varchar("tenant_purchaser_name").notNull(),
  source: varchar("source"), // dropdown: same as requirements
  tags: varchar("tags").array().default(sql`ARRAY[]::varchar[]`),
  transactionType: varchar("transaction_type").notNull(), // "Sale" or "Lease"
  spaceSize: varchar("space_size"), // Space size range
  leaseRate: varchar("lease_rate"), // for lease transactions (e.g., $/SF)
  term: varchar("term"), // for lease transactions (e.g., Years)
  salePrice: varchar("sale_price"), // for sale transactions ($)
  notes: varchar("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Broker Skills Schemas
export const BrokerSkillsSchema = z.object({
  id: z.string(),
  userId: z.string(),
  prospecting: z.number().default(0),
  followUp: z.number().default(0),
  consistency: z.number().default(0),
  marketKnowledge: z.number().default(0),
  lastActivity: z.date(),
  streakDays: z.number().default(0),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const SkillActivitySchema = z.object({
  id: z.string(),
  userId: z.string(),
  skillType: z.enum(['prospecting', 'followUp', 'consistency', 'marketKnowledge']),
  action: z.string(),
  xpGained: z.number(),
  timestamp: z.date(),
  relatedId: z.string().optional(),
  multiplier: z.number().default(1),
});

export type BrokerSkills = z.infer<typeof BrokerSkillsSchema>;
export type SkillActivity = z.infer<typeof SkillActivitySchema>;
export type BrokerSkillsRow = typeof brokerSkills.$inferSelect;
export type SkillActivityRow = typeof skillActivities.$inferSelect;
export type InsertBrokerSkills = typeof brokerSkills.$inferInsert;
export type InsertSkillActivity = typeof skillActivities.$inferInsert;
