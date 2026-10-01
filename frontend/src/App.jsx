import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from 'react-leaflet'
import {
  Activity, AlertTriangle, Ambulance, ArrowDownRight, ArrowUpRight, Bell, Check,
  ChevronDown, ClipboardList, Clock3, Filter, LayoutDashboard,
  Menu, Plus, RefreshCw, Route, Search, Settings, ShieldAlert, Truck, Users, X,
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import './App.css'

const initialIncidents = [
  { id: 'INC-2401', barangay: 'Sto. Niño', location: [14.8522, 120.8164], type: 'Rescue request', priority: 'Critical', people: 12, status: 'Pending', reported: '08:42', notes: 'Residents stranded on second floor' },
  { id: 'INC-2398', barangay: 'Tikay', location: [14.8652, 120.8262], type: 'Medical assistance', priority: 'High', people: 4, status: 'Assigned', reported: '08:31', notes: 'Elderly resident needs evacuation' },
  { id: 'INC-2395', barangay: 'Bayan', location: [14.8434, 120.8117], type: 'Relief delivery', priority: 'Medium', people: 28, status: 'Pending', reported: '08:17', notes: 'Food and drinking water requested' },
  { id: 'INC-2391', barangay: 'Longos', location: [14.878, 120.834], type: 'Rescue request', priority: 'High', people: 7, status: 'In progress', reported: '08:03', notes: 'Water entering ground floor' },
]

const initialUnits = [
  { id: 'UNIT-01', name: 'Rescue Boat 1', type: 'Rescue boat', capacity: 12, status: 'Available', location: [14.846, 120.811] },
  { id: 'UNIT-02', name: 'Rescue Team A', type: 'Rescue team', capacity: 8, status: 'Available', location: [14.838, 120.806] },
  { id: 'UNIT-03', name: 'Ambulance 2', type: 'Ambulance', capacity: 4, status: 'Assigned', location: [14.858, 120.817] },
  { id: 'UNIT-04', name: 'Utility Van 5', type: 'Utility vehicle', capacity: 10, status: 'Maintenance', location: [14.839, 120.828] },
]

const initialRoads = [
  { id: 'RD-01', name: 'Paseo del Congreso', segment: 'City center', condition: 'Open', depth: '0 cm', updated: '08:40' },
  { id: 'RD-02', name: 'Tikay Road', segment: 'North approach', condition: 'Restricted', depth: '25 cm', updated: '08:36' },
  { id: 'RD-03', name: 'Sto. Niño access road', segment: 'Eastern route', condition: 'Blocked', depth: '62 cm', updated: '08:29' },
  { id: 'RD-04', name: 'Longos Road', segment: 'Coastal approach', condition: 'Restricted', depth: '18 cm', updated: '08:18' },
]

const seedLogs = [
  { id: 1, time: '08:42', text: 'INC-2401 reported in Sto. Niño', actor: 'Dispatcher' },
  { id: 2, time: '08:36', text: 'Tikay Road condition updated to restricted', actor: 'Field responder' },
  { id: 3, time: '08:31', text: 'UNIT-03 assigned to INC-2398', actor: 'Dispatch system' },
]

const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'incidents', label: 'Incidents', icon: ShieldAlert },
  { id: 'roads', label: 'Road conditions', icon: Route },
  { id: 'resources', label: 'Rescue units', icon: Truck },
  { id: 'dispatch', label: 'Dispatch plans', icon: ClipboardList },
  { id: 'activity', label: 'System activity', icon: Activity },
]

const roleOptions = ['Coordinator', 'Dispatcher', 'Field responder', 'Viewer']
const mapCenter = [14.852, 120.815]

function MapResizeHandler({ active }) {
  const map = useMap()
  useEffect(() => {
    if (active) window.setTimeout(() => map.invalidateSize(), 120)
  }, [active, map])
  return null
}

function StatusPill({ children, tone = '' }) {
  return <span className={`status-pill ${tone}`}>{children}</span>
}

