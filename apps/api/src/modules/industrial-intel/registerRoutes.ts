import type { Express, Request } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";
import { getUserId, requireAuth } from "../../auth";
import { ensureUser } from "../../ensureUser";
import { industrialIntelService } from "./service";

const intelRequirementSchema = z.object({
  title: z.string().trim().min(1),
  clientName: z.string().trim().min(1).nullable().optional(),
  status: z.string().trim().min(1).nullable().optional(),
  dealType: z.string().trim().min(1).nullable().optional(),
  market: z.string().trim().min(1).nullable().optional(),
  submarket: z.string().trim().min(1).nullable().optional(),
  minSf: z.number().int().nonnegative().nullable().optional(),
  maxSf: z.number().int().nonnegative().nullable().optional(),
  minClearHeightFt: z.number().nonnegative().nullable().optional(),
  maxBudgetPsf: z.number().nonnegative().nullable().optional(),
  requiredDockDoors: z.number().int().nonnegative().nullable().optional(),
  requiredGradeDoors: z.number().int().nonnegative().nullable().optional(),
  minYardAcres: z.number().nonnegative().nullable().optional(),
  powerNotes: z.string().trim().nullable().optional(),
  officeNotes: z.string().trim().nullable().optional(),
  timingNotes: z.string().trim().nullable().optional(),
  specialNotes: z.string().trim().nullable().optional(),
  isOffMarketSearchEnabled: z.boolean().nullable().optional(),
});

const intelRequirementUpdateSchema = intelRequirementSchema.partial();

const intelRequirementPreferenceSchema = z.object({
  key: z.string().trim().min(1),
  operator: z.string().trim().min(1).nullable().optional(),
  valueText: z.string().trim().nullable().optional(),
  valueNumber: z.number().nullable().optional(),
  valueBoolean: z.boolean().nullable().optional(),
  weight: z.number().int().nullable().optional(),
});

const intelRequirementPreferencesSchema = z.array(intelRequirementPreferenceSchema);

const intelRequirementListingDecisionSchema = z.object({
  decision: z.enum(["shortlist", "maybe", "rejected"]),
  notes: z.string().trim().nullable().optional(),
  sortOrder: z.number().int().nonnegative().nullable().optional(),
});

const intelManualListingSchema = z.object({
  sourceUrl: z.string().trim().url(),
  title: z.string().trim().min(1),
  brochureUrl: z.string().trim().url().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  market: z.string().trim().nullable().optional(),
  submarket: z.string().trim().nullable().optional(),
  listingType: z.string().trim().min(1).nullable().optional(),
  assetType: z.string().trim().min(1).nullable().optional(),
  recordKeySuffix: z.string().trim().min(1).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  availableSf: z.number().int().nonnegative().nullable().optional(),
  landAcres: z.number().nonnegative().nullable().optional(),
  totalPrice: z.number().nonnegative().nullable().optional(),
  pricePerAcre: z.number().nonnegative().nullable().optional(),
  leaseRatePsf: z.number().nonnegative().nullable().optional(),
});

const intelManualUploadListingSchema = intelManualListingSchema.extend({
  sourceUrl: z.string().trim().url().nullable().optional(),
});

const intelManualUploadSchema = z.object({
  sourceName: z.string().trim().min(1).nullable().optional(),
  records: z.array(intelManualUploadListingSchema).min(1).max(500),
});

const intelManualListingPreviewSchema = z.object({
  sourceUrl: z.string().trim().url(),
});

const intelArchiveDuplicatesSchema = z.object({
  keepId: z.string().trim().min(1),
  duplicateIds: z.array(z.string().trim().min(1)).min(1).max(50),
});

const intelManualPublicLinkSchema = z.object({
  candidateUrl: z.string().trim().url(),
  title: z.string().trim().min(1).nullable().optional(),
  snippet: z.string().trim().min(1).nullable().optional(),
});

