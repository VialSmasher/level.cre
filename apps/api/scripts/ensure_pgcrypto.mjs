import pg from 'pg';

const { Client } = pg;

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
    console.log('pgcrypto extension ensured');
  } catch (err) {
    console.error('Failed to ensure pgcrypto:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();

