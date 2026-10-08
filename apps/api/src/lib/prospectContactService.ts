import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { derivePhoneReadiness, contactIdentityKey } from './phoneReadiness';

type Queryable = Pick<PoolClient, 'query'>;
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
export const AdditionalPhoneSchema = z.object({ label: z.string().trim().min(1).max(40), number: z.string().trim().min(3).max(80) }).strict();
const contactFields = {
  name: optionalText(240), company: optionalText(240),
  email: z.union([z.string().trim().email().max(320), z.literal(''), z.null()]).optional(),
  phone: optionalText(80), title: optionalText(240),
  additionalPhones: z.array(AdditionalPhoneSchema).max(5).optional(),
};
export const ProspectContactCreateSchema = z.object({ ...contactFields, name: z.string().trim().min(1).max(240) }).strict();
export const ProspectContactUpdateSchema = z.object({ ...contactFields, archived: z.boolean().optional() }).strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide a contact change.');
export type ProspectContactCreate = z.infer<typeof ProspectContactCreateSchema>;
export type ProspectContactUpdate = z.infer<typeof ProspectContactUpdateSchema>;
export type ProspectContact = {
  id: string; prospectId: string; isPrimary: boolean; name: string | null; company: string | null;
  email: string | null; phone: string | null; title: string | null;
  additionalPhones: Array<{ label: string; number: string }>; archivedAt: string | null;
};
export class ProspectContactError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'ProspectContactError'; }
}
const clean = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const dateText = (value: any) => value instanceof Date ? value.toISOString() : value || null;
export const primaryContactIdentity = contactIdentityKey;
function dto(row: Record<string, any>): ProspectContact {
  return { id: row.id, prospectId: row.prospect_id, isPrimary: row.is_primary,
    name: clean(row.name), company: clean(row.company), email: clean(row.email), phone: clean(row.phone), title: clean(row.title),
    additionalPhones: Array.isArray(row.additional_phones) ? row.additional_phones : [], archivedAt: dateText(row.archived_at) };
}
export async function requireContactProspect(db: Queryable, userId: string, prospectId: string) {
  const { rows } = await db.query('SELECT * FROM public.prospects WHERE id=$1 AND user_id=$2 FOR UPDATE', [prospectId, userId]);
  const prospect = rows[0];
  if (!prospect) throw new ProspectContactError(404, 'prospect_not_found', 'Prospect was not found for the signed-in broker.');
  if (prospect.merged_into_prospect_id) throw new ProspectContactError(409, 'prospect_merged', 'This record has been consolidated. Open the surviving record.');
  return prospect;
}

/** Caller holds the owned prospect row lock. Scalars are authoritative; rows are durable identity snapshots. */
export async function reconcilePrimaryContact(db: Queryable, userId: string, prospect: Record<string, any>) {
  const identity = primaryContactIdentity(prospect);
  const { rows } = await db.query(`SELECT * FROM public.prospect_contacts
    WHERE user_id=$1 AND prospect_id=$2 AND is_primary=true AND archived_at IS NULL FOR UPDATE`, [userId, prospect.id]);
  let primary = rows[0];
  if (primary && primary.identity_key !== identity) {
    await db.query(`UPDATE public.prospect_contacts SET is_primary=false,archived_at=now(),updated_at=now()
      WHERE id=$1 AND user_id=$2`, [primary.id, userId]);
    primary = null;
  }
  const values = [userId, prospect.id, clean(prospect.contact_name), clean(prospect.contact_company), clean(prospect.contact_email), clean(prospect.contact_phone), identity];
  if (!primary) {
    const inserted = await db.query(`INSERT INTO public.prospect_contacts
      (id,user_id,prospect_id,is_primary,source,name,company,email,phone,identity_key)
      VALUES ($8,$1,$2,true,'legacy_primary',$3,$4,$5,$6,$7) RETURNING *`, [...values, randomUUID()]);
    primary = inserted.rows[0];
  } else if (['name','company','email','phone'].some((key, index) => clean(primary[key]) !== values[index + 2])) {
    const updated = await db.query(`UPDATE public.prospect_contacts SET name=$3,company=$4,email=$5,phone=$6,identity_key=$7,updated_at=now()
      WHERE id=$8 AND user_id=$1 AND prospect_id=$2 RETURNING *`, [...values, primary.id]);
    primary = updated.rows[0];
  }
  return dto(primary);
}

