import munkres from 'munkres-js'
import { getDemoRouteFixtures } from './demoRouteFixtures'
import { normalizeRoadGeometry } from './roadGeometry'
import { findRoadPath } from './routeOptimization'
import { demoBarangayLocations } from './data/barangays'

const API_URL = '/api'
const DEFAULT_USER_ID = Number(import.meta.env.VITE_USER_ID || 1)
const prioritiesForEvaluation = ['Critical', 'High', 'Medium', 'Low']
const USE_DEMO_DATA = import.meta.env.VITE_DEMO_MODE !== 'false'
const DEMO_STORAGE_KEY = 'flood-dispatch-demo-data'
const INCIDENT_BARANGAY_KEY = 'flood-dispatch-incident-barangays'
const INCIDENT_COORDINATE_KEY = 'flood-dispatch-incident-coordinates'
const BARANGAY_COORDINATE_KEY = 'flood-dispatch-barangay-coordinates'
let demoMode = false
const roadGeometryCache = new Map()

const createDemoData = () => ({
  nodes: [
    { node_id: 1, node_type: 'Operations center', latitude: 14.841474, longitude: 120.812272 },
    { node_id: 2, node_type: 'Road junction', latitude: 14.829974, longitude: 120.818234 },
    { node_id: 3, node_type: 'Evacuation area', latitude: 14.857662, longitude: 120.814045 },
    { node_id: 4, node_type: 'Road junction', latitude: 14.82364, longitude: 120.845272 },
    { node_id: 5, node_type: 'Community center', latitude: 14.840909, longitude: 120.853198 },
    { node_id: 6, node_type: 'Road junction', latitude: 14.85126, longitude: 120.835154 },
    { node_id: 7, node_type: 'Road junction', latitude: 14.862076, longitude: 120.806557 },
  ],
  incidents: [
    { incident_id: 1, reported_by: 1, location_node_id: 3, location_latitude: 14.857662, location_longitude: 120.814045, people_affected: 8, barangay: 'Guinhawa', urgency_level: 'High', status: 'Pending' },
    { incident_id: 2, reported_by: 2, location_node_id: 4, location_latitude: 14.82364, location_longitude: 120.845272, people_affected: 6, barangay: 'Bangkal', urgency_level: 'Critical', status: 'Assigned' },
    { incident_id: 3, reported_by: 1, location_node_id: 5, location_latitude: 14.840909, location_longitude: 120.853198, people_affected: 5, barangay: 'Tikay', urgency_level: 'Medium', status: 'Pending' },
    { incident_id: 4, reported_by: 2, location_node_id: 2, location_latitude: 14.829974, location_longitude: 120.818234, people_affected: 2, barangay: 'Atlag', urgency_level: 'Low', status: 'Resolved' },
  ],
  units: [
    { unit_id: 1, name: 'Rescue Unit 1', type: 'Ambulance', current_node_id: 1, capacity: 10, status: 'Available' },
    { unit_id: 2, name: 'Rescue Unit 2', type: 'Rescue boat', current_node_id: 5, capacity: 8, status: 'Deployed' },
    { unit_id: 3, name: 'Rescue Unit 3', type: 'Rescue truck', current_node_id: 2, capacity: 6, status: 'Available' },
    { unit_id: 4, name: 'Rescue Unit 4', type: 'Rescue boat', current_node_id: 4, capacity: 12, status: 'Available' },
  ],
  edges: [
    { edge_id: 1, from_node_id: 1, to_node_id: 2, distance_km: 1.6731, is_passable: true },
    { edge_id: 2, from_node_id: 2, to_node_id: 3, distance_km: 3.8961, is_passable: true },
    { edge_id: 3, from_node_id: 3, to_node_id: 4, distance_km: 8.3789, is_passable: false },
    { edge_id: 4, from_node_id: 2, to_node_id: 5, distance_km: 4.6077, is_passable: true },
    { edge_id: 5, from_node_id: 5, to_node_id: 4, distance_km: 4.5206, is_passable: true },
    { edge_id: 6, from_node_id: 5, to_node_id: 6, distance_km: 2.938, is_passable: true },
    { edge_id: 7, from_node_id: 6, to_node_id: 4, distance_km: 6.286, is_passable: true },
    { edge_id: 8, from_node_id: 5, to_node_id: 7, distance_km: 5.8187, is_passable: true },
    { edge_id: 9, from_node_id: 7, to_node_id: 4, distance_km: 9.1667, is_passable: false },
  ],
  dispatches: [
    { dispatch_id: 1, unit_id: 2, incident_id: 2, assigned_by: 2, status: 'Assigned', route: { total_distance: 4.5206, node_ids: [5, 4], edge_ids: [5] } },
  ],
  logs: [
    { log_id: 3, user_id: 2, action_type: 'Assigned rescue unit to incident', time: '10:42 AM' },
    { log_id: 2, user_id: 1, action_type: 'Updated road edge 3 passability to false', time: '10:18 AM' },
    { log_id: 1, user_id: 1, action_type: 'Reported incident at road node 3', time: '09:56 AM' },
  ],
  notifications: [
    { notification_id: 3, title: 'Critical incident assigned', message: 'Unit 2 is responding to Bangkal.', time: '10:42 AM', read: false },
    { notification_id: 2, title: 'Road marked impassable', message: 'Road edge 3 is closed to dispatch routes.', time: '10:18 AM', read: false },
    { notification_id: 1, title: 'New incident reported', message: 'A High urgency incident was reported in Guinhawa.', time: '09:56 AM', read: true },
  ],
})

