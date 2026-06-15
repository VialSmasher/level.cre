import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import pg from 'pg';

const { Client } = pg;

const MIGRATIONS = [
  '../../drizzle/0003_industrial_intel_core.sql',
  '../../drizzle/0004_industrial_intel_requirements.sql',
  '../../drizzle/0005_industrial_intel_land_fields.sql',
  '../../drizzle/0006_industrial_intel_map_fields.sql',
  '../../drizzle/0008_industrial_intel_shortlist_decisions.sql',
  '../../drizzle/0009_industrial_intel_surveys.sql',
  '../../drizzle/0010_industrial_intel_public_links.sql',
  '../../drizzle/0011_industrial_intel_survey_events.sql',
  '../../drizzle/0012_industrial_intel_listing_assets.sql',
  '../../drizzle/0013_industrial_intel_property_dossiers.sql',
  '../../drizzle/0014_industrial_intel_agent_events.sql',
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    for (const relativePath of MIGRATIONS) {
      const absolutePath = path.resolve(process.cwd(), relativePath);
      const sqlText = await fs.readFile(absolutePath, 'utf8');
      await client.query(sqlText);
      console.log(`Applied SQL from ${relativePath}`);
    }
  } catch (err) {
    console.error('Failed to apply Industrial Intel migrations:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
