import assert from 'node:assert/strict'
import test from 'node:test'

import { getMapRouteOptions, findRoadPath } from './routeOptimization.js'

const roads = [
  { id: '1', from_node_id: 1, to_node_id: 2, distanceKm: 1, condition: 'Passable' },
  { id: '2', from_node_id: 2, to_node_id: 4, distanceKm: 1, condition: 'Passable' },
  { id: '3', from_node_id: 1, to_node_id: 3, distanceKm: 1.5, condition: 'Passable' },
  { id: '4', from_node_id: 3, to_node_id: 4, distanceKm: 1.5, condition: 'Passable' },
  { id: '5', from_node_id: 2, to_node_id: 3, distanceKm: 1, condition: 'Passable' },
  { id: '6', from_node_id: 1, to_node_id: 4, distanceKm: 0.5, condition: 'Impassable' },
]

test('classifies distinct shortest, longer, and verified blocked graph routes', () => {
  const routes = getMapRouteOptions(roads, 1, 4)

  assert.deepEqual(routes.recommended.edgeIds, ['1', '2'])
  assert.equal(routes.recommended.distanceKm, 2)
  assert.deepEqual(routes.passable.edgeIds, ['3', '4'])
  assert.equal(routes.passable.distanceKm, 3)
  assert.ok(routes.passable.distanceKm > routes.recommended.distanceKm)
  assert.notDeepEqual(routes.passable.edgeIds, routes.recommended.edgeIds)
  assert.deepEqual(routes.impassable.edgeIds, ['6'])
  assert.deepEqual(routes.impassable.nodeIds, ['1', '4'])
  assert.equal(routes.impassable.nodeIds[0], routes.recommended.nodeIds[0])
  assert.equal(routes.impassable.nodeIds.at(-1), routes.recommended.nodeIds.at(-1))
  assert.equal(routes.impassable.blockedEdgeId, '6')
  assert.equal(roads.find((road) => road.id === routes.impassable.blockedEdgeId).condition, 'Impassable')
})

test('does not invent an alternative or blocked path when the graph lacks one', () => {
  const routes = getMapRouteOptions([
    { id: 'open', from_node_id: 1, to_node_id: 2, distanceKm: 1, condition: 'Passable' },
    { id: 'unknown', from_node_id: 2, to_node_id: 3, distanceKm: 1, condition: 'Unknown' },
    { id: 'blocked', from_node_id: 1, to_node_id: 3, distanceKm: 0.5, condition: 'Unknown' },
  ], 1, 2)

  assert.deepEqual(routes.recommended.edgeIds, ['open'])
  assert.equal(routes.passable, null)
  assert.equal(routes.impassable, null)
})

test('respects directed road edges and excludes impassable edges from passable routing', () => {
  const directedRoads = [
    { id: 'out', from_node_id: 1, to_node_id: 2, distanceKm: 1, condition: 'Passable' },
    { id: 'closed', from_node_id: 2, to_node_id: 3, distanceKm: 1, condition: 'Impassable' },
  ]

  assert.equal(findRoadPath(directedRoads, 1, 3), null)
  assert.deepEqual(findRoadPath(directedRoads, 2, 1), null)
  assert.deepEqual(getMapRouteOptions(directedRoads, 1, 3), {
    recommended: null,
    passable: null,
    impassable: {
      distanceKm: 2,
      nodeIds: ['1', '2', '3'],
      edgeIds: ['out', 'closed'],
      blockedEdgeId: 'closed',
    },
  })
})

test('ignores roads without a valid positive distance', () => {
  const invalidRoads = [
    { id: 'missing', from_node_id: 1, to_node_id: 2, condition: 'Passable' },
    { id: 'zero', from_node_id: 1, to_node_id: 2, distanceKm: 0, condition: 'Passable' },
  ]

  assert.equal(findRoadPath(invalidRoads, 1, 2), null)
})
