import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
const { Pool } = pg;
import * as schema from '@level-cre/shared/schema';

const demoOrDevMode =
  process.env.DEMO_MODE === '1' ||
  process.env.VITE_DEMO_MODE === '1' ||
  process.env.NODE_ENV === 'development';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl && !demoOrDevMode) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

const fallbackDemoUrl = 'postgresql://demo:demo@127.0.0.1:5432/demo';
export const pool = new Pool({
  connectionString: databaseUrl || fallbackDemoUrl,
  ...(databaseUrl ? { ssl: { rejectUnauthorized: false } } : {}),
});
export const db = drizzle(pool, { schema });
