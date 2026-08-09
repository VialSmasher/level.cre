import 'dotenv/config'
import { createHash } from 'crypto'
import fs from 'fs/promises'
import pg from 'pg'

const { Client } = pg
const migrationNames = [
  '0018_brokerage_memory.sql',
  '0019_prospect_merge.sql',
]

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, ['levelcre-schema-migrations'])
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.levelcre_schema_migrations (
        filename text PRIMARY KEY,
        checksum varchar NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    // The ledger controls whether schema changes run. Keep it out of direct
    // client access even when the canonical database exposes the public schema.
    await client.query('ALTER TABLE public.levelcre_schema_migrations ENABLE ROW LEVEL SECURITY')
    await client.query('REVOKE ALL ON TABLE public.levelcre_schema_migrations FROM PUBLIC')
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          EXECUTE 'REVOKE ALL ON TABLE public.levelcre_schema_migrations FROM anon';
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          EXECUTE 'REVOKE ALL ON TABLE public.levelcre_schema_migrations FROM authenticated';
        END IF;
      END $$
    `)
    for (const migrationName of migrationNames) {
      const migrationUrl = new URL(`../../../drizzle/${migrationName}`, import.meta.url)
      const sql = await fs.readFile(migrationUrl, 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      const existing = await client.query(
        `SELECT checksum, applied_at FROM public.levelcre_schema_migrations WHERE filename = $1 LIMIT 1`,
        [migrationName],
      )
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`${migrationName} was already applied with a different checksum`)
        }
        console.log(`${migrationName} already applied at ${existing.rows[0].applied_at}`)
        continue
      }

      await client.query(sql)
      await client.query(
        `INSERT INTO public.levelcre_schema_migrations (filename, checksum) VALUES ($1, $2)`,
        [migrationName, checksum],
      )
      console.log(`Applied ${migrationName} (${checksum})`)
    }

    // Older API instances created this legacy unique index on dossier reads.
    // Reassert the migrated invariant on every deployment before the API starts.
    await client.query('DROP INDEX IF EXISTS public.uq_intel_property_dossiers_user_address')
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_intel_property_dossiers_user_address
      ON public.intel_property_dossiers (created_by_user_id, normalized_address)
      WHERE normalized_address IS NOT NULL
    `)
    await client.query('COMMIT')
    console.log('Level CRE brokerage-memory migrations are current')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('Failed to apply brokerage-memory migration:', error?.message || error)
  process.exitCode = 1
})