const readDemoData = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DEMO_STORAGE_KEY))
    if (saved && Array.isArray(saved.incidents) && Array.isArray(saved.units)) {
      const initial = createDemoData()
      const routeData = {
        ...initial,
        edges: initial.edges.map((edge) => ({
          ...edge,
          ...saved.edges?.find((savedEdge) => Number(savedEdge.edge_id) === Number(edge.edge_id)),
          distance_km: edge.distance_km,
        })),
      }
      const migratedData = {
        ...initial,
        ...saved,
        nodes: Array.isArray(saved.nodes)
          ? [
              ...saved.nodes.map((node) => ({
                ...node,
                ...initial.nodes.find((seedNode) => Number(seedNode.node_id) === Number(node.node_id)),
              })),
              ...initial.nodes.filter((seedNode) => !saved.nodes.some((node) => Number(node.node_id) === Number(seedNode.node_id))),
            ]
          : initial.nodes,
        edges: Array.isArray(saved.edges)
          ? [
              ...saved.edges
                .filter((savedEdge) => ![6, 7, 8, 9, 10, 11, 12, 13, 14].includes(Number(savedEdge.edge_id)))
                .map((savedEdge) => {
                  const seededEdge = initial.edges.find((edge) => Number(edge.edge_id) === Number(savedEdge.edge_id))
                  return seededEdge
                    ? { ...seededEdge, ...savedEdge, distance_km: seededEdge.distance_km }
                    : savedEdge
                }),
              ...initial.edges.filter((edge) => [6, 7, 8, 9].includes(Number(edge.edge_id))),
              ...saved.edges.filter((savedEdge) => (
                !initial.edges.some((edge) => Number(edge.edge_id) === Number(savedEdge.edge_id))
                && ![6, 7, 8, 9, 10, 11, 12, 13, 14].includes(Number(savedEdge.edge_id))
              )),
            ]
          : initial.edges,
        incidents: saved.incidents.map((incident) => {
          const seededIncident = initial.incidents.find((item) => item.incident_id === Number(incident.incident_id))
          return {
            ...seededIncident,
            ...incident,
            ...(seededIncident ? {
              location_node_id: seededIncident.location_node_id,
              location_latitude: seededIncident.location_latitude,
              location_longitude: seededIncident.location_longitude,
              barangay: seededIncident.barangay,
            } : {}),
            people_affected: incident.people_affected ?? 1,
          }
        }),
        units: saved.units.map((unit) => ({
          ...initial.units.find((item) => item.unit_id === Number(unit.unit_id)),
          ...unit,
        })),
        dispatches: Array.isArray(saved.dispatches) ? saved.dispatches.map((dispatch) => {
          const initialDispatch = initial.dispatches.find((item) => item.dispatch_id === Number(dispatch.dispatch_id))
          const unit = routeData.units.find((item) => Number(item.unit_id) === Number(dispatch.unit_id))
          const incident = routeData.incidents.find((item) => Number(item.incident_id) === Number(dispatch.incident_id))
          const route = dispatch.status !== 'Completed' && unit && incident
            ? demoShortestPath(routeData, unit.current_node_id, incident.location_node_id)
            : null
          return {
            ...initialDispatch,
            ...dispatch,
            route: {
              ...initialDispatch?.route,
              ...dispatch.route,
              ...(dispatch.status !== 'Completed'
                ? {
                    total_distance: route?.distanceKm ?? 0,
                    node_ids: route?.nodeIds || [],
                    edge_ids: route?.edgeIds || [],
                    status: route ? 'Active' : 'Unreachable',
                  }
                : {}),
            },
          }
        }) : initial.dispatches,
        logs: Array.isArray(saved.logs)
          ? saved.logs.map((log) => ({ ...log, action_type: String(log.action_type || '').replaceAll('Pamarawan', 'Guinhawa') }))
          : initial.logs,
        notifications: Array.isArray(saved.notifications)
          ? saved.notifications.map((notification) => ({
              ...notification,
              message: String(notification.message || '').replaceAll('Pamarawan', 'Guinhawa'),
            }))
          : initial.notifications,
      }
      writeDemoData(migratedData)
      return migratedData
    }
  } catch {
    // Start with fresh sample records if browser storage is unavailable or invalid.
  }
  return createDemoData()
}

const writeDemoData = (data) => {
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Demo interactions still work for the current page when storage is unavailable.
  }
}

const readIncidentBarangays = () => {
  try {
    return JSON.parse(window.localStorage.getItem(INCIDENT_BARANGAY_KEY)) || {}
  } catch {
    return {}
  }
}

const saveIncidentBarangay = (incidentId, barangay) => {
  if (!incidentId || !barangay) return
  const labels = readIncidentBarangays()
  labels[String(incidentId)] = barangay
  try {
    window.localStorage.setItem(INCIDENT_BARANGAY_KEY, JSON.stringify(labels))
  } catch {
    // Keep the server-backed incident usable if browser storage is unavailable.
  }
}

