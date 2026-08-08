import type { Pool } from "pg";
import { z } from "zod";
import { ActivityEventBatchSchema, importActivityEventBatch } from "./activityEventService";
import { OPPORTUNITY_TYPES } from "./opportunityService";

export const OpportunityPromotionProposalInputSchema = z.object({
  sourceEventId: z.string().trim().min(1),
  externalId: z.string().trim().min(1).max(240).optional(),
  type: z.enum(OPPORTUNITY_TYPES).default("listing_pursuit"),
  title: z.string().trim().min(1).max(300).optional(),
  company: z.string().trim().max(240).nullable().optional(),
  contactName: z.string().trim().max(240).nullable().optional(),
  contactEmail: z.string().trim().email().max(320).toLowerCase().nullable().optional(),
  propertyAddress: z.string().trim().max(1000).nullable().optional(),
  prospectId: z.string().trim().min(1).nullable().optional(),
  listingId: z.string().trim().min(1).nullable().optional(),
  confidence: z.number().int().min(0).max(100).default(0),
  reason: z.string().trim().min(1).max(2000),
  source: z.string().trim().min(1).max(80).default("codex_opportunity_agent"),
  metadata: z.record(z.unknown()).optional().default({}),
});

export const OpportunityPromotionProposalReviewSchema = z.object({
  action: z.enum(["approve", "ignore"]),
});

export type OpportunityPromotionProposalInput = z.infer<typeof OpportunityPromotionProposalInputSchema>;

export async function submitOpportunityPromotionProposal(params: {
  pool: Pool;
  userId: string;
  input: OpportunityPromotionProposalInput;
  agentName?: string | null;
}) {
  const { rows } = await params.pool.query(`
    SELECT id, event_type, evidence_status, match_status, occurred_at, contact_name,
           company, email, property_address, prospect_id, listing_id, subject
    FROM public.activity_events
    WHERE id = $1 AND user_id = $2
    LIMIT 1
  `, [params.input.sourceEventId, params.userId]);
  const sourceEvent = rows[0];
  if (!sourceEvent) throw new Error("Source activity event was not found");
  if (sourceEvent.evidence_status !== "confirmed") {
    throw new Error("Opportunity proposals require a confirmed source activity event");
  }
  if (sourceEvent.match_status !== "matched") {
    throw new Error("Confirmed activity must be matched to canonical context before opportunity promotion");
  }
  const prospectId = params.input.prospectId || sourceEvent.prospect_id || null;
  const listingId = params.input.listingId || sourceEvent.listing_id || null;
  if (!prospectId && !listingId) {
    throw new Error("Confirmed activity must be linked to a prospect or listing before promotion");
  }
  const proposal = {
    ...params.input,
    prospectId,
    listingId,
    title: params.input.title
      || params.input.company
      || sourceEvent.company
      || sourceEvent.subject
      || "Brokerage opportunity",
    company: params.input.company || sourceEvent.company || null,
    contactName: params.input.contactName || sourceEvent.contact_name || null,
    contactEmail: params.input.contactEmail || sourceEvent.email || null,
    propertyAddress: params.input.propertyAddress || sourceEvent.property_address || null,
  };
  return importActivityEventBatch({
    pool: params.pool,
    userId: params.userId,
    payload: ActivityEventBatchSchema.parse({
      source: params.input.source,
      events: [{
        externalEventId: params.input.externalId || `opportunity-proposal:${sourceEvent.id}:${params.input.type}`,
        eventType: "opportunity_promotion_proposed",
        direction: "internal",
        evidenceStatus: "observed",
        occurredAt: new Date(),
        contactName: proposal.contactName,
        company: proposal.company,
        email: proposal.contactEmail,
        subject: `Proposed opportunity: ${proposal.title}`,
        summary: params.input.reason,
        propertyAddress: proposal.propertyAddress,
        confidence: params.input.confidence,
        matchStatus: "needs_review",
        matchReason: "confirmed_activity_opportunity_proposal",
        prospectId,
        listingId,
        sourceMetadata: {
          proposal,
          sourceActivityEvent: {
            id: sourceEvent.id,
            eventType: sourceEvent.event_type,
            occurredAt: sourceEvent.occurred_at,
            evidenceStatus: sourceEvent.evidence_status,
          },
          agentName: params.agentName || null,
        },
        links: [{
          entityType: prospectId ? "prospect" : "listing",
          entityId: prospectId || listingId,
          role: prospectId ? "promotion_source" : "listing_context",
          confidence: params.input.confidence,
        }],
      }],
    }),
  });
}
