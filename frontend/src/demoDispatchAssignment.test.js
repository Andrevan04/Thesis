import assert from 'node:assert/strict'
import test from 'node:test'

import { assignUnreachableIncidents } from './demoDispatchAssignment.js'

test('assigns pending incidents without a route to remaining available units by urgency', () => {
  const assigned = assignUnreachableIncidents(
    [
      { unit_id: 1, name: 'Busy unit', status: 'Deployed', capacity: 10 },
      { unit_id: 2, name: 'Free unit 2', status: 'Available', capacity: 8 },
      { unit_id: 3, name: 'Free unit 3', status: 'Available', capacity: 5 },
    ],
    [
      { incident_id: 10, barangay: 'Low priority', urgency_level: 'Low', people_affected: 2 },
      { incident_id: 11, barangay: 'Critical', urgency_level: 'Critical', people_affected: 6 },
      { incident_id: 12, barangay: 'Over capacity', urgency_level: 'High', people_affected: 9 },
    ],
    [{ unitId: '1', incidentId: '9' }],
  )

  assert.deepEqual(assigned.map(({ unitId, incidentId, routeStatus }) => ({ unitId, incidentId, routeStatus })), [
    { unitId: '2', incidentId: '11', routeStatus: 'Unreachable' },
    { unitId: '3', incidentId: '10', routeStatus: 'Unreachable' },
  ])
  assert.ok(assigned.every((assignment) => (
    assignment.distanceKm === null && assignment.nodeIds.length === 0 && assignment.edgeIds.length === 0
  )))
})

test('does not create assignments when no available unit or capacity remains', () => {
  const incidents = [{ incident_id: 1, urgency_level: 'High', people_affected: 4 }]

  assert.deepEqual(assignUnreachableIncidents(
    [{ unit_id: 1, status: 'Deployed', capacity: 10 }],
    incidents,
    [],
  ), [])
  assert.deepEqual(assignUnreachableIncidents(
    [{ unit_id: 1, status: 'Available', capacity: 3 }],
    incidents,
    [],
  ), [])
})
