import type { Prospect } from '@level-cre/shared/schema';

const DEFAULT_MAX_IMPORT_ROWS = 200;

export type PursuitImportStatus = 'prospect' | 'contacted' | 'listing' | 'client' | 'no_go';
export type PropertyImportSourceSystem = 'gettel' | 'costar' | 'generic';
export type PropertyImportKind = 'ownership' | 'availability' | 'tenancy' | 'mixed';

export type PursuitImportRow = {
  sourceRow: number;
  sourceSheet: string;
  sourceSystem: PropertyImportSourceSystem;
  importKind: PropertyImportKind;
  sourceRecordId: string;
  sourceUrl: string;
  address: string;
  propertyName: string;
  status: PursuitImportStatus;
  buildingSf: number | null;
  lotSizeAcres: number | null;
  submarket: string;
  submarketBucket: string | null;
  ownerCompany: string;
  tenantName: string;
  suite: string;
  occupancySf: number | null;
  availableSf: number | null;
  leaseCommencementDate: string | null;
  leaseExpirationDate: string | null;
  renewalNoticeDate: string | null;
  leaseTermMonths: number | null;
  askingRentPsf: number | null;
  listingType: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
};

export type ParsedPursuitImportSheet = {
  sheetName: string;
  headerRow: number;
  detectedFields: string[];
  headerLabels: string[];
  sourceSystem: PropertyImportSourceSystem;
  importKind: PropertyImportKind;
  rows: PursuitImportRow[];
};

export type PreparedPursuitImportRow = PursuitImportRow & {
  selected: boolean;
  duplicateReason: string | null;
  updateReason: string | null;
  geocodeError: string | null;
  formattedAddress: string | null;
};

const FIELD_ALIASES = {
  address: ['address', 'property address', 'street address', 'address property', 'location'],
  propertyName: ['property name', 'business name', 'building name', 'property', 'title', 'name'],
  status: ['status', 'prospect status', 'stage'],
  buildingSf: ['building sf', 'building size', 'building square feet', 'size sf', 'sf', 'square feet', 'building area'],
  lotSizeAcres: ['lot size acres', 'lot acres', 'site acres', 'land acres', 'acres'],
  submarket: ['submarket', 'submarket name', 'area', 'district'],
  ownerCompany: ['owner purchaser of record', 'owner', 'owner company', 'purchaser', 'company', 'ownership'],
  contactName: ['contact', 'contact name', 'decision maker', 'owner contact'],
  contactEmail: ['email', 'contact email', 'owner email'],
  contactPhone: ['phone', 'contact phone', 'owner phone', 'telephone'],
  notes: ['notes', 'note', 'comments', 'description'],
  callAngle: ['call angle', 'outreach angle', 'recommended approach'],
  verification: ['verification', 'verification note', 'title note', 'due diligence'],
  sourceRecordId: ['property id', 'propertyid', 'record id', 'recordid', 'listing id', 'listingid', 'costar property id', 'costar id'],
  sourceUrl: ['url', 'source url', 'property url', 'listing url', 'link', 'website'],
  tenantName: ['tenant', 'tenant name', 'occupant', 'occupant name', 'company name'],
  suite: ['suite', 'suite number', 'unit', 'unit number', 'space'],
  occupancySf: ['occupied sf', 'occupancy sf', 'leased sf', 'tenant sf', 'space occupied', 'occupied space'],
  availableSf: ['available sf', 'lease sf', 'space available', 'total available space sf', 'direct available space', 'smallest available space', 'max building contiguous space'],
  leaseCommencementDate: ['lease commencement', 'commencement date', 'lease start', 'lease start date', 'start date'],
  leaseExpirationDate: ['lease expiration', 'lease expiration date', 'lease expiry', 'lease expiry date', 'expiration date', 'expiry date'],
  renewalNoticeDate: ['renewal notice', 'renewal notice date', 'option notice date', 'notice date'],
  leaseTermMonths: ['lease term months', 'term months', 'lease term', 'term mos'],
  askingRentPsf: ['rent sf yr', 'rent per sf per year', 'asking rent', 'lease rate', 'net rent', 'average weighted rent', 'avg rent direct industrial', 'avg rent sublet industrial'],
  listingType: ['listing type', 'deal type', 'availability type', 'transaction type'],
  latitude: ['latitude', 'lat', 'map latitude'],
  longitude: ['longitude', 'lng', 'lon', 'long', 'map longitude'],
} as const;

type FieldName = keyof typeof FIELD_ALIASES;

