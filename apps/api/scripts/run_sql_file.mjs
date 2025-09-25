import 'dotenv/config';
import fs from 'fs/promises';
import pg from 'pg';

const { Client } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  const file = process.argv[2];
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  if (!file) {
    console.error('Usage: node run_sql_file.mjs <path-to-sql-file>');
    process.exit(1);
  }

  const sqlText = await fs.readFile(file, 'utf8');

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query(sqlText);
    console.log(`Applied SQL from ${file}`);
  } catch (err) {
    console.error('Failed to apply SQL:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
