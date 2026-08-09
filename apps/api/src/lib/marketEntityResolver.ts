import type { Pool } from "pg";
import {
  resolveMarketEntities,
  type MarketEntityResolutionInput,
  type ResolvableMarketEntity,
} from "@level-cre/shared";

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return value == null || value === "" || !Number.isFinite(parsed) ? null : parsed;
}

function isMissingRelation(error: unknown) {
  return String((error as any)?.code || "") === "42P01";
}

export async function resolveMarketEntitiesForUser(params: {
  pool: Pool;
  userId: string;
  input: MarketEntityResolutionInput;
}) {
  const entities: ResolvableMarketEntity[] = [];
  const [prospects, listings] = await Promise.all([
    params.pool.query(`
      SELECT id, name, address, location_lat, location_lng, market_key,
             contact_phone, contact_email, website_url, business_name, contact_company,
             ai_metadata -> 'googlePlace' ->> 'placeId' AS place_id,
             ai_metadata -> 'legalIdentity' ->> 'municipality' AS municipality,
             ai_metadata -> 'legalIdentity' ->> 'titleNumber' AS title_number,
             ai_metadata -> 'legalIdentity' ->> 'linc' AS linc,
             ai_metadata -> 'legalIdentity' ->> 'plan' AS plan,
             ai_metadata -> 'legalIdentity' ->> 'block' AS block,
             ai_metadata -> 'legalIdentity' ->> 'lot' AS lot
      FROM public.prospects
      WHERE user_id = $1 AND merged_into_prospect_id IS NULL
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 750
    `, [params.userId]),
    params.pool.query(`
      SELECT id, title, address, lat, lng
      FROM public.listings
      WHERE user_id = $1 AND archived_at IS NULL
      ORDER BY created_at DESC
      LIMIT 500
    `, [params.userId]),
  ]);

  for (const row of prospects.rows) {
    entities.push({
      entityType: "prospect",
      id: row.id,
      label: row.business_name || row.contact_company || row.name || row.address || "Untitled prospect",
      address: row.address || row.name || null,
      latitude: numberOrNull(row.location_lat),
      longitude: numberOrNull(row.location_lng),
      placeId: row.place_id || null,
      marketKey: row.market_key || null,
      phone: row.contact_phone || null,
      email: row.contact_email || null,
      websiteUrl: row.website_url || null,
      businessName: row.business_name || row.contact_company || null,
      municipality: row.municipality || null,
      titleNumber: row.title_number || null,
      linc: row.linc || null,
      plan: row.plan || null,
      block: row.block || null,
      lot: row.lot || null,
    });
  }
  for (const row of listings.rows) {
    entities.push({
      entityType: "listing",
      id: row.id,
      label: row.title || row.address || "Untitled listing",
      address: row.address || null,
      latitude: numberOrNull(row.lat),
      longitude: numberOrNull(row.lng),
    });
  }

  try {
    const dossiers = await params.pool.query(`
      SELECT id, title, address, lat, lng
      FROM public.intel_property_dossiers
      WHERE created_by_user_id = $1 AND status <> 'archived'
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 500
    `, [params.userId]);
    for (const row of dossiers.rows) {
      entities.push({
        entityType: "dossier",
        id: row.id,
        label: row.title || row.address || "Untitled dossier",
        address: row.address || null,
        latitude: numberOrNull(row.lat),
        longitude: numberOrNull(row.lng),
      });
    }
  } catch (error) {
    if (!isMissingRelation(error)) throw error;
  }

  return resolveMarketEntities(params.input, entities);
}
