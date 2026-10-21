import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeRoadGeometry } from './roadGeometry.js'

const from = { latitude: 14.85, longitude: 120.81 }
const to = { latitude: 14.851, longitude: 120.811 }

test('normalizes a LineString whose endpoints match its directed road nodes', () => {
  const result = normalizeRoadGeometry({
    type: 'LineString',
    coordinates: [
      [120.81, 14.85],
      [120.8105, 14.8505],
      [120.811, 14.851],
    ],
  }, from, to)

  assert.deepEqual(result.positions, [[14.85, 120.81], [14.8505, 120.8105], [14.851, 120.811]])
  assert.equal(result.error, null)
})

test('rejects missing, malformed, and reversed-direction edge geometry', () => {
  assert.equal(normalizeRoadGeometry(null, from, to).positions, null)
  assert.match(normalizeRoadGeometry('{invalid', from, to).error, /valid GeoJSON/)
  assert.match(normalizeRoadGeometry({
    type: 'LineString',
    coordinates: [[120.811, 14.851], [120.81, 14.85]],
  }, from, to).error, /directed endpoint nodes/)
})