export async function listProspectContacts(db: Queryable, userId: string, prospect: Record<string, any>) {
  await reconcilePrimaryContact(db, userId, prospect);
  const { rows } = await db.query(`SELECT * FROM public.prospect_contacts WHERE user_id=$1 AND prospect_id=$2 AND archived_at IS NULL
    ORDER BY is_primary DESC,created_at ASC,id ASC`, [userId, prospect.id]);
  return rows.map(dto);
}

async function workspace(db: Queryable, userId: string, prospect: Record<string, any>, contactId?: string) {
  const contacts = await listProspectContacts(db, userId, prospect);
  if (contactId) {
    const exists = await db.query('SELECT id FROM public.prospect_contacts WHERE id=$1 AND user_id=$2 AND prospect_id=$3', [contactId, userId, prospect.id]);
    if (!exists.rows[0]) throw new ProspectContactError(404, 'contact_not_found', 'Contact was not found on this record.');
  }
  const [history, counts] = await Promise.all([
    db.query(`SELECT id,type,outcome,date::text AS occurred_at,notes,source_metadata FROM public.contact_interactions
      WHERE user_id=$1 AND prospect_id=$2 AND ($3::varchar IS NULL OR source_metadata->>'contactId'=$3)
      ORDER BY CASE WHEN date::text ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])($|[T ])'
        THEN date::text END DESC NULLS LAST,created_at DESC,id DESC LIMIT 100`, [userId, prospect.id, contactId || null]),
    db.query(`SELECT COUNT(*)::int AS count FROM public.contact_interactions
      WHERE user_id=$1 AND prospect_id=$2 AND NULLIF(source_metadata->>'contactId','') IS NULL`, [userId, prospect.id]),
  ]);
  return {
    prospect: { id: prospect.id, name: prospect.name, status: prospect.status, address: prospect.address || null,
      businessName: prospect.business_name || null, notes: prospect.notes || '', websiteUrl: prospect.website_url || null,
      lastContactDate: dateText(prospect.last_contact_date), followUpDueDate: dateText(prospect.follow_up_due_date),
      buildingSf: prospect.building_sf ?? null, lotSizeAcres: prospect.lot_size_acres ?? null, aiMetadata: prospect.ai_metadata || null },
    contacts, primaryContactId: contacts.find((contact) => contact.isPrimary)!.id, phoneReadiness: derivePhoneReadiness(prospect, contacts),
    activity: history.rows.map((row) => ({ id: row.id, type: row.type, outcome: row.outcome, occurredAt: row.occurred_at,
      notes: row.notes || '', contactId: row.source_metadata?.contactId || null,
      contactName: row.source_metadata?.contactSnapshot?.name || row.source_metadata?.contactName || null,
      phoneSnapshot: row.source_metadata?.phoneSnapshot || null,
      subject: clean(row.source_metadata?.subject), email: clean(row.source_metadata?.email),
      direction: (['inbound','outbound','internal'].includes(row.source_metadata?.direction) ? row.source_metadata.direction : null) as 'inbound' | 'outbound' | 'internal' | null,
      evidenceStatus: (['confirmed','observed','inferred'].includes(row.source_metadata?.evidenceStatus) ? row.source_metadata.evidenceStatus : null) as 'confirmed' | 'observed' | 'inferred' | null })),
    unattributedActivityCount: Number(counts.rows[0]?.count || 0),
  };
}
async function transaction<T>(pool: Pool, action: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await action(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function getCallingWorkspace(params: { pool: Pool; userId: string; prospectId: string; contactId?: string }) {
  return transaction(params.pool, async (client) => workspace(client, params.userId, await requireContactProspect(client, params.userId, params.prospectId), params.contactId));
}
export async function createProspectContact(params: { pool: Pool; userId: string; prospectId: string; input: ProspectContactCreate }) {
  return transaction(params.pool, async (client) => {
    const prospect = await requireContactProspect(client, params.userId, params.prospectId);
    await reconcilePrimaryContact(client, params.userId, prospect);
    const input = params.input;
    await client.query(`INSERT INTO public.prospect_contacts
      (id,user_id,prospect_id,source,name,company,email,phone,title,additional_phones,identity_key)
      VALUES ($1,$2,$3,'broker_added',$4,$5,$6,$7,$8,$9::jsonb,$10)`,
    [randomUUID(), params.userId, prospect.id, input.name, clean(input.company), clean(input.email), clean(input.phone), clean(input.title), JSON.stringify(input.additionalPhones || []), primaryContactIdentity({contact_name:input.name,contact_email:input.email,contact_phone:input.phone})]);
    return workspace(client, params.userId, prospect);
  });
}
export async function updateProspectContact(params: { pool: Pool; userId: string; prospectId: string; contactId: string; input: ProspectContactUpdate }) {
  return transaction(params.pool, async (client) => {
    let prospect = await requireContactProspect(client, params.userId, params.prospectId);
    await reconcilePrimaryContact(client, params.userId, prospect);
    const result = await client.query('SELECT * FROM public.prospect_contacts WHERE id=$1 AND user_id=$2 AND prospect_id=$3 FOR UPDATE', [params.contactId, params.userId, prospect.id]);
    const row = result.rows[0];
    if (!row || row.archived_at) throw new ProspectContactError(404, 'contact_not_found', 'Contact was not found on this record.');
    const input = params.input;
    if (row.is_primary) {
      if (input.archived !== undefined) throw new ProspectContactError(400, 'primary_contact_archive', 'The saved primary contact cannot be archived here.');
      const updates = [['name', 'contact_name'], ['company', 'contact_company'], ['email', 'contact_email'], ['phone', 'contact_phone']] as const;
      const fields: string[] = []; const values: any[] = [prospect.id, params.userId];
      for (const [key, column] of updates) if (Object.prototype.hasOwnProperty.call(input, key)) { values.push(clean(input[key])); fields.push(`${column}=$${values.length}`); }
      if (fields.length) {
        const updated = await client.query(`UPDATE public.prospects SET ${fields.join(',')},updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *`, values);
        prospect = updated.rows[0];
      }
      // Name/email change creates a new relationship; apply explicitly supplied phone options/title to that new identity.
      const primary = await reconcilePrimaryContact(client, params.userId, prospect);
      const fields2: string[] = []; const values2: any[] = [primary.id, params.userId];
      if (input.title !== undefined) { values2.push(clean(input.title)); fields2.push(`title=$${values2.length}`); }
      if (input.additionalPhones !== undefined) { values2.push(JSON.stringify(input.additionalPhones)); fields2.push(`additional_phones=$${values2.length}::jsonb`); }
      if (fields2.length) await client.query(`UPDATE public.prospect_contacts SET ${fields2.join(',')},updated_at=now() WHERE id=$1 AND user_id=$2`, values2);
    } else {
      const next = Object.fromEntries(['name','company','email','phone','title'].map((key) => [key, Object.prototype.hasOwnProperty.call(input,key) ? clean((input as any)[key]) : row[key]]));
      const previousIdentity = primaryContactIdentity({contact_name:row.name,contact_email:row.email,contact_phone:row.phone});
      const nextIdentity = primaryContactIdentity({contact_name:next.name,contact_email:next.email,contact_phone:next.phone});
      if (!next.name) throw new ProspectContactError(400, 'contact_name_required', 'Additional contacts need a name.');
      if (input.archived !== true && nextIdentity !== previousIdentity) {
        await client.query('UPDATE public.prospect_contacts SET archived_at=now(),updated_at=now() WHERE id=$1 AND user_id=$2', [row.id,params.userId]);
        await client.query(`INSERT INTO public.prospect_contacts (id,user_id,prospect_id,source,name,company,email,phone,title,additional_phones,identity_key)
          VALUES ($1,$2,$3,'broker_added',$4,$5,$6,$7,$8,$9::jsonb,$10)`,
        [randomUUID(),params.userId,prospect.id,next.name,next.company,next.email,next.phone,input.title === undefined ? null : next.title,JSON.stringify(input.additionalPhones || []),nextIdentity]);
        return workspace(client,params.userId,prospect);
      }
      const fields: string[] = []; const values: any[] = [row.id, params.userId, prospect.id];
      for (const key of ['name','company','email','phone','title'] as const) if (Object.prototype.hasOwnProperty.call(input, key)) {
        if (key === 'name' && !clean(input.name)) throw new ProspectContactError(400, 'contact_name_required', 'Additional contacts need a name.');
        values.push(clean(input[key])); fields.push(`${key}=$${values.length}`);
      }
      if (input.additionalPhones !== undefined) { values.push(JSON.stringify(input.additionalPhones)); fields.push(`additional_phones=$${values.length}::jsonb`); }
      if (input.archived === true) fields.push('archived_at=now()');
      if (fields.length) await client.query(`UPDATE public.prospect_contacts SET ${fields.join(',')},updated_at=now() WHERE id=$1 AND user_id=$2 AND prospect_id=$3`, values);
    }
    return workspace(client, params.userId, prospect);
  });
}
