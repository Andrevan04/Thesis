const munkres = require('munkres-js')

const UNREACHABLE_COST = 1e12

const distanceBetween = (first, second) => {
  const radians = (degrees) => degrees * Math.PI / 180
  const latitude1 = radians(Number(first.latitude))
  const latitude2 = radians(Number(second.latitude))
  const latitudeDelta = latitude2 - latitude1
  const longitudeDelta = radians(Number(second.longitude) - Number(first.longitude))
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

const createRoadGraph = (nodes, edges) => {
  const nodeById = new Map(nodes.map((node) => [Number(node.node_id), node]))
  const adjacency = new Map(nodes.map((node) => [Number(node.node_id), []]))

  for (const edge of edges) {
    if (edge.is_passable !== true) continue
    const fromId = Number(edge.from_node_id)
    const toId = Number(edge.to_node_id)
    const from = nodeById.get(fromId)
    const to = nodeById.get(toId)
    if (!from || !to) continue

    const edgeWeight = Number(edge.distance_km ?? edge.distance)
    const weight = Number.isFinite(edgeWeight) && edgeWeight >= 0
      ? edgeWeight
      : distanceBetween(from, to)
    adjacency.get(fromId).push({ nodeId: toId, edgeId: Number(edge.edge_id), weight })
  }

  return { nodeById, adjacency }
}

const shortestPath = (graph, startId, endId) => {
  const source = Number(startId)
  const target = Number(endId)
  if (!graph.nodeById.has(source) || !graph.nodeById.has(target)) return null
  if (source === target) return { distanceKm: 0, nodeIds: [source], edgeIds: [] }

  const distances = new Map([[source, 0]])
  const previous = new Map()
  const visited = new Set()

  while (true) {
    let current = null
    let bestDistance = Infinity
    for (const [nodeId, distance] of distances) {
      if (!visited.has(nodeId) && distance < bestDistance) {
        current = nodeId
        bestDistance = distance
      }
    }

    if (current === null) return null
    if (current === target) break
    visited.add(current)

    for (const edge of graph.adjacency.get(current) || []) {
      const candidate = bestDistance + edge.weight
      if (candidate < (distances.get(edge.nodeId) ?? Infinity)) {
        distances.set(edge.nodeId, candidate)
        previous.set(edge.nodeId, { nodeId: current, edgeId: edge.edgeId })
      }
    }
  }

  const nodeIds = [target]
  const edgeIds = []
  let current = target
  while (current !== source) {
    const step = previous.get(current)
    if (!step) return null
    edgeIds.unshift(step.edgeId)
    nodeIds.unshift(step.nodeId)
    current = step.nodeId
  }

  return { distanceKm: distances.get(target), nodeIds, edgeIds }
}

const optimalAssignment = (costMatrix) => {
  if (!costMatrix.length || !costMatrix[0]?.length) return []
  return munkres(costMatrix)
}

const routeAffectedByEdge = (route, edgeId) => {
  const edgeIds = Array.isArray(route?.edge_ids) ? route.edge_ids.map(String) : []
  const status = route?.status || route?.route_status
  return status === 'Unreachable' || edgeIds.length === 0 || edgeIds.includes(String(edgeId))
}

const recommendAssignments = ({ units, incidents, nodes, edges }) => {
  const availableUnits = units.filter((unit) => String(unit.status).toLowerCase() === 'available')
  const pendingIncidents = incidents.filter((incident) => String(incident.status).toLowerCase() === 'pending')
  if (!availableUnits.length || !pendingIncidents.length) {
    return { assignments: [], unassignedIncidentIds: pendingIncidents.map((incident) => Number(incident.incident_id)) }
  }

  const graph = createRoadGraph(nodes, edges)
  const paths = availableUnits.map((unit) => pendingIncidents.map((incident) => {
    const path = shortestPath(graph, unit.current_node_id, incident.location_node_id)
    const demand = Number(incident.people_affected ?? incident.affected_residents ?? 1)
    const capacity = Number(unit.capacity)
    if (!path || (Number.isFinite(capacity) && Number.isFinite(demand) && capacity < demand)) return null
    return path
  }))
  const costs = paths.map((unitPaths) => unitPaths.map((path) => path?.distanceKm ?? UNREACHABLE_COST))
  const pairs = optimalAssignment(costs)
  const assignments = pairs.flatMap(([unitIndex, incidentIndex]) => {
    const path = paths[unitIndex]?.[incidentIndex]
    if (!path || costs[unitIndex][incidentIndex] >= UNREACHABLE_COST) return []
    const unit = availableUnits[unitIndex]
    const incident = pendingIncidents[incidentIndex]
    return [{
      unitId: Number(unit.unit_id),
      incidentId: Number(incident.incident_id),
      unitName: unit.name || unit.unit_name || `Rescue Unit ${unit.unit_id}`,
      incidentLabel: incident.barangay || incident.location_name || `Node ${incident.location_node_id}`,
      priority: incident.urgency_level,
      distanceKm: path.distanceKm,
      nodeIds: path.nodeIds,
      edgeIds: path.edgeIds,
    }]
  })
  const assignedIncidentIds = new Set(assignments.map((item) => item.incidentId))

  return {
    assignments,
    unassignedIncidentIds: pendingIncidents
      .filter((incident) => !assignedIncidentIds.has(Number(incident.incident_id)))
      .map((incident) => Number(incident.incident_id)),
  }
}

module.exports = {
  createRoadGraph,
  shortestPath,
  optimalAssignment,
  routeAffectedByEdge,
  recommendAssignments,
}