export function normalizeSpreadsheetHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeCellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseSpreadsheetNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = normalizeCellText(value).replace(/[$,%\s]/g, '').replace(/,/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSpreadsheetDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && value >= 20_000 && value <= 100_000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000);
    return date.toISOString().slice(0, 10);
  }

  const text = normalizeCellText(value);
  if (!text) return null;
  const numericDate = text.match(/^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,4})$/);
  if (numericDate) {
    const [, first, middle, last] = numericDate;
    const year = first.length === 4 ? Number(first) : Number(last.length === 2 ? `20${last}` : last);
    const month = first.length === 4 ? Number(middle) : Number(first);
    const day = first.length === 4 ? Number(last) : Number(middle);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return date.toISOString().slice(0, 10);
    }
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function normalizeStatus(value: unknown): PursuitImportStatus {
  const normalized = normalizeCellText(value).toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'contacted' || normalized === 'listing' || normalized === 'client' || normalized === 'no_go') {
    return normalized;
  }
  return 'prospect';
}

function buildAliasMap(): Map<string, FieldName> {
  const aliases = new Map<string, FieldName>();
  for (const [field, values] of Object.entries(FIELD_ALIASES) as [FieldName, readonly string[]][]) {
    for (const value of values) aliases.set(normalizeSpreadsheetHeader(value), field);
  }
  return aliases;
}

const ALIAS_MAP = buildAliasMap();

function findHeader(rows: unknown[][]): { rowIndex: number; columns: Partial<Record<FieldName, number>>; score: number } | null {
  let best: { rowIndex: number; columns: Partial<Record<FieldName, number>>; score: number } | null = null;
  const scanLimit = Math.min(rows.length, 50);

  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
    const columns: Partial<Record<FieldName, number>> = {};
    row.forEach((cell, columnIndex) => {
      const field = ALIAS_MAP.get(normalizeSpreadsheetHeader(cell));
      if (field && columns[field] === undefined) columns[field] = columnIndex;
    });
    if (columns.address === undefined) continue;
    const score = Object.keys(columns).length;
    if (!best || score > best.score) best = { rowIndex, columns, score };
  }

  return best;
}

function cell(row: unknown[], columns: Partial<Record<FieldName, number>>, field: FieldName): unknown {
  const index = columns[field];
  return index === undefined ? '' : row[index];
}

function joinNotes(parts: Array<string | null | undefined>): string {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join(' ');
}

function inferImportKind(columns: Partial<Record<FieldName, number>>): PropertyImportKind {
  const hasTenancy = columns.tenantName !== undefined || columns.leaseExpirationDate !== undefined || columns.renewalNoticeDate !== undefined;
  const hasAvailability = columns.availableSf !== undefined || columns.listingType !== undefined || (!hasTenancy && columns.askingRentPsf !== undefined);
  if (hasTenancy && hasAvailability) return 'mixed';
  if (hasTenancy) return 'tenancy';
  if (hasAvailability) return 'availability';
  return 'ownership';
}

export function detectPropertyImportSource(
  fileName: string,
  sheet: Pick<ParsedPursuitImportSheet, 'sheetName' | 'headerLabels'>,
): PropertyImportSourceSystem {
  const evidence = [fileName, sheet.sheetName, ...sheet.headerLabels].join(' ').toLowerCase();
  if (/costar/.test(evidence)) return 'costar';
  if (/gettel|the network|v&p improved|owner.{0,3}purchaser of record/.test(evidence)) return 'gettel';
  return 'generic';
}

export function applyPropertyImportSource(
  sheet: ParsedPursuitImportSheet,
  sourceSystem: PropertyImportSourceSystem,
): ParsedPursuitImportSheet {
  return { ...sheet, sourceSystem, rows: sheet.rows.map((row) => ({ ...row, sourceSystem })) };
}

export function toPursuitSubmarketBucket(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('nisku')) return 'Nisku';
  if (normalized.includes('leduc')) return 'Leduc';
  if (normalized.includes('sherwood')) return 'Sherwood Park';
  if (normalized.includes('acheson')) return 'Acheson';
  if (normalized.includes('fort sask')) return 'Fort Sask';
  if (normalized.includes('st albert') || normalized.includes('st. albert')) return 'St Albert';
  if (normalized.includes('strathcona county')) return 'Strathcona County';
  if (/northwest|winterburn|yellowhead|armstrong|stone industrial|mistatim/.test(normalized)) return 'NW';
  if (/northeast|clareview|kennedale|hermitage/.test(normalized)) return 'NE';
  if (/southeast|mcintyre|roper|strathcona industrial|weir|coronet|parsons|papaschase|davies|eastgate|lambton|gainer|argyll/.test(normalized)) return 'SE';
  if (['nw', 'ne', 'se'].includes(normalized)) return normalized.toUpperCase();
  return null;
}

