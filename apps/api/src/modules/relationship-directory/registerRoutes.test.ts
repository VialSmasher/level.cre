import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { SignJWT } from 'jose';
import { PGlite } from '@electric-sql/pglite';
import { BrokerSchema, registerRelationshipDirectory } from './registerRoutes';
import { createProspectContact } from '../../lib/prospectContactService';
test('directory persistence, ownership, validation, concurrent edits, and merged accounts', async (t) => {
    const db = new PGlite();
    t.after(() => db.close());
    const fixture = await readFile(new URL('../../lib/prospectContactService.test.ts', import.meta.url), 'utf8');
    const quote = String.fromCharCode(96);
    await db.exec(fixture.split('const schema = ' + quote)[1].split(quote + ';')[0]);
    await db.exec('ALTER TABLE prospects ADD COLUMN merge_event_id varchar; CREATE TABLE prospect_merge_events(id varchar,preview_hash varchar)');
    for (const migration of ['0021_prospect_contacts.sql', '0023_relationship_directory.sql']) {
        await db.exec(await readFile(new URL('../../../../../drizzle/' + migration, import.meta.url), 'utf8'));
    }
    let tail = Promise.resolve();
    async function acquire() {
        const previous = tail;
        let release!: () => void;
        tail = new Promise<void>(resolve => { release = resolve; });
        await previous;
        return release;
    }
    const pool: any = {
        async query(sql: string, values?: unknown[]) { const release = await acquire(); try {
            return await db.query(sql, values);
        }
        finally {
            release();
        } },
        async connect() { const release = await acquire(); return { query: (sql: string, values?: unknown[]) => db.query(sql, values), release }; },
    };
    const secret = randomUUID();
    process.env.SUPABASE_JWT_SECRET = secret;
    const token = async (id: string) => 'Bearer ' + await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(id)
        .setIssuer((process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'http://localhost').replace(/\/$/, '') + '/auth/v1')
        .setExpirationTime('5m').sign(new TextEncoder().encode(secret));
    const owner = await token('owner'), foreign = await token('foreign');
    const app = express();
    app.use(express.json());
    registerRelationshipDirectory(app, pool);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
    const url = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/api/desk/directory';
    const call = (path: string, auth = owner, body?: unknown) => fetch(url + path, { method: body === undefined ? 'GET' : 'PUT', headers: { Authorization: auth, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal((await call('', '')).status, 401);
    let response = await call('');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).companies.length, 2);
    const id = randomUUID(), relationshipId = randomUUID();
    const broker = { name: 'Test broker', firm: 'Cushman & Wakefield', email: 'broker@example.test', phone: '+1 780 555 0101', linkedinUrl: 'https://www.linkedin.com/in/test-broker', version: 0 };
    assert.equal(BrokerSchema.safeParse({ ...broker, linkedinUrl: 'not a url' }).success, false);
    assert.equal(BrokerSchema.safeParse({ ...broker, linkedinUrl: 'https://linkedin.com.evil.test/a' }).success, false);
    assert.equal((await call('/brokers/' + id, owner, { ...broker, userId: 'foreign' })).status, 400);
    assert.equal((await call('/brokers/' + id, owner, broker)).status, 200);
    assert.equal((await call('/brokers/' + id, foreign)).status, 404);
    assert.equal((await call('/brokers/' + id, foreign, { ...broker, version: 1 })).status, 409);
    const link = { brokerId: id, prospectId: 'account', status: 'historical', scope: 'Past local assignment', notes: 'Broker confirmed', sourceUrl: 'https://example.com/evidence', learnedOn: '2026-11-19', version: 0 };
    assert.equal((await call('/relationships/' + relationshipId, owner, link)).status, 200);
    assert.equal((await call('/relationships/' + randomUUID(), foreign, link)).status, 409);
    assert.equal((await call('/relationships/' + randomUUID(), owner, { ...link, prospectId: 'foreign-account' })).status, 409);
    assert.equal((await call('/relationships/' + randomUUID(), owner, link)).status, 409);
    assert.equal((await call('/relationships/' + relationshipId, owner, link)).status, 409);
    const contact = await createProspectContact({ pool, userId: 'owner', prospectId: 'account', input: { name: 'New contact', email: 'contact@example.test' } });
    assert.ok(contact.contacts.some(c => c.email === 'contact@example.test'));
    const company = await (await call('/companies/account')).json();
    assert.equal(company.relationships[0].brokerName, 'Test broker');
    assert.ok(company.contacts.some((c: any) => c.email === 'contact@example.test'));
    assert.equal((await call('/companies/foreign-account')).status, 404);
    const updates = await Promise.all([1, 2].map(n => call('/brokers/' + id, owner, { ...broker, name: 'Updated ' + n, version: 1 })));
    assert.deepEqual(updates.map(r => r.status).sort(), [200, 409]);
    const fresh = await (await call('/brokers/' + id)).json();
    assert.equal(fresh.broker.version, 2);
    assert.equal(fresh.relationships.length, 1);
    await db.exec("UPDATE prospects SET merged_into_prospect_id='other-account' WHERE id='account'");
    const merged = await (await call('/companies/account')).json();
    assert.equal(merged.prospect.id, 'other-account');
    assert.equal(merged.relationships.length, 1);
    assert.equal((await call('/relationships/' + relationshipId, owner, { ...link, status: 'ended', version: 1 })).status, 200);
    assert.equal((await call('/relationships/' + relationshipId, owner, { ...link, version: 2, archived: true })).status, 200);
    assert.equal((await (await call('/brokers/' + id)).json()).relationships.length, 0);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query('SELECT * FROM directory_brokers'), /permission denied/);
    await assert.rejects(db.query('SELECT * FROM directory_relationships'), /permission denied/);
});
