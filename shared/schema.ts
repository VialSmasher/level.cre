import { z } from "zod";
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  uuid,
  text,
  integer,
  numeric,
  pgEnum,
  unique,
  primaryKey,
  customType,
} from "drizzle-orm/pg-core";

// Prospect status enum
export const ProspectStatus = z.enum([
  'prospect',
  'contacted', 
  'listing',
  'client',
  'no_go',
  'development',
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
  lastContactDate: z.string().optional(),
  followUpTimeframe: FollowUpTimeframe.optional(),
  // Calculated follow-up due date (ISO string). May be derived server-side
  // from created/last contact + followUpTimeframe, or explicitly set.
  followUpDueDate: z.string().optional(),
  // Contact information
  contactName: z.string().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  contactCompany: z.string().optional(),
  // Size and area information
  buildingSf: z.number().int().nonnegative().optional(), // Building area in square feet
  lotSizeAcres: z.number().nonnegative().optional(), // Lot size in acres (2dp precision)
  aiMetadata: z.record(z.any()).optional(), // Reserved for AI enrichments/classifications
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

// Unified status metadata: labels + colors used across app
export const STATUS_META: Record<ProspectStatusType, { label: string; color: string }> = {
  prospect:    { label: 'Prospect',    color: '#EAB308' },
  contacted:   { label: 'Contacted',   color: '#3B82F6' },
  listing:     { label: 'Listing',     color: '#10B981' },
  client:      { label: 'Client',      color: '#8B5CF6' },
  no_go:       { label: 'No Go',       color: '#EF4444' },
  development: { label: 'Development', color: '#FB923C' },
} as const;
export type FollowUpTimeframeType = z.infer<typeof FollowUpTimeframe>;

// Contact interaction types  
export type ContactInteractionRow = typeof contactInteractions.$inferSelect;
export type InsertContactInteraction = typeof contactInteractions.$inferInsert;

// Status color mapping
// Back-compat mapping for any legacy imports. Prefer STATUS_META.
export const STATUS_COLORS = Object.fromEntries(
  Object.entries(STATUS_META).map(([k, v]) => [k, v.color])
) as Record<ProspectStatusType, string>;

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

// Listings (Workspace) tables
export const listings = pgTable(
  "listings",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id),
    title: varchar("title").notNull(),
    address: varchar("address"),
    lat: varchar("lat"),
    lng: varchar("lng"),
    submarket: varchar("submarket"),
    dealType: varchar("deal_type"), // lease | sale
    size: varchar("size"),
    price: varchar("price"),
    createdAt: timestamp("created_at").defaultNow(),
    archivedAt: timestamp("archived_at"),
  },
  (table) => [
    index("IDX_listings_user").on(table.userId),
  ],
);

export type Listing = typeof listings.$inferSelect;
export type InsertListing = typeof listings.$inferInsert;

// listingProspects is defined after prospects table to satisfy references

// Listing members (sharing) table
export const listingMembers = pgTable(
  "listing_members",
  {
    listingId: varchar("listing_id").notNull().references(() => listings.id, { onDelete: 'cascade' }),
    userId: varchar("user_id").notNull().references(() => users.id),
    role: varchar("role").notNull().default('viewer'), // 'owner' | 'editor' | 'viewer'
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.listingId, table.userId], name: 'PK_listing_members' }),
    index("IDX_listing_members_listing").on(table.listingId),
    index("IDX_listing_members_user").on(table.userId),
  ],
);

export type ListingMember = typeof listingMembers.$inferSelect;
export type InsertListingMember = typeof listingMembers.$inferInsert;

// Contact interactions table
export const contactInteractions = pgTable(
  "contact_interactions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").notNull().references(() => users.id),
    prospectId: varchar("prospect_id").notNull().references(() => prospects.id, { onDelete: 'cascade' }),
    listingId: varchar("listing_id").references(() => listings.id),
    date: varchar("date").notNull(),
    type: varchar("type").notNull(), // call, email, meeting, note, tour, proposal
    outcome: varchar("outcome").notNull(), // contacted, no_answer, left_message, scheduled_meeting, not_interested, follow_up_later
    notes: varchar("notes").default(""),
    nextFollowUp: varchar("next_follow_up"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("IDX_interactions_user").on(table.userId),
    index("IDX_interactions_listing").on(table.listingId),
    index("IDX_interactions_prospect").on(table.prospectId),
  ],
);

