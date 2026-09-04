import { getPropertyInventory, INVENTORY_CLASS_META } from '@level-cre/shared';
export const UNCLASSIFIED_PROPERTY_META = { label: 'Unclassified property', marker: '?', color: '#64748B' };
export function propertyPresentation(prospect: { aiMetadata?: unknown }) {
  const inventory = getPropertyInventory(prospect);
  return inventory ? INVENTORY_CLASS_META[inventory.classification] : UNCLASSIFIED_PROPERTY_META;
}
