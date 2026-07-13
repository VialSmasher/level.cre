import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMarketGeocodeQuery,
  buildPlacesAutocompleteQuery,
  isLikelyAddressQuery,
} from './searchQueries';

test('autocomplete preserves the company text and relies on location bias', () => {
  assert.equal(buildPlacesAutocompleteQuery('  Nucor  '), 'Nucor');
  assert.equal(buildPlacesAutocompleteQuery('Waj'), 'Waj');
});

test('geocoder fallback adds the market without duplicating Edmonton', () => {
  assert.equal(
    buildMarketGeocodeQuery('10060 Jasper Avenue', 'Edmonton, Alberta, Canada'),
    '10060 Jasper Avenue, Edmonton, Alberta, Canada',
  );
  assert.equal(
    buildMarketGeocodeQuery('10060 Jasper Avenue, Edmonton', 'Edmonton, Alberta, Canada'),
    '10060 Jasper Avenue, Edmonton',
  );
});

test('company names do not fall through to address geocoding', () => {
  assert.equal(isLikelyAddressQuery('Daveta Energy'), false);
  assert.equal(isLikelyAddressQuery('Nucor'), false);
  assert.equal(isLikelyAddressQuery('3M Canada'), false);
  assert.equal(isLikelyAddressQuery('10060 Jasper Avenue'), true);
  assert.equal(isLikelyAddressQuery('Jasper Ave'), true);
  assert.equal(isLikelyAddressQuery('T5J 1V9'), true);
});
