const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const { Pool } = require('pg')
const fs = require('node:fs')
const path = require('node:path')
const { createRoadGraph, shortestPath, recommendAssignments } = require('./optimization')

dotenv.config()

const app = express()
const PORT = Number(process.env.PORT) || 5000
const poolOptions = { connectionString: process.env.DATABASE_URL }

if (process.env.PGSSLROOTCERT) {
  const databaseUrl = new URL(process.env.DATABASE_URL)
  databaseUrl.searchParams.delete('sslmode')
  poolOptions.connectionString = databaseUrl.toString()
  poolOptions.ssl = {
    ca: fs.readFileSync(path.resolve(process.env.PGSSLROOTCERT), 'utf8'),
    rejectUnauthorized: true,
  }
}

const pool = new Pool(poolOptions)

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || true }))
app.use(express.json())

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const positiveId = (value) => /^\d+$/.test(String(value)) && Number(value) > 0
const tableList = (table, columns, orderBy) => asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`SELECT ${columns} FROM ${table} ORDER BY ${orderBy}`)
  res.json(rows)
})

const createLog = async (client, userId, action) => {
  await client.query(
    'INSERT INTO system_log (user_id, action_type) VALUES ($1, $2)',
    [userId, action],
  )
}

const loadRoadNetwork = async (database) => {
  const [nodeResult, edgeResult] = await Promise.all([
    database.query('SELECT node_id, latitude, longitude FROM road_node'),
    database.query('SELECT edge_id, from_node_id, to_node_id, is_passable FROM road_edge'),
  ])
  return {
    nodes: nodeResult.rows,
    edges: edgeResult.rows,
    graph: createRoadGraph(nodeResult.rows, edgeResult.rows),
  }
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1')
  res.json({ status: 'ok', database: 'postgresql' })
}))

app.get('/api/incidents', tableList(
  'incident i LEFT JOIN road_node n ON n.node_id = i.location_node_id',
  'i.incident_id, i.reported_by, i.location_node_id, i.people_affected, i.urgency_level, i.status, n.node_type, n.latitude, n.longitude',
  'i.incident_id DESC',
))

app.post('/api/incidents', asyncRoute(async (req, res) => {
  const { location_node_id, people_affected, urgency_level, reported_by, status = 'Pending' } = req.body
  if (!positiveId(location_node_id) || !positiveId(people_affected) || !positiveId(reported_by) || !['Critical', 'High', 'Medium', 'Low'].includes(urgency_level)) {
    return res.status(400).json({ message: 'location_node_id, people_affected, reported_by, and a valid urgency_level are required' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      'INSERT INTO incident (reported_by, location_node_id, people_affected, urgency_level, status) VALUES ($1, $2, $3, $4, $5) RETURNING incident_id, reported_by, location_node_id, people_affected, urgency_level, status',
      [Number(reported_by), Number(location_node_id), Number(people_affected), urgency_level, status],
    )
    await createLog(client, Number(reported_by), `Created incident ${rows[0].incident_id}`)
    await client.query('COMMIT')
    res.status(201).json({ incident: rows[0] })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}))

app.get('/api/units', tableList(
  'rescue_unit u LEFT JOIN road_node n ON n.node_id = u.current_node_id',
  'u.unit_id, u.current_node_id, u.capacity, u.status, n.node_type, n.latitude, n.longitude',
  'u.unit_id',
))

app.patch('/api/units/:id', asyncRoute(async (req, res) => {
  const { status } = req.body
  if (!positiveId(req.params.id)) return res.status(400).json({ message: 'Unit id must be a positive integer' })
  if (!['Available', 'Assigned'].includes(status)) return res.status(400).json({ message: 'Status must be Available or Assigned' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      'UPDATE rescue_unit SET status = $1 WHERE unit_id = $2 RETURNING unit_id, current_node_id, capacity, status',
      [status, Number(req.params.id)],
    )
    if (!rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ message: 'Rescue unit not found' })
    }
    await createLog(client, Number(req.body.updated_by || process.env.DEFAULT_USER_ID || 1), `Updated rescue unit ${req.params.id} to ${status}`)
    await client.query('COMMIT')
    res.json({ unit: rows[0] })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}))

app.get('/api/roads/nodes', tableList(
  'road_node',
  'node_id, node_type, latitude, longitude',
  'node_id',
))

app.get('/api/roads/edges', tableList(
  'road_edge',
  'edge_id, from_node_id, to_node_id, is_passable',
  'edge_id',
))

app.patch('/api/roads/edges/:id', asyncRoute(async (req, res) => {
  const { is_passable } = req.body
  if (!positiveId(req.params.id)) return res.status(400).json({ message: 'Edge id must be a positive integer' })
  if (typeof is_passable !== 'boolean') return res.status(400).json({ message: 'is_passable must be a boolean' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      'UPDATE road_edge SET is_passable = $1 WHERE edge_id = $2 RETURNING edge_id, from_node_id, to_node_id, is_passable',
      [is_passable, Number(req.params.id)],
    )
    if (!rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ message: 'Road edge not found' })
    }
    await createLog(client, Number(req.body.updated_by || process.env.DEFAULT_USER_ID || 1), `Updated road edge ${req.params.id} passability to ${is_passable}`)
    await client.query('COMMIT')
    res.json({ edge: rows[0] })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}))

