import './App.css'

const stats = [
  { label: 'Active incidents', value: '12', tone: 'warning' },
  { label: 'Units deployed', value: '08', tone: 'primary' },
  { label: 'Roads blocked', value: '04', tone: 'danger' },
  { label: 'Avg. response', value: '18 min', tone: 'success' },
]

const incidents = [
  { name: 'Barangay Sto. Niño', priority: 'High', units: 3, status: 'Severe flooding' },
  { name: 'Barangay Tikay', priority: 'Critical', units: 4, status: 'Road access limited' },
  { name: 'Barangay Bayan', priority: 'Medium', units: 2, status: 'Relief support needed' },
]

const resourceStatus = [
  { name: 'Rescue Boat 1', status: 'Available', tag: 'ready' },
  { name: 'Fire Truck 3', status: 'On route', tag: 'route' },
  { name: 'Ambulance 2', status: 'Standby', tag: 'standby' },
  { name: 'Utility Van 5', status: 'Maintenance', tag: 'repair' },
]

const routes = [
  { route: 'MDRRMO → Sto. Niño', eta: '09 min', risk: 'Low', assigned: 'Rescue Team A' },
  { route: 'MDRRMO → Tikay', eta: '14 min', risk: 'Medium', assigned: 'Rescue Team B' },
  { route: 'Supply Depot → Bayan', eta: '22 min', risk: 'High', assigned: 'Utility Van 2' },
]

function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div>
            <p className="eyebrow">Malolos</p>
            <h2>Flood Dispatch</h2>
          </div>
        </div>

        <nav className="nav">
          <button className="nav-item active">Overview</button>
          <button className="nav-item">Incidents</button>
          <button className="nav-item">Routes</button>
          <button className="nav-item">Resources</button>
          <button className="nav-item">Reports</button>
        </nav>

        <div className="sidebar-card">
          <p className="eyebrow">System status</p>
          <strong>Operations normal</strong>
          <span>Flood alert level: Yellow</span>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Emergency operations</p>
            <h1>Dispatch Dashboard</h1>
          </div>
          <div className="topbar-actions">
            <button className="ghost-btn">Export</button>
            <button className="primary-btn">Generate plan</button>
          </div>
        </header>

        <section className="stats-grid">
          {stats.map((item) => (
            <div key={item.label} className={`stat-card ${item.tone}`}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </section>

        <section className="content-grid">
          <div className="panel map-panel">
            <div className="panel-header">
              <h3>Road network overview</h3>
              <span className="status-dot live">Live</span>
            </div>

            <div className="map-box">
              <div className="node node-a">A</div>
              <div className="node node-b">B</div>
              <div className="node node-c">C</div>
              <div className="node node-d">D</div>

              <div className="road road-1" />
              <div className="road road-2" />
              <div className="road road-3" />
              <div className="road road-4 blocked" />
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>Active incidents</h3>
              <button className="tiny-btn">Refresh</button>
            </div>

            <div className="incident-list">
              {incidents.map((incident) => (
                <div key={incident.name} className="incident-item">
                  <div>
                    <strong>{incident.name}</strong>
                    <span>{incident.status}</span>
                  </div>
                  <div className="incident-meta">
                    <span className={`priority ${incident.priority.toLowerCase()}`}>
                      {incident.priority}
                    </span>
                    <span>{incident.units} units</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel full-width">
          <div className="panel-header">
            <h3>Recommended dispatch plan</h3>
            <span className="status-pill">Optimized</span>
          </div>

          <table>
            <thead>
              <tr>
                <th>Route</th>
                <th>ETA</th>
                <th>Risk</th>
                <th>Assigned resource</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((row) => (
                <tr key={row.route}>
                  <td>{row.route}</td>
                  <td>{row.eta}</td>
                  <td>{row.risk}</td>
                  <td>{row.assigned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel full-width">
          <div className="panel-header">
            <h3>Resource availability</h3>
          </div>

          <div className="resource-grid">
            {resourceStatus.map((resource) => (
              <div key={resource.name} className="resource-card">
                <strong>{resource.name}</strong>
                <span className={`tag ${resource.tag}`}>{resource.status}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
