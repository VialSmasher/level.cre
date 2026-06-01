import { pool } from '../../db';
import { applyNormalizedRecords, type ApplyNormalizedRecordsResult } from './ingest/applyNormalizedRecords';
import { runSourceAdapter } from './ingest/runSource';
import type { IntelSourceAdapterSlug } from './ingest/types';

export type RunnableIntelSourceSlug = Exclude<IntelSourceAdapterSlug, 'manual_url'>;

export type IntelSourceConfig = {
  adapterSlug: RunnableIntelSourceSlug;
  dbSlug: string;
  name: string;
  kind: string;
  feedUrl: string | null;
};

export const RUNNABLE_INTEL_SOURCE_CONFIGS: IntelSourceConfig[] = [
  {
    adapterSlug: 'cwedm',
    dbSlug: 'cwedm',
    name: 'Cushman & Wakefield Edmonton',
    kind: 'broker_site',
    feedUrl: 'https://cwedm.com/',
  },
  {
    adapterSlug: 'nai_edmonton',
    dbSlug: 'nai-edmonton',
    name: 'NAI Commercial Edmonton',
    kind: 'broker_site',
    feedUrl: 'https://naiedmonton.com/',
  },
  {
    adapterSlug: 'avison_young',
    dbSlug: 'avison-young',
    name: 'Avison Young',
    kind: 'broker_site',
    feedUrl: 'https://avisonyoung.ca/',
  },
  {
    adapterSlug: 'jll',
    dbSlug: 'jll',
    name: 'JLL',
    kind: 'broker_site',
    feedUrl: 'https://jll.ca/',
  },
  {
    adapterSlug: 'cbre',
    dbSlug: 'cbre',
    name: 'CBRE',
    kind: 'broker_site',
    feedUrl: 'https://cbre.ca/',
  },
  {
    adapterSlug: 'colliers',
    dbSlug: 'colliers',
    name: 'Colliers',
    kind: 'broker_site',
    feedUrl: 'https://collierscanada.com/',
  },
];

export function resolveRunnableIntelSource(value: string): IntelSourceConfig | null {
  const normalized = value.trim().toLowerCase().replace(/-/g, '_');
  return (
    RUNNABLE_INTEL_SOURCE_CONFIGS.find(
      (source) => source.adapterSlug === normalized || source.dbSlug === value.trim().toLowerCase(),
    ) || null
  );
}

export async function ensureIntelSource(config: IntelSourceConfig): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    'select id from public.intel_sources where slug = $1 limit 1',
    [config.dbSlug],
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const inserted = await pool.query<{ id: string }>(
    `
      insert into public.intel_sources (name, slug, kind, feed_url, field_mapping, is_active)
      values ($1, $2, $3, $4, '{}'::jsonb, true)
      returning id
    `,
    [config.name, config.dbSlug, config.kind, config.feedUrl],
  );
  return inserted.rows[0].id;
}

async function recordFailedRun(params: {
  sourceId: string | null;
  triggerType: string;
  initiatedByUserId?: string | null;
  error: unknown;
}) {
  await pool.query(
    `
      insert into public.intel_ingest_runs (
        source_id,
        trigger_type,
        status,
        started_at,
        completed_at,
        error_message,
        initiated_by_user_id
      ) values ($1, $2, 'failed', now(), now(), $3, $4)
    `,
    [
      params.sourceId,
      params.triggerType,
      String((params.error as any)?.message || params.error || 'Unknown source run failure').slice(0, 2000),
      params.initiatedByUserId ?? null,
    ],
  );
}

export async function runIndustrialIntelSource(
  sourceSlug: string,
  options: { triggerType?: string; initiatedByUserId?: string | null } = {},
): Promise<ApplyNormalizedRecordsResult & { sourceSlug: RunnableIntelSourceSlug; sourceId: string }> {
  const config = resolveRunnableIntelSource(sourceSlug);
  if (!config) {
    throw new Error(`Unsupported industrial intel source: ${sourceSlug}`);
  }

  const triggerType = options.triggerType ?? 'manual_ui';
  let sourceId: string | null = null;

  try {
    sourceId = await ensureIntelSource(config);
    const result = await runSourceAdapter(config.adapterSlug, {
      sourceId,
      sourceSlug: config.adapterSlug,
      triggerType,
      initiatedByUserId: options.initiatedByUserId ?? null,
    });
    const applied = await applyNormalizedRecords(
      {
        sourceId,
        sourceSlug: config.adapterSlug,
        triggerType,
        initiatedByUserId: options.initiatedByUserId ?? null,
      },
      result,
    );

    return {
      ...applied,
      sourceSlug: config.adapterSlug,
      sourceId,
    };
  } catch (error) {
    await recordFailedRun({
      sourceId,
      triggerType,
      initiatedByUserId: options.initiatedByUserId,
      error,
    });
    throw error;
  }
}