app.get('/api/dispatches', asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT d.dispatch_id, d.unit_id, d.incident_id, d.assigned_by,
      i.urgency_level, i.status AS incident_status,
      rt.route_id, rt.total_distance
    FROM dispatch d
    LEFT JOIN incident i ON i.incident_id = d.incident_id
    LEFT JOIN LATERAL (
      SELECT route_id, total_distance
      FROM route
      WHERE route.dispatch_id = d.dispatch_id
      ORDER BY route_id DESC
      LIMIT 1
    ) rt ON TRUE
    ORDER BY d.dispatch_id DESC
  `)
  res.json({ dispatches: rows })
}))

app.get('/api/dispatches/recommendations', asyncRoute(async (_req, res) => {
  const [unitResult, incidentResult, network] = await Promise.all([
    pool.query("SELECT unit_id, current_node_id, capacity, status FROM rescue_unit WHERE status = 'Available' ORDER BY unit_id"),
    pool.query("SELECT incident_id, location_node_id, people_affected, urgency_level, status FROM incident WHERE status = 'Pending' ORDER BY incident_id"),
    loadRoadNetwork(pool),
  ])
  const result = recommendAssignments({
    units: unitResult.rows,
    incidents: incidentResult.rows,
    nodes: network.nodes,
    edges: network.edges,
  })
  res.json(result)
}))

app.post('/api/dispatches', asyncRoute(async (req, res) => {
  const { unit_id, incident_id, assigned_by } = req.body
  if (![unit_id, incident_id, assigned_by].every(positiveId)) {
    return res.status(400).json({ message: 'unit_id, incident_id, and assigned_by must be positive integers' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: units } = await client.query('SELECT current_node_id, status FROM rescue_unit WHERE unit_id = $1 FOR UPDATE', [Number(unit_id)])
    const { rows: incidents } = await client.query('SELECT location_node_id, status FROM incident WHERE incident_id = $1 FOR UPDATE', [Number(incident_id)])
    if (!units.length || !incidents.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ message: !units.length ? 'Rescue unit not found' : 'Incident not found' })
    }
    if (units[0].status !== 'Available' || incidents[0].status !== 'Pending') {
      await client.query('ROLLBACK')
      return res.status(409).json({ message: 'The rescue unit or incident is no longer available for dispatch' })
    }

    const network = await loadRoadNetwork(client)
    const path = shortestPath(network.graph, units[0].current_node_id, incidents[0].location_node_id)
    if (!path) {
      await client.query('ROLLBACK')
      return res.status(409).json({ message: 'No passable road path exists between the unit and incident nodes' })
    }

    const { rows: dispatchRows } = await client.query(
      'INSERT INTO dispatch (unit_id, incident_id, assigned_by) VALUES ($1, $2, $3) RETURNING dispatch_id, unit_id, incident_id, assigned_by',
      [Number(unit_id), Number(incident_id), Number(assigned_by)],
    )
    const { rows: routeRows } = await client.query(
      'INSERT INTO route (dispatch_id, total_distance) VALUES ($1, $2) RETURNING route_id, dispatch_id, total_distance',
      [dispatchRows[0].dispatch_id, path.distanceKm],
    )
    await client.query('UPDATE rescue_unit SET status = $1 WHERE unit_id = $2', ['Assigned', Number(unit_id)])
    await client.query('UPDATE incident SET status = $1 WHERE incident_id = $2', ['Assigned', Number(incident_id)])
    await createLog(client, Number(assigned_by), `Created dispatch ${dispatchRows[0].dispatch_id}`)
    await client.query('COMMIT')
    res.status(201).json({ dispatch: { ...dispatchRows[0], route: routeRows[0], status: 'Assigned' } })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}))

app.get('/api/logs', asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT log_id, user_id, action_type FROM system_log ORDER BY log_id DESC LIMIT 100',
  )
  res.json({ logs: rows })
}))

app.use((error, _req, res, _next) => {
  console.error(error)
  if (error.code === '23503') return res.status(400).json({ message: 'A referenced user, unit, incident, or node does not exist' })
  if (error.code === '23505') return res.status(409).json({ message: 'That record already exists' })
  if (error.code === '42P01' || error.code === '42703') {
    return res.status(500).json({ message: 'Database schema does not match the ERD expected by this API' })
  }
  res.status(500).json({ message: 'Internal server error' })
})

app.use((_req, res) => res.status(404).json({ message: 'API route not found' }))

const startServer = async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  await pool.query('SELECT 1')
  app.listen(PORT, () => console.log(`Flood dispatch API listening on port ${PORT}`))
}

startServer().catch((error) => {
  console.error(`Unable to start backend: ${error.message}`)
  process.exit(1)
})

process.on('SIGINT', async () => {
  await pool.end()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await pool.end()
  process.exit(0)
})
