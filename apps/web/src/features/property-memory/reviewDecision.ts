export type PropertyMemoryDecisionTarget = {
  targetDossierId: string | null
  targetProspectId: string | null
  targetListingId: string | null
}

const EMPTY_TARGET: PropertyMemoryDecisionTarget = {
  targetDossierId: null,
  targetProspectId: null,
  targetListingId: null,
}

export function propertyMemoryTargetFromValue(value: string): PropertyMemoryDecisionTarget {
  if (value === 'new') return { ...EMPTY_TARGET }
  const separator = value.indexOf(':')
  if (separator < 1) return { ...EMPTY_TARGET }
  const kind = value.slice(0, separator)
  const id = value.slice(separator + 1)
  if (!id) return { ...EMPTY_TARGET }
  if (kind === 'dossier') return { ...EMPTY_TARGET, targetDossierId: id }
  if (kind === 'prospect') return { ...EMPTY_TARGET, targetProspectId: id }
  if (kind === 'listing') return { ...EMPTY_TARGET, targetListingId: id }
  return { ...EMPTY_TARGET }
}
