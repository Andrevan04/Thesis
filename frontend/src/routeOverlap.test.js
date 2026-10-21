import assert from 'node:assert/strict'
import test from 'node:test'

import { removeOverlappingRouteSegments } from './routeOverlap.js'

const latitude = 14.85
const metersToLatitude = (meters) => meters / 111_320

test('hides only the impassable portion that follows the recommended road', () => {
  const sharedStart = [latitude, 120.81]
  const sharedEnd = [latitude, 120.812]
  const branchEnd = [latitude + 0.002, 120.812]
  const fragments = removeOverlappingRouteSegments(
    [sharedStart, sharedEnd, branchEnd],
    [sharedStart, sharedEnd],
  )

  assert.equal(fragments.length, 1)
  assert.ok(fragments[0].length >= 2)
  assert.ok(fragments[0].every((position) => position[0] >= sharedEnd[0]))
  assert.deepEqual(fragments[0].at(-1), branchEnd)
})

test('retains nearby parallel roads and removes only the local crossing', () => {
  const recommended = [[latitude, 120.81], [latitude, 120.812]]
  const parallelRoute = [[latitude + metersToLatitude(30), 120.81], [latitude + metersToLatitude(30), 120.812]]
  const crossingRoute = [[latitude - 0.001, 120.811], [latitude + 0.001, 120.811]]

  assert.equal(removeOverlappingRouteSegments(parallelRoute, recommended).length, 1)
  const crossingFragments = removeOverlappingRouteSegments(crossingRoute, recommended)
  assert.equal(crossingFragments.length, 2)
  assert.ok(crossingFragments[0].at(-1)[0] < latitude)
  assert.ok(crossingFragments[1][0][0] > latitude)
})

test('returns no red geometry when the blocked path completely overlaps the recommendation', () => {
  const route = [[latitude, 120.81], [latitude, 120.811], [latitude, 120.812]]

  assert.deepEqual(removeOverlappingRouteSegments(route, route), [])
})
