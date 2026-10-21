import test from 'node:test'
import assert from 'node:assert/strict'

import { demoBarangays, demoBarangayLocations, malolosBarangays } from './barangays.js'

test('demo intake is limited to ten located barangays in Malolos', () => {
  assert.equal(demoBarangays.length, 10)
  assert.equal(new Set(demoBarangays).size, 10)
  assert.ok(demoBarangays.every((barangay) => malolosBarangays.includes(barangay)))
  assert.deepEqual(Object.keys(demoBarangayLocations).sort(), [...demoBarangays].sort())
  assert.ok(Object.values(demoBarangayLocations).every(({ latitude, longitude }) => (
    latitude >= 14.8 && latitude <= 14.9 && longitude >= 120.7 && longitude <= 120.9
  )))
})
