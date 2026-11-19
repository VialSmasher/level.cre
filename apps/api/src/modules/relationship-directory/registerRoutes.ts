import type { Express, Request, Response, RequestHandler } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { getUserId, requireBrokerAuth, requireAccountIntelligenceAuth } from '../../auth';
import { coverage, FindingSchema, recordFinding, reviewFinding } from './findings';
import { getCallingWorkspace, ProspectContactError } from '../../lib/prospectContactService';
import { resolveCanonicalProspect, ProspectMergeServiceError } from '../../lib/prospectMergeService';
import { industrialIntelAgentManifest } from '../industrial-intel/agentManifest';
const text = (length: number) => z.string().trim().max(length).default('');
const url = z.union([z.literal(''), z.string().url().max(2000).refine(value => {
        try {
            const parsed = new URL(value);
            return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
        }
        catch {
            return false;
        }
    }, 'Use an HTTPS link.')]).default('');
export const BrokerSchema = z.object({
    name: z.string().trim().min(1).max(240),
    firm: z.string().trim().min(1).max(240),
    office: text(240),
    email: z.union([z.literal(''), z.string().trim().email().max(320)]).default(''),
    phone: text(80),
    linkedinUrl: url.refine(value => {
        try {
            return !value || /(^|\.)linkedin\.com$/i.test(new URL(value).hostname);
        }
        catch {
            return false;
        }
    }, 'Use a LinkedIn profile URL.'),
    sourceUrl: url, notes: text(4000),
    version: z.number().int().min(0), archived: z.boolean().default(false),
}).strict();
export const RelationshipSchema = z.object({
    brokerId: z.string().uuid(), prospectId: z.string().min(1).max(240),
    status: z.enum(['unverified', 'active', 'historical', 'ended']),
    scope: text(500), notes: text(4000), sourceUrl: url,
    learnedOn: z.string().date(), version: z.number().int().min(0),
    archived: z.boolean().default(false),
}).strict();
const brokerColumns = `id, name, firm, office, email, phone, linkedin_url AS "linkedinUrl",
  source_url AS "sourceUrl", notes, version, archived`;
const relationshipColumns = `r.id, r.broker_id AS "brokerId", r.prospect_id AS "prospectId",
  r.status, r.scope, r.notes, r.source_url AS "sourceUrl", r.learned_on::text AS "learnedOn",
  r.version, r.archived, b.name AS "brokerName", b.firm, p.name AS "recordName",
  COALESCE(NULLIF(p.business_name,''),NULLIF(p.contact_company,''),p.name) AS "companyName"`;