function App() {
  const [incidents, setIncidents] = useState(() => JSON.parse(localStorage.getItem('malolos-incidents') || 'null') || initialIncidents)
  const [units, setUnits] = useState(() => JSON.parse(localStorage.getItem('malolos-units') || 'null') || initialUnits)
  const [roads, setRoads] = useState(() => JSON.parse(localStorage.getItem('malolos-roads') || 'null') || initialRoads)
  const [logs, setLogs] = useState(() => JSON.parse(localStorage.getItem('malolos-logs') || 'null') || seedLogs)
  const [plans, setPlans] = useState(() => JSON.parse(localStorage.getItem('malolos-plans') || '[]'))
  const [activePage, setActivePage] = useState('overview')
  const [role, setRole] = useState('Coordinator')
  const [modal, setModal] = useState('')
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('All priorities')
  const [notice, setNotice] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => localStorage.setItem('malolos-incidents', JSON.stringify(incidents)), [incidents])
  useEffect(() => localStorage.setItem('malolos-units', JSON.stringify(units)), [units])
  useEffect(() => localStorage.setItem('malolos-roads', JSON.stringify(roads)), [roads])
  useEffect(() => localStorage.setItem('malolos-logs', JSON.stringify(logs)), [logs])
  useEffect(() => localStorage.setItem('malolos-plans', JSON.stringify(plans)), [plans])

  useEffect(() => {
    if (!notice) return undefined
    const timeout = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const appendLog = (text) => {
    setLogs((current) => [{ id: Date.now(), time: new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false }), text, actor: role }, ...current].slice(0, 30))
  }

  const visibleIncidents = useMemo(() => incidents.filter((incident) => {
    const query = search.toLowerCase()
    const matchesSearch = `${incident.id} ${incident.barangay} ${incident.type}`.toLowerCase().includes(query)
    return matchesSearch && (priorityFilter === 'All priorities' || incident.priority === priorityFilter)
  }), [incidents, priorityFilter, search])

  const pageTitle = navItems.find((item) => item.id === activePage)?.label || 'Overview'
  const openIncidents = incidents.filter((item) => item.status !== 'Resolved').length
  const availableUnits = units.filter((item) => item.status === 'Available').length
  const blockedRoads = roads.filter((item) => item.condition === 'Blocked').length

  const addIncident = (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const barangay = form.get('barangay')
    const item = {
      id: `INC-${Math.floor(2402 + Math.random() * 500)}`,
      barangay,
      location: [14.852, 120.815],
      type: form.get('type'),
      priority: form.get('priority'),
      people: Number(form.get('people')),
      status: 'Pending',
      reported: new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false }),
      notes: form.get('notes') || 'No additional details',
    }
    setIncidents((current) => [item, ...current])
    appendLog(`${item.id} reported in ${barangay}`)
    setModal('')
    setNotice('Incident added to the dispatch queue')
  }

  const updateRoad = (id, condition) => {
    setRoads((current) => current.map((road) => road.id === id ? { ...road, condition, updated: new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false }) } : road))
    const road = roads.find((item) => item.id === id)
    appendLog(`${road?.name || 'Road'} updated to ${condition.toLowerCase()}`)
    setNotice('Road condition updated')
  }

  const updateUnit = (id, status) => {
    setUnits((current) => current.map((unit) => unit.id === id ? { ...unit, status } : unit))
    const unit = units.find((item) => item.id === id)
    appendLog(`${unit?.name || 'Unit'} status changed to ${status.toLowerCase()}`)
    setNotice('Rescue unit status updated')
  }

  const generatePlan = () => {
    const pending = incidents.filter((item) => item.status === 'Pending')
    const available = units.filter((item) => item.status === 'Available')
    if (!pending.length || !available.length) {
      setNotice(!pending.length ? 'No pending incidents to assign' : 'No available units to assign')
      return
    }
    const priorityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 }
    const orderedIncidents = [...pending].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    const assignments = orderedIncidents.slice(0, available.length).map((incident, index) => ({
      incidentId: incident.id,
      barangay: incident.barangay,
      unitId: available[index].id,
      unitName: available[index].name,
      eta: `${8 + index * 5} min`,
      priority: incident.priority,
      route: `Dispatch base → ${incident.barangay}`,
    }))
    const plan = { id: `PLAN-${Date.now().toString().slice(-6)}`, createdAt: new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false }), status: 'Recommended', assignments }
    setPlans((current) => [plan, ...current])
    appendLog(`${plan.id} generated with ${assignments.length} recommended assignment(s)`)
    setActivePage('dispatch')
    setNotice('Demo plan generated from sample data; review before approval')
  }

  const approvePlan = (plan) => {
    setPlans((current) => current.map((item) => item.id === plan.id ? { ...item, status: 'Approved' } : item))
    const assignedIds = new Set(plan.assignments.map((item) => item.incidentId))
    const assignedUnitIds = new Set(plan.assignments.map((item) => item.unitId))
    setIncidents((current) => current.map((item) => assignedIds.has(item.id) ? { ...item, status: 'Assigned' } : item))
    setUnits((current) => current.map((item) => assignedUnitIds.has(item.id) ? { ...item, status: 'Assigned' } : item))
    appendLog(`${plan.id} approved by ${role}`)
    setNotice('Plan approved; assigned units and incidents updated')
  }

  const resetDemo = () => {
    setIncidents(initialIncidents)
    setUnits(initialUnits)
    setRoads(initialRoads)
    setPlans([])
    setLogs(seedLogs)
    setNotice('Sample workspace restored')
  }

  const changePage = (page) => {
    setActivePage(page)
    setMobileNavOpen(false)
  }

  const renderIncidents = (compact = false) => (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>Incident</th><th>Priority</th><th>People</th><th>Reported</th><th>Status</th></tr></thead>
        <tbody>
          {(compact ? incidents.filter((item) => item.status !== 'Resolved').slice(0, 4) : visibleIncidents).map((item) => (
            <tr key={item.id}>
              <td><strong>{item.barangay}</strong><small>{item.id} · {item.type}</small></td>
              <td><StatusPill tone={item.priority.toLowerCase()}>{item.priority}</StatusPill></td>
              <td>{item.people}</td><td>{item.reported}</td>
              <td><StatusPill tone={item.status.toLowerCase().replace(' ', '-')}>{item.status}</StatusPill></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!compact && visibleIncidents.length === 0 && <p className="empty-state">No incidents match the current filters.</p>}
    </div>
  )

  const renderRoads = () => (
    <div className="table-scroll">
      <table className="data-table"><thead><tr><th>Road / segment</th><th>Condition</th><th>Reported depth</th><th>Updated</th><th>Set condition</th></tr></thead>
        <tbody>{roads.map((road) => <tr key={road.id}><td><strong>{road.name}</strong><small>{road.id} · {road.segment}</small></td><td><StatusPill tone={road.condition.toLowerCase()}>{road.condition}</StatusPill></td><td>{road.depth}</td><td>{road.updated}</td><td><select className="inline-select" aria-label={`Set ${road.name} condition`} value={road.condition} onChange={(event) => updateRoad(road.id, event.target.value)}><option>Open</option><option>Restricted</option><option>Blocked</option></select></td></tr>)}</tbody>
      </table>
    </div>
  )

  const renderUnits = () => (
    <div className="table-scroll">
      <table className="data-table"><thead><tr><th>Unit</th><th>Type</th><th>Capacity</th><th>Status</th><th>Update</th></tr></thead>
        <tbody>{units.map((unit) => <tr key={unit.id}><td><strong>{unit.name}</strong><small>{unit.id}</small></td><td>{unit.type}</td><td>{unit.capacity} people</td><td><StatusPill tone={unit.status.toLowerCase().replace(' ', '-')}>{unit.status}</StatusPill></td><td><select className="inline-select" aria-label={`Set ${unit.name} status`} value={unit.status} onChange={(event) => updateUnit(unit.id, event.target.value)}><option>Available</option><option>Assigned</option><option>On route</option><option>On scene</option><option>Maintenance</option></select></td></tr>)}</tbody>
      </table>
    </div>
  )

  const renderPlans = () => (
    <div className="plan-list">
      {plans.length === 0 && <div className="empty-state plan-empty"><ClipboardList size={22} /><strong>No dispatch plans yet</strong><span>Generate a recommendation from pending incidents and available units.</span><button className="button-primary" onClick={generatePlan}><Route size={16} /> Generate plan</button></div>}
      {plans.map((plan) => <article className="plan-card" key={plan.id}>
        <div className="plan-heading"><div><p className="eyebrow">{plan.id} · {plan.createdAt}</p><h3>Dispatch recommendation</h3></div><StatusPill tone={plan.status.toLowerCase()}>{plan.status}</StatusPill></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Incident</th><th>Recommended unit</th><th>ETA*</th><th>Priority</th></tr></thead><tbody>{plan.assignments.map((assignment) => <tr key={assignment.incidentId}><td><strong>{assignment.barangay}</strong><small>{assignment.incidentId}</small></td><td>{assignment.unitName}</td><td>{assignment.eta}</td><td><StatusPill tone={assignment.priority.toLowerCase()}>{assignment.priority}</StatusPill></td></tr>)}</tbody></table></div>
        <div className="plan-footer"><small>*Illustrative estimate; route calculation is not connected yet.</small>{plan.status === 'Recommended' && <button className="button-primary" onClick={() => approvePlan(plan)}><Check size={16} /> Approve plan</button>}</div>
      </article>)}
    </div>
  )

  const renderActivity = () => <div className="activity-list">{logs.map((log) => <div className="activity-row" key={log.id}><span className="activity-marker" /><div><strong>{log.text}</strong><small>{log.actor}</small></div><time>{log.time}</time></div>)}</div>

  const pageContent = () => {
    if (activePage === 'incidents') return <><PageHeading title="Incident intake" subtitle="Record requests for assistance and review their priority and status." action={<button className="button-primary" onClick={() => setModal('incident')}><Plus size={16} /> New incident</button>} /><div className="toolbar"><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search incidents" /></label><label className="select-field"><Filter size={15} /><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option>All priorities</option><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></label></div><section className="panel">{renderIncidents()}</section></>
    if (activePage === 'roads') return <><PageHeading title="Road conditions" subtitle="Manually updated road status informs dispatch recommendations." /><section className="panel"><div className="panel-header"><h3>Malolos road segments</h3><span className="muted">{blockedRoads} blocked · user-updated</span></div>{renderRoads()}</section></>
    if (activePage === 'resources') return <><PageHeading title="Rescue units" subtitle="Monitor unit availability and response capacity." /><section className="panel"><div className="panel-header"><h3>Registered response units</h3><span className="muted">{availableUnits} available</span></div>{renderUnits()}</section></>
    if (activePage === 'dispatch') return <><PageHeading title="Dispatch plans" subtitle="Review the generated recommendations and approve assignments." action={<button className="button-primary" onClick={generatePlan}><Route size={16} /> Generate plan</button>} />{renderPlans()}</>
    if (activePage === 'activity') return <><PageHeading title="System activity" subtitle="Recent actions in this browser-based demo workspace." action={<button className="button-secondary" onClick={resetDemo}><RefreshCw size={15} /> Reset demo data</button>} /><section className="panel"><div className="panel-header"><h3>Activity log</h3><StatusPill>Latest {logs.length}</StatusPill></div>{renderActivity()}</section></>
    return <>
      <PageHeading title="Dispatch overview" subtitle="Flood response coordination · Malolos, Bulacan" action={<><button className="button-secondary" onClick={() => setNotice('Dashboard refreshed from local demo data')}><RefreshCw size={15} /> Refresh</button><button className="button-primary" onClick={generatePlan}><Route size={16} /> Generate plan</button></>} />
      <div className="sample-banner"><AlertTriangle size={17} /><span><strong>Demonstration data</strong> This prototype is not connected to live MDRRMO systems or emergency feeds.</span><button onClick={resetDemo}>Reset sample data</button></div>
      <section className="metric-grid">
        <Metric icon={ShieldAlert} label="Open incidents" value={String(openIncidents).padStart(2, '0')} trend="Needs review" tone="red" />
        <Metric icon={Truck} label="Units available" value={String(availableUnits).padStart(2, '0')} trend="of 4 registered" tone="blue" />
        <Metric icon={Route} label="Blocked roads" value={String(blockedRoads).padStart(2, '0')} trend="Manual reports" tone="amber" />
        <Metric icon={Clock3} label="Latest update" value="08:42" trend="Local demo time" tone="green" />
      </section>
      <section className="overview-grid">
        <div className="panel map-panel"><div className="panel-header"><div><h3>Malolos response map</h3><p className="panel-subtitle">Incident locations and reported road conditions</p></div><span className="map-legend"><i className="legend-incident" /> Incident <i className="legend-blocked" /> Blocked</span></div>
          <div className="map-frame"><MapContainer center={mapCenter} zoom={13} scrollWheelZoom={false} zoomControl={true}><MapResizeHandler active={activePage === 'overview'} /><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><Polyline positions={[[14.846, 120.811], [14.85, 120.816], [14.8522, 120.8164]]} pathOptions={{ color: '#137c8b', weight: 5, opacity: 0.78 }} /><Polyline positions={[[14.858, 120.817], [14.862, 120.822], [14.8652, 120.8262]]} pathOptions={{ color: '#d3534b', weight: 5, dashArray: '8 8' }} />{incidents.filter((item) => item.status !== 'Resolved').map((item) => <CircleMarker key={item.id} center={item.location} radius={item.priority === 'Critical' ? 9 : 7} pathOptions={{ color: '#fff', weight: 2, fillColor: item.priority === 'Critical' ? '#d94e48' : '#e4a335', fillOpacity: 1 }}><Popup><strong>{item.barangay}</strong><br />{item.id} · {item.priority}<br />{item.people} people affected</Popup></CircleMarker>)}</MapContainer><div className="map-caption">Illustrative coordinates · Verify all locations with responders</div></div>
        </div>
        <div className="panel incident-panel"><div className="panel-header"><div><h3>Priority queue</h3><p className="panel-subtitle">Unresolved requests</p></div><button className="text-button" onClick={() => changePage('incidents')}>View all <ArrowUpRight size={14} /></button></div>{incidents.filter((item) => item.status !== 'Resolved').sort((a, b) => ({ Critical: 0, High: 1, Medium: 2, Low: 3 }[a.priority] - { Critical: 0, High: 1, Medium: 2, Low: 3 }[b.priority])).slice(0, 4).map((incident) => <div className="queue-item" key={incident.id}><div className={`queue-symbol ${incident.priority.toLowerCase()}`}><AlertTriangle size={16} /></div><div className="queue-copy"><strong>{incident.barangay}</strong><span>{incident.type} · {incident.people} people</span></div><StatusPill tone={incident.priority.toLowerCase()}>{incident.priority}</StatusPill></div>)}</div>
      </section>
      <section className="bottom-grid"><div className="panel"><div className="panel-header"><div><h3>Recent incidents</h3><p className="panel-subtitle">Current operation queue</p></div><button className="text-button" onClick={() => changePage('incidents')}>All incidents <ArrowDownRight size={14} /></button></div>{renderIncidents(true)}</div><div className="panel"><div className="panel-header"><div><h3>Unit readiness</h3><p className="panel-subtitle">Availability and deployment</p></div><button className="text-button" onClick={() => changePage('resources')}>Manage <ArrowUpRight size={14} /></button></div><div className="unit-summary">{units.slice(0, 4).map((unit) => <div className="unit-row" key={unit.id}><span className="unit-icon">{unit.type === 'Ambulance' ? <Ambulance size={17} /> : <Truck size={17} />}</span><div><strong>{unit.name}</strong><small>{unit.capacity} person capacity</small></div><StatusPill tone={unit.status.toLowerCase().replace(' ', '-')}>{unit.status}</StatusPill></div>)}</div></div></section>
      <section className="panel activity-preview"><div className="panel-header"><div><h3>Latest activity</h3><p className="panel-subtitle">Recorded actions</p></div><button className="text-button" onClick={() => changePage('activity')}>View log <ArrowUpRight size={14} /></button></div>{logs.slice(0, 3).map((log) => <div className="compact-log" key={log.id}><span className="activity-marker" /><span>{log.text}</span><time>{log.time}</time></div>)}</section>
    </>
  }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Activity size={21} /></div><div><p className="brand-kicker">MALOLOS · BULACAN</p><h2>Flood Dispatch</h2></div><button className="mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X size={20} /></button></div>
      <div className="sidebar-section"><span className="sidebar-label">WORKSPACE</span><nav className="nav">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${activePage === id ? 'active' : ''}`} onClick={() => changePage(id)}><Icon size={17} /><span>{label}</span>{id === 'incidents' && openIncidents > 0 && <span className="nav-count">{openIncidents}</span>}</button>)}</nav></div>
      <div className="sidebar-bottom"><div className="alert-level"><span className="alert-level-dot" /><div><small>OPERATIONAL STATUS</small><strong>Monitoring active</strong></div></div><label className="role-picker"><Users size={15} /><select aria-label="Demo user role" value={role} onChange={(event) => setRole(event.target.value)}>{roleOptions.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label><div className="sidebar-foot"><span>Flood response support</span><span>Prototype · v0.1</span></div></div>
    </aside>
    {mobileNavOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
    <main className="main-panel"><header className="topbar"><div className="topbar-title"><button className="mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><div><div className="breadcrumb">Operations <span>/</span> {pageTitle}</div><h1>{pageTitle}</h1></div></div><div className="topbar-tools"><div className="demo-user"><span className="user-avatar">{role.slice(0, 1)}</span><span><strong>{role}</strong><small>Demo workspace</small></span></div><button className="icon-button" title="Notifications" aria-label="Notifications" onClick={() => setNotice('No new notifications in this demo')}><Bell size={18} /><i /></button><button className="icon-button settings-button" title="Settings" aria-label="Settings" onClick={() => setNotice('Settings will be available when user accounts are connected')}><Settings size={18} /></button></div></header>
      <div className="page-content">{pageContent()}<footer className="page-footer"><span>Decision support only · Final dispatch decisions remain with authorized coordinators.</span><button onClick={() => setNotice('Demo workspace: data is stored locally in this browser')}>About this prototype</button></footer></div>
    </main>
    {notice && <div className="toast" role="status"><Check size={17} />{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={15} /></button></div>}
    {modal === 'incident' && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal('') }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="incident-modal-title"><div className="modal-heading"><div><p className="eyebrow">Incident intake</p><h2 id="incident-modal-title">New assistance request</h2></div><button className="icon-button" onClick={() => setModal('')} aria-label="Close dialog"><X size={19} /></button></div><form onSubmit={addIncident}><label>Barangay<select name="barangay" required defaultValue=""><option value="" disabled>Select barangay</option>{['Bayan', 'Longos', 'Mojon', 'San Pablo', 'Sto. Niño', 'Tikay'].map((item) => <option key={item}>{item}</option>)}</select></label><label>Request type<select name="type"><option>Rescue request</option><option>Medical assistance</option><option>Relief delivery</option></select></label><div className="form-row"><label>Priority<select name="priority"><option>Critical</option><option>High</option><option selected>Medium</option><option>Low</option></select></label><label>People affected<input name="people" type="number" min="1" defaultValue="1" required /></label></div><label>Notes<textarea name="notes" rows="3" placeholder="Situation, access notes, or assistance needed" /></label><div className="modal-actions"><button type="button" className="button-secondary" onClick={() => setModal('')}>Cancel</button><button className="button-primary" type="submit"><Plus size={16} /> Add incident</button></div></form></section></div>}
  </div>
}

function PageHeading({ title, subtitle, action }) {
  return <div className="page-heading"><div><p className="eyebrow">FLOOD RESPONSE · MALOLOS</p><h2>{title}</h2><p>{subtitle}</p></div>{action && <div className="heading-actions">{action}</div>}</div>
}

function Metric({ icon: Icon, label, value, trend, tone }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-trend">{tone === 'red' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{trend}</span></article>
}

export default App