export function parsePursuitImportSheet(
  rows: unknown[][],
  sheetName: string,
  maxRows = DEFAULT_MAX_IMPORT_ROWS,
): ParsedPursuitImportSheet | null {
  const header = findHeader(rows);
  if (!header) return null;
  const importKind = inferImportKind(header.columns);
  const headerRowValues = Array.isArray(rows[header.rowIndex]) ? rows[header.rowIndex] : [];
  const headerLabels = headerRowValues.map(normalizeCellText).filter(Boolean);

  const parsedRows: PursuitImportRow[] = [];
  for (let rowIndex = header.rowIndex + 1; rowIndex < rows.length && parsedRows.length < maxRows; rowIndex += 1) {
    const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
    const address = normalizeCellText(cell(row, header.columns, 'address'));
    if (!address) continue;

    const submarket = normalizeCellText(cell(row, header.columns, 'submarket'));
    const suppliedNotes = normalizeCellText(cell(row, header.columns, 'notes'));
    const callAngle = normalizeCellText(cell(row, header.columns, 'callAngle'));
    const verification = normalizeCellText(cell(row, header.columns, 'verification'));
    const tenantName = normalizeCellText(cell(row, header.columns, 'tenantName'));
    const leaseCommencementDate = parseSpreadsheetDate(cell(row, header.columns, 'leaseCommencementDate'));
    const leaseExpirationDate = parseSpreadsheetDate(cell(row, header.columns, 'leaseExpirationDate'));
    const renewalNoticeDate = parseSpreadsheetDate(cell(row, header.columns, 'renewalNoticeDate'));
    const contextualNotes = joinNotes([
      submarket ? `Submarket: ${submarket}.` : '',
      tenantName ? `Tenant: ${tenantName}.` : '',
      leaseCommencementDate ? `Lease commencement: ${leaseCommencementDate}.` : '',
      leaseExpirationDate ? `Lease expiry: ${leaseExpirationDate}.` : '',
      renewalNoticeDate ? `Renewal notice: ${renewalNoticeDate}.` : '',
      suppliedNotes,
      callAngle,
      verification,
    ]);
    const latitude = parseSpreadsheetNumber(cell(row, header.columns, 'latitude'));
    const longitude = parseSpreadsheetNumber(cell(row, header.columns, 'longitude'));

    parsedRows.push({
      sourceRow: rowIndex + 1,
      sourceSheet: sheetName,
      sourceSystem: 'generic',
      importKind,
      sourceRecordId: normalizeCellText(cell(row, header.columns, 'sourceRecordId')),
      sourceUrl: normalizeCellText(cell(row, header.columns, 'sourceUrl')),
      address,
      propertyName: normalizeCellText(cell(row, header.columns, 'propertyName')) || address,
      status: normalizeStatus(cell(row, header.columns, 'status')),
      buildingSf: parseSpreadsheetNumber(cell(row, header.columns, 'buildingSf')),
      lotSizeAcres: parseSpreadsheetNumber(cell(row, header.columns, 'lotSizeAcres')),
      submarket,
      submarketBucket: toPursuitSubmarketBucket(submarket),
      ownerCompany: normalizeCellText(cell(row, header.columns, 'ownerCompany')),
      tenantName,
      suite: normalizeCellText(cell(row, header.columns, 'suite')),
      occupancySf: parseSpreadsheetNumber(cell(row, header.columns, 'occupancySf')),
      availableSf: parseSpreadsheetNumber(cell(row, header.columns, 'availableSf')),
      leaseCommencementDate,
      leaseExpirationDate,
      renewalNoticeDate,
      leaseTermMonths: parseSpreadsheetNumber(cell(row, header.columns, 'leaseTermMonths')),
      askingRentPsf: parseSpreadsheetNumber(cell(row, header.columns, 'askingRentPsf')),
      listingType: normalizeCellText(cell(row, header.columns, 'listingType')),
      contactName: normalizeCellText(cell(row, header.columns, 'contactName')),
      contactEmail: normalizeCellText(cell(row, header.columns, 'contactEmail')),
      contactPhone: normalizeCellText(cell(row, header.columns, 'contactPhone')),
      notes: contextualNotes,
      latitude: latitude !== null && latitude >= -90 && latitude <= 90 ? latitude : null,
      longitude: longitude !== null && longitude >= -180 && longitude <= 180 ? longitude : null,
    });
  }

  if (parsedRows.length === 0) return null;
  return {
    sheetName,
    headerRow: header.rowIndex + 1,
    detectedFields: Object.keys(header.columns),
    headerLabels,
    sourceSystem: 'generic',
    importKind,
    rows: parsedRows,
  };
}

