import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from 'react-leaflet'
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Check,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Filter,
  LayoutDashboard,
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
const rolePages = {
  Coordinator: ['overview', 'incidents', 'barangays', 'roads', 'units', 'dispatches', 'evaluation', 'logs'],
  'Field Responder': ['overview', 'dispatches', 'roads', 'units'],
  Administrator: ['overview', 'users', 'evaluation', 'logs'],
}
const initialDemoUsers = [
  { id: '1', name: 'Mara Cruz', role: 'Coordinator' },
  { id: '2', name: 'Rico Santos', role: 'Field Responder', unitId: '2' },
  { id: '3', name: 'Lia Mendoza', role: 'Administrator' },
]
const isoCriteria = ['Functional suitability', 'Performance efficiency', 'Compatibility', 'Interaction capability', 'Reliability', 'Security', 'Maintainability', 'Flexibility']
const tamCriteria = ['Perceived usefulness', 'Perceived ease of use', 'Behavioral intention to use', 'Attitude toward using']

const loadLocalJson = (key, fallback) => {
  try {
    return JSON.parse(window.localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

const formatMetric = (value, digits = 1) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '0.0'

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

function App() {
  const [incidents, setIncidents] = useState([])
  const [units, setUnits] = useState([])
  const [roads, setRoads] = useState([])
  const [roadGeometries, setRoadGeometries] = useState({})
  const [nodes, setNodes] = useState([])
  const [logs, setLogs] = useState([])
  const [notifications, setNotifications] = useState([])
  const [dispatches, setDispatches] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [activePage, setActivePage] = useState('overview')
  const [demoUsers, setDemoUsers] = useState(() => loadLocalJson('flood-dispatch-demo-users', initialDemoUsers))
  const [activeUserId, setActiveUserId] = useState(() => loadLocalJson('flood-dispatch-active-user', '1'))
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [evaluationRatings, setEvaluationRatings] = useState(() => loadLocalJson('flood-dispatch-evaluation-ratings', {}))
  const [evaluationResults, setEvaluationResults] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('All priorities')
  const [barangaySearch, setBarangaySearch] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)

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
    let cancelled = false

    const loadRoadGeometries = async () => {
      const entries = await Promise.all(roads.map(async (road) => {
        try {
          return [road.id, await api.getRoadGeometry(road)]
        } catch {
          return [road.id, null]
        }
      }))

      if (!cancelled) setRoadGeometries(Object.fromEntries(entries.filter(([, positions]) => positions)))
    }

    loadRoadGeometries()
    return () => { cancelled = true }
  }, [roads])

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

  useEffect(() => {
    window.localStorage.setItem('flood-dispatch-evaluation-ratings', JSON.stringify(evaluationRatings))
  }, [evaluationRatings])

  const visibleIncidents = useMemo(() => {
    const query = search.toLowerCase()
    return incidents.filter((incident) => {
      const matchesQuery = `${incident.id} ${incident.barangay} ${incident.locationNodeId}`.toLowerCase().includes(query)
      return matchesQuery && (priorityFilter === 'All priorities' || incident.priority === priorityFilter)
    })
  }, [incidents, priorityFilter, search])

  const openIncidents = incidents.filter((incident) => !['Resolved', 'Completed'].includes(incident.status)).length
  const availableUnits = units.filter((unit) => unit.status.toLowerCase() === 'available').length
  const blockedRoads = roads.filter((road) => road.condition === 'Blocked').length
  const activeUser = demoUsers.find((user) => user.id === String(activeUserId)) || demoUsers[0]
  const activeRole = activeUser?.role || 'Coordinator'
  const highlightedEdgeIds = [
    ...recommendations.flatMap((recommendation) => recommendation.assignments.flatMap((assignment) => assignment.edgeIds || [])),
    ...dispatches.flatMap((dispatch) => dispatch.assignments.flatMap((assignment) => assignment.edgeIds || [])),
  ]
  const allNavItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'incidents', label: 'Incidents', icon: ShieldAlert },
    { id: 'barangays', label: 'Barangays', icon: MapPin },
    { id: 'roads', label: 'Road network', icon: Route },
    { id: 'units', label: 'Rescue units', icon: Truck },
    { id: 'dispatches', label: 'Dispatches', icon: ClipboardList },
    { id: 'logs', label: 'System activity', icon: Activity },
    { id: 'users', label: 'User roles', icon: Users },
    { id: 'evaluation', label: 'Evaluation', icon: ClipboardCheck },
  ]
  const navItems = allNavItems.filter((item) => rolePages[activeRole]?.includes(item.id))
  const pageTitle = navItems.find((item) => item.id === activePage)?.label || 'Overview'
  const visibleBarangays = malolosBarangays.filter((barangay) => barangay.toLowerCase().includes(barangaySearch.toLowerCase()))

  const addIncident = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      await api.createIncident({
        location_node_id: form.get('location_node_id'),
        people_affected: form.get('people_affected'),
        barangay: form.get('barangay'),
        urgency_level: form.get('urgency_level'),
      })
      setModal(false)
      setNotice('Incident created')
      await refresh()
      await recommendDispatches(false)
    } catch (requestError) {
      setNotice(requestError.message || 'Could not create incident')
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
      await api.updateRoad(edgeId, passable ? 'Open' : 'Blocked')
      setNotice('Road passability updated')
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
        return {
          ...assignment,
          incidentId: String(assignment.incidentId),
          incidentLabel: assignment.incidentLabel || incident?.barangay || `Incident ${assignment.incidentId}`,
          unitId: String(assignment.unitId),
          unitName: assignment.unitName || unit?.name || `Rescue Unit ${assignment.unitId}`,
          priority: assignment.priority || incident?.priority || '—',
        }
      })

      if (!assignments.length) {
        setRecommendations([])
        if (navigateToDispatches) setNotice(incidents.some((incident) => incident.status.toLowerCase() === 'pending')
          ? 'No feasible assignments: check available units, capacity, and passable roads'
          : 'No pending incidents')
        return
      }

      setRecommendations((current) => [{
        id: `draft-${Date.now()}`,
        assignments,
        unassignedIncidentIds: result.unassignedIncidentIds || [],
      }, ...current])
      if (navigateToDispatches) setActivePage('dispatches')
    } catch (requestError) {
      setNotice(requestError.message || 'Could not compute dispatch recommendations')
    }
  }

  const createDispatches = async (recommendation) => {
    try {
      const created = await Promise.all(recommendation.assignments.map((assignment) => api.createDispatch({
        unit_id: assignment.unitId,
        incident_id: assignment.incidentId,
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
    }
  }

  const resetSampleData = async () => {
    api.resetDemoData()
    setRecommendations([])
    setEvaluationResults(null)
    setNotice('Sample data reset')
    await refresh()
  }

  const changeActiveUser = (userId) => {
    setActiveUserId(userId)
    const nextUser = demoUsers.find((user) => user.id === userId)
    if (!rolePages[nextUser?.role]?.includes(activePage)) setActivePage('overview')
  }

  const changeDemoUserRole = (userId, role) => {
    setDemoUsers((current) => current.map((user) => user.id === userId ? { ...user, role } : user))
  }

  const toggleNotifications = () => {
    const opening = !notificationsOpen
    setNotificationsOpen(opening)
    if (opening) setNotifications(api.markDemoNotificationsRead())
  }

  const saveEvaluation = (event) => {
    event.preventDefault()
    setNotice('Prototype evaluation ratings saved in this browser')
  }

  const runEvaluation = () => setEvaluationResults(api.compareDemoDispatchMethods())

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
        <thead><tr><th>Unit ID</th><th>Current node</th><th>Capacity</th><th>Status</th>{activeRole === 'Coordinator' && <th>Update status</th>}</tr></thead>
        <tbody>{units.map((unit) => (
          <tr key={unit.id}>
            <td><strong>{unit.name}</strong><small>{unit.id}</small></td>
            <td>{unit.current_node_id ?? unit.currentNodeId ?? '—'}</td>
            <td>{unit.capacity ?? '—'}</td>
            <td><StatusPill tone={unit.status.toLowerCase().replace(' ', '-')}>{unit.status}</StatusPill></td>
            {activeRole === 'Coordinator' && <td><select className="inline-select" aria-label={`Update ${unit.name} status`} value={unit.status} onChange={(event) => changeUnitStatus(unit.id, event.target.value)}>
              <option>Available</option><option>Assigned</option>
            </select></td>}
          </tr>
        ))}</tbody>
      </table>
    </div>
  )

  const roadsTable = () => (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>Edge</th><th>From node</th><th>To node</th><th>Passable</th><th>Update</th></tr></thead>
        <tbody>{roads.map((road) => (
          <tr key={road.id}>
            <td><strong>Road edge {road.id}</strong></td>
            <td>{road.from_node_id ?? road.fromNodeId ?? '—'}</td>
            <td>{road.to_node_id ?? road.toNodeId ?? '—'}</td>
            <td><StatusPill tone={road.condition === 'Open' ? 'open' : 'blocked'}>{road.condition === 'Open' ? 'Passable' : 'Not passable'}</StatusPill></td>
            <td>{activeRole === 'Administrator' ? 'Coordinator update' : <select className="inline-select" aria-label={`Update edge ${road.id} passability`} value={road.condition === 'Open' ? 'true' : 'false'} onChange={(event) => changeRoadPassability(road.id, event.target.value === 'true')}>
              <option value="true">Passable</option><option value="false">Not passable</option>
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
            <td><StatusPill tone={dispatch.status.toLowerCase()}>{dispatch.status}</StatusPill></td>
          </tr>
        ))}</tbody>
      </table>
      {!items.length && <p className="empty-state">No dispatches recorded.</p>}
    </div>
  )

  const pageContent = () => {
    if (activePage === 'users') return <>
      <PageHeading title="User roles" subtitle="Simulated role hierarchy for the prototype. This does not provide authentication or security." />
      <section className="panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>Demo user</th><th>Prototype role</th><th>Role permissions</th></tr></thead><tbody>{demoUsers.map((user) => <tr key={user.id}>
        <td><strong>{user.name}</strong><small>Demo user {user.id}</small></td>
        <td><select className="inline-select" aria-label={`Change role for ${user.name}`} value={user.role} onChange={(event) => changeDemoUserRole(user.id, event.target.value)}><option>Coordinator</option><option>Field Responder</option><option>Administrator</option></select></td>
        <td>{user.role === 'Coordinator' ? 'Incidents, roads, units, dispatch recommendations' : user.role === 'Field Responder' ? 'Assigned routes, route status, road reports' : 'User roles, evaluation records, system logs'}</td>
      </tr>)}</tbody></table></div></section>
    </>

    if (activePage === 'evaluation') return <>
      <PageHeading title="Prototype evaluation" subtitle="Demo-only algorithm comparison and draft ISO/TAM ratings. These are not study results." />
      <section className="panel evaluation-panel">
        <div className="panel-header"><div><h3>Dispatch effectiveness scenario</h3><p className="panel-subtitle">Compare the Hungarian assignment with a simulated priority-first baseline.</p></div><button className="button-primary" onClick={runEvaluation}><Activity size={16} /> Run comparison</button></div>
        {evaluationResults && <div className="evaluation-results">
          <article><span>Optimized distance</span><strong>{formatMetric(evaluationResults.optimized?.totalDistanceKm, 2)} km</strong><small>{evaluationResults.optimized?.assignmentCount ?? 0} assignments</small></article>
          <article><span>Baseline distance</span><strong>{formatMetric(evaluationResults.baseline?.totalDistanceKm, 2)} km</strong><small>{evaluationResults.baseline?.assignmentCount ?? 0} assignments</small></article>
          <article><span>Estimated total travel</span><strong>{formatMetric(evaluationResults.optimized?.estimatedTravelMinutes)} min</strong><small>Optimized routes, simulated at 20 km/h</small></article>
          <article><span>Estimated response time</span><strong>{formatMetric(evaluationResults.optimized?.estimatedResponseMinutes)} min</strong><small>Average per assigned incident</small></article>
          <article><span>Assignment calculation</span><strong>{formatMetric(evaluationResults.optimized?.allocationMs, 2)} ms</strong><small>Baseline: {formatMetric(evaluationResults.baseline?.allocationMs, 2)} ms</small></article>
          <article><span>Distance difference</span><strong>{formatMetric(evaluationResults.improvementPercent)}%</strong><small>{Math.abs(Number(evaluationResults.improvementPercent) || 0) < 0.05 ? 'equal distance in this sample' : evaluationResults.improvementPercent > 0 ? 'shorter in this sample' : 'longer in this sample'}</small></article>
          <p>{evaluationResults.note}</p>
        </div>}
      </section>
      <form className="panel evaluation-panel" onSubmit={saveEvaluation}>
        <div className="panel-header"><div><h3>ISO/IEC 25010 and TAM draft rating</h3><p className="panel-subtitle">Rate the prototype from 1 (Strongly disagree) to 5 (Strongly agree).</p></div></div>
        {[['ISO/IEC 25010:2023', isoCriteria], ['Technology Acceptance Model', tamCriteria]].map(([group, criteria]) => <fieldset className="rating-group" key={group}>
          <legend>{group}</legend>
          {criteria.map((criterion) => <label className="rating-row" key={criterion}><span>{criterion}</span><select required value={evaluationRatings[criterion] || ''} onChange={(event) => setEvaluationRatings((current) => ({ ...current, [criterion]: event.target.value }))}><option value="" disabled>Rate</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}</option>)}</select></label>)}
        </fieldset>)}
        <button className="button-primary" type="submit"><Check size={16} /> Save draft ratings</button>
      </form>
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

    if (activePage === 'dispatches' && activeRole === 'Field Responder') {
      const assignedRoutes = dispatches.filter((dispatch) => dispatch.assignments?.some((assignment) => assignment.unitId === String(activeUser.unitId)))
      return <>
        <PageHeading title="My assigned routes" subtitle="Update dispatch progress and share road observations with the coordinator." action={<label className="select-field responder-unit-picker"><Truck size={15} /><select aria-label="Select assigned rescue unit" value={activeUser.unitId || ''} onChange={(event) => setDemoUsers((current) => current.map((user) => user.id === activeUser.id ? { ...user, unitId: event.target.value } : user))}>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>} />
        <section className="panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>Incident</th><th>Route</th><th>Distance</th><th>Dispatch status</th><th>Update</th></tr></thead><tbody>{assignedRoutes.map((dispatch) => {
          const assignment = dispatch.assignments[0]
          return <tr key={dispatch.id}><td><strong>{assignment.incidentLabel}</strong><small>Incident {assignment.incidentId}</small></td><td>{assignment.nodeIds?.join(' → ') || 'Route details unavailable'}</td><td>{assignment.distanceKm != null ? `${Number(assignment.distanceKm).toFixed(2)} km` : assignment.eta}</td><td><StatusPill tone={dispatch.status.toLowerCase().replace(' ', '-')}>{dispatch.status}</StatusPill></td><td><select className="inline-select" aria-label={`Update dispatch ${dispatch.dispatchId} status`} value={dispatch.status} onChange={(event) => updateDispatch(dispatch.dispatchId, event.target.value)}><option>Assigned</option><option>En route</option><option>Completed</option></select></td></tr>
        })}</tbody></table>{!assignedRoutes.length && <p className="empty-state">No routes are assigned to this demo user.</p>}</div></section>
      </>
    }

    if (activePage === 'dispatches') return <>
      <PageHeading title="Dispatches" subtitle="Review globally optimized assignments and confirm dispatch recommendations." action={activeRole === 'Coordinator' ? <button className="button-primary" onClick={recommendDispatches}><Route size={16} /> Recommend assignments</button> : null} />
      {recommendations.map((recommendation) => <article className="plan-card" key={recommendation.id}>
        <div className="plan-heading"><div><p className="eyebrow">Review before creating dispatches</p><h3>Minimum-distance unit assignments</h3></div><span className="muted">{recommendation.unassignedIncidentIds.length} unassigned</span></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Incident</th><th>Unit</th><th>Urgency</th><th>Distance</th><th>Road nodes</th></tr></thead><tbody>{recommendation.assignments.map((assignment) => <tr key={assignment.incidentId}><td>{assignment.incidentLabel} · {assignment.incidentId}</td><td>{assignment.unitName} · {assignment.unitId}</td><td>{assignment.priority}</td><td>{Number(assignment.distanceKm).toFixed(2)} km</td><td>{assignment.nodeIds?.join(' → ') || '—'}</td></tr>)}</tbody></table></div>
        {activeRole === 'Coordinator' && <div className="plan-footer"><small>Assignments minimize total distance across passable graph routes. Review unassigned incidents manually.</small><button className="button-primary" onClick={() => createDispatches(recommendation)}><Check size={16} /> Create dispatches</button></div>}
      </article>)}
      {recommendations.length > 0 && <section className="panel route-preview-panel"><div className="panel-header"><div><h3>Recommended graph routes</h3><p className="panel-subtitle">Highlighted edges form the suggested assignments</p></div><span className="map-legend"><i className="legend-route" /> Recommended route</span></div><div className="map-frame"><NetworkMap roads={roads} roadGeometries={roadGeometries} incidents={incidents} nodes={nodes} highlightedEdgeIds={highlightedEdgeIds} /></div></section>}
      <section className="panel">{dispatchTable(dispatches)}</section>
    </>

    if (activePage === 'logs') return <>
      <PageHeading title="System activity" subtitle="Actions recorded in the system log." action={<button className="button-secondary" onClick={refresh}><RefreshCw size={15} /> Refresh</button>} />
      <section className="panel"><div className="activity-list">{logs.map((log) => <div className="activity-row" key={log.id}><span className="activity-marker" /><div><strong>{log.text}</strong><small>{log.actor}</small></div><time>{log.time}</time></div>)}</div></section>
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
        <div className="panel map-panel"><div className="panel-header"><div><h3>Road and incident map</h3><p className="panel-subtitle">Road nodes, edges, and incident locations</p></div><span className="map-legend"><i className="legend-incident" /> Incident <i className="legend-blocked" /> Impassable</span></div>
          <div className="map-frame"><NetworkMap roads={roads} roadGeometries={roadGeometries} incidents={incidents} nodes={nodes} highlightedEdgeIds={highlightedEdgeIds} active={activePage === 'overview'} /><div className="map-caption">Street paths from OpenStreetMap routing; unavailable paths are hidden.</div></div>
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

  return <div className="app-shell">
    {sidebarOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}><div className="brand"><div className="brand-mark"><Activity size={21} /></div><div><p className="brand-kicker">MALOLOS · BULACAN</p><h2>Flood Dispatch</h2></div><button className="mobile-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={20} /></button></div>
      <div className="sidebar-section"><span className="sidebar-label">WORKSPACE</span><nav className="nav">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${activePage === id ? 'active' : ''}`} onClick={() => { setActivePage(id); setSidebarOpen(false) }}><Icon size={17} /><span>{label}</span>{id === 'incidents' && openIncidents > 0 && <span className="nav-count">{openIncidents}</span>}</button>)}</nav></div>
      <div className="sidebar-bottom"><div className="alert-level"><span className="alert-level-dot" /><div><small>OPERATIONAL STATUS</small><strong>{error ? 'Service issue' : isDemoMode ? 'Demo simulation' : 'Monitoring active'}</strong></div></div><div className="sidebar-foot"><span>Flood response support</span><span>Prototype · Local data</span></div></div>
    </aside>
    <main className="main-panel"><header className="topbar"><div className="topbar-title"><button className="mobile-menu" aria-label="Open navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}><Menu size={19} /></button><div><div className="breadcrumb">Operations <span>/</span> {pageTitle}</div><h1>{pageTitle}</h1></div></div><div className="topbar-tools"><label className="role-picker light-role-picker"><span>Demo profile</span><select aria-label="Switch demo profile" value={activeUser?.id || ''} onChange={(event) => changeActiveUser(event.target.value)}>{demoUsers.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}</select></label><button className="icon-button notification-button" title="Notifications" aria-label={`Notifications, ${notifications.filter((item) => !item.read).length} unread`} aria-expanded={notificationsOpen} onClick={toggleNotifications}><Bell size={18} />{notifications.some((item) => !item.read) && <i />}</button><button className="icon-button" title="Refresh data" aria-label="Refresh data" onClick={refresh}><RefreshCw size={18} /></button></div></header>
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
          <label>Road node for routing
            <select name="location_node_id" required defaultValue="">
              <option value="" disabled>Select a road node</option>
              {nodes.map((node) => {
                const id = node.node_id ?? node.nodeId ?? node.id
                return <option key={id} value={id}>Node {id} · {node.node_type ?? node.nodeType ?? 'Road node'}</option>
              })}
            </select>
          </label>
          <label>Urgency level
            <select name="urgency_level" defaultValue="Medium">
              {priorities.map((priority) => <option key={priority}>{priority}</option>)}
            </select>
          </label>
          <div className="modal-actions">
            <button type="button" className="button-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button className="button-primary" type="submit"><Plus size={16} /> Add incident</button>
          </div>
        </form>
      </section>
    </div>}
  </div>
}

function NetworkMap({ roads, roadGeometries, incidents, nodes, highlightedEdgeIds = [], active = true }) {
  const highlighted = new Set(highlightedEdgeIds.map(String))

  return <MapContainer center={mapCenter} zoom={13} scrollWheelZoom={false} zoomControl>
    <MapResizeHandler active={active} />
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    {roads.map((road) => {
      const positions = roadGeometries[road.id]
      if (!positions) return null
      const isRecommended = highlighted.has(String(road.id))
      return <Polyline key={road.id} positions={positions} pathOptions={{
        color: road.condition === 'Blocked' ? '#d3534b' : isRecommended ? '#db8b32' : '#137c8b',
        weight: isRecommended ? 7 : 4,
        dashArray: road.condition === 'Blocked' ? '8 8' : undefined,
      }} />
    })}
    {incidents.map((incident) => <CircleMarker key={incident.id} center={incident.location} radius={incident.priority === 'Critical' ? 9 : 7} pathOptions={{ color: '#fff', weight: 2, fillColor: incident.priority === 'Critical' ? '#d94e48' : '#e4a335', fillOpacity: 1 }}>
      <Popup><strong>Incident {incident.id}</strong><br />{incident.priority} urgency<br />Road node {incident.locationNodeId ?? 'not set'}</Popup>
    </CircleMarker>)}
    {nodes.map((node) => {
      const id = node.node_id ?? node.nodeId ?? node.id
      return <CircleMarker key={`node-${id}`} center={[Number(node.latitude), Number(node.longitude)]} radius={3} pathOptions={{ color: '#146d66', fillColor: '#fff', fillOpacity: 1 }}>
        <Popup>Road node {id}</Popup>
      </CircleMarker>
    })}
  </MapContainer>
}

function PageHeading({ title, subtitle, action }) {
  return <div className="page-heading"><div><p className="eyebrow">FLOOD RESPONSE · MALOLOS</p><h2>{title}</h2><p>{subtitle}</p></div>{action && <div className="heading-actions">{action}</div>}</div>
}

function Metric({ icon: Icon, label, value, trend, tone }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-trend">{tone === 'red' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{trend}</span></article>
}

export default App
