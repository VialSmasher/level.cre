import { INVENTORY_CLASSES, INVENTORY_CONFIDENCE, type PropertyInventory } from '@level-cre/shared'

export type InventoryFilters = { classes: string[]; confidence: string[]; tags: string[]; includeOther: boolean }
export const INVENTORY_SIGNAL_GROUPS = [
  { label: 'Occupancy / tenure signals', tags: [['owner_occupied','Owner-occupied signal'],['likely_tenanted','Likely tenanted'],['vacant','Vacant building']] },
  { label: 'Market activity', tags: [['on_market','On market in source']] },
  { label: 'Covenant / use', tags: [['weaker_covenant','Weaker covenant signal'],['duplex','Duplex'],['retail_fuel','Retail fuel'],['hospitality','Hospitality'],['food_service','Food service']] },
  { label: 'Data completeness', tags: [['has_occupant','Occupant recorded'],['has_costar','CoStar research present'],['costar_partial','CoStar partial'],['costar_no_match','CoStar no match'],['missing_assessment','Missing assessment'],['missing_year_built','Missing year built']] },
  { label: 'Title / area', tags: [['long_hold','Title registration over 15 years'],['nisku_park','Nisku Industrial Park']] },
] as const
const knownTags = new Set(INVENTORY_SIGNAL_GROUPS.flatMap(group=>group.tags.map(([key])=>key as string)))
export const defaultInventoryFilters = (): InventoryFilters => ({classes:[...INVENTORY_CLASSES], confidence:[...INVENTORY_CONFIDENCE], tags:[], includeOther:true})
export function readInventoryFilters(value: unknown): InventoryFilters {
  const defaults=defaultInventoryFilters()
  if(!value || typeof value!=='object') return defaults
  const saved=value as Partial<InventoryFilters>
  return {
    classes:Array.isArray(saved.classes)?saved.classes.filter(key=>INVENTORY_CLASSES.includes(key as any)):defaults.classes,
    confidence:Array.isArray(saved.confidence)?saved.confidence.filter(key=>INVENTORY_CONFIDENCE.includes(key as any)):defaults.confidence,
    tags:Array.isArray(saved.tags)?saved.tags.filter(key=>knownTags.has(key)):[],
    includeOther:typeof saved.includeOther==='boolean'?saved.includeOther:true,
  }
}
export function inventorySignals(inventory: PropertyInventory, now = new Date()): Set<string> {
  const tags=new Set(inventory.subFilters)
  if(inventory.occupant?.trim())tags.add('has_occupant')
  if(inventory.costar.propertyId||inventory.costar.notes)tags.add('has_costar')
  if(inventory.assessment===null)tags.add('missing_assessment')
  if(inventory.yearBuilt===null)tags.add('missing_year_built')
  if(inventory.businessPark==='Nisku Industrial Park')tags.add('nisku_park')
  const cutoff=new Date(now);cutoff.setUTCFullYear(cutoff.getUTCFullYear()-15)
  if(inventory.titleRecords.every(title=>Date.parse(title.lastSaleDate+'T00:00:00Z')<cutoff.getTime()))tags.add('long_hold')
  return tags
}
export function matchesInventoryFilters(inventory: PropertyInventory | null, filters: InventoryFilters, now?: Date): boolean {
  if(!inventory)return filters.includeOther
  if(!filters.classes.includes(inventory.classification)||!filters.confidence.includes(inventory.confidence))return false
  const tags=inventorySignals(inventory,now)
  return INVENTORY_SIGNAL_GROUPS.every(group=>{
    const selected=group.tags.map(([key])=>key).filter(key=>filters.tags.includes(key))
    return !selected.length||selected.some(key=>tags.has(key))
  })
}

export function inventoryMapExtent(points: Array<{lat:number;lng:number}>) {
  const usable=points.filter(point=>Number.isFinite(point.lat)&&Number.isFinite(point.lng))
  if(!usable.length)return null
  const north=Math.max(...usable.map(point=>point.lat)),south=Math.min(...usable.map(point=>point.lat))
  const east=Math.max(...usable.map(point=>point.lng)),west=Math.min(...usable.map(point=>point.lng))
  const latitude=(north+south)/2,longitude=(east+west)/2
  return {north:Math.max(north,latitude+.0015),south:Math.min(south,latitude-.0015),east:Math.max(east,longitude+.0025),west:Math.min(west,longitude-.0025)}
}
