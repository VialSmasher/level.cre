import type { Prospect } from '@level-cre/shared/schema';

const PLACEHOLDER_NAME_RE = /^(new\s+(marker|point|polygon|rectangle|prospect)|new\s+\w+|\s*)$/i;

export function isPlaceholderProspectName(value?: string | null): boolean {
  const normalized = (value || '').trim();
  return PLACEHOLDER_NAME_RE.test(normalized);
}

export function getProspectDisplayName(prospect: Partial<Prospect> & { name?: string | null }): string {
  const business = prospect.businessName?.trim();
  const name = prospect.name?.trim();
  const company = prospect.contactCompany?.trim();

  if (business) return business;
  if (name && !isPlaceholderProspectName(name)) return name;
  if (company) return company;
  if (prospect.geometry?.type === 'Point') return 'Dropped pin';
  if (prospect.geometry?.type === 'Polygon') return 'Mapped area';
  return 'Untitled Prospect';
}

export function getProspectSecondaryName(prospect: Partial<Prospect> & { name?: string | null }): string | undefined {
  const display = getProspectDisplayName(prospect);
  const name = prospect.name?.trim();

  if (name && name !== display && !isPlaceholderProspectName(name)) return name;
  return undefined;
}
