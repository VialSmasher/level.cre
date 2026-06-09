import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prospectGeometryFromTerraFeature } from './useTerraDrawGoogleMaps';

test('prospectGeometryFromTerraFeature preserves point coordinates', () => {
  const geometry = prospectGeometryFromTerraFeature({
    id: 'point-1',
    type: 'Feature',
    properties: { mode: 'point' },
    geometry: {
      type: 'Point',
      coordinates: [-113.4938, 53.5461],
    },
  } as any);

  assert.deepEqual(geometry, {
    type: 'Point',
    coordinates: [-113.4938, 53.5461],
  });
});

test('prospectGeometryFromTerraFeature closes polygon rings for saved prospects', () => {
  const geometry = prospectGeometryFromTerraFeature({
    id: 'polygon-1',
    type: 'Feature',
    properties: { mode: 'polygon' },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-113.5, 53.54],
        [-113.49, 53.54],
        [-113.49, 53.55],
        [-113.5, 53.55],
      ]],
    },
  } as any);

  assert.deepEqual(geometry, {
    type: 'Polygon',
    coordinates: [[
      [-113.5, 53.54],
      [-113.49, 53.54],
      [-113.49, 53.55],
      [-113.5, 53.55],
      [-113.5, 53.54],
    ]],
  });
});