const intelSurveySchema = z.object({
  requirementId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1),
  clientName: z.string().trim().nullable().optional(),
  status: z.enum(["draft", "shared", "archived"]).nullable().optional(),
});

const intelSurveyUpdateSchema = intelSurveySchema.partial().extend({
  shareToken: z.string().trim().min(1).nullable().optional(),
});

const intelSurveyItemSchema = z.object({
  listingId: z.string().trim().min(1),
  sortOrder: z.number().int().nonnegative().nullable().optional(),
  recommendationLabel: z.string().trim().nullable().optional(),
  brokerNotes: z.string().trim().nullable().optional(),
  clientNotes: z.string().trim().nullable().optional(),
  hidden: z.boolean().nullable().optional(),
});

const intelSurveyItemUpdateSchema = intelSurveyItemSchema.omit({ listingId: true }).partial();

const intelSurveyAssetUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
  fileSize: z.number().int().positive().max(25 * 1024 * 1024),
  assetType: z.enum(["brochure", "flyer", "aerial", "site_plan", "photo", "survey_page", "other"]).nullable().optional(),
});

const intelDossierSchema = z.object({
  canonicalListingId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1),
  address: z.string().trim().nullable().optional(),
  normalizedAddress: z.string().trim().nullable().optional(),
  market: z.string().trim().nullable().optional(),
  submarket: z.string().trim().nullable().optional(),
  assetType: z.string().trim().nullable().optional(),
  listingType: z.string().trim().nullable().optional(),
  status: z.enum(["active", "draft", "archived"]).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

const intelDossierUpdateSchema = intelDossierSchema.partial();

const intelDossierFactSchema = z.object({
  sourceAssetId: z.string().trim().min(1).nullable().optional(),
  factKey: z.string().trim().min(1),
  label: z.string().trim().min(1).nullable().optional(),
  valueText: z.string().trim().nullable().optional(),
  valueNumber: z.number().nullable().optional(),
  valueBoolean: z.boolean().nullable().optional(),
  valueJson: z.record(z.unknown()).nullable().optional(),
  confidence: z.number().int().min(0).max(100).nullable().optional(),
  status: z.enum(["proposed", "approved", "rejected"]).nullable().optional(),
  source: z.string().trim().min(1).nullable().optional(),
});

const intelDossierFactUpdateSchema = intelDossierFactSchema.partial();

async function ensureIntelActor(req: Request) {
  if (req.headers["x-demo-mode"] === "true") return;
  await ensureUser(getUserId(req), (req as any)?.user?.email || null);
}

export function registerIndustrialIntelRoutes(app: Express): void {
  app.get("/api/intel/summary", requireAuth, async (_req, res) => {
    try {
      const summary = await industrialIntelService.getSummary();
      res.json(summary);
    } catch (error) {
      console.error("Error fetching industrial intel summary:", error);
      res.status(500).json({ message: "Failed to fetch industrial intel summary" });
    }
  });

  app.get("/api/intel/sources", requireAuth, async (_req, res) => {
    try {
      const sources = await industrialIntelService.getSources();
      res.json(sources);
    } catch (error) {
      console.error("Error fetching industrial intel sources:", error);
      res.status(500).json({ message: "Failed to fetch industrial intel sources" });
    }
  });

  app.get("/api/intel/runs", requireAuth, async (_req, res) => {
    try {
      const runs = await industrialIntelService.getRuns();
      res.json(runs);
    } catch (error) {
      console.error("Error fetching industrial intel runs:", error);
      res.status(500).json({ message: "Failed to fetch industrial intel runs" });
    }
  });

  app.get("/api/intel/listings", requireAuth, async (_req, res) => {
    try {
      const listings = await industrialIntelService.getListings();
      res.json(listings);
    } catch (error) {
      console.error("Error fetching industrial intel listings:", error);
      res.status(500).json({ message: "Failed to fetch industrial intel listings" });
    }
  });

  app.get("/api/intel/changes", requireAuth, async (_req, res) => {
    try {
      const changes = await industrialIntelService.getRecentChanges();
      res.json(changes);
    } catch (error) {
      console.error("Error fetching industrial intel changes:", error);
      res.status(500).json({ message: "Failed to fetch industrial intel changes" });
    }
  });

  app.get("/api/intel/listings/duplicates", requireAuth, async (_req, res) => {
    try {
      const groups = await industrialIntelService.getListingDuplicates();
      res.json(groups);
    } catch (error) {
      console.error("Error fetching industrial intel listing duplicates:", error);
      res.status(500).json({ message: "Failed to fetch industrial intel listing duplicates" });
    }
  });

  app.get("/api/intel/dossiers", requireAuth, async (req, res) => {
    try {
      await ensureIntelActor(req);
      const dossiers = await industrialIntelService.getDossiers(getUserId(req));
      res.json(dossiers);
    } catch (error) {
      console.error("Error fetching industrial intel dossiers:", error);
      res.status(500).json({ message: "Failed to fetch industrial intel dossiers" });
    }
  });

  app.post("/api/intel/dossiers", requireAuth, async (req, res) => {
    try {
      const parsed = intelDossierSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid industrial intel dossier", issues: parsed.error.flatten() });
      }
      await ensureIntelActor(req);
      const dossier = await industrialIntelService.createDossier(getUserId(req), parsed.data);
      res.status(201).json(dossier);
    } catch (error) {
      console.error("Error creating industrial intel dossier:", error);
      res.status(500).json({ message: "Failed to create industrial intel dossier" });
    }
  });

  app.get("/api/intel/dossiers/:id", requireAuth, async (req, res) => {
    try {
      const dossier = await industrialIntelService.getDossierById(getUserId(req), req.params.id);
      if (!dossier) {
        return res.status(404).json({ message: "Industrial intel dossier not found" });
      }
      res.json(dossier);
    } catch (error) {
      console.error("Error fetching industrial intel dossier:", error);
      res.status(500).json({ message: "Failed to fetch industrial intel dossier" });
    }
  });

  app.patch("/api/intel/dossiers/:id", requireAuth, async (req, res) => {
    try {
      const parsed = intelDossierUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid industrial intel dossier update", issues: parsed.error.flatten() });
      }
      await ensureIntelActor(req);
      const dossier = await industrialIntelService.updateDossier(getUserId(req), req.params.id, parsed.data);
      if (!dossier) {
        return res.status(404).json({ message: "Industrial intel dossier not found" });
      }
      res.json(dossier);
    } catch (error) {
      console.error("Error updating industrial intel dossier:", error);
      res.status(500).json({ message: "Failed to update industrial intel dossier" });
    }
  });

  app.get("/api/intel/dossiers/:id/assets", requireAuth, async (req, res) => {
    try {
      const assets = await industrialIntelService.getDossierAssets(getUserId(req), req.params.id);
      res.json(assets);
    } catch (error) {
      console.error("Error fetching industrial intel dossier assets:", error);
      res.status(500).json({ message: "Failed to fetch industrial intel dossier assets" });
    }
  });

  app.post("/api/intel/dossiers/:id/assets/upload-url", requireAuth, async (req, res) => {
    try {
      const parsed = intelSurveyAssetUploadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid industrial intel asset upload", issues: parsed.error.flatten() });
      }
      await ensureIntelActor(req);
      const result = await industrialIntelService.createDossierAssetUpload(getUserId(req), req.params.id, parsed.data);
      if (!result) {
        return res.status(404).json({ message: "Industrial intel dossier not found" });
      }
      res.status(201).json(result);
    } catch (error: any) {
      console.error("Error creating industrial intel dossier asset upload:", error);
      res.status(500).json({
        message: "Failed to create industrial intel dossier asset upload",
        detail: String(error?.message || error || "Unknown upload failure"),
      });
    }
  });

  app.post("/api/intel/dossiers/:id/facts", requireAuth, async (req, res) => {
    try {
      const parsed = intelDossierFactSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid industrial intel dossier fact", issues: parsed.error.flatten() });
      }
      await ensureIntelActor(req);
      const fact = await industrialIntelService.upsertDossierFact(getUserId(req), req.params.id, parsed.data);
      if (!fact) {
        return res.status(404).json({ message: "Industrial intel dossier not found" });
      }
      res.status(201).json(fact);
    } catch (error) {
      console.error("Error creating industrial intel dossier fact:", error);
      res.status(500).json({ message: "Failed to create industrial intel dossier fact" });
    }
  });

  app.patch("/api/intel/dossiers/:id/facts/:factId", requireAuth, async (req, res) => {
    try {
      const parsed = intelDossierFactUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid industrial intel dossier fact update", issues: parsed.error.flatten() });
      }
      await ensureIntelActor(req);
      const fact = await industrialIntelService.updateDossierFact(getUserId(req), req.params.id, req.params.factId, parsed.data);
      if (!fact) {
        return res.status(404).json({ message: "Industrial intel dossier fact not found" });
      }
      res.json(fact);
    } catch (error) {
      console.error("Error updating industrial intel dossier fact:", error);
      res.status(500).json({ message: "Failed to update industrial intel dossier fact" });
    }
  });

  app.post("/api/intel/listings/duplicates/archive", requireAuth, async (req, res) => {
    try {
      const parsed = intelArchiveDuplicatesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid duplicate archive request", issues: parsed.error.flatten() });
      }

      const result = await industrialIntelService.archiveDuplicateListings(parsed.data.keepId, parsed.data.duplicateIds);
      res.json(result);
    } catch (error) {
      console.error("Error archiving industrial intel listing duplicates:", error);
      res.status(500).json({ message: "Failed to archive industrial intel listing duplicates" });
    }
  });

  app.get("/api/intel/listings/:id/public-links", requireAuth, async (req, res) => {
    try {
      const candidates = await industrialIntelService.getPublicLinkCandidates(req.params.id);
      res.json({ candidates });
    } catch (error) {
      console.error("Error fetching industrial intel public link candidates:", error);
      res.status(500).json({ message: "Failed to fetch public link candidates" });
    }
  });

  app.post("/api/intel/listings/:id/resolve-public-links", requireAuth, async (req, res) => {
    try {
      const result = await industrialIntelService.resolvePublicLinkCandidates(req.params.id);
      if (!result) {
        return res.status(404).json({ message: "Industrial intel listing not found" });
      }
      if (result.status === "not_configured") {
        return res.json(result);
      }
      res.json(result);
    } catch (error) {
      console.error("Error resolving industrial intel public links:", error);
      res.status(500).json({
        message: "Resolver failed",
        detail: String((error as Error)?.message || error || "Unknown resolver failure"),
      });
    }
  });

  app.post("/api/intel/listings/:id/public-links/manual", requireAuth, async (req, res) => {
    try {
      const parsed = intelManualPublicLinkSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid public link", issues: parsed.error.flatten() });
      }

      const candidate = await industrialIntelService.createManualPublicLinkCandidate(req.params.id, parsed.data);
      if (!candidate) {
        return res.status(404).json({ message: "Industrial intel listing not found" });
      }
      res.status(201).json(candidate);
    } catch (error) {
      console.error("Error saving manual industrial intel public link:", error);
      res.status(500).json({ message: "Failed to save public link" });
    }
  });

  app.post("/api/intel/listings/:id/public-links/:candidateId/approve", requireAuth, async (req, res) => {
    try {
      const candidate = await industrialIntelService.approvePublicLinkCandidate(req.params.id, req.params.candidateId);
      if (!candidate) {
        return res.status(404).json({ message: "Public link candidate not found" });
      }
      res.json(candidate);
    } catch (error) {
      console.error("Error approving industrial intel public link candidate:", error);
      res.status(500).json({ message: "Failed to approve public link candidate" });
    }
  });

  app.post("/api/intel/listings/:id/public-links/:candidateId/reject", requireAuth, async (req, res) => {
    try {
      const candidate = await industrialIntelService.rejectPublicLinkCandidate(req.params.id, req.params.candidateId);
      if (!candidate) {
        return res.status(404).json({ message: "Public link candidate not found" });
      }
      res.json(candidate);
    } catch (error) {
      console.error("Error rejecting industrial intel public link candidate:", error);
      res.status(500).json({ message: "Failed to reject public link candidate" });
    }
  });

  app.post("/api/intel/sources/:slug/run", requireAuth, async (req, res) => {
    try {
      const result = await industrialIntelService.runSource(getUserId(req), req.params.slug);
      res.status(202).json(result);
    } catch (error) {
      console.error("Error running industrial intel source:", error);
      res.status(500).json({
        message: "Failed to run industrial intel source",
        detail: String((error as Error)?.message || error || "Unknown source run failure"),
      });
    }
  });

  app.post("/api/intel/manual-listings/preview", requireAuth, async (req, res) => {
    try {
      const parsed = intelManualListingPreviewSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid industrial intel manual listing preview", issues: parsed.error.flatten() });
      }
      const result = await industrialIntelService.previewManualListing(parsed.data.sourceUrl);
      res.json(result);
    } catch (error) {
      console.error("Error previewing industrial intel manual listing:", error);
      res.status(500).json({ message: "Failed to preview industrial intel manual listing" });
    }
  });

  app.post("/api/intel/manual-listings", requireAuth, async (req, res) => {
    try {
      const parsed = intelManualListingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid industrial intel manual listing", issues: parsed.error.flatten() });
      }
      const result = await industrialIntelService.ingestManualListing(getUserId(req), parsed.data);
      res.status(201).json(result);
    } catch (error) {
      console.error("Error ingesting industrial intel manual listing:", error);
      res.status(500).json({ message: "Failed to ingest industrial intel manual listing" });
    }
  });

  app.post("/api/intel/manual-listings/upload", requireAuth, async (req, res) => {
    try {
      const parsed = intelManualUploadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid industrial intel listing upload", issues: parsed.error.flatten() });
      }
      const result = await industrialIntelService.ingestManualListingUpload(getUserId(req), parsed.data);
      res.status(201).json(result);
    } catch (error) {
      console.error("Error ingesting industrial intel listing upload:", error);
      res.status(500).json({ message: "Failed to ingest industrial intel listing upload" });
    }
  });

  app.get("/api/intel/surveys", requireAuth, async (req, res) => {
    try {
      const surveys = await industrialIntelService.getSurveys(getUserId(req));
      res.json(surveys);
    } catch (error) {
      console.error("Error fetching industrial intel surveys:", error);
      res.status(500).json({ message: "Failed to fetch industrial intel surveys" });
    }
  });

  app.post("/api/intel/surveys", requireAuth, async (req, res) => {
    try {
      const parsed = intelSurveySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid industrial intel survey", issues: parsed.error.flatten() });
      }
      await ensureIntelActor(req);
      const survey = await industrialIntelService.createSurvey(getUserId(req), parsed.data);
      res.status(201).json(survey);
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code === "23503") {
        return res.status(404).json({ message: "Industrial intel requirement not found" });
      }
      console.error("Error creating industrial intel survey:", error);
      res.status(500).json({ message: "Failed to create industrial intel survey" });
    }
  });

  app.get("/api/intel/surveys/share/:token", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      if (!token) {
        return res.status(400).json({ message: "Missing survey share token" });
      }
      const survey = await industrialIntelService.getSurveyByShareToken(token);
      if (!survey) {
        return res.status(404).json({ message: "Industrial intel shared survey not found" });
      }
      res.json(survey);
    } catch (error) {
      console.error("Error fetching shared industrial intel survey:", error);
      res.status(500).json({ message: "Failed to fetch shared industrial intel survey" });
    }
  });

  app.get("/api/intel/surveys/share/:token/assets", async (req, res) => {
    try {
      const token = String(req.params.token || "").trim();
      if (!token) {
        return res.status(400).json({ message: "Missing survey share token" });
      }
      const assets = await industrialIntelService.getSharedSurveyAssets(token);
      res.json(assets);
    } catch (error) {
      console.error("Error fetching shared industrial intel survey assets:", error);
      res.status(500).json({ message: "Failed to fetch shared industrial intel survey assets" });
    }
  });

  app.post("/api/intel/surveys/:id/share", requireAuth, async (req, res) => {
    try {
      await ensureIntelActor(req);
      const token = randomBytes(18).toString("base64url");
      const survey = await industrialIntelService.updateSurvey(getUserId(req), req.params.id, {
        status: "shared",
        shareToken: token,
      });
      if (!survey) {
        return res.status(404).json({ message: "Industrial intel survey not found" });
      }
      res.json(survey);
    } catch (error) {
      console.error("Error sharing industrial intel survey:", error);
      res.status(500).json({ message: "Failed to share industrial intel survey" });
    }
  });

  app.delete("/api/intel/surveys/:id/share", requireAuth, async (req, res) => {
    try {
      await ensureIntelActor(req);
      const survey = await industrialIntelService.updateSurvey(getUserId(req), req.params.id, {
        status: "draft",
        shareToken: null,
      });
      if (!survey) {
        return res.status(404).json({ message: "Industrial intel survey not found" });
      }
      res.json(survey);
    } catch (error) {
      console.error("Error disabling industrial intel survey share:", error);
      res.status(500).json({ message: "Failed to disable industrial intel survey share" });
    }
  });

  app.get("/api/intel/surveys/:id", requireAuth, async (req, res) => {
    try {
      const survey = await industrialIntelService.getSurveyById(getUserId(req), req.params.id);
      if (!survey) {
        return res.status(404).json({ message: "Industrial intel survey not found" });
      }
      res.json(survey);
    } catch (error) {
      console.error("Error fetching industrial intel survey:", error);
      res.status(500).json({ message: "Failed to fetch industrial intel survey" });
    }
  });

  app.get("/api/intel/surveys/:id/assets", requireAuth, async (req, res) => {
    try {
      const assets = await industrialIntelService.getSurveyAssets(getUserId(req), req.params.id);
      res.json(assets);
    } catch (error) {
      console.error("Error fetching industrial intel survey assets:", error);
      res.status(500).json({ message: "Failed to fetch industrial intel survey assets" });
    }
  });

  app.get("/api/intel/surveys/:id/events", requireAuth, async (req, res) => {
    try {
      const events = await industrialIntelService.getSurveyEvents(getUserId(req), req.params.id);
      res.json(events);
    } catch (error) {
      console.error("Error fetching industrial intel survey events:", error);
      res.status(500).json({ message: "Failed to fetch industrial intel survey events" });
    }
  });

  app.patch("/api/intel/surveys/:id", requireAuth, async (req, res) => {
    try {
      const parsed = intelSurveyUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid industrial intel survey update", issues: parsed.error.flatten() });
      }
      await ensureIntelActor(req);
      const survey = await industrialIntelService.updateSurvey(getUserId(req), req.params.id, parsed.data);
      if (!survey) {
        return res.status(404).json({ message: "Industrial intel survey not found" });
      }
      res.json(survey);
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code === "23503") {
        return res.status(404).json({ message: "Industrial intel requirement not found" });
      }
      console.error("Error updating industrial intel survey:", error);
      res.status(500).json({ message: "Failed to update industrial intel survey" });
    }
  });

  app.post("/api/intel/surveys/:id/items", requireAuth, async (req, res) => {
    try {
      const parsed = intelSurveyItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid industrial intel survey item", issues: parsed.error.flatten() });
      }
      await ensureIntelActor(req);
      const survey = await industrialIntelService.addSurveyItem(getUserId(req), req.params.id, parsed.data);
      if (!survey) {
        return res.status(404).json({ message: "Industrial intel survey not found" });
      }
      res.status(201).json(survey);
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code === "23503") {
        return res.status(404).json({ message: "Industrial intel listing not found" });
      }
      console.error("Error adding industrial intel survey item:", error);
      res.status(500).json({ message: "Failed to add industrial intel survey item" });
    }
  });

  app.post("/api/intel/surveys/:id/items/:itemId/assets/upload-url", requireAuth, async (req, res) => {
    try {
      const parsed = intelSurveyAssetUploadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid industrial intel asset upload", issues: parsed.error.flatten() });
      }
      await ensureIntelActor(req);
      const result = await industrialIntelService.createSurveyItemAssetUpload(
        getUserId(req),
        req.params.id,
        req.params.itemId,
        parsed.data,
      );
      if (!result) {
        return res.status(404).json({ message: "Industrial intel survey item not found" });
      }
      res.status(201).json(result);
    } catch (error: any) {
      console.error("Error creating industrial intel asset upload:", error);
      res.status(500).json({
        message: "Failed to create industrial intel asset upload",
        detail: String(error?.message || error || "Unknown upload failure"),
      });
    }
  });

  app.post("/api/intel/assets/:assetId/complete", requireAuth, async (req, res) => {
    try {
      await ensureIntelActor(req);
      const asset = await industrialIntelService.completeListingAsset(getUserId(req), req.params.assetId);
      if (!asset) {
        return res.status(404).json({ message: "Industrial intel asset not found" });
      }
      res.json(asset);
    } catch (error) {
      console.error("Error completing industrial intel asset upload:", error);
      res.status(500).json({ message: "Failed to complete industrial intel asset upload" });
    }
  });

  app.patch("/api/intel/surveys/:id/items/:itemId", requireAuth, async (req, res) => {
    try {
      const parsed = intelSurveyItemUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid industrial intel survey item update", issues: parsed.error.flatten() });
      }
      await ensureIntelActor(req);
      const survey = await industrialIntelService.updateSurveyItem(getUserId(req), req.params.id, req.params.itemId, parsed.data);
      if (!survey) {
        return res.status(404).json({ message: "Industrial intel survey item not found" });
      }
      res.json(survey);
    } catch (error) {
      console.error("Error updating industrial intel survey item:", error);
      res.status(500).json({ message: "Failed to update industrial intel survey item" });
    }
  });

  app.delete("/api/intel/surveys/:id/items/:itemId", requireAuth, async (req, res) => {
    try {
      await ensureIntelActor(req);
      const survey = await industrialIntelService.deleteSurveyItem(getUserId(req), req.params.id, req.params.itemId);
      if (!survey) {
        return res.status(404).json({ message: "Industrial intel survey item not found" });
      }
      res.json(survey);
    } catch (error) {
      console.error("Error deleting industrial intel survey item:", error);
      res.status(500).json({ message: "Failed to delete industrial intel survey item" });
    }
  });

  app.get("/api/intel/requirements", requireAuth, async (req, res) => {
    try {
      const requirements = await industrialIntelService.getRequirements(getUserId(req));
      res.json(requirements);
    } catch (error) {
      console.error("Error fetching industrial intel requirements:", error);
      res.status(500).json({ message: "Failed to fetch industrial intel requirements" });
    }
  });

  app.post("/api/intel/requirements", requireAuth, async (req, res) => {
    try {
      const parsed = intelRequirementSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid industrial intel requirement", issues: parsed.error.flatten() });
      }
      const requirement = await industrialIntelService.createRequirement(getUserId(req), parsed.data);
      res.status(201).json(requirement);
    } catch (error) {
      console.error("Error creating industrial intel requirement:", error);
      res.status(500).json({ message: "Failed to create industrial intel requirement" });
    }
  });

  app.get("/api/intel/requirements/:id", requireAuth, async (req, res) => {
    try {
      const requirement = await industrialIntelService.getRequirementById(getUserId(req), req.params.id);
      if (!requirement) {
        return res.status(404).json({ message: "Industrial intel requirement not found" });
      }
      res.json(requirement);
    } catch (error) {
      console.error("Error fetching industrial intel requirement:", error);
      res.status(500).json({ message: "Failed to fetch industrial intel requirement" });
    }
  });

  app.patch("/api/intel/requirements/:id", requireAuth, async (req, res) => {
    try {
      const parsed = intelRequirementUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid industrial intel requirement update", issues: parsed.error.flatten() });
      }
      const requirement = await industrialIntelService.updateRequirement(getUserId(req), req.params.id, parsed.data);
      if (!requirement) {
        return res.status(404).json({ message: "Industrial intel requirement not found" });
      }
      res.json(requirement);
    } catch (error) {
      console.error("Error updating industrial intel requirement:", error);
      res.status(500).json({ message: "Failed to update industrial intel requirement" });
    }
  });

  app.get("/api/intel/requirements/:id/preferences", requireAuth, async (req, res) => {
    try {
      const requirement = await industrialIntelService.getRequirementById(getUserId(req), req.params.id);
      if (!requirement) {
        return res.status(404).json({ message: "Industrial intel requirement not found" });
      }
      const preferences = await industrialIntelService.getRequirementPreferences(getUserId(req), req.params.id);
      res.json(preferences);
    } catch (error) {
      console.error("Error fetching industrial intel requirement preferences:", error);
      res.status(500).json({ message: "Failed to fetch industrial intel requirement preferences" });
    }
  });

  app.put("/api/intel/requirements/:id/preferences", requireAuth, async (req, res) => {
    try {
      const parsed = intelRequirementPreferencesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid industrial intel requirement preferences", issues: parsed.error.flatten() });
      }
      const preferences = await industrialIntelService.replaceRequirementPreferences(getUserId(req), req.params.id, parsed.data);
      if (!preferences) {
        return res.status(404).json({ message: "Industrial intel requirement not found" });
      }
      res.json(preferences);
    } catch (error) {
      console.error("Error replacing industrial intel requirement preferences:", error);
      res.status(500).json({ message: "Failed to replace industrial intel requirement preferences" });
    }
  });

  app.get("/api/intel/requirements/:id/shortlist", requireAuth, async (req, res) => {
    try {
      const requirement = await industrialIntelService.getRequirementById(getUserId(req), req.params.id);
      if (!requirement) {
        return res.status(404).json({ message: "Industrial intel requirement not found" });
      }
      const decisions = await industrialIntelService.getRequirementListingDecisions(getUserId(req), req.params.id);
      res.json(decisions);
    } catch (error) {
      console.error("Error fetching industrial intel requirement shortlist:", error);
      res.status(500).json({ message: "Failed to fetch industrial intel requirement shortlist" });
    }
  });

  app.put("/api/intel/requirements/:id/shortlist/:listingId", requireAuth, async (req, res) => {
    try {
      const parsed = intelRequirementListingDecisionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid industrial intel shortlist decision", issues: parsed.error.flatten() });
      }

      const decision = await industrialIntelService.upsertRequirementListingDecision(
        getUserId(req),
        req.params.id,
        req.params.listingId,
        parsed.data,
      );
      if (!decision) {
        return res.status(404).json({ message: "Industrial intel requirement not found" });
      }
      res.json(decision);
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code === "23503") {
        return res.status(404).json({ message: "Industrial intel listing not found" });
      }
      console.error("Error updating industrial intel shortlist decision:", error);
      res.status(500).json({ message: "Failed to update industrial intel shortlist decision" });
    }
  });

}
