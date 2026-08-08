import type { Pool } from "pg";
import { z } from "zod";
import { ActivityEventBatchSchema, importActivityEventBatch } from "./activityEventService";
import { resolveMarketEntitiesForUser } from "./marketEntityResolver";

const LegalPropertyIdentitySchema = z.object({
  municipality: z.string().trim().max(240).nullable().optional(),
  titleNumber: z.string().trim().max(120).nullable().optional(),
  linc: z.string().trim().max(120).nullable().optional(),
  plan: z.string().trim().max(120).nullable().optional(),
  block: z.string().trim().max(120).nullable().optional(),
  lot: z.string().trim().max(120).nullable().optional(),
});

export const MarketRecordProposalInputSchema = z.object({
  externalId: z.string().trim().min(1).max(240),
  source: z.string().trim().min(1).max(80).default("codex_market_research"),
  observedAt: z.string().datetime().optional(),
  evidenceStatus: z.enum(["observed", "inferred"]).default("observed"),
  confidence: z.number().int().min(0).max(100).default(0),
  businessName: z.string().trim().max(240).nullable().optional(),
  address: z.string().trim().min(3).max(1000),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  contactName: z.string().trim().max(240).nullable().optional(),
  contactEmail: z.string().trim().email().max(320).toLowerCase().nullable().optional(),
  contactPhone: z.string().trim().max(80).nullable().optional(),
  websiteUrl: z.string().trim().url().max(2000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  placeId: z.string().trim().max(240).nullable().optional(),
  googleMapsUrl: z.string().trim().url().max(2000).nullable().optional(),
  evidenceUrl: z.string().trim().url().max(2000).nullable().optional(),
  legalIdentity: LegalPropertyIdentitySchema.nullable().optional(),
  sourceMetadata: z.record(z.unknown()).optional().default({}),
});

export const MarketRecordProposalReviewSchema = z.object({
  action: z.enum(["approve", "ignore"]),
  prospectId: z.string().trim().min(1).optional(),
});

export type MarketRecordProposalInput = z.infer<typeof MarketRecordProposalInputSchema>;

export async function submitMarketRecordProposal(params: {
  pool: Pool;
  userId: string;
  proposal: MarketRecordProposalInput;
  agentName?: string | null;
}) {
  const resolution = await resolveMarketEntitiesForUser({
    pool: params.pool,
    userId: params.userId,
    input: {
      address: params.proposal.address,
      latitude: params.proposal.latitude,
      longitude: params.proposal.longitude,
      placeId: params.proposal.placeId,
      phone: params.proposal.contactPhone,
      email: params.proposal.contactEmail,
      websiteUrl: params.proposal.websiteUrl,
      businessName: params.proposal.businessName,
      ...(params.proposal.legalIdentity || {}),
    },
  });
  const resolutionSummary = {
    decision: resolution.decision,
    candidates: resolution.candidates.slice(0, 5).map((candidate) => ({
      entityType: candidate.entityType,
      id: candidate.id,
      label: candidate.label,
      address: candidate.address || null,
      confidence: candidate.confidence,
      signals: candidate.signals,
      conflicts: candidate.conflicts,
    })),
  };
  const summary = await importActivityEventBatch({
    pool: params.pool,
    userId: params.userId,
    payload: ActivityEventBatchSchema.parse({
      source: params.proposal.source,
      events: [{
        externalEventId: params.proposal.externalId,
        eventType: "market_record_proposed",
        direction: "internal",
        evidenceStatus: params.proposal.evidenceStatus,
        occurredAt: params.proposal.observedAt || new Date(),
        contactName: params.proposal.contactName,
        company: params.proposal.businessName,
        email: params.proposal.contactEmail,
        phone: params.proposal.contactPhone,
        subject: params.proposal.businessName ? `Proposed map record: ${params.proposal.businessName}` : "Proposed map record",
        summary: params.proposal.notes || "Agent-proposed market record awaiting broker approval.",
        propertyAddress: params.proposal.address,
        confidence: params.proposal.confidence,
        matchStatus: "needs_review",
        matchReason: "agent_market_record_proposal",
        evidenceUrl: params.proposal.evidenceUrl,
        sourceMetadata: {
          ...params.proposal.sourceMetadata,
          proposal: params.proposal,
          entityResolution: resolutionSummary,
          agentName: params.agentName || null,
        },
      }],
    }),
  });
  return { ...summary, entityResolution: resolutionSummary };
}
