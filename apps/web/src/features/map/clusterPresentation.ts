import { INVENTORY_CLASSES, INVENTORY_CLASS_META } from '@level-cre/shared'
import { UNCLASSIFIED_PROPERTY_META } from './propertyPresentation'

const PROPERTY_TYPES = [
  ...INVENTORY_CLASSES.map(classification => ({ classification, ...INVENTORY_CLASS_META[classification] })),
  { classification: 'unknown', ...UNCLASSIFIED_PROPERTY_META, label: 'Unclassified' },
] as const
const TYPES_BY_COLOR = new Map(PROPERTY_TYPES.map(type => [type.color.toUpperCase(), type]))
const UNKNOWN_TYPE = PROPERTY_TYPES[PROPERTY_TYPES.length - 1]

/** Property colors alone determine the ring; brokerage relationship colors are not inputs. */
export function clusterPresentation(colors: readonly (string | null | undefined)[]) {
  const counts = new Map<string, number>()
  for (const color of colors) {
    const type = TYPES_BY_COLOR.get(color?.trim().toUpperCase() || '') || UNKNOWN_TYPE
    counts.set(type.classification, (counts.get(type.classification) || 0) + 1)
  }
  // Stable legend order keeps the ring from rotating when records are reordered.
  const segments = PROPERTY_TYPES.flatMap(type => {
    const count = counts.get(type.classification) || 0
    return count ? [{ ...type, count, fraction: count / colors.length }] : []
  })
  const detail = segments.map(segment => `${segment.count} ${segment.label}`).join(', ')
  const title = `${colors.length} ${colors.length === 1 ? 'property' : 'properties'}${detail ? `: ${detail}` : ''}`
  if (segments.length < 2) {
    return { background: segments[0]?.color || UNKNOWN_TYPE.color, title, segments }
  }

  let represented = 0
  const stops = segments.map(segment => {
    const start = represented / colors.length * 100
    represented += segment.count
    const end = represented / colors.length * 100
    return `${segment.color} ${start}% ${end}%`
  })
  return {
    background: `radial-gradient(circle closest-side, #0F172A 68%, transparent 72%), conic-gradient(${stops.join(', ')})`,
    title,
    segments,
  }
}