export function registerRelationshipDirectory(app: Express, pool: Pool) {
    function handle(action: (req: Request, res: Response, owner: string) => Promise<unknown>): RequestHandler {
        return (req, res) => {
            res.set('Cache-Control', 'no-store');
            const owner = getUserId(req);
            if (owner === 'demo-user') {
                res.status(403).json({ message: 'Sign in to save your private directory.' });
                return;
            }
            action(req, res, owner).catch(error => {
                if (error instanceof ProspectContactError)
                    return res.status(error.status).json({ message: error.message });
                if (error instanceof ProspectMergeServiceError)
                    return res.status(error.status).json({ message: error.message });
                if (error.code === '23505')
                    return res.status(409).json({ message: 'This broker is already linked to that account. Edit the existing connection.' });
                if ([400,404,409].includes(error.status))
                    return res.status(error.status).json({message:error.message});
                console.error('Relationship directory request failed', error);
                res.status(500).json({ message: 'The directory could not be saved or loaded. Please try again.' });
            });
        };
    }
    const base = '/api/desk/directory';
    const agentBase = '/api/intel/directory';
    app.get(agentBase + '/manifest', requireAccountIntelligenceAuth, handle(async (_req,res) => {
      res.json(industrialIntelAgentManifest.capabilities.companyRelationships);
    }));
    const readAuth: RequestHandler = (req,res,next) => req.path.startsWith(agentBase)
      ? requireAccountIntelligenceAuth(req,res,next) : requireBrokerAuth(req,res,next);
    app.get([base, agentBase + '/search'], readAuth, handle(async (req, res, owner) => {
        const input = z.object({ search: z.string().trim().max(240).default('') }).safeParse(req.query);
        if (!input.success)
            return res.sendStatus(400);
        const term = '%' + input.data.search.replace(/[\\%_]/g, '\\$&') + '%';
        const [companies, brokers] = await Promise.all([
            pool.query(`SELECT p.id, COALESCE(NULLIF(p.business_name,''),NULLIF(p.contact_company,''),p.name) AS name,
        p.name AS "recordName", p.address, p.contact_name AS "contactName"
        FROM public.prospects p WHERE p.user_id=$1 AND p.merged_into_prospect_id IS NULL
        AND (p.name ILIKE $2 OR p.business_name ILIKE $2 OR p.contact_company ILIKE $2
          OR p.contact_name ILIKE $2 OR EXISTS (SELECT 1 FROM public.prospect_contacts c
            WHERE c.user_id=$1 AND c.prospect_id=p.id AND c.archived_at IS NULL AND c.name ILIKE $2))
        ORDER BY name,p.id LIMIT 101`, [owner, term]),
            pool.query(`SELECT ${brokerColumns} FROM public.directory_brokers
        WHERE user_id=$1 AND NOT archived AND (name ILIKE $2 OR firm ILIKE $2 OR office ILIKE $2)
        ORDER BY name,id LIMIT 101`, [owner, term]),
        ]);
        res.json({ companies: companies.rows.slice(0, 100), brokers: brokers.rows.slice(0, 100),
            moreCompanies: companies.rows.length > 100, moreBrokers: brokers.rows.length > 100 });
    }));
    app.get([base + '/companies/:id', agentBase + '/companies/:id/brief'], readAuth, handle(async (req, res, owner) => {
        const resolved = await resolveCanonicalProspect({ pool, userId: owner, prospectId: req.params.id });
        const workspace = await getCallingWorkspace({ pool, userId: owner, prospectId: resolved.canonicalProspectId });
        const links = await pool.query(`WITH RECURSIVE aliases AS (
      SELECT id FROM public.prospects WHERE user_id=$1 AND id=$2
      UNION
      SELECT p.id FROM public.prospects p JOIN aliases a ON p.merged_into_prospect_id=a.id WHERE p.user_id=$1
    ) SELECT ${relationshipColumns}
      FROM public.directory_relationships r JOIN public.directory_brokers b ON b.id=r.broker_id AND b.user_id=r.user_id
      JOIN public.prospects p ON p.id=r.prospect_id AND p.user_id=r.user_id
      WHERE r.user_id=$1 AND r.prospect_id IN (SELECT id FROM aliases) AND NOT r.archived AND NOT b.archived ORDER BY b.name`, [owner, resolved.canonicalProspectId]);
        const findings = await pool.query(`WITH RECURSIVE aliases AS (
          SELECT id FROM public.prospects WHERE user_id=$1 AND id=$2
          UNION SELECT p.id FROM public.prospects p JOIN aliases a ON p.merged_into_prospect_id=a.id WHERE p.user_id=$1
        ) SELECT id,prospect_id AS "sourceProspectId",payload,status,created_at AS "createdAt"
          FROM public.directory_findings WHERE user_id=$1 AND prospect_id IN (SELECT id FROM aliases) AND status='observed' ORDER BY created_at`,
          [owner,resolved.canonicalProspectId]);
        res.json({ ...workspace, relationships: links.rows, findings: findings.rows,
          coverage: coverage(workspace.contacts),
          reasoningRules: ['A director role establishes a recorded legal connection only. Verify property decision authority separately.',
            'Apply each relationship only to its recorded company, geography, date and scope.',
            'An empty branch is a research gap. Pending findings remain observations.'] });
    }));
    app.get([base + '/brokers/:id',agentBase + '/brokers/:id/brief'], readAuth, handle(async (req, res, owner) => {
        if (!z.string().uuid().safeParse(req.params.id).success)
            return res.sendStatus(400);
        const result = await pool.query(`SELECT ${brokerColumns} FROM public.directory_brokers WHERE user_id=$1 AND id=$2 AND NOT archived`, [owner, req.params.id]);
        if (!result.rows[0])
            return res.sendStatus(404);
        const links = await pool.query(`SELECT ${relationshipColumns}
      FROM public.directory_relationships r JOIN public.directory_brokers b ON b.id=r.broker_id AND b.user_id=r.user_id
      JOIN public.prospects p ON p.id=r.prospect_id AND p.user_id=r.user_id
      WHERE r.user_id=$1 AND r.broker_id=$2 AND NOT r.archived ORDER BY "companyName"`, [owner, req.params.id]);
        res.json({ broker: result.rows[0], relationships: links.rows });
    }));
    app.post(agentBase + '/findings', requireAccountIntelligenceAuth, handle(async (req,res,owner) => {
      const parsed = FindingSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({message:'Findings need a contact, source, date and valid company context.',issues:parsed.error.flatten()})
      return res.json(await recordFinding(pool,owner,parsed.data))
    }))
    app.post(base + '/findings/:id/review', requireBrokerAuth, handle(async (req,res,owner) => {
      const parsed = z.object({decision:z.enum(['accepted','rejected'])}).strict().safeParse(req.body)
      if (!parsed.success || !z.string().uuid().safeParse(req.params.id).success) return res.sendStatus(400)
      return res.json(await reviewFinding(pool,owner,req.params.id,parsed.data.decision))
    }))
    app.put(base + '/brokers/:id', requireBrokerAuth, handle(async (req, res, owner) => {
        const parsed = BrokerSchema.safeParse(req.body);
        if (!parsed.success || !z.string().uuid().safeParse(req.params.id).success)
            return res.status(400).json({ message: 'Check the broker name, email, and profile links.' });
        const b = parsed.data;
        const saved = await pool.query(`INSERT INTO public.directory_brokers
      (id,user_id,name,firm,office,email,phone,linkedin_url,source_url,notes)
      SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10 WHERE $11=0
      ON CONFLICT (id) DO NOTHING RETURNING id`, [req.params.id, owner, b.name, b.firm, b.office, b.email, b.phone, b.linkedinUrl, b.sourceUrl, b.notes, b.version]);
        if (saved.rows.length)
            return res.json({ id: req.params.id });
        const updated = await pool.query(`UPDATE public.directory_brokers SET name=$3,firm=$4,office=$5,email=$6,phone=$7,
      linkedin_url=$8,source_url=$9,notes=$10,version=version+1,archived=$12,updated_at=now()
      WHERE id=$1 AND user_id=$2 AND version=$11 RETURNING id`, [req.params.id, owner, b.name, b.firm, b.office, b.email, b.phone, b.linkedinUrl, b.sourceUrl, b.notes, b.version, b.archived]);
        if (!updated.rows.length)
            return res.status(409).json({ message: 'This broker changed. Reload the directory before saving again.' });
        res.json({ id: req.params.id });
    }));
    app.put(base + '/relationships/:id', requireBrokerAuth, handle(async (req, res, owner) => {
        const parsed = RelationshipSchema.safeParse(req.body);
        if (!parsed.success || !z.string().uuid().safeParse(req.params.id).success)
            return res.status(400).json({ message: 'Check the account, broker, relationship, date, and source link.' });
        const r = parsed.data;
        const values = [req.params.id, owner, r.brokerId, r.prospectId, r.status, r.scope, r.notes, r.sourceUrl, r.learnedOn, r.version, r.archived];
        // Ownership and merge eligibility are checked in the write itself.
        const eligible = `EXISTS(SELECT 1 FROM public.prospects p WHERE p.id=$4 AND p.user_id=$2 AND (p.merged_into_prospect_id IS NULL OR $10>0))
      AND EXISTS(SELECT 1 FROM public.directory_brokers b WHERE b.id=$3 AND b.user_id=$2 AND NOT b.archived)`;
        const saved = await pool.query(`INSERT INTO public.directory_relationships
      (id,user_id,broker_id,prospect_id,status,scope,notes,source_url,learned_on,archived)
      SELECT $1::uuid,$2::varchar,$3::uuid,$4::varchar,$5,$6,$7,$8,$9::date,$11 WHERE $10=0 AND ${eligible}
      ON CONFLICT (id) DO NOTHING RETURNING id`, values);
        if (saved.rows.length)
            return res.json({ id: req.params.id });
        const updated = await pool.query(`UPDATE public.directory_relationships SET status=$5,scope=$6,notes=$7,
      source_url=$8,learned_on=$9::date,version=version+1,archived=$11,updated_at=now()
      WHERE id=$1 AND user_id=$2 AND broker_id=$3 AND prospect_id=$4 AND version=$10 AND ${eligible} RETURNING id`, values);
        if (!updated.rows.length)
            return res.status(409).json({ message: 'This connection or account changed. Reload the directory before saving again.' });
        res.json({ id: req.params.id });
    }));
}
