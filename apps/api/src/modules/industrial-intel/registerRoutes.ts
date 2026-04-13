import type { Express } from "express";
import { z } from "zod";
import { getUserId, requireAuth } from "../../auth";
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

const intelManualListingSchema = z.object({
  sourceUrl: z.string().trim().url(),
  title: z.string().trim().min(1),
  brochureUrl: z.string().trim().url().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  market: z.string().trim().nullable().optional(),
  submarket: z.string().trim().nullable().optional(),
  listingType: z.string().trim().min(1).nullable().optional(),
  assetType: z.string().trim().min(1).nullable().optional(),
  availableSf: z.number().int().nonnegative().nullable().optional(),
  landAcres: z.number().nonnegative().nullable().optional(),
  totalPrice: z.number().nonnegative().nullable().optional(),
  pricePerAcre: z.number().nonnegative().nullable().optional(),
});

const intelManualListingPreviewSchema = z.object({
  sourceUrl: z.string().trim().url(),
});

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
}
