import { Client } from 'pg';

function extractFirstInteger(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace(/,/g, '');

  const kMatch = normalized.match(/(-?\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) {
    const n = Number.parseFloat(kMatch[1]);
    if (Number.isFinite(n)) return Math.round(n * 1000);
  }

  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number.parseFloat(match[0]);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function extractFirstDecimal(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace(/,/g, '');

  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number.parseFloat(match[0]);
  if (!Number.isFinite(n)) return null;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE public.prospects
      ADD COLUMN IF NOT EXISTS building_sf integer,
      ADD COLUMN IF NOT EXISTS lot_size_acres numeric(10,2),
      ADD COLUMN IF NOT EXISTS ai_metadata jsonb
    `);

    const colRes = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'prospects'
    `);
    const columns = new Set(colRes.rows.map((r) => r.column_name));
    const sizeSourceCol = columns.has('legacy_size') ? 'legacy_size' : (columns.has('size') ? 'size' : null);
    const acresSourceCol = columns.has('legacy_acres') ? 'legacy_acres' : (columns.has('acres') ? 'acres' : null);

    const selectSql = `
      SELECT
        id,
        building_sf,
        lot_size_acres,
        ${sizeSourceCol ? `"${sizeSourceCol}"` : 'NULL::text'} AS source_size,
        ${acresSourceCol ? `"${acresSourceCol}"` : 'NULL::text'} AS source_acres
      FROM public.prospects
    `;

    const res = await client.query(selectSql);
    let updated = 0;

    for (const row of res.rows) {
      const nextBuildingSf =
        row.building_sf !== null && row.building_sf !== undefined
          ? Number(row.building_sf)
          : extractFirstInteger(row.source_size);
      const nextLotSize =
        row.lot_size_acres !== null && row.lot_size_acres !== undefined
          ? Number(row.lot_size_acres)
          : extractFirstDecimal(row.source_acres);

      if (nextBuildingSf === null && nextLotSize === null) continue;

      await client.query(
        `
          UPDATE public.prospects
          SET
            building_sf = COALESCE($2, building_sf),
            lot_size_acres = COALESCE($3, lot_size_acres)
          WHERE id = $1
        `,
        [row.id, nextBuildingSf, nextLotSize]
      );
      updated += 1;
    }

    await client.query('COMMIT');
    console.log(`Prospect numeric migration complete. Updated rows: ${updated}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