// Prospects table with user association
// Define PostGIS geometry column type for Drizzle
export const pgGeometry = customType<{ data: unknown; driverData: unknown }>({
  dataType() { return 'geometry'; },
});

export const prospects = pgTable("prospects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: varchar("name").notNull(),
  status: varchar("status").notNull(), // prospect, contacted, listing, client, no_go
  notes: varchar("notes").default(""),
  // PostGIS geometry column (SRID enforced via DB constraint/migration)
  geometry: pgGeometry("geometry").notNull(),
  submarketId: varchar("submarket_id"),
  lastContactDate: varchar("last_contact_date"),
  followUpTimeframe: varchar("follow_up_timeframe"), // 1_month, 3_month, 6_month, 1_year
  // Calculated due date for next follow-up
  followUpDueDate: timestamp("follow_up_due_date"),
  contactName: varchar("contact_name"),
  contactEmail: varchar("contact_email"),
  contactPhone: varchar("contact_phone"),
  contactCompany: varchar("contact_company"),
  buildingSf: integer("building_sf"), // Building area in square feet
  lotSizeAcres: numeric("lot_size_acres", { precision: 10, scale: 2 }), // Lot size in acres
  aiMetadata: jsonb("ai_metadata"), // Reserved for AI enrichment data
  businessName: varchar("business_name"), // Business name from Google Places
  websiteUrl: varchar("website_url"), // Business website URL
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Listing <-> Prospect link table (after prospects)
export const listingProspects = pgTable(
  "listing_prospects",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    listingId: varchar("listing_id").notNull().references(() => listings.id, { onDelete: 'cascade' }),
    prospectId: varchar("prospect_id").notNull().references(() => prospects.id, { onDelete: 'cascade' }),
    role: varchar("role").notNull().default("target"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("IDX_listing_prospects_listing").on(table.listingId),
    index("IDX_listing_prospects_prospect").on(table.prospectId),
    unique("UQ_listing_prospect").on(table.listingId, table.prospectId),
  ],
);

export type ListingProspect = typeof listingProspects.$inferSelect;
export type InsertListingProspect = typeof listingProspects.$inferInsert;

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
  location: varchar("location"), // dropdown from submarkets
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

// Market comps table with user association
export const marketComps = pgTable("market_comps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  // Base fields
  address: varchar("address").notNull(),
  submarket: varchar("submarket"),
  assetType: varchar("asset_type").notNull(), // Building | Land | Other
  buildingSize: varchar("building_size"), // SF
  landSize: varchar("land_size"), // acres (string to allow decimals)
  sourceLink: varchar("source_link"),
  notes: varchar("notes"),
  // Deal type
  dealType: varchar("deal_type").notNull(), // lease | sale
  // Lease fields
  tenant: varchar("tenant"),
  termMonths: integer("term_months"),
  rate: varchar("rate"),
  rateType: varchar("rate_type"), // Net | Gross | NNN
  commencement: varchar("commencement"),
  concessions: varchar("concessions"),
  // Sale fields
  saleDate: varchar("sale_date"),
  buyer: varchar("buyer"),
  seller: varchar("seller"),
  price: varchar("price"),
  pricePerSf: varchar("price_per_sf"),
  pricePerAcre: varchar("price_per_acre"),
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
  location: z.string().optional(),
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

// Market Comps
export const MarketCompAssetType = z.enum(["Building", "Land", "Other"]);
export const MarketCompDealType = z.enum(["lease", "sale"]);
export const MarketCompRateType = z.enum(["Net", "Gross", "NNN"]);

export const MarketCompSchema = z.object({
  id: z.string().optional(),
  userId: z.string().optional(),
  // Base fields
  address: z.string().min(1, "Address is required"),
  submarket: z.string().optional(),
  assetType: MarketCompAssetType,
  buildingSize: z.string().optional(), // store as string to allow flexibility
  landSize: z.string().optional(),     // acres, string to allow decimals
  sourceLink: z.string().optional(),
  notes: z.string().optional(),
  // Deal type
  dealType: MarketCompDealType,
  // Lease fields
  tenant: z.string().optional(),
  termMonths: z.number().optional(),
  rate: z.string().optional(),
  rateType: MarketCompRateType.optional(),
  commencement: z.string().optional(), // YYYY-MM-DD
  concessions: z.string().optional(),  // TI / Free Rent
  // Sale fields
  saleDate: z.string().optional(),     // YYYY-MM-DD
  buyer: z.string().optional(),
  seller: z.string().optional(),
  price: z.string().optional(),        // store as string; client can format as currency
  pricePerSf: z.string().optional(),
  pricePerAcre: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const InsertMarketCompSchema = MarketCompSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MarketComp = z.infer<typeof MarketCompSchema>;
export type InsertMarketComp = z.infer<typeof InsertMarketCompSchema>;

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

// Industrial Intel core domain tables
export const intelSources = pgTable(
  "intel_sources",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name").notNull(),
    slug: varchar("slug").notNull(),
    kind: varchar("kind").notNull().default("manual_upload"), // manual_upload | csv_url | json_url
    feedUrl: text("feed_url"),
    fieldMapping: jsonb("field_mapping").$type<Record<string, string>>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: varchar("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    unique("UQ_intel_sources_slug").on(table.slug),
    index("IDX_intel_sources_active").on(table.isActive),
  ],
);

export const intelListings = pgTable(
  "intel_listings",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    sourceId: varchar("source_id").notNull().references(() => intelSources.id, { onDelete: "cascade" }),
    sourceRecordKey: varchar("source_record_key").notNull(),
    externalId: varchar("external_id"),
    status: varchar("status").notNull().default("active"),
    listingType: varchar("listing_type").notNull().default("lease"), // lease | sale | sublease
    title: varchar("title").notNull(),
    address: text("address"),
    market: varchar("market"),
    submarket: varchar("submarket"),
    lat: numeric("lat", { precision: 9, scale: 6 }),
    lng: numeric("lng", { precision: 9, scale: 6 }),
    availableSf: integer("available_sf"),
    minDivisibleSf: integer("min_divisible_sf"),
    clearHeightFt: numeric("clear_height_ft", { precision: 6, scale: 2 }),
    brochureUrl: text("brochure_url"),
    sourceUrl: text("source_url"),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull().default({}),
    contentHash: varchar("content_hash").notNull(),
    firstSeenAt: timestamp("first_seen_at").defaultNow(),
    lastSeenAt: timestamp("last_seen_at").defaultNow(),
    removedAt: timestamp("removed_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    unique("UQ_intel_listings_source_record").on(table.sourceId, table.sourceRecordKey),
    index("IDX_intel_listings_source").on(table.sourceId),
    index("IDX_intel_listings_status").on(table.status),
    index("IDX_intel_listings_submarket").on(table.submarket),
    index("IDX_intel_listings_last_seen").on(table.lastSeenAt),
  ],
);

export const intelIngestRuns = pgTable(
  "intel_ingest_runs",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    sourceId: varchar("source_id").references(() => intelSources.id, { onDelete: "set null" }),
    triggerType: varchar("trigger_type").notNull().default("manual"),
    status: varchar("status").notNull().default("completed"), // queued | running | completed | failed
    startedAt: timestamp("started_at").defaultNow(),
    completedAt: timestamp("completed_at"),
    recordsSeen: integer("records_seen").notNull().default(0),
    recordsNew: integer("records_new").notNull().default(0),
    recordsUpdated: integer("records_updated").notNull().default(0),
    recordsRemoved: integer("records_removed").notNull().default(0),
    errorMessage: text("error_message"),
    initiatedByUserId: varchar("initiated_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    index("IDX_intel_runs_source").on(table.sourceId),
    index("IDX_intel_runs_started_at").on(table.startedAt),
  ],
);

export const intelListingChanges = pgTable(
  "intel_listing_changes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    listingId: varchar("listing_id").notNull().references(() => intelListings.id, { onDelete: "cascade" }),
    ingestRunId: varchar("ingest_run_id").references(() => intelIngestRuns.id, { onDelete: "set null" }),
    changeType: varchar("change_type").notNull(), // new | updated | removed | reactivated
    changeSummary: text("change_summary"),
    previousHash: varchar("previous_hash"),
    newHash: varchar("new_hash"),
    observedAt: timestamp("observed_at").defaultNow(),
  },
  (table) => [
    index("IDX_intel_listing_changes_listing").on(table.listingId),
    index("IDX_intel_listing_changes_observed_at").on(table.observedAt),
  ],
);

export const intelRequirements = pgTable(
  "intel_requirements",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    createdByUserId: varchar("created_by_user_id").notNull().references(() => users.id),
    title: varchar("title").notNull(),
    clientName: varchar("client_name"),
    status: varchar("status").notNull().default("draft"), // draft | active | paused | filled | archived
    dealType: varchar("deal_type").notNull().default("lease"), // lease | sale | either
    market: varchar("market"),
    submarket: varchar("submarket"),
    minSf: integer("min_sf"),
    maxSf: integer("max_sf"),
    minClearHeightFt: numeric("min_clear_height_ft", { precision: 6, scale: 2 }),
    maxBudgetPsf: numeric("max_budget_psf", { precision: 12, scale: 2 }),
    requiredDockDoors: integer("required_dock_doors"),
    requiredGradeDoors: integer("required_grade_doors"),
    minYardAcres: numeric("min_yard_acres", { precision: 10, scale: 2 }),
    powerNotes: text("power_notes"),
    officeNotes: text("office_notes"),
    timingNotes: text("timing_notes"),
    specialNotes: text("special_notes"),
    isOffMarketSearchEnabled: boolean("is_off_market_search_enabled").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    archivedAt: timestamp("archived_at"),
  },
  (table) => [
    index("IDX_intel_requirements_user").on(table.createdByUserId),
    index("IDX_intel_requirements_status").on(table.status),
    index("IDX_intel_requirements_market").on(table.market),
    index("IDX_intel_requirements_submarket").on(table.submarket),
    index("IDX_intel_requirements_archived_at").on(table.archivedAt),
  ],
);

export const intelRequirementPreferences = pgTable(
  "intel_requirement_preferences",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    requirementId: varchar("requirement_id").notNull().references(() => intelRequirements.id, { onDelete: "cascade" }),
    key: varchar("key").notNull(),
    operator: varchar("operator").notNull().default("preferred"), // required | preferred | avoid | note
    valueText: text("value_text"),
    valueNumber: numeric("value_number", { precision: 12, scale: 2 }),
    valueBoolean: boolean("value_boolean"),
    weight: integer("weight").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("IDX_intel_requirement_preferences_requirement").on(table.requirementId),
    index("IDX_intel_requirement_preferences_requirement_key").on(table.requirementId, table.key),
  ],
);

export type IntelSource = typeof intelSources.$inferSelect;
export type InsertIntelSource = typeof intelSources.$inferInsert;
export type IntelListing = typeof intelListings.$inferSelect;
export type InsertIntelListing = typeof intelListings.$inferInsert;
export type IntelIngestRun = typeof intelIngestRuns.$inferSelect;
export type InsertIntelIngestRun = typeof intelIngestRuns.$inferInsert;
export type IntelListingChange = typeof intelListingChanges.$inferSelect;
export type InsertIntelListingChange = typeof intelListingChanges.$inferInsert;
export type IntelRequirement = typeof intelRequirements.$inferSelect;
export type InsertIntelRequirement = typeof intelRequirements.$inferInsert;
export type IntelRequirementPreference = typeof intelRequirementPreferences.$inferSelect;
export type InsertIntelRequirementPreference = typeof intelRequirementPreferences.$inferInsert;