const readIncidentCoordinates = () => {
  try {
    return JSON.parse(window.localStorage.getItem(INCIDENT_COORDINATE_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

const readBarangayCoordinates = () => {
  try {
    return JSON.parse(window.localStorage.getItem(BARANGAY_COORDINATE_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

const saveIncidentCoordinates = (incidentId, coordinates) => {
  if (!incidentId || !coordinates) return
  const saved = readIncidentCoordinates()
  saved[String(incidentId)] = coordinates
  try {
    window.localStorage.setItem(INCIDENT_COORDINATE_KEY, JSON.stringify(saved))
  } catch {
    // The returned incident remains usable if browser storage is unavailable.
  }
}

const addDemoLog = (data, userId, action) => {
  const nextId = Math.max(0, ...data.logs.map((log) => Number(log.log_id) || 0)) + 1
  data.logs.unshift({ log_id: nextId, user_id: userId, action_type: action, time: 'Just now' })
}

const addDemoNotification = (data, title, message) => {
  data.notifications ||= []
  const nextId = Math.max(0, ...data.notifications.map((item) => Number(item.notification_id) || 0)) + 1
  data.notifications.unshift({ notification_id: nextId, title, message, time: 'Just now', read: false })
}

const normalizeDemoData = (data) => {
  const incidents = data.incidents.map((item) => normalizeIncident(item, data.nodes))
  const units = data.units.map((item) => normalizeUnit(item, data.nodes))
  return {
    incidents,
    units,
    roads: data.edges.map((item) => normalizeRoad(item, data.nodes, { allowRouterGeometry: true })),
    logs: data.logs.map(normalizeLog),
    notifications: data.notifications || [],
    plans: data.dispatches.map((item) => normalizeDispatch(item, incidents, units)),
    nodes: data.nodes,
  }
}

const demoShortestPath = (data, startId, endId) => {
  const startNode = data.nodes.find((node) => String(node.node_id) === String(startId))
  const endNode = data.nodes.find((node) => String(node.node_id) === String(endId))
  const routeFixtures = getDemoRouteFixtures(
    startId,
    endId,
    startNode ? [Number(startNode.latitude), Number(startNode.longitude)] : null,
    endNode ? [Number(endNode.latitude), Number(endNode.longitude)] : null,
  )
  if (routeFixtures.length) return findRoadPath(routeFixtures, startId, endId)

  const roads = data.edges.map((edge) => ({
    ...edge,
    id: String(edge.edge_id),
    distanceKm: edge.distance_km,
    condition: edge.is_passable === true ? 'Passable' : edge.is_passable === false ? 'Impassable' : 'Unknown',
  }))
  return findRoadPath(roads, startId, endId)
}

const demoDispatchRecommendations = () => {
  const data = readDemoData()
  const units = data.units.filter((unit) => unit.status.toLowerCase() === 'available')
  const incidents = data.incidents.filter((incident) => incident.status.toLowerCase() === 'pending')
  if (!units.length || !incidents.length) {
    return { assignments: [], unassignedIncidentIds: incidents.map((incident) => Number(incident.incident_id)) }
  }

  const paths = units.map((unit) => incidents.map((incident) => {
    const path = demoShortestPath(data, unit.current_node_id, incident.location_node_id)
    const demand = Number(incident.people_affected ?? incident.affected_residents ?? 1)
    const capacity = Number(unit.capacity)
    return path && (!Number.isFinite(capacity) || capacity >= demand) ? path : null
  }))
  const costs = paths.map((unitPaths) => unitPaths.map((path) => path?.distanceKm ?? 1e12))
  const pairs = munkres(costs)
  const assignments = pairs.flatMap(([unitIndex, incidentIndex]) => {
    const path = paths[unitIndex]?.[incidentIndex]
    if (!path || costs[unitIndex][incidentIndex] >= 1e12) return []
    const unit = units[unitIndex]
    const incident = incidents[incidentIndex]
    return [{
      unitId: String(unit.unit_id),
      incidentId: String(incident.incident_id),
      unitName: unit.name || unit.unit_name || `Rescue Unit ${unit.unit_id}`,
      incidentLabel: incident.barangay || `Node ${incident.location_node_id}`,
      priority: incident.urgency_level,
      distanceKm: path.distanceKm,
      nodeIds: path.nodeIds,
      edgeIds: path.edgeIds,
    }]
  })
  const assignedIds = new Set(assignments.map((item) => Number(item.incidentId)))
  return {
    assignments,
    unassignedIncidentIds: incidents.filter((incident) => !assignedIds.has(Number(incident.incident_id)))
      .map((incident) => Number(incident.incident_id)),
  }
}

const request = async (path, options) => {
  const response = await fetch(`${API_URL}${path}`, options)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || `Request failed: ${response.status}`)
  return body
}

const listFrom = (body, ...keys) => {
  if (Array.isArray(body)) return body
  for (const key of [...keys, 'data', 'results']) {
    if (Array.isArray(body?.[key])) return body[key]
  }
  return []
}

const value = (record, ...keys) => keys.map((key) => record?.[key]).find((item) => item !== undefined && item !== null)
const getId = (record) => value(record, 'id', 'incident_id', 'unit_id', 'node_id', 'edge_id', 'dispatch_id', 'route_id', 'log_id')
const distanceBetweenNodeCoordinates = (first, second) => {
  const radians = (degrees) => degrees * Math.PI / 180
  const latitude1 = radians(Number(first.latitude))
  const latitude2 = radians(Number(second.latitude))
  const latitudeDelta = latitude2 - latitude1
  const longitudeDelta = radians(Number(second.longitude) - Number(first.longitude))
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}
const normalizeIncident = (incident, nodes, barangayLabels = {}) => {
  const nodeId = value(incident, 'location_node_id', 'locationNodeId')
  const node = nodes.find((item) => String(getId(item)) === String(nodeId))
  const id = getId(incident)
  const barangay = value(incident, 'barangay', 'location_name') || barangayLabels[String(id)] || (nodeId ? `Node ${nodeId}` : 'Location not set')
  const storedCoordinates = readIncidentCoordinates()[String(id)]
  const barangayCoordinates = readBarangayCoordinates()[barangay]
  const latitude = Number(value(incident, 'location_latitude', 'locationLatitude') ?? storedCoordinates?.latitude ?? barangayCoordinates?.latitude)
  const longitude = Number(value(incident, 'location_longitude', 'locationLongitude') ?? storedCoordinates?.longitude ?? barangayCoordinates?.longitude)
  const urgency = value(incident, 'urgency_level', 'urgencyLevel', 'priority') || 'Medium'

  return {
    ...incident,
    id: String(id ?? ''),
    barangay,
    type: value(incident, 'type', 'incident_type') || 'Assistance request',
    priority: String(urgency).charAt(0).toUpperCase() + String(urgency).slice(1).toLowerCase(),
    people: value(incident, 'people', 'people_affected') ?? '—',
    status: value(incident, 'status') || 'Pending',
    reported: value(incident, 'reported', 'created_at', 'reported_at') || '—',
    location: Number.isFinite(latitude) && Number.isFinite(longitude)
      ? [latitude, longitude]
      : node ? [Number(value(node, 'latitude')), Number(value(node, 'longitude'))] : [14.852, 120.815],
    locationNodeId: nodeId,
  }
}

const normalizeUnit = (unit, nodes) => {
  const nodeId = value(unit, 'current_node_id', 'currentNodeId')
  const node = nodes.find((item) => String(getId(item)) === String(nodeId))
  const rawStatus = String(value(unit, 'status') || 'Unknown').toLowerCase().replaceAll('_', ' ')
  const status = rawStatus === 'assigned' || rawStatus === 'deployed'
    ? 'Deployed'
    : rawStatus === 'under maintenance' || rawStatus === 'maintenance'
      ? 'Under maintenance'
      : rawStatus === 'available' ? 'Available' : 'Unknown'

  return {
    ...unit,
    id: String(getId(unit) ?? ''),
    name: value(unit, 'name', 'unit_name') || `Rescue Unit ${getId(unit)}`,
    type: value(unit, 'type', 'unit_type') || 'Rescue unit',
    capacity: value(unit, 'capacity') ?? '—',
    status,
    location: node ? [Number(value(node, 'latitude')), Number(value(node, 'longitude'))] : [14.846, 120.811],
  }
}

const normalizeRoad = (edge, nodes, { allowRouterGeometry = false } = {}) => {
  const fromId = value(edge, 'from_node_id', 'fromNodeId')
  const toId = value(edge, 'to_node_id', 'toNodeId')
  const from = nodes.find((item) => String(getId(item)) === String(fromId))
  const to = nodes.find((item) => String(getId(item)) === String(toId))
  const passable = value(edge, 'is_passable', 'isPassable')
  const storedDistance = value(edge, 'distance_km', 'distanceKm', 'distance')
  const { positions: geometryPositions, error: geometryError } = normalizeRoadGeometry(
    value(edge, 'geometry_geojson', 'geometryGeoJSON'),
    from,
    to,
  )

  return {
    ...edge,
    id: String(getId(edge) ?? ''),
    name: value(edge, 'name', 'road_name') || `Road edge ${getId(edge)}`,
    segment: `${fromId ?? '?'} → ${toId ?? '?'}`,
    condition: passable === false ? 'Impassable' : passable === true ? 'Passable' : 'Unknown',
    distanceKm: storedDistance ?? null,
    allowRouterGeometry,
    geometryPositions,
    geometryError,
    depth: 'Not recorded',
    updated: value(edge, 'updated', 'updated_at') || '—',
    from,
    to,
  }
}

const normalizeDispatch = (dispatch, incidents = [], units = []) => {
  const id = value(dispatch, 'dispatch_id', 'dispatchId', 'id')
  const incidentId = value(dispatch, 'incident_id', 'incidentId')
  const unitId = value(dispatch, 'unit_id', 'unitId')
  const route = dispatch.route || dispatch.routes?.[0] || dispatch
  const incidentStatus = value(dispatch, 'incident_status', 'incidentStatus')
  const dispatchStatus = value(dispatch, 'dispatch_status', 'status')
    || (incidentStatus === 'In Progress' ? 'En route' : incidentStatus === 'Resolved' ? 'Completed' : incidentStatus === 'Assigned' ? 'Assigned' : 'Dispatched')
  const routeStatus = value(dispatch, 'route_status', 'routeStatus') || value(route, 'status', 'route_status') || 'Active'

  return {
    id: `DISPATCH-${id}`,
    dispatchId: String(id ?? ''),
    createdAt: value(dispatch, 'created_at', 'createdAt') || '—',
    status: dispatchStatus,
    routeStatus,
    assignments: [{
      incidentId: String(incidentId ?? '—'),
      barangay: value(dispatch, 'barangay') || incidents.find((item) => item.id === String(incidentId))?.barangay || `Incident ${incidentId ?? '—'}`,
      unitId: String(unitId ?? '—'),
      unitName: value(dispatch, 'unit_name', 'unitName') || units.find((item) => item.id === String(unitId))?.name || `Unit ${unitId ?? '—'}`,
      eta: routeStatus === 'Unreachable'
        ? '—'
        : value(route, 'total_distance', 'totalDistance') != null ? `${Number(value(route, 'total_distance', 'totalDistance')).toFixed(2)} km` : '—',
      priority: value(dispatch, 'urgency_level', 'urgencyLevel', 'priority') || '—',
      route: value(route, 'route_id', 'routeId') || 'Route recorded',
      distanceKm: routeStatus === 'Unreachable' ? null : value(route, 'total_distance', 'totalDistance') ?? null,
      nodeIds: routeStatus === 'Unreachable' ? [] : value(route, 'node_ids', 'nodeIds') || [],
      edgeIds: routeStatus === 'Unreachable' ? [] : value(route, 'edge_ids', 'edgeIds') || [],
    }],
  }
}

const normalizeLog = (log) => ({
  id: String(getId(log) ?? ''),
  time: value(log, 'time', 'created_at', 'createdAt') || '—',
  text: value(log, 'action_type', 'actionType', 'text') || 'System action',
  actor: value(log, 'user_name', 'userName') || '',
  userId: value(log, 'user_id', 'userId'),
})

export const resolveBarangayLocation = async (barangay, nodes) => {
  const nodeCoordinates = nodes.map((node) => ({
    id: value(node, 'node_id', 'nodeId', 'id'),
    latitude: Number(value(node, 'latitude')),
    longitude: Number(value(node, 'longitude')),
  })).filter((node) => node.id != null && Number.isFinite(node.latitude) && Number.isFinite(node.longitude))
  if (!nodeCoordinates.length) throw new Error('No road-network nodes are available for location matching')

  let coordinates = (demoMode ? demoBarangayLocations[barangay] : null)
    || readBarangayCoordinates()[barangay]
    || null

  if (!coordinates) {
    const query = encodeURIComponent(`${barangay}, Malolos, Bulacan, Philippines`)
    let nominatimError = ''
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ph&q=${query}`, {
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`OpenStreetMap geocoder returned ${response.status}`)
      const results = await response.json()
      const result = results.find((candidate) => (
        candidate.display_name?.includes('Malolos') && candidate.display_name?.includes('Bulacan')
      ))
      if (!result) throw new Error('OpenStreetMap did not return a Malolos, Bulacan location')
      const candidateCoordinates = { latitude: Number(result.lat), longitude: Number(result.lon) }
      if (!Number.isFinite(candidateCoordinates.latitude) || !Number.isFinite(candidateCoordinates.longitude)) {
        throw new Error('OpenStreetMap returned invalid coordinates')
      }
      coordinates = candidateCoordinates
    } catch (error) {
      nominatimError = error.message || 'OpenStreetMap geocoder failed'
    }

    if (!coordinates) {
      try {
        const response = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?SingleLine=${query}&f=json&maxLocations=5`, {
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) throw new Error(`Alternative geocoder returned ${response.status}`)
        const body = await response.json()
        const candidate = body.candidates?.find((item) => (
          item.address?.includes('Malolos') && item.address?.includes('Bulacan')
        ))
        if (!candidate) throw new Error('Alternative geocoder did not return a Malolos, Bulacan location')
        const candidateCoordinates = { latitude: Number(candidate.location.y), longitude: Number(candidate.location.x) }
        if (!Number.isFinite(candidateCoordinates.latitude) || !Number.isFinite(candidateCoordinates.longitude)) {
          throw new Error('Alternative geocoder returned invalid coordinates')
        }
        coordinates = candidateCoordinates
      } catch (error) {
        throw new Error(`Could not locate ${barangay} in Malolos. OpenStreetMap: ${nominatimError}. Alternative geocoder: ${error.message || 'request failed'}.`, { cause: error })
      }
    }

    if (!Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) {
      throw new Error('The map service returned invalid coordinates for this barangay.')
    }
    try {
      const saved = readBarangayCoordinates()
      window.localStorage.setItem(BARANGAY_COORDINATE_KEY, JSON.stringify({ ...saved, [barangay]: coordinates }))
    } catch {
      // Geocoding can still be used for this request without browser storage.
    }
  }

  const radians = (degrees) => degrees * Math.PI / 180
  const distanceSquared = (node) => {
    const latitudeDelta = radians(node.latitude - coordinates.latitude)
    const longitudeDelta = radians(node.longitude - coordinates.longitude)
    const latitude = radians(coordinates.latitude)
    return latitudeDelta ** 2 + Math.cos(latitude) ** 2 * longitudeDelta ** 2
  }
  return {
    locationNodeId: String(nodeCoordinates.reduce((nearest, node) => distanceSquared(node) < distanceSquared(nearest) ? node : nearest).id),
    location: [coordinates.latitude, coordinates.longitude],
  }
}

export const resolveBarangayNodeId = async (barangay, nodes) => (
  (await resolveBarangayLocation(barangay, nodes)).locationNodeId
)

export const loadDashboard = async () => {
  if (USE_DEMO_DATA) {
    demoMode = true
    return { ...normalizeDemoData(readDemoData()), errors: [], source: 'demo' }
  }

  const requests = [
    request('/incidents'),
    request('/units'),
    request('/roads/nodes'),
    request('/roads/edges'),
    request('/dispatches'),
    request('/logs'),
  ]
  const paths = ['/api/incidents', '/api/units', '/api/roads/nodes', '/api/roads/edges', '/api/dispatches', '/api/logs']
  const results = await Promise.allSettled(requests)
  const errors = results.flatMap((result, index) => result.status === 'rejected'
    ? [`${paths[index]}: ${result.reason?.message || 'request failed'}`]
    : [])
  const [incidentBody, unitBody, nodeBody, edgeBody, dispatchBody, logBody] = results.map((result) => (
    result.status === 'fulfilled' ? result.value : {}
  ))

  const nodes = listFrom(nodeBody, 'nodes', 'roadNodes', 'road_nodes')
  const barangayLabels = readIncidentBarangays()
  const incidents = listFrom(incidentBody, 'incidents').map((item) => normalizeIncident(item, nodes, barangayLabels))
  const units = listFrom(unitBody, 'units', 'rescueUnits', 'rescue_units').map((item) => normalizeUnit(item, nodes))
  const roads = listFrom(edgeBody, 'edges', 'roadEdges', 'road_edges').map((item) => normalizeRoad(item, nodes))

  const dispatches = listFrom(dispatchBody, 'dispatches').map((item) => normalizeDispatch(item, incidents, units))

  if (errors.length) {
    demoMode = true
    return {
      ...normalizeDemoData(readDemoData()),
      errors,
      source: 'demo',
    }
  }

  demoMode = false
  return {
    incidents,
    units,
    roads,
    logs: listFrom(logBody, 'logs', 'systemLogs', 'system_logs').map(normalizeLog),
    notifications: [],
    plans: dispatches,
    nodes,
    errors,
    source: 'api',
  }
}

export const createIncident = async ({ urgency_level, location_node_id, location_latitude, location_longitude, people_affected, barangay, reported_by = DEFAULT_USER_ID }) => {
  if (demoMode) {
    const data = readDemoData()
    const incident_id = Math.max(0, ...data.incidents.map((item) => Number(item.incident_id) || 0)) + 1
    const incident = { incident_id, reported_by, location_node_id: Number(location_node_id), location_latitude, location_longitude, people_affected: Number(people_affected), barangay, urgency_level, status: 'Pending' }
    data.incidents.unshift(incident)
    addDemoLog(data, reported_by, `Created incident ${incident_id}`)
    addDemoNotification(data, `New ${urgency_level} incident`, `${barangay} needs ${people_affected} residents assisted.`)
    writeDemoData(data)
    return incident
  }
  const body = await request('/incidents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      urgency_level,
      location_node_id: Number(location_node_id),
      location_latitude: Number(location_latitude),
      location_longitude: Number(location_longitude),
      people_affected: Number(people_affected),
      reported_by: Number(reported_by),
      barangay,
      status: 'Pending',
    }),
  })
  const incident = body.incident || body
  saveIncidentBarangay(getId(incident), barangay)
  saveIncidentCoordinates(getId(incident), { latitude: Number(location_latitude), longitude: Number(location_longitude) })
  return incident
}

export const updateUnit = async (id, status) => {
  if (!['Available', 'Deployed', 'Under maintenance'].includes(status)) throw new Error('Invalid rescue unit status')
  if (demoMode) {
    const data = readDemoData()
    const unit = data.units.find((item) => String(item.unit_id) === String(id))
    if (!unit) throw new Error('Rescue unit not found')
    unit.status = status
    addDemoLog(data, DEFAULT_USER_ID, `Updated rescue unit ${id} to ${status}`)
    addDemoNotification(data, 'Rescue unit updated', `${unit.name || `Unit ${id}`} is now ${status.toLowerCase()}.`)
    writeDemoData(data)
    return unit
  }
  const body = await request(`/units/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, updated_by: DEFAULT_USER_ID }),
  })
  return body.unit || body
}

export const updateRoad = async (id, condition) => {
  if (demoMode) {
    const data = readDemoData()
    const edge = data.edges.find((item) => String(item.edge_id) === String(id))
    if (!edge) throw new Error('Road edge not found')
    edge.is_passable = condition === 'Passable'
    const reroutedDispatchIds = []
    const unreachableDispatchIds = []
    for (const dispatch of data.dispatches) {
      if (!['Assigned', 'En route'].includes(dispatch.status)) continue
      const routeStatus = dispatch.route?.status || 'Active'
      const routeEdgeIds = dispatch.route?.edge_ids || []
      if (routeStatus !== 'Unreachable' && routeEdgeIds.length && !routeEdgeIds.map(String).includes(String(id))) continue

      const unit = data.units.find((item) => Number(item.unit_id) === Number(dispatch.unit_id))
      const incident = data.incidents.find((item) => Number(item.incident_id) === Number(dispatch.incident_id))
      if (!unit || !incident) continue
      const path = demoShortestPath(data, unit.current_node_id, incident.location_node_id)
      dispatch.route = {
        ...dispatch.route,
        total_distance: path?.distanceKm ?? 0,
        node_ids: path?.nodeIds || [],
        edge_ids: path?.edgeIds || [],
        status: path ? 'Active' : 'Unreachable',
      }
      if (path) reroutedDispatchIds.push(String(dispatch.dispatch_id))
      else unreachableDispatchIds.push(String(dispatch.dispatch_id))
      addDemoLog(data, DEFAULT_USER_ID, path
        ? `Re-optimized route for dispatch ${dispatch.dispatch_id}`
        : `No passable route for dispatch ${dispatch.dispatch_id}`)
    }
    addDemoLog(data, DEFAULT_USER_ID, `Updated road edge ${id} passability to ${edge.is_passable}`)
    addDemoNotification(data, edge.is_passable ? 'Road marked passable' : 'Road marked impassable', `Road edge ${id} is ${edge.is_passable ? 'passable' : 'impassable'} for dispatch routes.`)
    if (reroutedDispatchIds.length || unreachableDispatchIds.length) {
      addDemoNotification(data, 'Active routes re-optimized', `${reroutedDispatchIds.length} route(s) updated; ${unreachableDispatchIds.length} dispatch(es) have no passable path.`)
    }
    writeDemoData(data)
    return { edge, reroutedDispatchIds, unreachableDispatchIds }
  }
  const body = await request(`/roads/edges/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_passable: condition === 'Passable', updated_by: DEFAULT_USER_ID }),
  })
  return body
}

