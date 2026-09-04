import { BrokerClassificationSchema, type BrokerClassification, type MarketMemoryAnchor } from '@level-cre/shared'

export type MemoryClassificationTarget = {kind:'memory_item' | 'dossier'; id:string}

export function memoryClassificationTarget(anchor: MarketMemoryAnchor): MemoryClassificationTarget | null {
  const persistence = anchor.persistence
  if (persistence?.state === 'pending' && persistence.importItemId) return {kind:'memory_item', id:persistence.importItemId}
  if (persistence?.state === 'approved' && persistence.dossierId && !persistence.linkedProspectId) return {kind:'dossier', id:persistence.dossierId}
  return null
}

export function memoryClassificationUrl(target: MemoryClassificationTarget) {
  const collection = target.kind === 'memory_item' ? 'items' : 'dossiers'
  return `/api/intel/brokerage-memory/${collection}/${encodeURIComponent(target.id)}/classification`
}

export function readMemoryClassificationResponse(payload: unknown, target: MemoryClassificationTarget): BrokerClassification | null {
  const result = payload as {target?: MemoryClassificationTarget; propertyClassification?: unknown} | null
  if (!result || result.target?.kind !== target.kind || result.target.id !== target.id) throw new Error('Unexpected property save response')
  if (result.propertyClassification === null) return null
  return BrokerClassificationSchema.parse(result.propertyClassification)
}

export function applyMemoryClassification(anchor: MarketMemoryAnchor, target: MemoryClassificationTarget, classification: BrokerClassification | null) {
  const currentTarget = memoryClassificationTarget(anchor)
  return currentTarget?.kind === target.kind && currentTarget.id === target.id
    ? {...anchor, propertyClassification:classification} : anchor
}
