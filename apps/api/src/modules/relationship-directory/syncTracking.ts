import type { Pool } from 'pg'

export async function requireRunningDirectorySync(db:Pick<Pool,'query'>,owner:string,requestId?:string) {
  if(!requestId) return
  const result=await db.query("SELECT request_id FROM public.desk_sync WHERE owner_id=$1 AND request_id=$2 AND state='running'",[owner,requestId])
  if(!result.rows.length) throw Object.assign(new Error('This sync is no longer running for the authenticated owner.'),{status:409})
}

// Correlation is not source identity: a later run may retry the exact same evidence.
export function withoutSyncId<T extends {syncRequestId?:string}>(input:T) {
  const {syncRequestId,...evidence}=input
  return evidence
}
