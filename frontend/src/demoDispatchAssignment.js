const urgencyOrder = ['Critical', 'High', 'Medium', 'Low']

export const assignUnreachableIncidents = (
  units,
  incidents,
  existingAssignments,
) => {
  const assignedUnitIds = new Set(existingAssignments.map((assignment) => String(assignment.unitId)))
  const assignedIncidentIds = new Set(existingAssignments.map((assignment) => String(assignment.incidentId)))
  const availableUnits = units
    .filter((unit) => unit.status.toLowerCase() === 'available' && !assignedUnitIds.has(String(unit.unit_id)))
    .sort((first, second) => Number(first.unit_id) - Number(second.unit_id))
  const pendingIncidents = incidents
    .filter((incident) => !assignedIncidentIds.has(String(incident.incident_id)))
    .sort((first, second) => {
      const urgencyDifference = urgencyOrder.indexOf(first.urgency_level) - urgencyOrder.indexOf(second.urgency_level)
      return urgencyDifference || Number(first.incident_id) - Number(second.incident_id)
    })
  const fallbackAssignments = []

  for (const incident of pendingIncidents) {
    const demand = Number(incident.people_affected ?? incident.affected_residents ?? 1)
    const unitIndex = availableUnits.findIndex((unit) => (
      !Number.isFinite(Number(unit.capacity)) || Number(unit.capacity) >= demand
    ))
    if (unitIndex < 0) continue

    const [unit] = availableUnits.splice(unitIndex, 1)
    fallbackAssignments.push({
      unitId: String(unit.unit_id),
      incidentId: String(incident.incident_id),
      unitName: unit.name || unit.unit_name || `Rescue Unit ${unit.unit_id}`,
      incidentLabel: incident.barangay || `Node ${incident.location_node_id}`,
      priority: incident.urgency_level,
      distanceKm: null,
      nodeIds: [],
      edgeIds: [],
      routeStatus: 'Unreachable',
    })
  }

  return fallbackAssignments
}