export function normalizePursuitAddress(value: unknown): string {
  const firstLine = String(value ?? '').split(',')[0] || '';
  return firstLine
    .toUpperCase()
    .replace(/\bNORTHWEST\b|\bNORTHEAST\b|\bSOUTHWEST\b|\bSOUTHEAST\b/g, '')
    .replace(/\bNW\b|\bNE\b|\bSW\b|\bSE\b/g, '')
    .replace(/\bSTREET\b|\bST\b/g, 'ST')
    .replace(/\bAVENUE\b|\bAVE\b/g, 'AVE')
    .replace(/\bROAD\b|\bRD\b/g, 'RD')
    .replace(/\bDRIVE\b|\bDR\b/g, 'DR')
    .replace(/\bTRAIL\b|\bTRL\b/g, 'TRL')
    .replace(/\bBOULEVARD\b|\bBLVD\b/g, 'BLVD')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function preparePursuitImportRows(
  rows: PursuitImportRow[],
  existingProspects: Pick<Prospect, 'id' | 'name' | 'businessName' | 'geometry'>[],
): PreparedPursuitImportRow[] {
  const existingByAddress = new Map<string, Pick<Prospect, 'id' | 'name' | 'businessName' | 'geometry'>>();
  for (const prospect of existingProspects) {
    const nameKey = normalizePursuitAddress(prospect.name);
    const businessKey = normalizePursuitAddress(prospect.businessName);
    if (nameKey) existingByAddress.set(nameKey, prospect);
    if (businessKey) existingByAddress.set(businessKey, prospect);
  }

  const fileKeys = new Set<string>();
  return rows.map((row) => {
    const key = normalizePursuitAddress(row.address);
    const observationIdentity = row.sourceRecordId || [row.tenantName, row.suite, row.leaseExpirationDate].filter(Boolean).join('|');
    const fileKey = row.importKind === 'ownership' || !observationIdentity ? key : `${key}|${observationIdentity.toUpperCase()}`;
    const existing = key ? existingByAddress.get(key) : undefined;
    const canUpdateExisting = Boolean(existing && row.importKind !== 'ownership');
    let duplicateReason: string | null = null;
    if (existing && !canUpdateExisting) duplicateReason = 'Already in this pursuit';
    else if (fileKey && fileKeys.has(fileKey)) duplicateReason = 'Duplicate row in this file';
    if (fileKey) fileKeys.add(fileKey);

    const pointCoordinates = existing?.geometry?.type === 'Point' ? existing.geometry.coordinates : null;
    const existingLongitude = Array.isArray(pointCoordinates) && typeof pointCoordinates[0] === 'number' ? pointCoordinates[0] : null;
    const existingLatitude = Array.isArray(pointCoordinates) && typeof pointCoordinates[1] === 'number' ? pointCoordinates[1] : null;

    return {
      ...row,
      selected: !duplicateReason,
      duplicateReason,
      updateReason: canUpdateExisting ? 'Updates existing asset' : null,
      geocodeError: null,
      formattedAddress: null,
      latitude: row.latitude ?? existingLatitude,
      longitude: row.longitude ?? existingLongitude,
    };
  });
}

export function chooseBestPursuitImportSheet(candidates: ParsedPursuitImportSheet[]): ParsedPursuitImportSheet | null {
  if (candidates.length === 0) return null;

  const scoreSheet = (candidate: ParsedPursuitImportSheet) => {
    const sheetName = normalizeCellText(candidate.sheetName).toLowerCase();
    let nameScore = 0;

    if (/call priorit|priorit|prospect|target/.test(sheetName)) nameScore += 1_000;
    else if (/propert|asset|listing/.test(sheetName)) nameScore += 500;

    if (/source|raw|all latest|check|assumption|repeat/.test(sheetName)) nameScore -= 500;

    return nameScore + candidate.detectedFields.length * 10 + Math.min(candidate.rows.length, DEFAULT_MAX_IMPORT_ROWS);
  };

  return [...candidates].sort((left, right) => {
    const scoreDifference = scoreSheet(right) - scoreSheet(left);
    if (scoreDifference !== 0) return scoreDifference;
    return right.rows.length - left.rows.length;
  })[0];
}
