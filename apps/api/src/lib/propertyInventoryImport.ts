import { createHash } from 'node:crypto'
import type { Pool } from 'pg'
import { z } from 'zod'
import { PropertyInventoryRecordSchema, inventoryAddressKey, type PropertyInventoryRecord } from '@level-cre/shared'

type Existing = { id: string; name: string; address: string | null; status: string; notes: string | null; ai_metadata: any; location_lat: number | null; location_lng: number | null }
const titleKey = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
function existingTitles(row: Existing): string[] {
  const metadata = row.ai_metadata || {}
  return [metadata.titleNumber, ...(Array.isArray(metadata.titleNumbers) ? metadata.titleNumbers : []), ...(metadata.propertyInventory?.titleRecords || []).map((title: any) => title.titleNumber)].map(titleKey).filter(Boolean)
}
export function matchInventoryRecord(record: PropertyInventoryRecord, existing: Existing[]): Existing | undefined {
  const { inventory } = record
  const key = inventoryAddressKey(inventory.address, inventory.municipality)
  const byAddress = key ? existing.filter(row => {
    const address = row.address || row.name
    const sameArea = address.toLowerCase().includes(inventory.municipality.toLowerCase())
      || row.ai_metadata?.propertyInventory?.municipality === inventory.municipality
      || (row.location_lat !== null && row.location_lng !== null && Math.abs(row.location_lat - record.latitude) < .02 && Math.abs(row.location_lng - record.longitude) < .03)
    return sameArea && inventoryAddressKey(address, inventory.municipality) === key
  }) : []
  if (byAddress.length > 1) throw Error(`Multiple existing prospects match ${inventory.address}; resolve the duplicate before importing.`)
  if (byAddress.length === 1) return byAddress[0]
  const titles = new Set(inventory.titleRecords.map(row => titleKey(row.titleNumber)))
  const byTitle = existing.filter(row => existingTitles(row).some(title => titles.has(title)))
  if (byTitle.length > 1) throw Error(`Multiple existing prospects match the title records for ${inventory.address || inventory.name}.`)
  return byTitle[0]
}

export async function importPropertyInventory(pool: Pick<Pool, 'connect'>, userId: string, input: unknown, apply = false) {
  if (!userId) throw Error('An explicit owner is required')
  const records = z.array(PropertyInventoryRecordSchema).min(1).max(1000).parse(input)
  const keys = records.map(({ inventory }) => inventoryAddressKey(inventory.address, inventory.municipality) || 'TITLE:' + titleKey(inventory.titleRecords[0].titleNumber))
  if (new Set(keys).size !== keys.length) throw Error('Combine repeated addresses and retain their title records before importing')
  const client = await pool.connect()
  const results: Array<{ address: string; id: string | null; action: 'created' | 'updated' | 'unchanged'; classification: string; titleCount: number; before?: Existing }> = []
  try {
    await client.query('BEGIN')
    // Serializes this import path per owner without changing the stable CRM schema.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('property-inventory:' || $1, 0))", [userId])
    const owner = await client.query('SELECT id FROM public.users WHERE id=$1', [userId])
    if (!owner.rows.length) throw Error('The requested CRM owner does not exist')
    const { rows: existing } = await client.query<Existing>(`SELECT id,name,address,status,notes,ai_metadata,location_lat,location_lng FROM public.prospects WHERE user_id=$1 AND merged_into_prospect_id IS NULL FOR UPDATE`, [userId])
    const { rows: submarkets } = await client.query<{ id: string; name: string }>('SELECT id,name FROM public.submarkets WHERE user_id=$1', [userId])
    for (const record of records) {
      const { inventory } = record
      const match = matchInventoryRecord(record, existing)
      const fingerprint = createHash('sha256').update(JSON.stringify(record)).digest('hex')
      const current = match?.ai_metadata || {}
      const unchanged = current.propertyInventoryReceipt?.fingerprint === fingerprint
      const metadata = {
        ...current,
        prospectTypes: Array.from(new Set([...(Array.isArray(current.prospectTypes) ? current.prospectTypes : []), 'listing_prospect'])),
        propertyInventory: inventory,
        propertyInventoryReceipt: { fingerprint, importedAt: new Date().toISOString() },
      }
      const action = unchanged ? 'unchanged' : match ? 'updated' : 'created'
      let id: string | null = match?.id || null
      if (apply && !unchanged) {
        if (match) {
          // Existing contact, lifecycle, notes and geometry remain broker-controlled.
          await client.query('UPDATE public.prospects SET ai_metadata=$3::jsonb, updated_at=now() WHERE id=$1 AND user_id=$2', [match.id, userId, JSON.stringify(metadata)])
          match.ai_metadata = metadata
        } else {
          // The map/profile selector stores the submarket name in this legacy field.
          const submarketId = submarkets.find(row => row.name.toLowerCase() === inventory.municipality.toLowerCase())?.name || null
          const created = await client.query<{ id: string }>(`INSERT INTO public.prospects
            (user_id,name,address,status,notes,geometry,submarket_id,building_sf,ai_metadata,location_lat,location_lng,market_key,market_context_source,market_context_status)
            VALUES ($1,$2,$3,'prospect',$4,ST_SetSRID(ST_GeomFromGeoJSON($5::text),4326),$6,$7,$8::jsonb,$9,$10,$11,'property_inventory_import','research') RETURNING id`,
          [userId, inventory.name, inventory.address ? `${inventory.address}, ${inventory.municipality}, AB` : null,
            `Research inventory from ${inventory.source.file}, ${inventory.source.sheet}. Classification and tenure are source research signals. LastSaleDate is the title registration date, not a verified sale.\n\n${inventory.notes}`,
            JSON.stringify({ type: 'Point', coordinates: [record.longitude, record.latitude] }), submarketId,
            !inventory.subFilters.includes('costar_partial') && Number.isInteger(inventory.costar.buildingSf) ? inventory.costar.buildingSf : null, JSON.stringify(metadata), record.latitude, record.longitude,
            'inventory:' + (inventoryAddressKey(inventory.address, inventory.municipality) || 'TITLE:' + titleKey(inventory.titleRecords[0].titleNumber))])
          id = created.rows[0].id
          existing.push({ id, name: inventory.name, address: inventory.address, status: 'prospect', notes: inventory.notes, ai_metadata: metadata, location_lat: record.latitude, location_lng: record.longitude })
        }
      }
      results.push({ address: inventory.address, id, action, classification: inventory.classification, titleCount: inventory.titleRecords.length, ...(match && action === 'updated' ? { before: {...match, ai_metadata:current} } : {}) })
    }
    await client.query(apply ? 'COMMIT' : 'ROLLBACK')
    return { applied: apply, records: records.length, created: results.filter(row => row.action === 'created').length, updated: results.filter(row => row.action === 'updated').length, unchanged: results.filter(row => row.action === 'unchanged').length, results }
  } catch (error) { await client.query('ROLLBACK'); throw error }
  finally { client.release() }
}