export const createDispatch = async ({ unit_id, incident_id, assigned_by, distanceKm, nodeIds, edgeIds }) => {
  if (demoMode) {
    const data = readDemoData()
    const unit = data.units.find((item) => String(item.unit_id) === String(unit_id))
    const incident = data.incidents.find((item) => String(item.incident_id) === String(incident_id))
    if (!unit || !incident) throw new Error('The selected unit or incident is no longer available')
    if (unit.status !== 'Available' || incident.status !== 'Pending') {
      throw new Error('The selected unit or incident is no longer available for dispatch')
    }
    const dispatch = {
      dispatch_id: Math.max(0, ...data.dispatches.map((item) => Number(item.dispatch_id) || 0)) + 1,
      unit_id: Number(unit_id),
      incident_id: Number(incident_id),
      assigned_by: Number(assigned_by ?? DEFAULT_USER_ID),
      status: 'Assigned',
      route: { total_distance: distanceKm, node_ids: nodeIds, edge_ids: edgeIds, status: 'Active' },
    }
    data.dispatches.unshift(dispatch)
    unit.status = 'Deployed'
    incident.status = 'Assigned'
    addDemoLog(data, dispatch.assigned_by, `Created dispatch ${dispatch.dispatch_id}`)
    addDemoNotification(data, 'Dispatch assigned', `${unit.name || `Unit ${unit_id}`} assigned to ${incident.barangay || `incident ${incident_id}`}.`)
    writeDemoData(data)
    return dispatch
  }
  const body = await request('/dispatches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unit_id: Number(unit_id), incident_id: Number(incident_id), assigned_by: Number(assigned_by ?? DEFAULT_USER_ID) }),
  })
  return body.dispatch || body
}

