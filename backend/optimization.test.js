const assert = require('node:assert/strict')
const test = require('node:test')
const { createRoadGraph, shortestPath, optimalAssignment, recommendAssignments } = require('./optimization')

test('shortest path avoids impassable edges and returns the node path', () => {
  const graph = createRoadGraph(
    [
      { node_id: 1, latitude: 0, longitude: 0 },
      { node_id: 2, latitude: 0, longitude: 1 },
      { node_id: 3, latitude: 0, longitude: 2 },
    ],
    [
      { edge_id: 1, from_node_id: 1, to_node_id: 3, is_passable: false, distance_km: 1 },
      { edge_id: 2, from_node_id: 1, to_node_id: 2, is_passable: true, distance_km: 2 },
      { edge_id: 3, from_node_id: 2, to_node_id: 3, is_passable: true, distance_km: 2 },
    ],
  )

  assert.deepEqual(shortestPath(graph, 1, 3), { distanceKm: 4, nodeIds: [1, 2, 3], edgeIds: [2, 3] })
  assert.equal(shortestPath(graph, 3, 1), null)
})

test('Hungarian assignment beats greedy pairing on a non-greedy cost matrix', () => {
  const pairs = optimalAssignment([[1, 2], [2, 100]])
  const total = pairs.reduce((sum, [unit, incident]) => sum + [[1, 2], [2, 100]][unit][incident], 0)

  assert.deepEqual(pairs, [[0, 1], [1, 0]])
  assert.equal(total, 4)
})

test('recommendations omit incidents with no passable or capacity-feasible match', () => {
  const result = recommendAssignments({
    units: [{ unit_id: 1, current_node_id: 1, capacity: 2, status: 'Available' }],
    incidents: [
      { incident_id: 10, location_node_id: 2, people_affected: 3, urgency_level: 'High', status: 'Pending' },
      { incident_id: 11, location_node_id: 3, people_affected: 1, urgency_level: 'Medium', status: 'Pending' },
    ],
    nodes: [
      { node_id: 1, latitude: 0, longitude: 0 },
      { node_id: 2, latitude: 0, longitude: 1 },
      { node_id: 3, latitude: 0, longitude: 2 },
    ],
    edges: [{ edge_id: 1, from_node_id: 1, to_node_id: 3, is_passable: true, distance_km: 5 }],
  })

  assert.deepEqual(result.assignments.map((item) => item.incidentId), [11])
  assert.deepEqual(result.unassignedIncidentIds, [10])
  assert.deepEqual(result.assignments[0].nodeIds, [1, 3])
})