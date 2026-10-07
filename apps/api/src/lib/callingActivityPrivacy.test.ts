import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

import { canViewCallingInteraction, excludePrivateCallingSql } from './callingActivityPrivacy';
import { buildPublicPursuitSnapshot } from './pursuitPublicShareService';

test('public snapshots and shared pursuit counts exclude private phone-link calls; owners retain theirs', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE contact_interactions (id text PRIMARY KEY, user_id text, prospect_id text, source_provider text,
        date text, type text, outcome text);
      CREATE TABLE activity_events (interaction_id text, source text);
      INSERT INTO contact_interactions VALUES
        ('legacy', 'broker-b', 'prospect', NULL, '2026-10-01', 'email', 'contacted'),
        ('mine', 'broker-a', 'prospect', 'level_cre_mobile', '2026-10-03', 'call', 'attempted'),
        ('theirs', 'broker-b', 'prospect', 'level_cre_mobile', '2026-10-04', 'call', 'attempted'),
        ('ledger-only', 'broker-b', 'prospect', NULL, '2026-10-05', 'call', 'attempted'),
        ('unrelated', 'broker-b', 'other', NULL, '2026-10-06', 'email', 'contacted');
      INSERT INTO activity_events VALUES ('ledger-only', 'level_cre_mobile_calling');
    `);
    const publicRows = await db.query<any>(`SELECT ci.* FROM contact_interactions ci
      WHERE ci.prospect_id = $1 AND ${excludePrivateCallingSql('ci')}
      ORDER BY ci.date DESC LIMIT 1`, ['prospect']);
    assert.deepEqual(publicRows.rows.map((row) => row.id), ['legacy']);
    const publicSnapshot = buildPublicPursuitSnapshot({ listing: { title: 'Shared pursuit' }, prospects: [],
      interactions: publicRows.rows, generatedAt: '2026-10-07T12:00:00.000Z' });
    assert.equal(publicSnapshot.summary.activityCount, 1);
    const visibleRows = await db.query<any>(`SELECT ci.* FROM contact_interactions ci
      WHERE ci.prospect_id = $1 AND (ci.user_id = $2 OR ${excludePrivateCallingSql('ci')})
      ORDER BY ci.date`, ['prospect', 'broker-a']);
    assert.deepEqual(visibleRows.rows.map((row) => row.id), ['legacy', 'mine']);
    const allRows = await db.query<any>('SELECT * FROM contact_interactions WHERE prospect_id = $1 ORDER BY date', ['prospect']);
    const fallback = allRows.rows.filter((row) => canViewCallingInteraction(row, 'broker-a', new Set(['ledger-only'])));
    assert.deepEqual(fallback.map((row) => row.id), visibleRows.rows.map((row) => row.id));
    const aggregate = await db.query<any>(`SELECT COUNT(*)::int AS count, MAX(ci.date) AS last FROM contact_interactions ci
      WHERE ci.prospect_id = $1 AND (ci.user_id = $2 OR ${excludePrivateCallingSql('ci')})`, ['prospect', 'broker-a']);
    assert.deepEqual(aggregate.rows[0], { count: 2, last: '2026-10-03' });
  } finally { await db.close(); }
});

test('the privacy SQL alias accepts only a code-owned identifier', () => {
  assert.throws(() => excludePrivateCallingSql('ci; SELECT 1'), /Invalid/);
});
