import fs from 'node:fs/promises'
import pg from 'pg'
import { importPropertyInventory } from '../../apps/api/src/lib/propertyInventoryImport'

const args = process.argv.slice(2)
const option = (key: string) => args[args.indexOf(key) + 1]
const inputPath = args.includes('--input') ? option('--input') : null
const reportPath = args.includes('--report') ? option('--report') : null
const userId = process.env.LEVELCRE_USER_ID
if (!inputPath || !reportPath || !userId || !process.env.DATABASE_URL) throw Error('Supply --input, --report, LEVELCRE_USER_ID and DATABASE_URL. Add --apply only after reviewing the dry run.')
const input = JSON.parse(await fs.readFile(inputPath, 'utf8'))
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false } })
try {
  const result = await importPropertyInventory(pool, userId, input, args.includes('--apply'))
  await fs.writeFile(reportPath, JSON.stringify(result, null, 2))
  console.log(JSON.stringify({applied:result.applied,records:result.records,created:result.created,updated:result.updated,unchanged:result.unchanged}))
} finally { await pool.end() }
