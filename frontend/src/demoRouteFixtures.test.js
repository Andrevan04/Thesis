import assert from 'node:assert/strict'
import test from 'node:test'

import { getDemoRouteFixtureScenarios, getDemoRouteFixtures } from './demoRouteFixtures.js'
import { getMapRouteOptions } from './routeOptimization.js'

test('demo scenarios provide a connected shortest, longer, and blocked route for each assigned map', () => {
  for (const [nodePair, scenario] of Object.entries(getDemoRouteFixtureScenarios())) {
    const [startNodeId, endNodeId] = nodePair.split('->')
    const fixtures = getDemoRouteFixtures(startNodeId, endNodeId, [14.84, 120.81], [14.85, 120.82])
    const routes = getMapRouteOptions(fixtures, startNodeId, endNodeId)

    assert.deepEqual(routes.recommended.nodeIds, [startNodeId, endNodeId])
    assert.deepEqual(routes.passable.nodeIds, [startNodeId, endNodeId])
    assert.deepEqual(routes.impassable.nodeIds, [startNodeId, endNodeId])
    assert.equal(routes.recommended.distanceKm, scenario[0].distanceKm)
    assert.equal(routes.passable.distanceKm, scenario[1].distanceKm)
    assert.equal(routes.impassable.distanceKm, scenario[2].distanceKm)
    assert.ok(routes.passable.distanceKm > routes.recommended.distanceKm)
    assert.notDeepEqual(routes.recommended.edgeIds, routes.passable.edgeIds)
    assert.equal(fixtures.find((road) => road.id === routes.impassable.blockedEdgeId).condition, 'Impassable')
    assert.ok(fixtures.every((road) => road.allowRouterGeometry && road.demoRouteFixture))
  }
})

test('demo route fixtures make dispatch recommendations use the displayed shortest distance', () => {
  for (const [nodePair, scenario] of Object.entries(getDemoRouteFixtureScenarios())) {
    const [startNodeId, endNodeId] = nodePair.split('->')
    const fixtures = getDemoRouteFixtures(startNodeId, endNodeId, [14.84, 120.81], [14.85, 120.82])

    assert.equal(getMapRouteOptions(fixtures, startNodeId, endNodeId).recommended.distanceKm, scenario[0].distanceKm)
  }
})

test('demo fixtures preserve street-routing waypoints and reject unknown node pairs', () => {
  const fixtures = getDemoRouteFixtures(2, 5, [14.83, 120.82], [14.84, 120.85])

  assert.equal(fixtures[0].viaCoordinates.length, 0)
  assert.deepEqual(fixtures[1].viaCoordinates, [[120.835, 14.83]])
  assert.deepEqual(fixtures[2].viaCoordinates, [[120.83, 14.85]])
  assert.deepEqual(getDemoRouteFixtures(3, 5, [14.85, 120.81], [14.84, 120.85]), [])
})
