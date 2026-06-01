import { pool } from '../src/db';
import { RUNNABLE_INTEL_SOURCE_CONFIGS, runIndustrialIntelSource } from '../src/modules/industrial-intel/sourceRegistry';

async function main() {
  const slug = process.argv[2];
  const supported = RUNNABLE_INTEL_SOURCE_CONFIGS.map((source) => source.adapterSlug).join('|');
  if (!slug) {
    throw new Error(`Usage: run-industrial-intel-source.ts <${supported}>`);
  }

  const applied = await runIndustrialIntelSource(slug, { triggerType: 'manual_script' });
  console.log(JSON.stringify({ slug, sourceId: applied.sourceId, applied }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
