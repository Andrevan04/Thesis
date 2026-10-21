import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Tooltip, Pane, useMap } from 'react-leaflet'
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Check,
  ClipboardList,
  Clock3,
  Filter,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Plus,
  RefreshCw,
  Route,
  Search,
  ShieldAlert,
  Truck,
  Users,
  X,
} from 'lucide-react'

import 'leaflet/dist/leaflet.css'
import './App.css'
import * as api from './api'
import { demoBarangays, malolosBarangays } from './data/barangays'
import { getDemoRouteFixtures } from './demoRouteFixtures'
import { removeOverlappingRouteSegments } from './routeOverlap'
import { getMapRouteOptions as optimizeMapRoutes } from './routeOptimization'

const mapCenter = [14.852, 120.815]
const priorities = ['Critical', 'High', 'Medium', 'Low']
const recommendedRouteColor = '#db8b32'
const routeAlgorithmLabel = 'Dijkstra shortest-path search'
const assignmentAlgorithmLabel = 'Hungarian assignment optimization'
const fieldResponderRole = 'Field Responder / Dispatcher'
const rolePages = {
  Coordinator: ['overview', 'incidents', 'barangays', 'roads', 'units', 'dispatches', 'logs'],
  [fieldResponderRole]: ['overview', 'dispatches', 'roads', 'units'],
  Administrator: ['overview', 'users', 'logs'],
}
const initialDemoUsers = [
  { id: '1', name: 'Mara Cruz', email: 'coordinator@cdrrmo.malolos.gov.ph', role: 'Coordinator', active: true },
  { id: '2', name: 'Rico Santos', email: 'responder@cdrrmo.malolos.gov.ph', role: fieldResponderRole, unitId: '2', active: true },
  { id: '3', name: 'Lia Mendoza', email: 'admin@cdrrmo.malolos.gov.ph', role: 'Administrator', active: true },
  { id: '4', name: 'Sofia Reyes', email: 'dispatcher1@cdrrmo.malolos.gov.ph', role: fieldResponderRole, unitId: '1', active: true },
  { id: '5', name: 'Miguel Dela Cruz', email: 'dispatcher3@cdrrmo.malolos.gov.ph', role: fieldResponderRole, unitId: '3', active: true },
  { id: '6', name: 'Ana Bautista', email: 'dispatcher4@cdrrmo.malolos.gov.ph', role: fieldResponderRole, unitId: '4', active: true },
]

