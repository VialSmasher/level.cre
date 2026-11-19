import type { Pool } from 'pg'
import { z } from 'zod'

export const DirectoryHomeQuery = z.object({
  recent: z.string().max(1600).default('').transform(value => value.split(',').filter(Boolean))
    .pipe(z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)).max(8)),
}).strict()

type Account = {id:string;name:string;address:string|null;contactName:string|null;aliases:string[];
  activityAt:string|null;activityType:string|null;networkAt:string|null;linkCount:number}

// Read-only overview. Viewing a company is browser history, never a BD activity.
export async function directoryHome(pool:Pick<Pool,'query'>,owner:string,recentIds:string[]) {
  const result=await pool.query<Account>(`WITH RECURSIVE lineage AS (
    SELECT id AS source_id,id,merged_into_prospect_id,ARRAY[id] AS visited FROM prospects WHERE user_id=$1
    UNION ALL
    SELECT l.source_id,p.id,p.merged_into_prospect_id,l.visited||p.id
    FROM lineage l JOIN prospects p ON p.id=l.merged_into_prospect_id AND p.user_id=$1
    WHERE NOT p.id=ANY(l.visited)
  ), canonical AS (SELECT source_id,id FROM lineage WHERE merged_into_prospect_id IS NULL),
  latest_activity AS (
    SELECT DISTINCT ON (c.id) c.id,a.occurred_at,a.event_type
    FROM activity_events a JOIN canonical c ON c.source_id=a.prospect_id
    WHERE a.user_id=$1 AND a.evidence_status='confirmed'
      AND a.event_type IN ('email_sent','email_received','call_attempted','meeting')
      AND a.occurred_at<=now() AND a.occurred_at>=now()-interval '90 days'
    ORDER BY c.id,a.occurred_at DESC,a.id DESC
  ), links AS (
    SELECT c.id,count(*)::int AS count,max(r.updated_at) AS updated_at
    FROM directory_relationships r JOIN canonical c ON c.source_id=r.prospect_id
    JOIN directory_brokers b ON b.id=r.broker_id AND b.user_id=$1 AND NOT b.archived
    WHERE r.user_id=$1 AND NOT r.archived GROUP BY c.id
  ), changes AS (
    SELECT c.id,max(d.created_at) AS updated_at FROM directory_changes d
    JOIN canonical c ON c.source_id=COALESCE(d.request->>'prospectId',d.request->'relationship'->>'prospectId')
    WHERE d.user_id=$1 GROUP BY c.id
  ) SELECT p.id,COALESCE(NULLIF(p.business_name,''),NULLIF(p.contact_company,''),p.name) AS name,
      p.address,p.contact_name AS "contactName",array_agg(c.source_id ORDER BY c.source_id) AS aliases,
      a.occurred_at AS "activityAt",a.event_type AS "activityType",
      GREATEST(l.updated_at,d.updated_at) AS "networkAt",COALESCE(l.count,0)::int AS "linkCount"
    FROM prospects p JOIN canonical c ON c.id=p.id
    LEFT JOIN latest_activity a ON a.id=p.id LEFT JOIN links l ON l.id=p.id LEFT JOIN changes d ON d.id=p.id
    WHERE p.user_id=$1 AND p.merged_into_prospect_id IS NULL
    GROUP BY p.id,p.business_name,p.contact_company,p.name,p.address,p.contact_name,a.occurred_at,a.event_type,l.updated_at,d.updated_at,l.count
    ORDER BY name,p.id`,[owner])
  const accounts=result.rows
  const recent=recentIds.flatMap(id=>accounts.find(a=>a.aliases.includes(id))||[])
    .filter((a,i,list)=>list.findIndex(b=>b.id===a.id)===i).slice(0,6)
  const recentSet=new Set(recent.map(a=>a.id))
  const time=(value:string|null)=>value ? new Date(value).getTime() : 0
  const engaged=accounts.filter(a=>a.activityAt&&!recentSet.has(a.id))
    .sort((a,b)=>time(b.activityAt)-time(a.activityAt)||a.id.localeCompare(b.id)).slice(0,6)
  const used=new Set([...recent,...engaged].map(a=>a.id))
  const connected=accounts.filter(a=>!used.has(a.id)&&(a.linkCount>0||a.networkAt))
    .sort((a,b)=>time(b.networkAt)-time(a.networkAt)||b.linkCount-a.linkCount||a.id.localeCompare(b.id)).slice(0,6)
  const suggested=recent.length+engaged.length+connected.length ? [] : accounts.slice(0,6)
  const selected=[...recent,...engaged,...connected,...suggested]
  if(!selected.length) return {recent:[],engaged:[],connected:[],suggested:[]}
  const sourceToAccount=new Map(selected.flatMap(a=>a.aliases.map(id=>[id,a.id] as const)))
  const [contactResult,brokerResult]=await Promise.all([
    pool.query(`SELECT c.prospect_id AS "prospectId",c.name,c.title,c.is_primary AS "isPrimary"
      FROM prospect_contacts c JOIN prospects p ON p.id=c.prospect_id AND p.user_id=$1
      WHERE c.user_id=$1 AND c.prospect_id=ANY($2::varchar[]) AND c.archived_at IS NULL
        AND NULLIF(trim(c.name),'') IS NOT NULL AND c.name<>'Company main line'
        AND (NOT c.is_primary OR c.name=p.contact_name)
      ORDER BY c.is_primary DESC,c.name,c.id`,[owner,selected.map(a=>a.id)]),
    pool.query(`SELECT r.prospect_id AS "prospectId",b.id,b.name,r.status,r.scope
      FROM directory_relationships r JOIN directory_brokers b ON b.id=r.broker_id AND b.user_id=$1
      WHERE r.user_id=$1 AND r.prospect_id=ANY($2::varchar[]) AND NOT r.archived AND NOT b.archived
      ORDER BY CASE r.status WHEN 'active' THEN 0 WHEN 'unverified' THEN 1 ELSE 2 END,b.name,r.id`,[owner,[...sourceToAccount.keys()]]),
  ])
  function preview(a:Account) {
    const people=contactResult.rows.filter(c=>c.prospectId===a.id).map(({name,title})=>({name,title}))
    if(a.contactName?.trim() && a.contactName!=='Company main line' && !people.some(c=>c.name===a.contactName)) {
      people.unshift({name:a.contactName,title:null})
    }
    const brokers=brokerResult.rows.filter(b=>sourceToAccount.get(b.prospectId)===a.id)
      .map(({id,name,status,scope})=>({id,name,status,scope}))
    return {id:a.id,name:a.name,address:a.address,activityAt:a.activityAt,activityType:a.activityType,
      contactCount:people.length,brokerCount:brokers.length,contacts:people.slice(0,2),brokers:brokers.slice(0,2)}
  }
  return {recent:recent.map(preview),engaged:engaged.map(preview),connected:connected.map(preview),suggested:suggested.map(preview)}
}
