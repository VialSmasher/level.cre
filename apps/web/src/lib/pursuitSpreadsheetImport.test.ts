import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseBestPursuitImportSheet,
  detectPropertyImportSource,
  normalizePursuitAddress,
  parsePursuitImportSheet,
  preparePursuitImportRows,
  toPursuitSubmarketBucket,
} from './pursuitSpreadsheetImport';

test('finds a header below workbook title rows and maps owner priority columns', () => {
  const parsed = parsePursuitImportSheet([
    ['Edmonton Industrial Owner Call Priorities'],
    ['Generated for review'],
    [],
    ['Rank', 'Address', 'Submarket', 'Owner / Purchaser of Record', 'Contact', 'Building SF', 'Call Angle', 'Verification'],
    [1, '5311 86 St', 'McIntyre Industrial', 'THV Real Estate Holding Corp', 'James Sheard', 76437, 'Lead with value.', 'Confirm title.'],
  ], 'Call Priorities');

  assert.ok(parsed);
  assert.equal(parsed.headerRow, 4);
  assert.equal(parsed.rows.length, 1);
  assert.deepEqual(parsed.rows[0], {
    sourceRow: 5,
    sourceSheet: 'Call Priorities',
    sourceSystem: 'generic',
    importKind: 'ownership',
    sourceRecordId: '',
    sourceUrl: '',
    address: '5311 86 St',
    propertyName: '5311 86 St',
    status: 'prospect',
    buildingSf: 76437,
    lotSizeAcres: null,
    submarket: 'McIntyre Industrial',
    submarketBucket: 'SE',
    ownerCompany: 'THV Real Estate Holding Corp',
    tenantName: '',
    suite: '',
    occupancySf: null,
    availableSf: null,
    leaseCommencementDate: null,
    leaseExpirationDate: null,
    renewalNoticeDate: null,
    leaseTermMonths: null,
    askingRentPsf: null,
    listingType: '',
    contactName: 'James Sheard',
    contactEmail: '',
    contactPhone: '',
    notes: 'Submarket: McIntyre Industrial. Lead with value. Confirm title.',
    latitude: null,
    longitude: null,
  });
});

test('detects Gettel-derived owner exports from their column language', () => {
  const parsed = parsePursuitImportSheet([
    ['Address', 'Owner / Purchaser of Record'],
    ['5311 86 St', 'THV Real Estate Holding Corp'],
  ], 'Properties');
  assert.ok(parsed);
  assert.equal(detectPropertyImportSource('Edmonton owners.xlsx', parsed), 'gettel');
});

test('maps CoStar tenancy and renewal fields into a normalized lease signal', () => {
  const parsed = parsePursuitImportSheet([
    ['CoStar Property ID', 'Property Address', 'Tenant Name', 'Occupied SF', 'Lease Commencement', 'Lease Expiration Date', 'Renewal Notice Date', 'Rent/SF/Yr'],
    ['P-100', '8204 Coronet Road', 'Example Distribution Ltd.', 63330, '2024-01-01', 47484, '09/30/2028', '$14.50'],
  ], 'Tenant Detail');
  assert.ok(parsed);
  assert.equal(detectPropertyImportSource('CoStar Tenant Export.xlsx', parsed), 'costar');
  assert.equal(parsed.importKind, 'tenancy');
  assert.deepEqual({
    sourceRecordId: parsed.rows[0].sourceRecordId,
    tenantName: parsed.rows[0].tenantName,
    occupancySf: parsed.rows[0].occupancySf,
    leaseCommencementDate: parsed.rows[0].leaseCommencementDate,
    leaseExpirationDate: parsed.rows[0].leaseExpirationDate,
    renewalNoticeDate: parsed.rows[0].renewalNoticeDate,
    askingRentPsf: parsed.rows[0].askingRentPsf,
  }, {
    sourceRecordId: 'P-100',
    tenantName: 'Example Distribution Ltd.',
    occupancySf: 63330,
    leaseCommencementDate: '2024-01-01',
    leaseExpirationDate: '2030-01-01',
    renewalNoticeDate: '2028-09-30',
    askingRentPsf: 14.5,
  });
  assert.match(parsed.rows[0].notes, /Lease expiry: 2030-01-01/);
});

