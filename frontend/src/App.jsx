import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from 'react-leaflet'
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
import { malolosBarangays } from './data/barangays'

const mapCenter = [14.852, 120.815]
const priorities = ['Critical', 'High', 'Medium', 'Low']
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
]

const loadLocalJson = (key, fallback) => {
  try {
    return JSON.parse(window.localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
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

function StatusPill({ children, tone = '' }) {
  return <span className={`status-pill ${tone}`}>{children}</span>
}

const findRoadPath = (roads, startNodeId, endNodeId, { excludedEdgeIds = new Set() } = {}) => {
  const start = String(startNodeId ?? '')
  const end = String(endNodeId ?? '')
  if (!start || !end) return null
  if (start === end) return { distanceKm: 0, nodeIds: [start], edgeIds: [] }

  const adjacency = new Map()
  for (const road of roads) {
    const fromId = String(road.from_node_id ?? road.fromNodeId ?? road.from?.node_id ?? road.from?.nodeId ?? road.from?.id ?? '')
    const toId = String(road.to_node_id ?? road.toNodeId ?? road.to?.node_id ?? road.to?.nodeId ?? road.to?.id ?? '')
    const edgeId = String(road.id ?? road.edge_id ?? road.edgeId ?? '')
    const distanceKm = Number(road.distanceKm)
    if (!fromId || !toId || !edgeId || road.distanceKm == null || excludedEdgeIds.has(edgeId) || road.condition !== 'Passable' || !Number.isFinite(distanceKm) || distanceKm < 0) continue
    if (!adjacency.has(fromId)) adjacency.set(fromId, [])
    adjacency.get(fromId).push({ edgeId, fromId, toId, distanceKm })
  }

  const distances = new Map([[start, 0]])
  const previous = new Map()
  const visited = new Set()

  while (true) {
    let currentNodeId = null
    let bestDistance = Infinity
    for (const [nodeId, distance] of distances) {
      if (!visited.has(nodeId) && distance < bestDistance) {
        currentNodeId = nodeId
        bestDistance = distance
      }
    }
    if (currentNodeId === null) break
    if (currentNodeId === end) break

    visited.add(currentNodeId)
    for (const edge of adjacency.get(currentNodeId) || []) {
      const nextDistance = bestDistance + edge.distanceKm
      if (nextDistance < (distances.get(edge.toId) ?? Infinity)) {
        distances.set(edge.toId, nextDistance)
        previous.set(edge.toId, { nodeId: currentNodeId, edgeId: edge.edgeId })
      }
    }
  }

  if (!distances.has(end)) return null
  const nodeIds = [end]
  const edgeIds = []
  let currentNodeId = end
  while (currentNodeId !== start) {
    const step = previous.get(currentNodeId)
    if (!step) return null
    edgeIds.unshift(step.edgeId)
    nodeIds.unshift(step.nodeId)
    currentNodeId = step.nodeId
  }
  return { distanceKm: distances.get(end), nodeIds, edgeIds }
}

const getMapRouteOptions = (roads, startNodeId, endNodeId, assignedEdgeIds, assignedNodeIds) => {
  const recommended = findRoadPath(roads, startNodeId, endNodeId)
  const route = recommended || (assignedEdgeIds.length && assignedEdgeIds.every((id) => roads.find((road) => String(road.id) === String(id))?.condition === 'Passable')
    ? { edgeIds: assignedEdgeIds.map(String), nodeIds: assignedNodeIds, distanceKm: null }
    : null)
  const passable = []
  const seenPaths = new Set(route ? [route.edgeIds.join(',')] : [])

  if (recommended) {
    for (const edgeId of recommended.edgeIds) {
      const alternative = findRoadPath(roads, startNodeId, endNodeId, { excludedEdgeIds: new Set([edgeId]) })
      if (!alternative || alternative.distanceKm <= recommended.distanceKm + 1e-6) continue
      const pathKey = alternative.edgeIds.join(',')
      if (seenPaths.has(pathKey)) continue
      seenPaths.add(pathKey)
      passable.push(alternative)
    }
  }

  passable.sort((first, second) => first.distanceKm - second.distanceKm)
  const blockedConnections = roads.flatMap((blockedRoad) => {
    if (blockedRoad.condition !== 'Impassable') return []
    const fromNodeId = blockedRoad.from_node_id ?? blockedRoad.fromNodeId ?? blockedRoad.from?.node_id ?? blockedRoad.from?.nodeId ?? blockedRoad.from?.id
    const toNodeId = blockedRoad.to_node_id ?? blockedRoad.toNodeId ?? blockedRoad.to?.node_id ?? blockedRoad.to?.nodeId ?? blockedRoad.to?.id
    const blockedEdgeId = String(blockedRoad.id ?? blockedRoad.edge_id ?? blockedRoad.edgeId ?? '')
    const blockedDistance = Number(blockedRoad.distanceKm)
    if (!fromNodeId || !toNodeId || !blockedEdgeId || !Number.isFinite(blockedDistance) || blockedDistance < 0) return []

    const approach = findRoadPath(roads, startNodeId, fromNodeId)
    const departure = findRoadPath(roads, toNodeId, endNodeId)
    if (!approach || !departure || approach.nodeIds.some((nodeId) => departure.nodeIds.includes(nodeId))) return []

    return [{
      distanceKm: approach.distanceKm + blockedDistance + departure.distanceKm,
      nodeIds: [...approach.nodeIds, String(toNodeId), ...departure.nodeIds.slice(1)],
      edgeIds: [...approach.edgeIds, blockedEdgeId, ...departure.edgeIds],
      blockedEdgeIds: [blockedEdgeId],
    }]
  }).sort((first, second) => first.distanceKm - second.distanceKm)
  return {
    recommended: route,
    passable: passable[0] || null,
    impassable: blockedConnections[0] || null,
  }
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
  const [demoUsers, setDemoUsers] = useState(() => loadLocalJson('flood-dispatch-demo-users', initialDemoUsers).map((user) => ({
    ...user,
    role: user.role === 'Field Responder' ? fieldResponderRole : user.role,
  })))
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
    } catch (loadError) {
      setError(loadError.message || 'Could not load API data')
      setNotice('Unable to load data. Check the backend service and API response format.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(refresh, 0)
    return () => window.clearTimeout(timer)
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
  })).filter(({ dispatch, incident }) => (
    String(dispatch.status).toLowerCase() !== 'completed'
    && ['assigned', 'in progress'].includes(String(incident?.status).toLowerCase())
  ))
  const overviewRoute = activeAssignedDispatches.find(({ dispatch }) => dispatch.id === selectedOverviewDispatchId)
    || activeAssignedDispatches[0]
  const selectedDispatchMapRoute = activeAssignedDispatches.find(({ dispatch }) => dispatch.id === selectedDispatchMapId)
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
  const visibleBarangays = malolosBarangays.filter((barangay) => barangay.toLowerCase().includes(barangaySearch.toLowerCase()))

  const addIncident = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setIncidentSubmitting(true)
    try {
      const barangay = form.get('barangay')
      const locationNodeId = await api.resolveBarangayNodeId(barangay, nodes)
      await api.createIncident({
        location_node_id: locationNodeId,
        people_affected: form.get('people_affected'),
        barangay,
        urgency_level: form.get('urgency_level'),
      })
      setModal(false)
      setNotice(`Incident created and mapped to nearest road node ${locationNodeId}`)
      await refresh()
      await recommendDispatches(false)
    } catch (requestError) {
      setNotice(requestError.message || 'Could not create incident')
    } finally {
      setIncidentSubmitting(false)
    }
  }

  const changeUnitStatus = async (unitId, status) => {
    try {
      await api.updateUnit(unitId, status)
      setNotice('Unit status updated')
      await refresh()
      await recommendDispatches(false)
    } catch (requestError) {
      setNotice(requestError.message || 'Could not update unit')
    }
  }

  const changeRoadPassability = async (edgeId, passable) => {
    try {
      const result = await api.updateRoad(edgeId, passable ? 'Passable' : 'Impassable')
      const rerouted = result.reroutedDispatchIds?.length || 0
      const unreachable = result.unreachableDispatchIds?.length || 0
      setNotice(unreachable
        ? `Road updated; ${rerouted} route(s) rerouted and ${unreachable} dispatch(es) have no passable route`
        : rerouted ? `Road updated; ${rerouted} active route(s) rerouted` : 'Road passability updated')
      await refresh()
      await recommendDispatches(false)
    } catch (requestError) {
      setNotice(requestError.message || 'Could not update road edge')
    }
  }

  const recommendDispatches = async (navigateToDispatches = true) => {
    try {
      const result = await api.getDispatchRecommendations()
      const assignments = result.assignments.map((assignment) => {
        const incident = incidents.find((item) => item.id === String(assignment.incidentId))
        const unit = units.find((item) => item.id === String(assignment.unitId))
        const priority = assignment.priority || incident?.priority || 'Medium'
        return {
          ...assignment,
          incidentId: String(assignment.incidentId),
          incidentLabel: assignment.incidentLabel || incident?.barangay || `Incident ${assignment.incidentId}`,
          unitId: String(assignment.unitId),
          unitName: assignment.unitName || unit?.name || `Rescue Unit ${assignment.unitId}`,
          priority,
        }
      })

      if (!assignments.length) {
        setRecommendations([])
        if (navigateToDispatches) setNotice(incidents.some((incident) => incident.status.toLowerCase() === 'pending')
          ? 'No feasible assignments: check available units, capacity, and passable roads'
          : 'No pending incidents')
        return
      }

      setRecommendations([{
        id: 'draft-plan',
        assignments,
        unassignedIncidentIds: result.unassignedIncidentIds || [],
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
      })))
      setRecommendations((current) => current.filter((item) => item.id !== recommendation.id))
      setNotice(`${created.length} dispatch record(s) created`)
      await refresh()
      await recommendDispatches(false)
    } catch (requestError) {
      setNotice(requestError.message || 'Could not create dispatch')
    } finally {
      setDispatchSubmitting(false)
    }
  }

  const resetSampleData = async () => {
    api.resetDemoData()
    setRecommendations([])
    setNotice('Sample data reset')
    await refresh()
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
      setNotice(`Dispatch ${dispatchId} marked ${status.toLowerCase()}`)
      await refresh()
      await recommendDispatches(false)
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
        <thead><tr><th>Incident ID</th><th>Urgency</th><th>Location node</th><th>Affected residents</th><th>Status</th></tr></thead>
        <tbody>{items.map((incident) => (
          <tr key={incident.id}>
            <td><strong>Incident {incident.id}</strong><small>{incident.barangay}</small></td>
            <td><StatusPill tone={incident.priority.toLowerCase()}>{incident.priority}</StatusPill></td>
            <td>{incident.locationNodeId ?? '—'}</td>
            <td>{incident.people}</td>
            <td><StatusPill tone={incident.status.toLowerCase().replace(' ', '-')}>{incident.status}</StatusPill></td>
          </tr>
        ))}</tbody>
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
        <label>Role<select name="role" defaultValue="Coordinator"><option>Coordinator</option><option>{fieldResponderRole}</option><option>Administrator</option></select></label>
        <button className="button-primary" type="submit"><Plus size={15} /> Add account</button>
      </form>
      <section className="panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>Demo user</th><th>Prototype role</th><th>Role permissions</th><th>Account</th><th>Action</th></tr></thead><tbody>{demoUsers.map((user) => <tr key={user.id}>
        <td><strong>{user.name}</strong><small>{user.email}</small></td>
        <td><select className="inline-select" aria-label={`Change role for ${user.name}`} value={user.role} onChange={(event) => changeDemoUserRole(user.id, event.target.value)}><option>Coordinator</option><option>{fieldResponderRole}</option><option>Administrator</option></select></td>
        <td>{user.role === 'Coordinator' ? 'Incidents, roads, units, dispatch recommendations' : user.role === fieldResponderRole ? 'Assigned routes, route status, road reports' : 'User roles, accounts, system logs'}</td>
        <td><StatusPill tone={user.active === false ? 'blocked' : 'available'}>{user.active === false ? 'Disabled' : 'Active'}</StatusPill></td>
        <td><button className="button-secondary account-toggle" type="button" disabled={user.id === activeUser?.id || (user.active !== false && activeDemoUsers.length <= 1)} onClick={() => toggleDemoUser(user.id)}>{user.active === false ? 'Enable' : 'Disable'}</button></td>
      </tr>)}</tbody></table></div></section>
    </>

    if (activePage === 'barangays') return <>
      <PageHeading title="Barangays" subtitle="All 51 barangays in the City of Malolos, Bulacan." action={<button className="button-primary" onClick={() => setModal(true)}><Plus size={16} /> New incident</button>} />
      <div className="toolbar">
        <label className="search-field"><Search size={16} /><input value={barangaySearch} onChange={(event) => setBarangaySearch(event.target.value)} placeholder="Search barangay" /></label>
        <span className="muted">{malolosBarangays.length} barangays</span>
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
      return <>
        <PageHeading title="My assigned routes" subtitle="Update dispatch progress and share road observations with the coordinator." action={<label className="select-field responder-unit-picker"><Truck size={15} /><select aria-label="Select assigned rescue unit" value={activeUser.unitId || ''} onChange={(event) => setDemoUsers((current) => current.map((user) => user.id === activeUser.id ? { ...user, unitId: event.target.value } : user))}>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>} />
        {selectedDispatch && selectedAssignment && <section className="panel route-selection-panel">
          <div className="panel-header"><div><p className="eyebrow">Currently viewing</p><h3>Incident {selectedAssignment.incidentId} · {selectedIncident?.barangay || selectedAssignment.incidentLabel}</h3><p className="panel-subtitle">Point A: {selectedAssignment.unitName} · Node {selectedRouteUnit?.current_node_id ?? selectedRouteUnit?.currentNodeId ?? '—'} → Point B: Incident {selectedAssignment.incidentId} · Node {selectedIncident?.locationNodeId ?? '—'}</p></div><StatusPill tone={selectedDispatch.routeStatus === 'Unreachable' ? 'blocked' : 'available'}>{selectedDispatch.routeStatus === 'Unreachable' ? 'Route blocked' : selectedDispatch.status}</StatusPill></div>
          <div className="map-legend"><i className="legend-recommended" /> Recommended <i className="legend-passable" /> Passable <i className="legend-impassable" /> Blocked route</div>
          <div className="map-frame"><NetworkMap roads={roads} nodes={nodes} incidents={selectedIncident ? [selectedIncident] : []} originUnit={selectedRouteUnit} routeEdgeIds={selectedAssignment.edgeIds || []} routeNodeIds={selectedAssignment.nodeIds || []} /><div className="map-caption">Red dashed connects Point A to the incident through an impassable road; it is not traversable.</div></div>
        </section>}
        <section className="panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>Incident</th><th>Route</th><th>Distance</th><th>Dispatch status</th><th>Update</th></tr></thead><tbody>{assignedRoutes.map((dispatch) => {
          const assignment = dispatch.assignments[0]
          return <tr key={dispatch.id} className={selectedDispatch?.id === dispatch.id ? 'selected-route-row' : ''}>
            <td><button className="route-select-button" type="button" aria-pressed={selectedDispatch?.id === dispatch.id} onClick={() => setSelectedAssignedDispatchId(dispatch.id)}><strong>{assignment.incidentLabel}</strong><small>Incident {assignment.incidentId}</small></button></td>
            <td>{dispatch.routeStatus === 'Unreachable' ? 'No passable route' : assignment.nodeIds?.join(' → ') || 'Route details unavailable'}</td><td>{dispatch.routeStatus === 'Unreachable' ? '—' : assignment.distanceKm != null ? `${Number(assignment.distanceKm).toFixed(2)} km` : assignment.eta}</td><td><StatusPill tone={dispatch.routeStatus === 'Unreachable' ? 'blocked' : dispatch.status.toLowerCase().replace(' ', '-')}>{dispatch.routeStatus === 'Unreachable' ? 'Route blocked' : dispatch.status}</StatusPill></td><td><select className="inline-select" aria-label={`Update dispatch ${dispatch.dispatchId} status`} value={dispatch.status} onChange={(event) => updateDispatch(dispatch.dispatchId, event.target.value)}><option>Assigned</option><option>En route</option><option>Completed</option></select></td></tr>
        })}</tbody></table>{!assignedRoutes.length && <p className="empty-state">No routes are assigned to this demo user.</p>}</div></section>
      </>
    }

    if (activePage === 'dispatches') return <>
      <PageHeading title={activeRole === 'Coordinator' ? 'Generate plan' : 'Dispatch plan'} subtitle={activeRole === 'Coordinator' ? `Re-optimize pending assignments to minimize total route distance using ${assignmentAlgorithmLabel.toLowerCase()}; route lengths use ${routeAlgorithmLabel.toLowerCase()}.` : 'Track route progress and confirmed dispatches for the assigned responder.'} action={activeRole === 'Coordinator' ? <button className="button-primary" onClick={recommendDispatches}><RefreshCw size={15} /> Re-optimize plan</button> : null} />
      {recommendations.map((recommendation) => <article className="plan-card" key={recommendation.id}>
        <div className="plan-heading"><div><p className="eyebrow">Review before confirming dispatch</p><h3>Distance-minimized assignments</h3></div><span className="muted">{recommendation.unassignedIncidentIds.length} unassigned</span></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Incident</th><th>Unit</th><th>Urgency</th><th>Route distance</th><th>Route path</th></tr></thead><tbody>{recommendation.assignments.map((assignment) => <tr key={assignment.incidentId}><td>{assignment.incidentLabel} · {assignment.incidentId}</td><td>{assignment.unitName} · {assignment.unitId}</td><td>{assignment.priority}</td><td>{Number(assignment.distanceKm).toFixed(2)} km</td><td>{assignment.nodeIds?.join(' → ') || '—'}</td></tr>)}</tbody></table></div>
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
          <div className="map-legend"><i className="legend-incident" /> Selected incident <i className="legend-unit" /> Assigned unit <i className="legend-recommended" /> Recommended <i className="legend-passable" /> Passable <i className="legend-impassable" /> Blocked route</div>
          <div className="map-frame"><NetworkMap roads={roads} nodes={nodes} incidents={selectedDispatchMapRoute.incident ? [selectedDispatchMapRoute.incident] : []} originUnit={selectedDispatchMapRoute.unit} routeEdgeIds={selectedDispatchMapRoute.assignment.edgeIds || []} routeNodeIds={selectedDispatchMapRoute.assignment.nodeIds || []} /><div className="map-caption">Red dashed connects Point A to the incident through an impassable road; it is not traversable.</div></div>
        </> : <p className="empty-state">No incidents are currently assigned to a unit.</p>}
      </section>}
      <section className="panel">{dispatchTable(dispatches)}</section>
    </>

    if (activePage === 'logs') return <>
      <PageHeading title="System activity" subtitle="Actions recorded in the system log." action={<button className="button-secondary" onClick={refresh}><RefreshCw size={15} /> Refresh</button>} />
      <section className="panel"><div className="activity-list">{logs.map((log) => <div className="activity-row" key={log.id}><span className="activity-marker" /><div><strong>{log.text}</strong><small>{logActorLabel(log)}</small></div><time>{log.time}</time></div>)}</div></section>
    </>

    return <>
      <PageHeading title="Dispatch overview" subtitle="Network-based flood response coordination · Malolos, Bulacan" action={<><button className="button-secondary" onClick={refresh}><RefreshCw size={15} /> Refresh</button>{activeRole === 'Coordinator' && <button className="button-primary" onClick={recommendDispatches}><Route size={16} /> Recommend assignments</button>}</>} />
      {isDemoMode && <div className="sample-banner"><AlertTriangle size={17} /><span><strong>Demo mode</strong> Local sample records are active; changes are saved only in this browser.</span><button onClick={resetSampleData}>Reset sample</button></div>}
      {error && !isDemoMode && <div className="sample-banner"><AlertTriangle size={17} /><span><strong>API notice</strong> {error}</span><button onClick={refresh}>Retry</button></div>}
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
            <div className="map-legend"><i className="legend-incident" /> Selected incident <i className="legend-unit" /> Assigned unit <i className="legend-recommended" /> Recommended <i className="legend-passable" /> Passable <i className="legend-impassable" /> Blocked route</div>
            <div className="map-frame"><NetworkMap roads={roads} nodes={nodes} incidents={overviewRoute.incident ? [overviewRoute.incident] : []} originUnit={overviewRoute.unit} routeEdgeIds={overviewRoute.assignment.edgeIds || []} routeNodeIds={overviewRoute.assignment.nodeIds || []} active={activePage === 'overview'} /><div className="map-caption">Red dashed connects Point A to the incident through an impassable road; it is not traversable.</div></div>
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
    <main className="main-panel"><header className="topbar"><div className="topbar-title"><button className="mobile-menu" aria-label="Open navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}><Menu size={19} /></button><div><div className="breadcrumb">Operations <span>/</span> {pageTitle}</div><h1>{pageTitle}</h1></div></div><div className="topbar-tools"><label className="role-picker light-role-picker"><span>Demo profile</span><select aria-label="Switch demo profile" value={activeUser?.id || ''} onChange={(event) => changeActiveUser(event.target.value)}>{demoUsers.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}</select></label><button className="icon-button notification-button" title="Notifications" aria-label={`Notifications, ${notifications.filter((item) => !item.read).length} unread`} aria-expanded={notificationsOpen} onClick={toggleNotifications}><Bell size={18} />{notifications.some((item) => !item.read) && <i />}</button><button className="icon-button" title="Refresh data" aria-label="Refresh data" onClick={refresh}><RefreshCw size={18} /></button><button className="icon-button" title="Sign out" aria-label="Sign out" onClick={signOut}><LogOut size={17} /></button></div></header>
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
              {malolosBarangays.map((barangay) => <option key={barangay}>{barangay}</option>)}
            </select>
          </label>
          <label>Affected residents
            <input name="people_affected" type="number" min="1" step="1" required defaultValue="1" />
          </label>
          <p className="form-note">The barangay location will be matched to the nearest road-network node.</p>
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

