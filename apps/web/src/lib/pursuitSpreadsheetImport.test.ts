import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseBestPursuitImportSheet,
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
    address: '5311 86 St',
    propertyName: '5311 86 St',
    status: 'prospect',
    buildingSf: 76437,
    lotSizeAcres: null,
    submarket: 'McIntyre Industrial',
    submarketBucket: 'SE',
    ownerCompany: 'THV Real Estate Holding Corp',
    contactName: 'James Sheard',
    contactEmail: '',
    contactPhone: '',
    notes: 'Submarket: McIntyre Industrial. Lead with value. Confirm title.',
    latitude: null,
    longitude: null,
  });
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

  const prepared = preparePursuitImportRows(parsed.rows, [{ name: '5311 86 Street NW, Edmonton, AB', businessName: null }]);
  assert.equal(prepared[0].duplicateReason, 'Already in this pursuit');
  assert.equal(prepared[1].duplicateReason, null);
  assert.equal(prepared[2].duplicateReason, 'Duplicate row in this file');
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
