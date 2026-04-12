import { pool } from '../src/db';
import { applyNormalizedRecords } from '../src/modules/industrial-intel/ingest/applyNormalizedRecords';
import { runSourceAdapter } from '../src/modules/industrial-intel/ingest/runSource';
import type { IntelSourceAdapterSlug } from '../src/modules/industrial-intel/ingest/types';

const SOURCE_CONFIG: Record<IntelSourceAdapterSlug, { name: string; slug: string; kind: string; feedUrl: string | null }> = {
  cwedm: {
    name: 'Cushman & Wakefield Edmonton',
    slug: 'cwedm',
    kind: 'broker_site',
    feedUrl: 'https://cwedm.com/',
  },
  nai_edmonton: {
    name: 'NAI Commercial Edmonton',
    slug: 'nai-edmonton',
    kind: 'broker_site',
    feedUrl: 'https://naiedmonton.com/',
  },
  avison_young: {
    name: 'Avison Young',
    slug: 'avison-young',
    kind: 'broker_site',
    feedUrl: 'https://avisonyoung.ca/',
  },
  jll: {
    name: 'JLL',
    slug: 'jll',
    kind: 'broker_site',
    feedUrl: 'https://jll.ca/',
  },
  cbre: {
    name: 'CBRE',
    slug: 'cbre',
    kind: 'broker_site',
    feedUrl: 'https://cbre.ca/',
  },
  colliers: {
    name: 'Colliers',
    slug: 'colliers',
    kind: 'broker_site',
    feedUrl: 'https://collierscanada.com/',
  },
};

async function ensureSource(slug: IntelSourceAdapterSlug): Promise<string> {
  const config = SOURCE_CONFIG[slug];
  const existing = await pool.query<{ id: string }>(
    'select id from public.intel_sources where slug = $1 limit 1',
    [config.slug],
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const inserted = await pool.query<{ id: string }>(
    `
      insert into public.intel_sources (name, slug, kind, feed_url, field_mapping, is_active)
      values ($1, $2, $3, $4, '{}'::jsonb, true)
      returning id
    `,
    [config.name, config.slug, config.kind, config.feedUrl],
  );
  return inserted.rows[0].id;
}

async function main() {
  const slug = process.argv[2] as IntelSourceAdapterSlug | undefined;
  if (!slug || !(slug in SOURCE_CONFIG)) {
    throw new Error(`Usage: run-industrial-intel-source.ts <${Object.keys(SOURCE_CONFIG).join('|')}>`);
  }

  const sourceId = await ensureSource(slug);
  const result = await runSourceAdapter(slug, { sourceId, sourceSlug: slug, triggerType: 'manual_script' });
  const applied = await applyNormalizedRecords({ sourceId, sourceSlug: slug, triggerType: 'manual_script' }, result);
  console.log(JSON.stringify({ slug, sourceId, applied }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