const loadLocalJson = (key, fallback) => {
  try {
    return JSON.parse(window.localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

const loadDemoUsers = () => {
  const savedUsers = loadLocalJson('flood-dispatch-demo-users', [])
  const savedById = new Map(savedUsers.map((user) => [String(user.id), user]))
  const seededIds = new Set(initialDemoUsers.map((user) => user.id))
  const seededUsers = initialDemoUsers.map((user) => {
    const savedUser = savedById.get(user.id)
    return {
      ...user,
      ...savedUser,
      role: user.role,
      ...(user.unitId ? { unitId: user.unitId } : {}),
    }
  })
  return [
    ...seededUsers,
    ...savedUsers.filter((user) => !seededIds.has(String(user.id))).map((user) => ({
      ...user,
      role: user.role === 'Field Responder' ? fieldResponderRole : user.role,
    })),
  ]
}

let pendingAssignmentPromise = null

const assignPendingIncidentsToAvailableUnits = async () => {
  if (pendingAssignmentPromise) return pendingAssignmentPromise

  pendingAssignmentPromise = (async () => {
    const result = await api.getDispatchRecommendations()
    if (!Array.isArray(result.assignments)) {
      throw new Error('The recommendation service returned an invalid assignment list')
    }
    const created = []
    for (const assignment of result.assignments) {
      created.push(await api.createDispatch({
        unit_id: assignment.unitId ?? assignment.unit_id,
        incident_id: assignment.incidentId ?? assignment.incident_id,
        assigned_by: 1,
        distanceKm: assignment.distanceKm ?? assignment.distance_km,
        nodeIds: assignment.nodeIds ?? assignment.node_ids ?? assignment.path ?? [],
        edgeIds: assignment.edgeIds ?? assignment.edge_ids ?? [],
        routeStatus: assignment.routeStatus ?? assignment.route_status,
        geometryPositions: assignment.geometryPositions ?? assignment.geometry_positions,
      }))
    }
    return created
  })()

  try {
    return await pendingAssignmentPromise
  } finally {
    pendingAssignmentPromise = null
  }
}

function MapResizeHandler({ active }) {
  const map = useMap()

  useEffect(() => {
    if (!active) return undefined
    const timer = window.setTimeout(() => map.invalidateSize(), 120)
    return () => window.clearTimeout(timer)
  }, [active, map])

  return null
}

function MapViewport({ positions }) {
  const map = useMap()

  useEffect(() => {
    if (!positions.length) return
    if (positions.length === 1) {
      map.setView(positions[0], 13)
      return
    }
    map.fitBounds(positions, { padding: [36, 36], maxZoom: 13 })
  }, [map, positions])

  return null
}

function StatusPill({ children, tone = '' }) {
  return <span className={`status-pill ${tone}`}>{children}</span>
}

function App() {
  const [incidents, setIncidents] = useState([])
  const [units, setUnits] = useState([])
  const [roads, setRoads] = useState([])
  const [nodes, setNodes] = useState([])
  const [logs, setLogs] = useState([])
  const [notifications, setNotifications] = useState([])
  const [dispatches, setDispatches] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [activePage, setActivePage] = useState('overview')
  const [selectedOverviewDispatchId, setSelectedOverviewDispatchId] = useState('')
  const [selectedDispatchMapId, setSelectedDispatchMapId] = useState('')
  const [selectedAssignedDispatchId, setSelectedAssignedDispatchId] = useState('')
  const [demoUsers, setDemoUsers] = useState(loadDemoUsers)
  const [activeUserId, setActiveUserId] = useState(() => loadLocalJson('flood-dispatch-active-user', '1'))
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(loadLocalJson('flood-dispatch-demo-session', null)))
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('All priorities')
  const [barangaySearch, setBarangaySearch] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)
  const [incidentSubmitting, setIncidentSubmitting] = useState(false)
  const [dispatchSubmitting, setDispatchSubmitting] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      const data = await api.loadDashboard()
      setIncidents(data.incidents)
      setUnits(data.units)
      setRoads(data.roads)
      setNodes(data.nodes)
      setLogs(data.logs)
      setNotifications(data.notifications || [])
      setDispatches(data.plans)
      setIsDemoMode(data.source === 'demo')
      setError(data.source === 'demo' ? '' : data.errors.length ? `Unavailable routes: ${data.errors.join('; ')}` : '')
      return data
    } catch (loadError) {
      setError(loadError.message || 'Could not load API data')
      setNotice('Unable to load data. Check the backend service and API response format.')
      return null
    } finally {
      setLoading(false)
    }
  }

  const refreshAndAssign = async () => {
    const data = await refresh()
    if (!data) return null
    try {
      const created = await assignPendingIncidentsToAvailableUnits()
      if (created.length) {
        setNotice(`${created.length} pending incident(s) automatically assigned to available units and dispatchers`)
        await refresh()
      }
      return created
    } catch (assignmentError) {
      setNotice(assignmentError.message || 'Could not automatically assign pending incidents')
      return null
    }
  }

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const data = await refresh()
      if (cancelled || !data) return
      try {
        const created = await assignPendingIncidentsToAvailableUnits()
        if (!cancelled && created.length) {
          setNotice(`${created.length} pending incident(s) automatically assigned to available units and dispatchers`)
          await refresh()
        }
      } catch (assignmentError) {
        if (!cancelled) setNotice(assignmentError.message || 'Could not automatically assign pending incidents')
      }
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!notice) return undefined
    const timeout = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    window.localStorage.setItem('flood-dispatch-demo-users', JSON.stringify(demoUsers))
  }, [demoUsers])

  useEffect(() => {
    window.localStorage.setItem('flood-dispatch-active-user', JSON.stringify(activeUserId))
  }, [activeUserId])

  const visibleIncidents = useMemo(() => {
    const query = search.toLowerCase()
    return incidents.filter((incident) => {
      const matchesQuery = `${incident.id} ${incident.barangay} ${incident.locationNodeId}`.toLowerCase().includes(query)
      return matchesQuery && (priorityFilter === 'All priorities' || incident.priority === priorityFilter)
    })
  }, [incidents, priorityFilter, search])

  const openIncidents = incidents.filter((incident) => !['Resolved', 'Completed'].includes(incident.status)).length
  const availableUnits = units.filter((unit) => unit.status.toLowerCase() === 'available').length
  const blockedRoads = roads.filter((road) => road.condition === 'Impassable').length
  const activeUser = demoUsers.find((user) => user.id === String(activeUserId)) || demoUsers[0]
  const activeDemoUsers = demoUsers.filter((user) => user.active !== false)
  const activeRole = activeUser?.role || 'Coordinator'
  const activeAssignedDispatches = dispatches.flatMap((dispatch) => (dispatch.assignments || []).map((assignment) => {
    const incident = incidents.find((item) => item.id === assignment.incidentId)
    const unit = units.find((item) => item.id === assignment.unitId)
    return { dispatch, assignment, incident, unit }
  })).filter(({ dispatch, assignment, incident }) => (
    String(dispatch.status).toLowerCase() !== 'completed'
    && ['assigned', 'in progress'].includes(String(incident?.status).toLowerCase())
    && (activeRole !== fieldResponderRole || String(activeUser.unitId) === String(assignment.unitId))
  ))
  const presentationRoute = isDemoMode
    ? activeAssignedDispatches.find(({ assignment }) => assignment.incidentId === '2')
    : null
  const overviewRoute = activeAssignedDispatches.find(({ dispatch }) => dispatch.id === selectedOverviewDispatchId)
    || presentationRoute
    || activeAssignedDispatches[0]
  const selectedDispatchMapRoute = activeAssignedDispatches.find(({ dispatch }) => dispatch.id === selectedDispatchMapId)
    || presentationRoute
    || activeAssignedDispatches[0]
  const allNavItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'incidents', label: 'Incidents', icon: ShieldAlert },
    { id: 'barangays', label: 'Barangays', icon: MapPin },
    { id: 'roads', label: 'Road network', icon: Route },
    { id: 'units', label: 'Rescue units', icon: Truck },
    { id: 'dispatches', label: 'Dispatches', icon: ClipboardList },
    { id: 'logs', label: 'System activity', icon: Activity },
    { id: 'users', label: 'User roles', icon: Users },
  ]
  const navItems = allNavItems.filter((item) => rolePages[activeRole]?.includes(item.id))
  const pageTitle = navItems.find((item) => item.id === activePage)?.label || 'Overview'
  const visibleBarangays = demoBarangays.filter((barangay) => barangay.toLowerCase().includes(barangaySearch.toLowerCase()))

  const addIncident = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setIncidentSubmitting(true)
    try {
      const barangay = form.get('barangay')
      const { locationNodeId, location } = await api.resolveBarangayLocation(barangay, nodes)
      await api.createIncident({
        location_node_id: locationNodeId,
        location_latitude: location[0],
        location_longitude: location[1],
        people_affected: form.get('people_affected'),
        barangay,
        urgency_level: form.get('urgency_level'),
      })
      setModal(false)
      await refresh()
      const assigned = await assignPendingIncidentsToAvailableUnits()
      const routeFollowUpCount = assigned.filter((dispatch) => dispatch.route?.status === 'Unreachable').length
      setNotice(assigned.length
        ? `Incident placed in ${barangay}; ${assigned.length} incident(s) assigned to available units and dispatchers${routeFollowUpCount ? `; ${routeFollowUpCount} route(s) need manual review` : ''}`
        : `Incident placed in ${barangay}, but no available unit and dispatcher could be assigned`)
      await refresh()
      setActivePage('dispatches')
    } catch (requestError) {
      setNotice(requestError.message || 'Could not create incident')
    } finally {
      setIncidentSubmitting(false)
    }
  }

  const changeUnitStatus = async (unitId, status) => {
    try {
      await api.updateUnit(unitId, status)
      await refresh()
      const assigned = await assignPendingIncidentsToAvailableUnits()
      setNotice(assigned.length ? `Unit updated; ${assigned.length} pending incident(s) assigned` : 'Unit status updated')
      if (assigned.length) await refresh()
    } catch (requestError) {
      setNotice(requestError.message || 'Could not update unit')
    }
  }

  const changeRoadPassability = async (edgeId, passable) => {
    try {
      const result = await api.updateRoad(edgeId, passable ? 'Passable' : 'Impassable')
      const rerouted = result.reroutedDispatchIds?.length || 0
      const unreachable = result.unreachableDispatchIds?.length || 0
      await refresh()
      const assigned = await assignPendingIncidentsToAvailableUnits()
      setNotice(unreachable
        ? `Road updated; ${rerouted} route(s) rerouted and ${unreachable} dispatch(es) have no passable route${assigned.length ? `; ${assigned.length} pending incident(s) assigned` : ''}`
        : assigned.length ? `Road updated; ${assigned.length} pending incident(s) assigned to available units`
          : rerouted ? `Road updated; ${rerouted} active route(s) rerouted` : 'Road passability updated')
      if (assigned.length) await refresh()
    } catch (requestError) {
      setNotice(requestError.message || 'Could not update road edge')
    }
  }

  const recommendDispatches = async (navigateToDispatches = true) => {
    try {
      const result = await api.getDispatchRecommendations()
      if (!Array.isArray(result.assignments)) {
        throw new Error('The recommendation service returned an invalid assignment list')
      }
      const assignments = result.assignments.map((assignment) => {
        const incidentId = String(assignment.incidentId ?? assignment.incident_id ?? '')
        const unitId = String(assignment.unitId ?? assignment.unit_id ?? '')
        const incident = incidents.find((item) => item.id === incidentId)
        const unit = units.find((item) => item.id === unitId)
        const nodeIds = assignment.nodeIds ?? assignment.node_ids ?? assignment.path ?? []
        const edgeIds = assignment.edgeIds ?? assignment.edge_ids ?? nodeIds.slice(1).map((nodeId, index) => (
          roads.find((road) => String(road.from_node_id ?? road.fromNodeId) === String(nodeIds[index])
            && String(road.to_node_id ?? road.toNodeId) === String(nodeId)
            && road.condition === 'Passable')?.id
        )).filter((edgeId) => edgeId != null)
        const routeStatus = assignment.routeStatus ?? assignment.route_status ?? (nodeIds.length ? 'Active' : 'Unreachable')
        const priority = assignment.priority || incident?.priority || 'Medium'
        return {
          ...assignment,
          incidentId,
          incidentLabel: assignment.incidentLabel || incident?.barangay || `Incident ${incidentId}`,
          unitId,
          unitName: assignment.unitName || unit?.name || `Rescue Unit ${unitId}`,
          distanceKm: assignment.distanceKm ?? assignment.distance_km ?? null,
          nodeIds,
          edgeIds,
          routeStatus,
          geometryPositions: assignment.geometryPositions ?? assignment.geometry_positions,
          alternativeGeometryPositions: assignment.alternativeGeometryPositions ?? assignment.alternative_geometry_positions,
          alternativeDistanceKm: assignment.alternativeDistanceKm ?? assignment.alternative_distance_km,
          priority,
        }
      })

      if (!assignments.length) {
        setRecommendations([])
        const unassignedIncidentIds = result.unassignedIncidentIds ?? result.unassigned_incident_ids ?? []
        if (unassignedIncidentIds.length || incidents.some((incident) => incident.status.toLowerCase() === 'pending')) {
          setNotice('Incident saved, but no feasible assignment was found. Check unit capacity and passable roads.')
        } else if (navigateToDispatches) {
          setNotice('No pending incidents')
        }
        return
      }

      setRecommendations([{
        id: 'draft-plan',
        assignments,
        unassignedIncidentIds: result.unassignedIncidentIds ?? result.unassigned_incident_ids ?? [],
      }])
      if (navigateToDispatches) setActivePage('dispatches')
    } catch (requestError) {
      setNotice(requestError.message || 'Could not compute dispatch recommendations')
    }
  }

  const createDispatches = async (recommendation) => {
    if (dispatchSubmitting) return
    setDispatchSubmitting(true)
    try {
      const created = await Promise.all(recommendation.assignments.map((assignment) => api.createDispatch({
        unit_id: assignment.unitId,
        incident_id: assignment.incidentId,
        assigned_by: activeUserId,
        distanceKm: assignment.distanceKm,
        nodeIds: assignment.nodeIds,
        edgeIds: assignment.edgeIds,
        routeStatus: assignment.routeStatus,
        geometryPositions: assignment.geometryPositions,
      })))
      setRecommendations((current) => current.filter((item) => item.id !== recommendation.id))
      setNotice(`${created.length} dispatch record(s) created`)
      await refresh()
    } catch (requestError) {
      setNotice(requestError.message || 'Could not create dispatch')
    } finally {
      setDispatchSubmitting(false)
    }
  }

  const resetSampleData = async () => {
    api.resetDemoData()
    setRecommendations([])
    const created = await refreshAndAssign()
    if (created === null) return
    setNotice(created.length
      ? `Sample data reset; ${created.length} pending incident(s) automatically assigned`
      : 'Sample data reset')
  }

  const changeActiveUser = (userId) => {
    const nextUser = demoUsers.find((user) => user.id === userId)
    if (!nextUser || nextUser.active === false) return
    setActiveUserId(userId)
    if (!rolePages[nextUser?.role]?.includes(activePage)) setActivePage('overview')
  }

  const changeDemoUserRole = (userId, role) => {
    setDemoUsers((current) => current.map((user) => user.id === userId ? { ...user, role } : user))
  }

  const addDemoUser = (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') || '').trim()
    const email = String(form.get('email') || '').trim().toLowerCase()
    if (demoUsers.some((user) => user.email.toLowerCase() === email)) {
      setNotice('An account with that email already exists')
      return
    }
    const id = String(Math.max(0, ...demoUsers.map((user) => Number(user.id) || 0)) + 1)
    setDemoUsers((current) => [...current, { id, name, email, role: form.get('role'), active: true }])
    event.currentTarget.reset()
    setNotice('Demo account added')
  }

  const toggleDemoUser = (userId) => {
    const user = demoUsers.find((item) => item.id === userId)
    if (!user || user.id === activeUser?.id) return
    const isActive = user.active !== false
    if (isActive && activeDemoUsers.length <= 1) {
      setNotice('At least one demo account must remain active')
      return
    }
    setDemoUsers((current) => current.map((item) => item.id === userId ? { ...item, active: !isActive } : item))
    setNotice(isActive ? 'Demo account disabled' : 'Demo account enabled')
  }

  const logActorLabel = (log) => {
    const userId = String(log.userId ?? log.user_id ?? '')
    const user = demoUsers.find((item) => item.id === userId)
    if (user) return `${user.name} · ${user.role}`
    if (log.actor && log.actor !== `User ${userId}`) return log.actor
    return userId ? `User ${userId} · Role unavailable` : 'System'
  }

  const toggleNotifications = () => {
    const opening = !notificationsOpen
    setNotificationsOpen(opening)
    if (opening) setNotifications(api.markDemoNotificationsRead())
  }

  const updateDispatch = async (dispatchId, status) => {
    try {
      await api.updateDispatchStatus(dispatchId, status)
      await refresh()
      const assigned = await assignPendingIncidentsToAvailableUnits()
      setNotice(assigned.length
        ? `Dispatch ${dispatchId} marked ${status.toLowerCase()}; ${assigned.length} pending incident(s) assigned`
        : `Dispatch ${dispatchId} marked ${status.toLowerCase()}`)
      if (assigned.length) await refresh()
    } catch (requestError) {
      setNotice(requestError.message || 'Could not update route status')
    }
  }

  const signIn = (event) => {
    event.preventDefault()
    const user = demoUsers.find((item) => item.id === String(activeUserId))
    if (!user || user.active === false || loginPassword !== 'demo123') {
      setLoginError('Choose a demo role and enter the demo password shown below.')
      return
    }
    window.localStorage.setItem('flood-dispatch-demo-session', JSON.stringify(user.id))
    setActivePage('overview')
    setLoginError('')
    setIsAuthenticated(true)
  }

  const signOut = () => {
    window.localStorage.removeItem('flood-dispatch-demo-session')
    setLoginPassword('')
    setIsAuthenticated(false)
  }

  const incidentsTable = (items) => (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>Incident ID</th><th>Urgency</th><th>Location node</th><th>Affected residents</th><th>Status</th><th>Assigned dispatcher</th></tr></thead>
        <tbody>{items.map((incident) => {
          const assignment = dispatches.flatMap((dispatch) => dispatch.assignments || [])
            .find((item) => item.incidentId === incident.id)
          const dispatcher = demoUsers.find((user) => (
            user.role === fieldResponderRole && String(user.unitId) === String(assignment?.unitId)
          ))
          return <tr key={incident.id}>
            <td><strong>Incident {incident.id}</strong><small>{incident.barangay}</small></td>
            <td><StatusPill tone={incident.priority.toLowerCase()}>{incident.priority}</StatusPill></td>
            <td>{incident.locationNodeId ?? '—'}</td>
            <td>{incident.people}</td>
            <td><StatusPill tone={incident.status.toLowerCase().replace(' ', '-')}>{incident.status}</StatusPill></td>
            <td>{assignment ? dispatcher?.name || `Rescue Unit ${assignment.unitId}` : '—'}</td>
          </tr>
        })}</tbody>
      </table>
      {!items.length && <p className="empty-state">No incidents to display.</p>}
    </div>
  )

  const unitsTable = () => (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>Unit ID</th><th>Unit type</th><th>Current node</th><th>Capacity</th><th>Status</th>{activeRole === 'Coordinator' && <th>Update status</th>}</tr></thead>
        <tbody>{units.map((unit) => (
          <tr key={unit.id}>
            <td><strong>{unit.name}</strong><small>{unit.id}</small></td>
            <td>{unit.type}</td>
            <td>{unit.current_node_id ?? unit.currentNodeId ?? '—'}</td>
            <td>{unit.capacity ?? '—'}</td>
            <td><StatusPill tone={unit.status.toLowerCase().replace(' ', '-')}>{unit.status}</StatusPill></td>
            {activeRole === 'Coordinator' && <td><select className="inline-select" aria-label={`Update ${unit.name} status`} value={unit.status} onChange={(event) => changeUnitStatus(unit.id, event.target.value)}>
              <option>Available</option><option>Deployed</option><option>Under maintenance</option>
            </select></td>}
          </tr>
        ))}</tbody>
      </table>
    </div>
  )

  const roadsTable = () => (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>Edge</th><th>From node</th><th>To node</th><th>Distance</th><th>Road status</th><th>Update</th></tr></thead>
        <tbody>{roads.map((road) => (
          <tr key={road.id}>
            <td><strong>Road edge {road.id}</strong></td>
            <td>{road.from_node_id ?? road.fromNodeId ?? '—'}</td>
            <td>{road.to_node_id ?? road.toNodeId ?? '—'}</td>
            <td>{road.distanceKm != null ? <>{road.distanceEstimated ? '~' : ''}{Number(road.distanceKm).toFixed(2)} km{road.distanceEstimated && <small>Approximate</small>}</> : 'Unavailable'}</td>
            <td><StatusPill tone={road.condition === 'Passable' ? 'open' : 'blocked'}>{road.condition === 'Passable' ? 'Passable' : 'Impassable'}</StatusPill></td>
            <td>{activeRole === 'Administrator' ? 'Coordinator update' : <select className="inline-select" aria-label={`Update edge ${road.id} passability`} value={road.condition === 'Passable' ? 'true' : 'false'} onChange={(event) => changeRoadPassability(road.id, event.target.value === 'true')}>
              <option value="true">Passable</option><option value="false">Impassable</option>
            </select>}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )

  const dispatchTable = (items) => (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>Dispatch</th><th>Incident</th><th>Unit</th><th>Route distance</th><th>Status</th></tr></thead>
        <tbody>{items.map((dispatch) => (
          <tr key={dispatch.id}>
            <td><strong>{dispatch.id}</strong><small>{dispatch.createdAt}</small></td>
            <td>{dispatch.assignments?.map((assignment) => assignment.incidentLabel || assignment.barangay).join(', ') || '—'}</td>
            <td>{dispatch.assignments?.map((assignment) => assignment.unitName).join(', ') || '—'}</td>
            <td>{dispatch.assignments?.map((assignment) => assignment.eta).join(', ') || '—'}</td>
            <td><StatusPill tone={dispatch.routeStatus === 'Unreachable' ? 'blocked' : dispatch.status.toLowerCase()}>{dispatch.routeStatus === 'Unreachable' ? 'Route blocked' : dispatch.status}</StatusPill></td>
          </tr>
        ))}</tbody>
      </table>
      {!items.length && <p className="empty-state">No dispatches recorded.</p>}
    </div>
  )

  const pageContent = () => {
    if (activePage === 'users') return <>
      <PageHeading title="User accounts" subtitle="Manage local demo accounts and their simulated role permissions." />
      <form className="panel account-form" onSubmit={addDemoUser}>
        <label>Full name<input name="name" autoComplete="off" required /></label>
        <label>Email<input name="email" type="email" autoComplete="off" required /></label>
        <label>Role<select name="role" defaultValue="Coordinator"><option>Coordinator</option><option>Administrator</option></select></label>
        <button className="button-primary" type="submit"><Plus size={15} /> Add account</button>
      </form>
      <section className="panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>Demo user</th><th>Prototype role</th><th>Assigned rescue unit</th><th>Role permissions</th><th>Account</th><th>Action</th></tr></thead><tbody>{demoUsers.map((user) => <tr key={user.id}>
        <td><strong>{user.name}</strong><small>{user.email}</small></td>
        <td>{user.role === fieldResponderRole ? fieldResponderRole : <select className="inline-select" aria-label={`Change role for ${user.name}`} value={user.role} onChange={(event) => changeDemoUserRole(user.id, event.target.value)}><option>Coordinator</option><option>Administrator</option></select>}</td>
        <td>{user.unitId ? units.find((unit) => unit.id === String(user.unitId))?.name || `Rescue Unit ${user.unitId}` : '—'}</td>
        <td>{user.role === 'Coordinator' ? 'Incidents, roads, units, dispatch recommendations' : user.role === fieldResponderRole ? 'Assigned routes, route status, road reports' : 'User roles, accounts, system logs'}</td>
        <td><StatusPill tone={user.active === false ? 'blocked' : 'available'}>{user.active === false ? 'Disabled' : 'Active'}</StatusPill></td>
        <td><button className="button-secondary account-toggle" type="button" disabled={user.id === activeUser?.id || (user.active !== false && activeDemoUsers.length <= 1)} onClick={() => toggleDemoUser(user.id)}>{user.active === false ? 'Enable' : 'Disable'}</button></td>
      </tr>)}</tbody></table></div></section>
    </>

    if (activePage === 'barangays') return <>
      <PageHeading title="Barangays" subtitle="Prototype area: 10 barangays around Bulacan State University. Other barangays are outside this demo scope." action={<button className="button-primary" onClick={() => setModal(true)}><Plus size={16} /> New incident</button>} />
      <div className="toolbar">
        <label className="search-field"><Search size={16} /><input value={barangaySearch} onChange={(event) => setBarangaySearch(event.target.value)} placeholder="Search barangay" /></label>
        <span className="muted">{demoBarangays.length} demo barangays</span>
      </div>
      <section className="panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>Barangay</th><th>Total incidents</th><th>Open incidents</th></tr></thead><tbody>{visibleBarangays.map((barangay) => {
        const records = incidents.filter((incident) => incident.barangay === barangay)
        const openRecords = records.filter((incident) => !['Resolved', 'Completed'].includes(incident.status))
        return <tr key={barangay}><td><strong>{barangay}</strong></td><td>{records.length}</td><td>{openRecords.length}</td></tr>
      })}</tbody></table>{!visibleBarangays.length && <p className="empty-state">No barangays match that search.</p>}</div></section>
    </>

    if (activePage === 'incidents') return <>
      <PageHeading title="Incidents" subtitle="Incident urgency, status, and linked road-network location." action={<button className="button-primary" onClick={() => setModal(true)}><Plus size={16} /> New incident</button>} />
      <div className="toolbar">
        <label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search incident or node ID" /></label>
        <label className="select-field"><Filter size={15} /><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option>All priorities</option>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
      </div>
      <section className="panel">{incidentsTable(visibleIncidents)}</section>
    </>

    if (activePage === 'units') return <>
      <PageHeading title="Rescue units" subtitle="Unit capacity, current road-network node, and deployment status." />
      <section className="panel">{unitsTable()}</section>
    </>

    if (activePage === 'roads') return <>
      <PageHeading title="Road network" subtitle="Road edges and their passability between network nodes." />
      <section className="panel">{roadsTable()}</section>
    </>

    if (activePage === 'dispatches' && activeRole === fieldResponderRole) {
      const assignedRoutes = activeAssignedDispatches
        .filter(({ assignment }) => assignment.unitId === String(activeUser.unitId))
        .map(({ dispatch }) => dispatch)
      const selectedDispatch = assignedRoutes.find((dispatch) => dispatch.id === selectedAssignedDispatchId) || assignedRoutes[0]
      const selectedAssignment = selectedDispatch?.assignments.find((assignment) => assignment.unitId === String(activeUser.unitId))
      const selectedIncident = incidents.find((incident) => incident.id === selectedAssignment?.incidentId)
      const selectedRouteUnit = units.find((unit) => unit.id === selectedAssignment?.unitId)
      const assignedUnit = units.find((unit) => unit.id === String(activeUser.unitId))
      const pendingIncidents = incidents.filter((incident) => incident.status.toLowerCase() === 'pending')
      return <>
        <PageHeading title="My assigned routes" subtitle={`Dispatcher for ${assignedUnit?.name || `Rescue Unit ${activeUser.unitId}`}. View and update routes assigned to this unit only.`} action={<span className="select-field responder-unit-picker"><Truck size={15} /> {assignedUnit?.name || `Rescue Unit ${activeUser.unitId}`}</span>} />
        {selectedDispatch && selectedAssignment && <section className="panel route-selection-panel">
          <div className="panel-header"><div><p className="eyebrow">Currently viewing</p><h3>Incident {selectedAssignment.incidentId} · {selectedIncident?.barangay || selectedAssignment.incidentLabel}</h3><p className="panel-subtitle">Point A: {selectedAssignment.unitName} · Node {selectedRouteUnit?.current_node_id ?? selectedRouteUnit?.currentNodeId ?? '—'} → Point B: Incident {selectedAssignment.incidentId} · Node {selectedIncident?.locationNodeId ?? '—'}</p></div><StatusPill tone={selectedDispatch.routeStatus === 'Unreachable' ? 'blocked' : 'available'}>{selectedDispatch.routeStatus === 'Unreachable' ? 'Route blocked' : selectedDispatch.status}</StatusPill></div>
          <div className="map-legend"><i className="legend-recommended" /> Recommended route <i className="legend-passable" /> Passable <i className="legend-impassable" /> Impassable</div>
          <div className="map-frame"><NetworkMap roads={roads} incidents={selectedIncident ? [selectedIncident] : []} originUnit={selectedRouteUnit} demoMode={isDemoMode} /><div className="map-caption">{isDemoMode ? 'Routes follow mapped streets from the assigned unit to the selected incident; demo passability and blocked conditions are simulated.' : 'Routes connect the assigned unit to the selected incident along connected road edges; red dashed marks an impassable route.'}</div></div>
        </section>}
        <section className="panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>Incident</th><th>Route</th><th>Distance</th><th>Dispatch status</th><th>Update</th></tr></thead><tbody>{assignedRoutes.map((dispatch) => {
          const assignment = dispatch.assignments[0]
          return <tr key={dispatch.id} className={selectedDispatch?.id === dispatch.id ? 'selected-route-row' : ''}>
            <td><button className="route-select-button" type="button" aria-pressed={selectedDispatch?.id === dispatch.id} onClick={() => setSelectedAssignedDispatchId(dispatch.id)}><strong>{assignment.incidentLabel}</strong><small>Incident {assignment.incidentId}</small></button></td>
            <td>{dispatch.routeStatus === 'Unreachable' ? 'No passable route' : assignment.nodeIds?.join(' → ') || (assignment.distanceKm != null ? 'Mapped street route' : 'Route details unavailable')}</td><td>{dispatch.routeStatus === 'Unreachable' ? '—' : assignment.distanceKm != null ? `${Number(assignment.distanceKm).toFixed(2)} km` : assignment.eta}</td><td><StatusPill tone={dispatch.routeStatus === 'Unreachable' ? 'blocked' : dispatch.status.toLowerCase().replace(' ', '-')}>{dispatch.routeStatus === 'Unreachable' ? 'Route blocked' : dispatch.status}</StatusPill></td><td><select className="inline-select" aria-label={`Update dispatch ${dispatch.dispatchId} status`} value={dispatch.status} onChange={(event) => updateDispatch(dispatch.dispatchId, event.target.value)}><option>Assigned</option><option>En route</option><option>Completed</option></select></td></tr>
        })}</tbody></table>{!assignedRoutes.length && <p className="empty-state">{pendingIncidents.length
          ? `${pendingIncidents.length} pending incident(s) are waiting for the coordinator to generate and confirm dispatch assignments. Your ${assignedUnit?.name || `Rescue Unit ${activeUser.unitId}`} route will appear here after confirmation.`
          : `No active route is currently assigned to ${assignedUnit?.name || `Rescue Unit ${activeUser.unitId}`}.`}</p>}</div></section>
      </>
    }

    if (activePage === 'dispatches') return <>
      <PageHeading title={activeRole === 'Coordinator' ? 'Generate plan' : 'Dispatch plan'} subtitle={activeRole === 'Coordinator' ? `Re-optimize pending assignments to minimize total route distance using ${assignmentAlgorithmLabel.toLowerCase()}; route lengths use ${routeAlgorithmLabel.toLowerCase()}.` : 'Track route progress and confirmed dispatches for the assigned responder.'} action={activeRole === 'Coordinator' ? <button className="button-primary" onClick={recommendDispatches}><RefreshCw size={15} /> Re-optimize plan</button> : null} />
      {recommendations.map((recommendation) => <article className="plan-card" key={recommendation.id}>
        <div className="plan-heading"><div><p className="eyebrow">Review before confirming dispatch</p><h3>Distance-minimized assignments</h3></div><span className="muted">{recommendation.unassignedIncidentIds.length} unassigned</span></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Incident</th><th>Unit</th><th>Urgency</th><th>Route distance</th><th>Route path</th></tr></thead><tbody>{recommendation.assignments.map((assignment) => <tr key={assignment.incidentId}><td>{assignment.incidentLabel} · {assignment.incidentId}</td><td>{assignment.unitName} · {assignment.unitId}</td><td>{assignment.priority}</td><td>{assignment.distanceKm != null && Number.isFinite(Number(assignment.distanceKm)) ? `${Number(assignment.distanceKm).toFixed(2)} km` : 'Unavailable'}</td><td>{assignment.nodeIds?.join(' → ') || '—'}</td></tr>)}</tbody></table></div>
        {recommendation.unassignedIncidentIds.length > 0 && <p className="unassigned-notice"><strong>Manual follow-up needed:</strong> {recommendation.unassignedIncidentIds.map((incidentId) => {
          const incident = incidents.find((item) => item.id === String(incidentId))
          return `${incident?.barangay || 'Incident'} · ${incidentId}`
        }).join(', ')}</p>}
        {activeRole === 'Coordinator' && <div className="plan-footer"><small>{assignmentAlgorithmLabel} minimizes total route distance across feasible passable paths. {routeAlgorithmLabel} computes each route.</small><button className="button-primary" disabled={dispatchSubmitting} onClick={() => createDispatches(recommendation)}><Check size={16} /> {dispatchSubmitting ? 'Creating dispatches…' : 'Confirm dispatches'}</button></div>}
      </article>)}
      {activeRole === 'Coordinator' && <section className="panel route-preview-panel">
        <div className="panel-header">
          <div><p className="eyebrow">Currently viewing</p><h3>{selectedDispatchMapRoute ? `Incident ${selectedDispatchMapRoute.assignment.incidentId} · ${selectedDispatchMapRoute.incident?.barangay || selectedDispatchMapRoute.assignment.incidentLabel}` : 'No active assigned route'}</h3><p className="panel-subtitle">Map displays only one active assigned route at a time.</p></div>
          {activeAssignedDispatches.length > 0 && <label className="select-field map-incident-picker"><MapPin size={15} /><select aria-label="Select assigned incident route to show" value={selectedDispatchMapRoute?.dispatch.id || ''} onChange={(event) => setSelectedDispatchMapId(event.target.value)}>{activeAssignedDispatches.map(({ dispatch, assignment, incident }) => <option key={`${dispatch.id}-${assignment.incidentId}`} value={dispatch.id}>Incident {assignment.incidentId} · {incident?.barangay || assignment.incidentLabel}</option>)}</select></label>}
        </div>
        {selectedDispatchMapRoute ? <>
          <p className="assigned-route-context">Point A: {selectedDispatchMapRoute.unit?.name || selectedDispatchMapRoute.assignment.unitName} → Point B: Incident {selectedDispatchMapRoute.assignment.incidentId} · {selectedDispatchMapRoute.incident?.barangay || selectedDispatchMapRoute.assignment.incidentLabel} · {selectedDispatchMapRoute.dispatch.status}</p>
          <div className="map-legend"><i className="legend-incident" /> Selected incident <i className="legend-unit" /> Assigned unit <i className="legend-recommended" /> Recommended route <i className="legend-passable" /> Passable <i className="legend-impassable" /> Impassable</div>
          <div className="map-frame"><NetworkMap roads={roads} incidents={selectedDispatchMapRoute.incident ? [selectedDispatchMapRoute.incident] : []} originUnit={selectedDispatchMapRoute.unit} demoMode={isDemoMode} /><div className="map-caption">{isDemoMode ? 'Routes follow mapped streets from the assigned unit to the selected incident; demo passability and blocked conditions are simulated.' : 'Routes connect the assigned unit to the selected incident along connected road edges; red dashed marks an impassable route.'}</div></div>
        </> : <p className="empty-state">No incidents are currently assigned to a unit.</p>}
      </section>}
      <section className="panel">{dispatchTable(dispatches)}</section>
    </>

    if (activePage === 'logs') return <>
      <PageHeading title="System activity" subtitle="Actions recorded in the system log." action={<button className="button-secondary" onClick={refreshAndAssign}><RefreshCw size={15} /> Refresh</button>} />
      <section className="panel"><div className="activity-list">{logs.map((log) => <div className="activity-row" key={log.id}><span className="activity-marker" /><div><strong>{log.text}</strong><small>{logActorLabel(log)}</small></div><time>{log.time}</time></div>)}</div></section>
    </>

    return <>
      <PageHeading title="Dispatch overview" subtitle="Network-based flood response coordination · Malolos, Bulacan" action={<><button className="button-secondary" onClick={refreshAndAssign}><RefreshCw size={15} /> Refresh</button>{activeRole === 'Coordinator' && <button className="button-primary" onClick={recommendDispatches}><Route size={16} /> Recommend assignments</button>}</>} />
      {isDemoMode && <div className="sample-banner"><AlertTriangle size={17} /><span><strong>Demo mode</strong> Local sample records are active; changes are saved only in this browser.</span><button onClick={resetSampleData}>Reset sample</button></div>}
      {error && !isDemoMode && <div className="sample-banner"><AlertTriangle size={17} /><span><strong>API notice</strong> {error}</span><button onClick={refreshAndAssign}>Retry</button></div>}
      <div className="sample-banner"><AlertTriangle size={17} /><span><strong>Decision support only</strong> Verify field reports and approve dispatch decisions with authorized coordinators.</span></div>
      <section className="metric-grid">
        <Metric icon={ShieldAlert} label="Open incidents" value={String(openIncidents).padStart(2, '0')} trend="Needs review" tone="red" />
        <Metric icon={Truck} label="Units available" value={String(availableUnits).padStart(2, '0')} trend={`${units.length} registered`} tone="blue" />
        <Metric icon={Route} label="Impassable edges" value={String(blockedRoads).padStart(2, '0')} trend="Road network reports" tone="amber" />
        <Metric icon={Clock3} label="Latest activity" value={logs[0]?.time || '—'} trend="System log" tone="green" />
      </section>
      <section className="overview-grid">
        <div className="panel map-panel"><div className="panel-header"><div><p className="eyebrow">Currently viewing</p><h3>{overviewRoute ? `Incident ${overviewRoute.assignment.incidentId} · ${overviewRoute.incident?.barangay || overviewRoute.assignment.incidentLabel}` : 'No active assigned route'}</h3><p className="panel-subtitle">Overview map is focused on an active assigned incident route.</p></div>{activeAssignedDispatches.length > 0 && <label className="select-field map-incident-picker"><MapPin size={15} /><select aria-label="Select overview assigned incident" value={overviewRoute?.dispatch.id || ''} onChange={(event) => setSelectedOverviewDispatchId(event.target.value)}>{activeAssignedDispatches.map(({ dispatch, assignment, incident }) => <option key={`${dispatch.id}-${assignment.incidentId}`} value={dispatch.id}>Incident {assignment.incidentId} · {incident?.barangay || assignment.incidentLabel}</option>)}</select></label>}</div>
          {overviewRoute ? <>
            <p className="assigned-route-context">Point A: {overviewRoute.unit?.name || overviewRoute.assignment.unitName} → Point B: Incident {overviewRoute.assignment.incidentId} · {overviewRoute.incident?.barangay || overviewRoute.assignment.incidentLabel} · {overviewRoute.dispatch.status}</p>
            <div className="map-legend"><i className="legend-incident" /> Selected incident <i className="legend-unit" /> Assigned unit <i className="legend-recommended" /> Recommended route <i className="legend-passable" /> Passable <i className="legend-impassable" /> Impassable</div>
            <div className="map-frame"><NetworkMap roads={roads} incidents={overviewRoute.incident ? [overviewRoute.incident] : []} originUnit={overviewRoute.unit} active={activePage === 'overview'} demoMode={isDemoMode} /><div className="map-caption">{isDemoMode ? 'Routes follow mapped streets from the assigned unit to the selected incident; demo passability and blocked conditions are simulated.' : 'Routes connect the assigned unit to the selected incident along connected road edges; red dashed marks an impassable route.'}</div></div>
          </> : <p className="empty-state">No incidents are currently assigned to a unit. Pending and resolved incidents are excluded.</p>}
        </div>
        <div className="panel incident-panel"><div className="panel-header"><div><h3>Priority queue</h3><p className="panel-subtitle">Unresolved incidents by urgency</p></div><button className="text-button" onClick={() => setActivePage('incidents')}>View all <ArrowUpRight size={14} /></button></div>
          {incidents.slice().sort((first, second) => priorities.indexOf(first.priority) - priorities.indexOf(second.priority)).slice(0, 4).map((incident) => <div className="queue-item" key={incident.id}><div className={`queue-symbol ${incident.priority.toLowerCase()}`}><AlertTriangle size={16} /></div><div className="queue-copy"><strong>Incident {incident.id}</strong><span>Node {incident.locationNodeId ?? '—'} · {incident.status}</span></div><StatusPill tone={incident.priority.toLowerCase()}>{incident.priority}</StatusPill></div>)}
        </div>
      </section>
      <section className="bottom-grid"><div className="panel"><div className="panel-header"><div><h3>Recent incidents</h3><p className="panel-subtitle">Active records</p></div><button className="text-button" onClick={() => setActivePage('incidents')}>All incidents <ArrowDownRight size={14} /></button></div>{incidentsTable(incidents.slice(0, 4))}</div>
        <div className="panel"><div className="panel-header"><div><h3>Unit readiness</h3><p className="panel-subtitle">Current availability</p></div><button className="text-button" onClick={() => setActivePage('units')}>Manage <ArrowUpRight size={14} /></button></div><div className="unit-summary">{units.slice(0, 4).map((unit) => <div className="unit-row" key={unit.id}><span className="unit-icon"><Truck size={17} /></span><div><strong>{unit.name}</strong><small>Capacity {unit.capacity ?? '—'} · Node {unit.current_node_id ?? unit.currentNodeId ?? '—'}</small></div><StatusPill tone={unit.status.toLowerCase()}>{unit.status}</StatusPill></div>)}</div></div>
      </section>
      <section className="panel activity-preview"><div className="panel-header"><div><h3>Latest activity</h3><p className="panel-subtitle">System log</p></div><button className="text-button" onClick={() => setActivePage('logs')}>View log <ArrowUpRight size={14} /></button></div>{logs.slice(0, 3).map((log) => <div className="compact-log" key={log.id}><span className="activity-marker" /><span>{log.text}</span><time>{log.time}</time></div>)}</section>
    </>
  }

  if (!isAuthenticated) return <main className="login-shell">
    <section className="login-panel">
      <div className="login-hero">
        <div className="brand-mark login-mark"><Activity size={22} /></div>
        <p className="eyebrow">CITY DISASTER RISK REDUCTION AND MANAGEMENT OFFICE</p>
        <h1>Flood Dispatch</h1>
        <p className="login-subtitle">Malolos, Bulacan · Dispatch decision-support prototype</p>
      </div>

      <div className="login-form-wrap">
        <form className="login-form" onSubmit={signIn}>
          <div className="login-input-row">
            <label className="login-field login-field-compact">
              <span>Demo account</span>
              <select aria-label="Demo account" value={activeUserId} onChange={(event) => setActiveUserId(event.target.value)}>
                {activeDemoUsers.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}
              </select>
            </label>

            <label className="login-field login-field-compact">
              <span>Password</span>
              <input aria-label="Password" type="password" autoComplete="current-password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="Enter demo password" required />
            </label>
          </div>

          {loginError && <p className="login-error" role="alert">{loginError}</p>}

          <button className="button-primary login-submit" type="submit">
            Sign in <ArrowUpRight size={16} />
          </button>
        </form>

        <div className="login-meta">
          <p className="login-hint"><strong>Demo password:</strong> demo123</p>
          <p className="login-disclaimer">Demo-only login. Accounts and role permissions are stored locally and are not secure authentication.</p>
        </div>
      </div>
    </section>
  </main>

  return <div className="app-shell">
    {sidebarOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}><div className="brand"><div className="brand-mark"><Activity size={21} /></div><div><p className="brand-kicker">MALOLOS · BULACAN</p><h2>Flood Dispatch</h2></div><button className="mobile-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={20} /></button></div>
      <div className="sidebar-section"><span className="sidebar-label">WORKSPACE</span><nav className="nav">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${activePage === id ? 'active' : ''}`} onClick={() => { setActivePage(id); setSidebarOpen(false) }}><Icon size={17} /><span>{label}</span>{id === 'incidents' && openIncidents > 0 && <span className="nav-count">{openIncidents}</span>}</button>)}</nav></div>
      <div className="sidebar-bottom"><div className="alert-level"><span className="alert-level-dot" /><div><small>OPERATIONAL STATUS</small><strong>{error ? 'Service issue' : isDemoMode ? 'Demo simulation' : 'Monitoring active'}</strong></div></div><div className="sidebar-foot"><span>Flood response support</span><span>Prototype · Local data</span></div></div>
    </aside>
    <main className="main-panel"><header className="topbar"><div className="topbar-title"><button className="mobile-menu" aria-label="Open navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}><Menu size={19} /></button><div><div className="breadcrumb">Operations <span>/</span> {pageTitle}</div><h1>{pageTitle}</h1></div></div><div className="topbar-tools"><label className="role-picker light-role-picker"><span>Demo profile</span><select aria-label="Switch demo profile" value={activeUser?.id || ''} onChange={(event) => changeActiveUser(event.target.value)}>{demoUsers.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}</select></label><button className="icon-button notification-button" title="Notifications" aria-label={`Notifications, ${notifications.filter((item) => !item.read).length} unread`} aria-expanded={notificationsOpen} onClick={toggleNotifications}><Bell size={18} />{notifications.some((item) => !item.read) && <i />}</button><button className="icon-button" title="Refresh data" aria-label="Refresh data" onClick={refreshAndAssign}><RefreshCw size={18} /></button><button className="icon-button" title="Sign out" aria-label="Sign out" onClick={signOut}><LogOut size={17} /></button></div></header>
      {notificationsOpen && <aside className="notification-panel" aria-label="Notification center"><div className="panel-header"><div><h3>Notification center</h3><p className="panel-subtitle">Local prototype alerts</p></div><button className="icon-button" aria-label="Close notifications" onClick={() => setNotificationsOpen(false)}><X size={16} /></button></div>{notifications.map((notification) => <article className={`notification-item ${notification.read ? 'read' : ''}`} key={notification.notification_id}><span className="activity-marker" /><div><strong>{notification.title}</strong><p>{notification.message}</p><time>{notification.time}</time></div></article>)}{!notifications.length && <p className="empty-state">No notifications.</p>}</aside>}
      {isDemoMode && <div className="prototype-notice"><AlertTriangle size={14} /> Prototype mode: profiles and permissions are simulated locally; this is not secure authentication.</div>}
      <div className="page-content">{loading ? <div className="loading-state">Loading prototype data...</div> : pageContent()}<footer className="page-footer"><span>Decision support prototype · Final dispatch decisions remain with authorized coordinators.</span><button onClick={() => setNotice('All prototype changes are stored in this browser only')}>Prototype information</button></footer></div>
    </main>
    {notice && <div className="toast" role="status"><Check size={17} />{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button></div>}
    {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(false) }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="incident-modal-title">
        <div className="modal-heading">
          <div><p className="eyebrow">Incident intake</p><h2 id="incident-modal-title">New incident</h2></div>
          <button className="icon-button" onClick={() => setModal(false)} aria-label="Close dialog">×</button>
        </div>
        <form onSubmit={addIncident}>
          <label>Barangay
            <select name="barangay" required defaultValue="">
              <option value="" disabled>Select a barangay</option>
              {demoBarangays.map((barangay) => <option key={barangay}>{barangay}</option>)}
              <optgroup label="Outside the prototype area · disabled">
                {malolosBarangays.filter((barangay) => !demoBarangays.includes(barangay)).map((barangay) => (
                  <option key={barangay} value={barangay} disabled>{barangay}</option>
                ))}
              </optgroup>
            </select>
          </label>
          <label>Affected residents
            <input name="people_affected" type="number" min="1" step="1" required defaultValue="1" />
          </label>
          <p className="form-note">The map pin uses the barangay's mapped location; routing uses its nearest road-network node.</p>
          <label>Urgency level
            <select name="urgency_level" defaultValue="Medium">
              {priorities.map((priority) => <option key={priority}>{priority}</option>)}
            </select>
          </label>
          <div className="modal-actions">
            <button type="button" className="button-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button className="button-primary" type="submit" disabled={incidentSubmitting}>{incidentSubmitting ? 'Mapping location…' : <><Plus size={16} /> Add incident</>}</button>
          </div>
        </form>
      </section>
    </div>}
  </div>
}

function NetworkMap({ roads, incidents, originUnit, active = true, demoMode = false }) {
  const startNodeId = originUnit?.current_node_id ?? originUnit?.currentNodeId
  const incidentLocation = incidents[0]?.location
  const incidentLocationNodeId = incidents[0]?.locationNodeId
  const originLocation = originUnit?.location
  const routeRoads = useMemo(() => {
    if (!demoMode) return roads
    const fixtures = getDemoRouteFixtures(startNodeId, incidentLocationNodeId, originLocation, incidentLocation)
    return fixtures.length ? fixtures : roads
  }, [demoMode, roads, startNodeId, incidentLocationNodeId, originLocation, incidentLocation])
  const routeOptions = useMemo(
    () => optimizeMapRoutes(routeRoads, startNodeId, incidentLocationNodeId),
    [routeRoads, startNodeId, incidentLocationNodeId],
  )
  const [routeGeometries, setRouteGeometries] = useState({})
  const [streetRouteOptions, setStreetRouteOptions] = useState(null)
  const [routeGeometryError, setRouteGeometryError] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadPathGeometry = async (route, edgeIds = route.edgeIds) => {
      if (!route || !edgeIds?.length) return null
      const edgeRecords = edgeIds.map((edgeId) => routeRoads.find((road) => String(road.id) === String(edgeId)))
      if (edgeRecords.some((road) => !road)) throw new Error('A route edge is missing from the current road network')
      const positionsByEdge = await Promise.all(edgeRecords.map((road) => api.getRoadGeometry(road)))
      if (positionsByEdge.some((positions) => !positions?.length)) {
        throw new Error('Road geometry is unavailable for one or more route edges')
      }
      return positionsByEdge.reduce((combined, positions) => {
        if (!combined.length) return [...positions]
        const [lastLatitude, lastLongitude] = combined[combined.length - 1]
        const [firstLatitude, firstLongitude] = positions[0]
        if (Math.abs(lastLatitude - firstLatitude) > 1e-7 || Math.abs(lastLongitude - firstLongitude) > 1e-7) {
          throw new Error('Road geometry edges do not connect at the route junction')
        }
        return [...combined, ...positions.slice(1)]
      }, [])
    }
    const reachesMapMarker = (position, marker) => {
      if (!Array.isArray(marker) || marker.length !== 2) return false
      const latitudeKm = (position[0] - marker[0]) * 111
      const longitudeKm = (position[1] - marker[1]) * 111 * Math.cos(marker[0] * Math.PI / 180)
      return Math.hypot(latitudeKm, longitudeKm) <= 0.05
    }

    const loadRouteGeometries = async () => {
      setRouteGeometries({})
      setStreetRouteOptions(null)
      const routeEntries = [
        ['recommended', routeOptions.recommended],
        ['passable', routeOptions.passable],
        ['impassable', routeOptions.impassable],
      ]
      const results = await Promise.all(routeEntries.map(async ([type, route]) => {
        if (!route) return [type, null, null]
        try {
          const validEdges = route.edgeIds.every((edgeId, index) => {
            const road = routeRoads.find((item) => String(item.id) === String(edgeId))
            const expectedCondition = type === 'impassable' && String(edgeId) === String(route.blockedEdgeId)
              ? 'Impassable'
              : 'Passable'
            return road?.condition === expectedCondition
              && String(road.from_node_id ?? road.fromNodeId ?? road.from?.node_id ?? road.from?.nodeId ?? road.from?.id) === route.nodeIds[index]
              && String(road.to_node_id ?? road.toNodeId ?? road.to?.node_id ?? road.to?.nodeId ?? road.to?.id) === route.nodeIds[index + 1]
          })
          if (!validEdges || route.nodeIds.length !== route.edgeIds.length + 1) {
            throw new Error('Route no longer matches connected road edges from the assigned unit to the incident')
          }
          if (type === 'impassable') {
            if (!route.blockedEdgeId) return [type, null, null]
          }
          const positions = await loadPathGeometry(route)
          if (!reachesMapMarker(positions[0], originLocation)
            || !reachesMapMarker(positions.at(-1), incidentLocation)) {
            throw new Error('The road route cannot reach the assigned unit or selected incident marker')
          }
          return [type, positions, null]
        } catch (geometryError) {
          return [type, null, geometryError.message || 'Road geometry could not be loaded']
        }
      }))

      let directStreetRoutes = null
      let directStreetRouteError = ''
      if (demoMode && !routeOptions.recommended
        && Array.isArray(originLocation) && Array.isArray(incidentLocation)) {
        try {
          directStreetRoutes = await api.getDemoStreetRoutes(originLocation, incidentLocation)
        } catch (streetRouteError) {
          directStreetRouteError = streetRouteError.message || 'No road-following route could be loaded'
        }
      }

      if (cancelled) return
      const geometries = Object.fromEntries(results.filter(([, positions]) => positions))
      if (directStreetRoutes) {
        geometries.recommended = directStreetRoutes.recommended.positions
        if (directStreetRoutes.passable) geometries.passable = directStreetRoutes.passable.positions
      }
      if (geometries.recommended && geometries.passable
        && geometries.recommended.length === geometries.passable.length
        && geometries.recommended.every(([latitude, longitude], index) => (
          Math.abs(latitude - geometries.passable[index][0]) < 1e-7
          && Math.abs(longitude - geometries.passable[index][1]) < 1e-7
        ))) {
        delete geometries.passable
      }
      if (geometries.recommended && geometries.impassable) {
        geometries.impassable = removeOverlappingRouteSegments(
          geometries.impassable,
          geometries.recommended,
        )
        if (!geometries.impassable.length) delete geometries.impassable
      }
      setRouteGeometries(geometries)
      setStreetRouteOptions(directStreetRoutes)
      const routeError = results.find(([, , error]) => error)?.[2]
      const hasRoute = Object.values(routeOptions).some(Boolean) || Boolean(directStreetRoutes)
      setRouteGeometryError(routeError || directStreetRouteError || (!hasRoute
        ? 'No routes available: the selected unit and incident have no connected path with valid road distance and passability data.'
        : ''))
    }

    loadRouteGeometries()
    return () => { cancelled = true }
  }, [routeRoads, routeOptions, incidentLocation, originLocation, demoMode])

  const displayedRouteOptions = {
    recommended: routeOptions.recommended || (streetRouteOptions
      ? { distanceKm: streetRouteOptions.recommended.distanceKm }
      : null),
    passable: routeOptions.passable || (streetRouteOptions?.passable
      ? { distanceKm: streetRouteOptions.passable.distanceKm }
      : null),
    impassable: routeOptions.impassable,
  }
  const hasSimulatedBlockedRoute = routeOptions.impassable?.edgeIds.some((edgeId) => (
    routeRoads.find((road) => String(road.id) === String(edgeId))?.demoRouteFixture
  ))
  const routeLabels = {
    recommended: `Recommended route · shortest passable (${displayedRouteOptions.recommended?.distanceKm?.toFixed(2) ?? '—'} km)`,
    passable: `Passable · longer alternative (${displayedRouteOptions.passable?.distanceKm?.toFixed(2) ?? '—'} km)`,
    impassable: hasSimulatedBlockedRoute
      ? 'Simulated blocked route to the selected incident'
      : `Blocked route via impassable road edge ${routeOptions.impassable?.blockedEdgeId ?? '—'}`,
  }
  const routeStyles = {
    impassable: { color: '#c84d47', weight: 10, opacity: 1, dashArray: '8 7', lineCap: 'butt', lineJoin: 'round' },
    passable: { color: '#2875a0', weight: 10, opacity: 0.92, lineCap: 'round', lineJoin: 'round' },
    recommended: { color: recommendedRouteColor, weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round' },
  }
  const routeSegments = ['impassable', 'passable', 'recommended']
    .filter((type) => displayedRouteOptions[type] && routeGeometries[type]?.length)
  const unavailableRouteTypes = [
    !displayedRouteOptions.passable && 'longer passable alternative',
    !routeOptions.impassable && 'connected impassable route',
  ].filter(Boolean)
  const routeAvailabilityNote = displayedRouteOptions.recommended && unavailableRouteTypes.length
    ? `Loaded road data has no ${unavailableRouteTypes.join(' or ')} for this unit and incident.`
    : ''
  const routePanes = {
    impassable: 'blocked-route-pane',
    passable: 'alternative-route-pane',
    recommended: 'recommended-route-pane',
  }
  const routePaneOrder = [
    ['impassable', 410],
    ['passable', 420],
    ['recommended', 430],
  ]
  const viewportPositions = useMemo(() => [
    ...Object.entries(routeGeometries).flatMap(([type, geometry]) => (
      type === 'impassable' ? geometry.flat() : geometry
    )),
    ...incidents.map((incident) => incident.location),
    originUnit?.location,
  ].filter((position) => (
    Array.isArray(position) && position.length === 2 && position.every(Number.isFinite)
  )), [routeGeometries, incidents, originUnit])
  return <>
    {routeGeometryError && <p className="map-route-error" role="status">{routeGeometryError}</p>}
    {routeAvailabilityNote && <p className="map-route-note" role="status">{routeAvailabilityNote}</p>}
    <MapContainer center={mapCenter} zoom={13} scrollWheelZoom={false} zoomControl>
      <MapResizeHandler active={active} />
      <MapViewport positions={viewportPositions} />
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {routePaneOrder.map(([type, zIndex]) => routeSegments.includes(type) && (
        <Pane key={routePanes[type]} name={routePanes[type]} style={{ zIndex }}>
          {(type === 'impassable' ? routeGeometries[type] : [routeGeometries[type]]).map((positions, index) => (
            <Polyline key={`${type}-${index}`} positions={positions} pathOptions={routeStyles[type]}>
              <Popup>{routeLabels[type]}</Popup>
            </Polyline>
          ))}
        </Pane>
      ))}
      {incidents.map((incident) => <CircleMarker key={incident.id} center={incident.location} radius={incident.priority === 'Critical' ? 9 : 8} pathOptions={{ color: '#fff', weight: 2, fillColor: '#d94e48', fillOpacity: 1 }}>
        <Tooltip permanent direction="right" offset={[8, 0]}>{incident.barangay}</Tooltip>
        <Popup><strong>Incident {incident.id}</strong><br />{incident.barangay} · approximate barangay location<br />{incident.priority} urgency<br />Routing node {incident.locationNodeId ?? 'not set'}</Popup>
      </CircleMarker>)}
      {originUnit?.location && <CircleMarker center={originUnit.location} radius={12} pathOptions={{ color: '#fff', weight: 3, fillColor: '#1769aa', fillOpacity: 1 }}>
        <Tooltip permanent direction="left" offset={[-8, 0]}>{originUnit.name} · assigned unit</Tooltip>
        <Popup><strong>{originUnit.name}</strong><br />Rescue unit · Point A</Popup>
      </CircleMarker>}
    </MapContainer>
  </>
}

function PageHeading({ title, subtitle, action }) {
  return <div className="page-heading"><div><p className="eyebrow">FLOOD RESPONSE · MALOLOS</p><h2>{title}</h2><p>{subtitle}</p></div>{action && <div className="heading-actions">{action}</div>}</div>
}

function Metric({ icon: Icon, label, value, trend, tone }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-trend">{tone === 'red' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{trend}</span></article>
}

export default App
