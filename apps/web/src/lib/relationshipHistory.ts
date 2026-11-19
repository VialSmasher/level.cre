export const relationshipHistoryKey=(owner:string)=>`levelcre.relationships.recent.v1::${owner}`

export function recentCompanyIds(value:unknown):string[] {
  if(!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((id):id is string=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id)))).slice(0,6)
}

export function rememberCompany(ids:string[],id:string) {
  return recentCompanyIds([id,...ids])
}