export const checkHealth = () => request('/health')

export const getRoadGeometry = async (road) => {
  if (road.geometryPositions?.length) return road.geometryPositions
  if (!road.allowRouterGeometry) {
    throw new Error(`Road edge ${road.id}: verified geometry is not recorded`)
  }
  if (!road.from || !road.to) {
    throw new Error(`Road edge ${road.id}: endpoint nodes are unavailable`)
  }

  const start = [Number(road.from.longitude), Number(road.from.latitude)]
  const end = [Number(road.to.longitude), Number(road.to.latitude)]
  const viaCoordinates = Array.isArray(road.viaCoordinates) ? road.viaCoordinates : []
  const routeCoordinates = [start, ...viaCoordinates, end]
  if (![...start, ...end].every(Number.isFinite)) {
    throw new Error(`Road edge ${road.id}: endpoint coordinates are invalid`)
  }
  if (viaCoordinates.some((coordinate) => !Array.isArray(coordinate)
    || coordinate.length !== 2
    || !coordinate.every(Number.isFinite))) {
    throw new Error(`Road edge ${road.id}: via coordinates are invalid`)
  }
  const key = `demo-edge:${road.id}:${routeCoordinates.flat().join(',')}`
  if (roadGeometryCache.has(key)) return roadGeometryCache.get(key)

  const coordinates = routeCoordinates.map((coordinate) => coordinate.join(',')).join(';')
  const geometryRequest = (async () => {
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`)
    if (!response.ok) throw new Error(`Road edge ${road.id} geometry request failed: ${response.status}`)
    const body = await response.json()
    const geometry = body.code === 'Ok' ? body.routes?.[0]?.geometry?.coordinates : null
    if (!Array.isArray(geometry) || geometry.length < 2) {
      throw new Error(`No road-following geometry returned for road edge ${road.id}`)
    }

    const positions = geometry.map(([longitude, latitude]) => [Number(latitude), Number(longitude)])
    if (positions.some(([latitude, longitude]) => !Number.isFinite(latitude) || !Number.isFinite(longitude))) {
      throw new Error(`Road edge ${road.id} geometry contains invalid coordinates`)
    }
    const endpointDistance = (position, endpoint) => distanceBetweenNodeCoordinates(
      { latitude: position[0], longitude: position[1] },
      { latitude: endpoint[1], longitude: endpoint[0] },
    )
    if (endpointDistance(positions[0], start) > 0.1 || endpointDistance(positions.at(-1), end) > 0.1) {
      throw new Error(`Road edge ${road.id} does not reach its graph node on the drivable network`)
    }
    return positions
  })()
  roadGeometryCache.set(key, geometryRequest)
  try {
    return await geometryRequest
  } catch (error) {
    roadGeometryCache.delete(key)
    throw error
  }
}

export const updateDispatchStatus = async (dispatchId, status) => {
  if (!demoMode) throw new Error('Route status updates are only available in prototype mode')
  if (!['Assigned', 'En route', 'Completed'].includes(status)) throw new Error('Invalid dispatch status')
  const data = readDemoData()
  const dispatch = data.dispatches.find((item) => String(item.dispatch_id) === String(dispatchId))
  if (!dispatch) throw new Error('Dispatch record not found')

  dispatch.status = status
  if (status === 'Completed') dispatch.route.status = 'Completed'
  const incident = data.incidents.find((item) => Number(item.incident_id) === Number(dispatch.incident_id))
  const unit = data.units.find((item) => Number(item.unit_id) === Number(dispatch.unit_id))
  if (incident) incident.status = status === 'Completed' ? 'Resolved' : status === 'En route' ? 'In Progress' : 'Assigned'
  if (unit && status === 'Completed') {
    unit.status = 'Available'
    if (incident) unit.current_node_id = incident.location_node_id
  }
  addDemoLog(data, DEFAULT_USER_ID, `Updated dispatch ${dispatch.dispatch_id} to ${status}`)
  addDemoNotification(data, 'Dispatch status updated', `Dispatch ${dispatch.dispatch_id} is now ${status.toLowerCase()}.`)
  writeDemoData(data)
  return dispatch
}

export const markDemoNotificationsRead = () => {
  const data = readDemoData()
  data.notifications = (data.notifications || []).map((notification) => ({ ...notification, read: true }))
  writeDemoData(data)
  return data.notifications
}

export const compareDemoDispatchMethods = () => {
  const data = readDemoData()
  const optimizedStart = performance.now()
  const optimized = demoDispatchRecommendations()
  const optimizedAllocationMs = performance.now() - optimizedStart
  const availableUnits = data.units.filter((unit) => unit.status.toLowerCase() === 'available')
  const pending = data.incidents
    .filter((incident) => incident.status.toLowerCase() === 'pending')
    .sort((first, second) => prioritiesForEvaluation.indexOf(first.urgency_level) - prioritiesForEvaluation.indexOf(second.urgency_level))
  const remainingUnits = [...availableUnits]
  const baselineAssignments = []
  const baselineStart = performance.now()

  for (const incident of pending) {
    const demand = Number(incident.people_affected ?? 1)
    const unitIndex = remainingUnits.findIndex((unit) => Number(unit.capacity) >= demand
      && demoShortestPath(data, unit.current_node_id, incident.location_node_id))
    if (unitIndex < 0) continue
    const [unit] = remainingUnits.splice(unitIndex, 1)
    const path = demoShortestPath(data, unit.current_node_id, incident.location_node_id)
    baselineAssignments.push({ unitId: unit.unit_id, incidentId: incident.incident_id, distanceKm: path.distanceKm })
  }
  const baselineAllocationMs = performance.now() - baselineStart

  const totalDistance = (items) => items.reduce((sum, item) => sum + Number(item.distanceKm || 0), 0)
  const estimatedTravelMinutes = (items) => totalDistance(items) / 20 * 60
  const optimizedDistanceKm = totalDistance(optimized.assignments)
  const baselineDistanceKm = totalDistance(baselineAssignments)
  return {
    optimized: {
      assignmentCount: optimized.assignments.length,
      totalDistanceKm: optimizedDistanceKm,
      estimatedTravelMinutes: estimatedTravelMinutes(optimized.assignments),
      estimatedResponseMinutes: optimized.assignments.length ? estimatedTravelMinutes(optimized.assignments) / optimized.assignments.length : 0,
      allocationMs: optimizedAllocationMs,
    },
    baseline: {
      assignmentCount: baselineAssignments.length,
      totalDistanceKm: baselineDistanceKm,
      estimatedTravelMinutes: estimatedTravelMinutes(baselineAssignments),
      estimatedResponseMinutes: baselineAssignments.length ? estimatedTravelMinutes(baselineAssignments) / baselineAssignments.length : 0,
      allocationMs: baselineAllocationMs,
    },
    unassignedIncidentIds: optimized.unassignedIncidentIds,
    improvementPercent: baselineDistanceKm > 0
      ? ((baselineDistanceKm - optimizedDistanceKm) / baselineDistanceKm) * 100
      : 0,
    note: 'Baseline is simulated priority-first/first-feasible, not observed CDRRMO data. Travel estimates assume 20 km/h and are not field measurements.',
  }
}

export const resetDemoData = () => {
  demoMode = true
  writeDemoData(createDemoData())
}

export const getDispatchRecommendations = async () => {
  if (demoMode) return demoDispatchRecommendations()
  return request('/dispatches/recommendations')
}