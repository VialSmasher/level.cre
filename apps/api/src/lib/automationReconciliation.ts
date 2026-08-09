import type { Pool } from "pg";

export type ReconciliationIssue = {
  id: string;
  kind: "orphan_pin" | "missing_address" | "missing_provenance" | "stale_follow_up" | "review_backlog" | "terminal_stage_evidence" | "dossier_gap";
  severity: "high" | "medium" | "low";
  entityType: "prospect" | "activity_event" | "opportunity" | "dossier";
  entityId: string;
  label: string;
  reason: string;
  suggestedAction: string;
};

async function safeRows(pool: Pool, query: string, values: unknown[]) {
  try {
    return (await pool.query(query, values)).rows;
  } catch (error) {
    if (["42P01", "42703"].includes(String((error as any)?.code || ""))) return [];
    throw error;
  }
}

export async function buildAutomationReconciliation(params: {
  pool: Pool;
  userId: string;
  now?: Date;
  limit?: number;
}) {
  const now = params.now || new Date();
  const limit = Math.min(Math.max(params.limit || 100, 1), 250);
  const [prospects, reviewEvents, terminalOpportunities, dossiers] = await Promise.all([
    safeRows(params.pool, `
      SELECT id, name, address, geometry, location_lat, location_lng, market_key,
             market_context_source, market_context_status, status, follow_up_due_date,
             updated_at, created_at
      FROM public.prospects
      WHERE user_id = $1 AND merged_into_prospect_id IS NULL
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 1000
    `, [params.userId]),
    safeRows(params.pool, `
      SELECT id, event_type, subject, summary, property_address, occurred_at, created_at
      FROM public.activity_events
      WHERE user_id = $1 AND match_status = 'needs_review'
        AND created_at < now() - interval '7 days'
      ORDER BY created_at ASC
      LIMIT 250
    `, [params.userId]),
    safeRows(params.pool, `
      SELECT opportunity.id, opportunity.title, opportunity.stage
      FROM public.opportunities opportunity
      WHERE opportunity.user_id = $1
        AND opportunity.stage IN ('won', 'lost')
        AND NOT EXISTS (
          SELECT 1
          FROM public.opportunity_stage_events stage_event
          WHERE stage_event.opportunity_id = opportunity.id
            AND stage_event.to_stage = opportunity.stage
            AND stage_event.evidence_status = 'confirmed'
        )
      LIMIT 100
    `, [params.userId]),
    safeRows(params.pool, `
      SELECT dossier.id, dossier.title, dossier.address, dossier.normalized_address,
             dossier.canonical_listing_id, dossier.lat, dossier.lng,
             COUNT(fact.id) FILTER (
               WHERE fact.status = 'proposed' AND fact.created_at < now() - interval '14 days'
             )::int AS stale_proposed_facts
      FROM public.intel_property_dossiers dossier
      LEFT JOIN public.intel_dossier_facts fact ON fact.dossier_id = dossier.id
      WHERE dossier.created_by_user_id = $1 AND dossier.status <> 'archived'
      GROUP BY dossier.id
      ORDER BY dossier.updated_at DESC NULLS LAST
      LIMIT 500
    `, [params.userId]),
  ]);
  const issues: ReconciliationIssue[] = [];

  for (const prospect of prospects) {
    const label = prospect.name || prospect.address || "Untitled prospect";
    const geometryCoordinates = prospect.geometry?.type === "Point" ? prospect.geometry.coordinates : null;
    const hasGeometry = Array.isArray(geometryCoordinates) && geometryCoordinates.length >= 2;
    const hasCanonicalCoordinates = prospect.location_lat != null && prospect.location_lng != null;
    if (hasGeometry && !hasCanonicalCoordinates) {
      issues.push({
        id: `orphan-pin:${prospect.id}`,
        kind: "orphan_pin",
        severity: "high",
        entityType: "prospect",
        entityId: prospect.id,
        label,
        reason: "Map geometry exists but the canonical latitude/longitude fields are empty.",
        suggestedAction: "Re-save or reconcile the pin so map search, exports, and agents use the same coordinates.",
      });
    }
    if (!prospect.address && hasGeometry) {
      issues.push({
        id: `missing-address:${prospect.id}`,
        kind: "missing_address",
        severity: "medium",
        entityType: "prospect",
        entityId: prospect.id,
        label,
        reason: "The map record has coordinates but no dedicated address.",
        suggestedAction: "Confirm the civic address or label it explicitly as a land/intersection location.",
      });
    }
    if (hasGeometry && (!prospect.market_key || !prospect.market_context_source || !prospect.market_context_status)) {
      issues.push({
        id: `missing-provenance:${prospect.id}`,
        kind: "missing_provenance",
        severity: "low",
        entityType: "prospect",
        entityId: prospect.id,
        label,
        reason: "The pin is missing one or more source, evidence, or stable identity fields.",
        suggestedAction: "Attach the original map/listing source and a stable market key before an agent treats it as confirmed context.",
      });
    }
    if (!['no_go', 'closed'].includes(String(prospect.status || ""))) {
      const dueAt = prospect.follow_up_due_date ? new Date(prospect.follow_up_due_date).getTime() : null;
      const updatedAt = new Date(prospect.updated_at || prospect.created_at || 0).getTime();
      if (!dueAt && Number.isFinite(updatedAt) && now.getTime() - updatedAt > 30 * 86_400_000) {
        issues.push({
          id: `stale-follow-up:${prospect.id}`,
          kind: "stale_follow_up",
          severity: "medium",
          entityType: "prospect",
          entityId: prospect.id,
          label,
          reason: "Active prospect has no next follow-up and has been untouched for more than 30 days.",
          suggestedAction: "Set a real next move or explicitly archive/no-go the record.",
        });
      }
    }
  }

  for (const event of reviewEvents) {
    issues.push({
      id: `review-backlog:${event.id}`,
      kind: "review_backlog",
      severity: "medium",
      entityType: "activity_event",
      entityId: event.id,
      label: event.subject || event.summary || event.property_address || event.event_type,
      reason: "This evidence has been waiting in Review for more than seven days.",
      suggestedAction: "Link, approve, or archive it so it does not remain ambiguous automation state.",
    });
  }

  for (const opportunity of terminalOpportunities) {
    issues.push({
      id: `terminal-evidence:${opportunity.id}`,
      kind: "terminal_stage_evidence",
      severity: "high",
      entityType: "opportunity",
      entityId: opportunity.id,
      label: opportunity.title,
      reason: `${opportunity.stage} stage has no matching confirmed stage evidence.`,
      suggestedAction: "Attach Patrick-confirmed evidence or move the opportunity back to a non-terminal stage.",
    });
  }

  for (const dossier of dossiers) {
    const gaps = [
      !dossier.normalized_address && !dossier.canonical_listing_id ? "no normalized address or canonical listing" : null,
      dossier.lat == null || dossier.lng == null ? "no map coordinates" : null,
      Number(dossier.stale_proposed_facts || 0) > 0 ? `${dossier.stale_proposed_facts} proposed fact(s) older than 14 days` : null,
    ].filter(Boolean);
    if (gaps.length === 0) continue;
    issues.push({
      id: `dossier-gap:${dossier.id}`,
      kind: "dossier_gap",
      severity: gaps.length > 1 ? "medium" : "low",
      entityType: "dossier",
      entityId: dossier.id,
      label: dossier.title || dossier.address || "Untitled dossier",
      reason: `Dossier has ${gaps.join("; ")}.`,
      suggestedAction: "Resolve the identity/location gaps and review old proposed facts before using this dossier in another automation.",
    });
  }

  const severityOrder = { high: 3, medium: 2, low: 1 } as const;
  issues.sort((left, right) => severityOrder[right.severity] - severityOrder[left.severity] || left.label.localeCompare(right.label));
  const rows = issues.slice(0, limit);
  return {
    generatedAt: now.toISOString(),
    summary: {
      issues: issues.length,
      returned: rows.length,
      high: issues.filter((issue) => issue.severity === "high").length,
      medium: issues.filter((issue) => issue.severity === "medium").length,
      low: issues.filter((issue) => issue.severity === "low").length,
    },
    rows,
  };
}
