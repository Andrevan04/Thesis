import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeDemoStreetRoutes } from './demoStreetRoutes.js'

const start = [14.85, 120.81]
const end = [14.86, 120.82]

test('uses actual router geometries for the shortest route and a distinct longer alternative', () => {
  const result = normalizeDemoStreetRoutes([
    { distance: 2400, geometry: { coordinates: [[120.81, 14.85], [120.815, 14.855], [120.82, 14.86]] } },
    { distance: 1500, geometry: { coordinates: [[120.81, 14.85], [120.817, 14.857], [120.82, 14.86]] } },
  ], start, end)

  assert.equal(result.recommended.distanceKm, 1.5)
  assert.deepEqual(result.recommended.positions[0], start)
  assert.deepEqual(result.recommended.positions.at(-1), end)
  assert.equal(result.passable.distanceKm, 2.4)
  assert.notDeepEqual(result.passable.positions, result.recommended.positions)
})

test('does not invent an alternative when the router returns one route', () => {
  const result = normalizeDemoStreetRoutes([
    { distance: 1500, geometry: { coordinates: [[120.81, 14.85], [120.82, 14.86]] } },
  ], start, end)

  assert.equal(result.passable, null)
})

test('rejects malformed or endpoint-disconnected street routes', () => {
  assert.throws(() => normalizeDemoStreetRoutes([], start, end), /no road-following route/)
  assert.throws(() => normalizeDemoStreetRoutes([
    { distance: 1500, geometry: { coordinates: [[120.8, 14.8], [120.82, 14.86]] } },
  ], start, end), /no road-following route/)
})
