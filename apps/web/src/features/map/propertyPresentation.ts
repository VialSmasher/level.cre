import { getPropertyClassification, INVENTORY_CLASS_META } from '@level-cre/shared';
export const UNCLASSIFIED_PROPERTY_META = { label: 'Unclassified property', marker: '?', color: '#64748B' };
export function propertyPresentation(prospect: { aiMetadata?: unknown }) {
  const classification = getPropertyClassification(prospect);
  return classification !== 'unknown' ? INVENTORY_CLASS_META[classification] : UNCLASSIFIED_PROPERTY_META;
}