test('normalizes formatted and abbreviated Edmonton addresses for duplicate checks', () => {
  assert.equal(
    normalizePursuitAddress('5311 86 Street Northwest, Edmonton, AB T6E 5T8, Canada'),
    normalizePursuitAddress('5311 86 St NW'),
  );
});

test('marks existing pursuit addresses and repeated file rows as duplicates', () => {
  const parsed = parsePursuitImportSheet([
    ['Address', 'Building SF'],
    ['5311 86 St', 76437],
    ['1210 70 Avenue', 40700],
    ['1210 70 Ave NW', 40700],
  ], 'Assets');
  assert.ok(parsed);

  const prepared = preparePursuitImportRows(parsed.rows, [{
    id: 'existing-1',
    name: '5311 86 Street NW, Edmonton, AB',
    businessName: null,
    geometry: { type: 'Point', coordinates: [-113.48, 53.49] },
  }]);
  assert.equal(prepared[0].duplicateReason, 'Already in this pursuit');
  assert.equal(prepared[1].duplicateReason, null);
  assert.equal(prepared[2].duplicateReason, 'Duplicate row in this file');
});

test('treats tenancy data at an existing address as an update, not a duplicate building', () => {
  const parsed = parsePursuitImportSheet([
    ['Address', 'Tenant', 'Lease Expiration'],
    ['5311 86 St', 'Example Tenant', '2030-06-30'],
  ], 'Tenant Detail');
  assert.ok(parsed);
  const [prepared] = preparePursuitImportRows(parsed.rows, [{
    id: 'existing-1',
    name: '5311 86 Street NW, Edmonton, AB',
    businessName: null,
    geometry: { type: 'Point', coordinates: [-113.48, 53.49] },
  }]);
  assert.equal(prepared.duplicateReason, null);
  assert.equal(prepared.updateReason, 'Updates existing asset');
  assert.equal(prepared.selected, true);
  assert.equal(prepared.longitude, -113.48);
  assert.equal(prepared.latitude, 53.49);
});

test('keeps distinct tenant observations at the same building', () => {
  const parsed = parsePursuitImportSheet([
    ['Address', 'Tenant', 'Suite', 'Lease Expiration'],
    ['8204 Coronet Road', 'Tenant A', '100', '2029-06-30'],
    ['8204 Coronet Road', 'Tenant B', '200', '2030-12-31'],
  ], 'Tenant Detail');
  assert.ok(parsed);
  const prepared = preparePursuitImportRows(parsed.rows, []);
  assert.equal(prepared[0].duplicateReason, null);
  assert.equal(prepared[1].duplicateReason, null);
  assert.equal(prepared[0].selected, true);
  assert.equal(prepared[1].selected, true);
});

test('prefers a purpose-named property sheet over a generic summary', () => {
  const small = parsePursuitImportSheet([['Address'], ['1 Test St']], 'Summary');
  const large = parsePursuitImportSheet([['Address'], ['1 Test St'], ['2 Test St']], 'Properties');
  assert.ok(small && large);
  assert.equal(chooseBestPursuitImportSheet([small, large])?.sheetName, 'Properties');
});

test('prefers a call-priority sheet over a larger raw-owner sheet', () => {
  const priorities = parsePursuitImportSheet([['Address'], ['1 Test St'], ['2 Test St']], 'Call Priorities');
  const rawOwners = parsePursuitImportSheet([
    ['Address'],
    ['1 Test St'],
    ['2 Test St'],
    ['3 Test St'],
    ['4 Test St'],
  ], 'All Latest Owners');
  assert.ok(priorities && rawOwners);
  assert.equal(chooseBestPursuitImportSheet([rawOwners, priorities])?.sheetName, 'Call Priorities');
});

test('maps common Edmonton industrial submarkets to broad map buckets', () => {
  assert.equal(toPursuitSubmarketBucket('Roper Industrial'), 'SE');
  assert.equal(toPursuitSubmarketBucket('Winterburn Industrial'), 'NW');
  assert.equal(toPursuitSubmarketBucket('Nisku Industrial Park'), 'Nisku');
});
