import type { Express } from "express";
import { requireAuth } from "../../auth";
import { industrialIntelService } from "./service";

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
}
