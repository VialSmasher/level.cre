import type { Prospect } from '@level-cre/shared/schema'

type ClassificationSource = Pick<Prospect, 'id' | 'aiMetadata'>

/** A classification-only response must not replace unrelated source metadata. */
export function mergeProspectClassification(current: Prospect, saved: ClassificationSource): Prospect {
  if (current.id !== saved.id) return current
  const aiMetadata = {...(current.aiMetadata || {})} as Record<string, unknown>
  const classification = (saved.aiMetadata as Record<string, unknown> | null | undefined)?.propertyClassification
  if (classification === undefined) delete aiMetadata.propertyClassification
  else aiMetadata.propertyClassification = classification
  return {...current, aiMetadata}
}

/** Reconcile only classification writes acknowledged after an ordinary request began. */
export class ProspectClassificationResponseGuard {
  private acknowledged = new Map<string, {revision:number; source:ClassificationSource}>()

  capture(prospectId: string) {
    return this.acknowledged.get(prospectId)?.revision || 0
  }

  record(saved: ClassificationSource) {
    this.acknowledged.set(saved.id, {revision:this.capture(saved.id) + 1, source:saved})
  }

  reconcile(saved: Prospect, startedRevision: number): Prospect {
    const latest = this.acknowledged.get(saved.id)
    return latest && latest.revision !== startedRevision ? mergeProspectClassification(saved, latest.source) : saved
  }
}
