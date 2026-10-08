import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { contactIdentityKey } from './phoneReadiness';

const searchTokens = (query: string) => [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))];
export const CallingSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120).refine((value) => searchTokens(value).length <= 8, 'Use eight or fewer search words.'),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
}).strict();
export type CallingSearchQuery = z.infer<typeof CallingSearchQuerySchema>;
export type CallingSearchRow = {
  companyName: string | null;
  prospect: { id: string; name: string | null; businessName: string | null; address: string | null; status: string | null };
  contact: { id: string | null; isPrimary: boolean; name: string | null; company: string | null;
    email: string | null; phone: string | null; title: string | null; hasAdditionalPhones: boolean };
};
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

/** Read-only discovery across saved accounts, independent of queue size or today's calls.
 * Primary scalars are authoritative. A missing/stale anchor is returned as a null
 * primary ID; the selected workspace reconciles it and checks the saved identity.
 * Every token must match the SAME contact/account row. strpos treats % and _ as
 * literal text; neither user input nor a requested user ID becomes SQL authority.
 */
export async function searchCallingContacts(params: {
  pool: Pick<Pool | PoolClient, 'query'>; userId: string; input: CallingSearchQuery;
}): Promise<{ query: string; rows: CallingSearchRow[]; hasMore: boolean }> {
  const input = CallingSearchQuerySchema.parse(params.input);
  const result = await params.pool.query(`WITH accounts AS (
    SELECT id,user_id,name,business_name,address,status,contact_name,contact_company,contact_email,contact_phone
    FROM public.prospects AS prospect
    WHERE user_id=$1 AND merged_into_prospect_id IS NULL
      AND status IS DISTINCT FROM 'no_go' AND status IS DISTINCT FROM 'archived'
      AND NULLIF(to_jsonb(prospect)->>'archived_at','') IS NULL
  ), targets AS (
    SELECT account.id AS prospect_id,account.name AS prospect_name,account.business_name,account.address,account.status,
      account.contact_company AS account_company,contact.id AS contact_id,true AS is_primary,
      contact.identity_key AS primary_anchor_identity,account.contact_name,account.contact_company,
      account.contact_email AS contact_email,account.contact_phone AS contact_phone,contact.title,contact.additional_phones
    FROM accounts AS account LEFT JOIN public.prospect_contacts AS contact
      ON contact.user_id=$1 AND contact.prospect_id=account.id AND contact.is_primary=true AND contact.archived_at IS NULL
    UNION ALL
    SELECT account.id,account.name,account.business_name,account.address,account.status,
      account.contact_company,contact.id,false,NULL::text,contact.name,contact.company,contact.email,contact.phone,contact.title,contact.additional_phones
    FROM accounts AS account JOIN public.prospect_contacts AS contact
      ON contact.user_id=$1 AND contact.prospect_id=account.id AND contact.is_primary=false AND contact.archived_at IS NULL
  )
  SELECT * FROM targets
  WHERE NOT EXISTS (
    SELECT 1 FROM unnest($2::text[]) AS token
    WHERE strpos(lower(concat_ws(' ',prospect_name,business_name,account_company,contact_name,contact_company,contact_email)),token)=0
  )
  ORDER BY lower(COALESCE(NULLIF(business_name,''),NULLIF(account_company,''),prospect_name,'')),
    prospect_id,is_primary DESC,lower(COALESCE(contact_name,'')),contact_id NULLS FIRST
  LIMIT $3`, [params.userId, searchTokens(input.q), input.limit + 1]);
  const rows: CallingSearchRow[] = result.rows.slice(0, input.limit).map((row) => {
    const currentPrimary = !row.is_primary || row.primary_anchor_identity === contactIdentityKey(row);
    return { companyName:text(row.business_name) || text(row.account_company) || text(row.prospect_name),
      prospect: {id:row.prospect_id,name:text(row.prospect_name),businessName:text(row.business_name),address:text(row.address),status:text(row.status)},
      contact: {id:currentPrimary ? row.contact_id || null : null,isPrimary:row.is_primary,
        name:text(row.contact_name),company:text(row.contact_company),email:text(row.contact_email),phone:text(row.contact_phone),
        title:currentPrimary ? text(row.title) : null,
        hasAdditionalPhones:currentPrimary && Array.isArray(row.additional_phones) && row.additional_phones.some((phone:any)=>Boolean(text(phone?.number)))} };
  });
  return {query:input.q,rows,hasMore:result.rows.length > input.limit};
}