function NetworkMap({ roads, nodes, incidents, routeEdgeIds = [], routeNodeIds = [], originUnit, active = true }) {
  const startNodeId = originUnit?.current_node_id ?? originUnit?.currentNodeId
  const endNodeId = incidents[0]?.locationNodeId
  const routeOptions = useMemo(
    () => getMapRouteOptions(roads, startNodeId, endNodeId, routeEdgeIds, routeNodeIds),
    [roads, startNodeId, endNodeId, routeEdgeIds, routeNodeIds],
  )
  const [routeGeometries, setRouteGeometries] = useState({})
  const [routeGeometryError, setRouteGeometryError] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadRouteGeometries = async () => {
      const results = await Promise.all(Object.entries(routeOptions).map(async ([type, route]) => {
        if (!route?.nodeIds?.length) return [type, null, null]
        try {
          return [type, await api.getRouteGeometry(route.nodeIds, nodes), null]
        } catch (geometryError) {
          return [type, null, geometryError.message || 'Could not load road-following route geometry']
        }
      }))

      if (cancelled) return
      setRouteGeometries(Object.fromEntries(results.filter(([, positions]) => positions)))
      setRouteGeometryError(results.find(([, , error]) => error)?.[2] || '')
    }

    loadRouteGeometries()
    return () => { cancelled = true }
  }, [nodes, routeOptions])

  const routeLabels = {
    recommended: 'Recommended route',
    passable: 'Passable route',
    impassable: 'Blocked route (includes impassable road)',
  }
  const routeStyles = {
    impassable: { color: '#c84d47', weight: 5, opacity: 0.95, dashArray: '8 7', lineCap: 'butt', lineJoin: 'round' },
    passable: { color: '#2875a0', weight: 7, opacity: 0.95, lineCap: 'round', lineJoin: 'round' },
    recommended: { color: '#db8b32', weight: 4, opacity: 1, lineCap: 'round', lineJoin: 'round' },
  }
  const routeSegments = ['impassable', 'passable', 'recommended']
    .filter((type) => routeOptions[type] && routeGeometries[type])
  return <>
    {routeGeometryError && <p className="map-route-error" role="status">{routeGeometryError}</p>}
    <MapContainer center={mapCenter} zoom={13} scrollWheelZoom={false} zoomControl>
      <MapResizeHandler active={active} />
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {routeSegments.map((type) => (
        <Polyline key={`route-${type}`} positions={routeGeometries[type]} pathOptions={routeStyles[type]}>
          <Popup>{routeLabels[type]}</Popup>
        </Polyline>
      ))}
      {incidents.map((incident) => <CircleMarker key={incident.id} center={incident.location} radius={incident.priority === 'Critical' ? 9 : 7} pathOptions={{ color: '#fff', weight: 2, fillColor: incident.priority === 'Critical' ? '#d94e48' : '#e4a335', fillOpacity: 1 }}>
        <Popup><strong>Incident {incident.id}</strong><br />{incident.priority} urgency<br />Road node {incident.locationNodeId ?? 'not set'}</Popup>
      </CircleMarker>)}
      {originUnit?.location && <CircleMarker center={originUnit.location} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: '#2875a0', fillOpacity: 1 }}>
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
