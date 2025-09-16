import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

let pool: Pool | undefined;
let db: ReturnType<typeof drizzle> | undefined;

// Lazy initialization function
export function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  
  if (!db) {
    db = drizzle({ client: pool, schema });
  }
  
  return { pool, db };
}

// Export getter functions for backward compatibility
export function getPool() {
  if (!pool) {
    initializeDatabase();
  }
  return pool!;
}

export function getDb() {
  if (!db) {
    initializeDatabase();
  }
  return db!;
}

// Legacy exports for backward compatibility
export { getDb as db };