import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { classificationMetadataPatch, metadataPatchPreservingPropertyLinks } from './propertyClassificationPatch'

test('classification writes preserve current ingestion metadata and resetting restores the source', async () => {
  const db = new PGlite()
  const dialect = new PgDialect()
  try {
    await db.exec("CREATE TABLE assets(id text primary key, metadata jsonb); INSERT INTO assets VALUES ('one', null)")
    const apply = async (value: 'single_tenant' | 'unknown' | null) => {
      const query = dialect.sqlToQuery(sql`UPDATE assets SET metadata = ${classificationMetadataPatch(sql`metadata`, value, 'broker-id')} WHERE id = 'one' RETURNING metadata`)
      return (await db.query<{metadata: any}>(query.sql, query.params)).rows[0].metadata
    }
    assert.equal((await apply('single_tenant')).propertyClassification.classification, 'single_tenant')
    await db.exec(`UPDATE assets SET metadata = metadata || '{"propertyInventory":{"classification":"multi_tenant","titleRecords":[{"titleNumber":"00123"}]},"agentReceipt":"new"}'::jsonb`)
    const correction = await apply('unknown')
    assert.equal(correction.agentReceipt, 'new')
    assert.equal(correction.propertyInventory.classification, 'multi_tenant')
    assert.equal(correction.propertyClassification.reviewedBy, 'broker-id')
    const restored = await apply(null)
    assert.equal(restored.propertyClassification, undefined)
    assert.equal(restored.propertyInventory.titleRecords[0].titleNumber, '00123')
    assert.equal(restored.agentReceipt, 'new')
  } finally { await db.close() }
})

test('generic metadata replacement preserves validated links, handles null, and cannot inject a link', async () => {
  const db = new PGlite(), dialect = new PgDialect()
  try {
    await db.exec("CREATE TABLE assets(metadata jsonb); INSERT INTO assets VALUES (null)")
    const apply = async (value: Record<string,unknown> | null) => {
      const query = dialect.sqlToQuery(sql`UPDATE assets SET metadata=${metadataPatchPreservingPropertyLinks(sql`metadata`,value)} RETURNING metadata`)
      return (await db.query<{metadata:any}>(query.sql,query.params)).rows[0].metadata
    }
    assert.equal(await apply(null),null)
    assert.deepEqual(await apply({source:'keep',propertyLink:{propertyProspectId:'injected'}}),{source:'keep'})
    await db.exec(`UPDATE assets SET metadata='{"propertyLink":{"propertyProspectId":"building"},"propertyLinkHistory":[{"previous":null}],"old":"source"}'::jsonb`)
    assert.deepEqual(await apply({source:'new'}),{source:'new',propertyLink:{propertyProspectId:'building'},propertyLinkHistory:[{previous:null}]})
    const cleared=await apply(null)
    assert.equal(cleared.propertyLink.propertyProspectId,'building')
    assert.equal(cleared.propertyLinkHistory.length,1)
    assert.equal(Array.isArray(cleared),false)
  } finally {await db.close()}
})
