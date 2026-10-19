const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const fs = require('node:fs')
const path = require('node:path')
const { Pool } = require('pg')
const { createRoadGraph, shortestPath, recommendAssignments } = require('./optimization')
const axios = require("axios");

dotenv.config()

const app = express()
const PORT = Number(process.env.PORT) || 5000
const hasDatabaseConfig = Boolean(process.env.DATABASE_URL || process.env.DB_HOST)
const poolOptions = {}

if (process.env.DATABASE_URL) {
  poolOptions.connectionString = process.env.DATABASE_URL
  if (process.env.PGSSLROOTCERT) {
    const databaseUrl = new URL(process.env.DATABASE_URL)
    databaseUrl.searchParams.delete('sslmode')
    poolOptions.connectionString = databaseUrl.toString()
    poolOptions.ssl = {
      ca: fs.readFileSync(path.resolve(process.env.PGSSLROOTCERT), 'utf8'),
      rejectUnauthorized: true,
    }
  }
} else if (process.env.DB_HOST) {
  poolOptions.user = process.env.DB_USER
  poolOptions.password = process.env.DB_PASSWORD
  poolOptions.host = process.env.DB_HOST
  poolOptions.port = Number(process.env.DB_PORT || 5432)
  poolOptions.database = process.env.DB_NAME

  if (process.env.DB_SSL_CA) {
    poolOptions.ssl = {
      rejectUnauthorized: true,
      ca: fs.readFileSync(path.resolve(process.env.DB_SSL_CA), 'utf8'),
    }
  }
}

const pool = new Pool(poolOptions)

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || true }))
app.use(express.json())

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const positiveId = (value) => /^\d+$/.test(String(value)) && Number(value) > 0
const requireDatabase = asyncRoute(async (_req, res, next) => {
  if (!hasDatabaseConfig) {
    return res.status(503).json({ message: 'Database configuration is not available for this backend instance.' })
  }

  try {
    await pool.query('SELECT 1')
    next()
  } catch (error) {
    next(error)
  }
})

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
    database.query(
      'SELECT node_id, latitude, longitude FROM road_node'
    ),
    database.query(`
      SELECT
        edge_id,
        from_node_id,
        to_node_id,
        is_passable,
        distance_km,
        travel_time_minutes
      FROM road_edge
    `),
  ]);

  return {
    nodes: nodeResult.rows,
    edges: edgeResult.rows,
    graph: createRoadGraph(nodeResult.rows, edgeResult.rows),
  };
};




app.get('/api/health', asyncRoute(async (_req, res) => {
  if (!hasDatabaseConfig) {
    return res.json({ status: 'ok', database: 'not-configured' })
  }

  await pool.query('SELECT 1')
  res.json({ status: 'ok', database: 'postgresql' })
}))

app.get('/api/incidents', requireDatabase, tableList(
  'incident i LEFT JOIN road_node n ON n.node_id = i.location_node_id',
  'i.incident_id, i.reported_by, i.location_node_id, i.people_affected, i.urgency_level, i.status, n.node_type, n.latitude, n.longitude',
  'i.incident_id DESC',
))


app.post('/api/incidents', requireDatabase, asyncRoute(async (req, res) => {
  const {
    location_node_id,
    people_affected,
    urgency_level,
    reported_by,
    status = 'Pending',
  } = req.body;

  if (
    !positiveId(location_node_id) ||
    !positiveId(people_affected) ||
    !positiveId(reported_by) ||
    !['Critical', 'High', 'Medium', 'Low'].includes(urgency_level)
  ) {
    return res.status(400).json({
      message: 'location_node_id, people_affected, reported_by, and a valid urgency_level are required',
    });
  }

  const client = await pool.connect();
  let incident;

  // 1. Save the incident in PostgreSQL.
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO incident
        (reported_by, location_node_id, people_affected, urgency_level, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING incident_id, reported_by, location_node_id,
                 people_affected, urgency_level, status`,
      [
        Number(reported_by),
        Number(location_node_id),
        Number(people_affected),
        urgency_level,
        status,
      ],
    );

    incident = rows[0];

    await createLog(
      client,
      Number(reported_by),
      `Created incident ${incident.incident_id}`,
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  // 2. Automatically recalculate recommendations using Flask.
  // The incident is already saved, even if optimization fails.
  try {
    const [unitResult, incidentResult, network] = await Promise.all([
      pool.query(
        `SELECT unit_id, current_node_id, capacity, status
         FROM rescue_unit
         WHERE status = 'Available'
         ORDER BY unit_id`,
      ),
      pool.query(
        `SELECT incident_id, location_node_id, people_affected,
                urgency_level, status
         FROM incident
         WHERE status = 'Pending'
         ORDER BY incident_id`,
      ),
      loadRoadNetwork(pool),
    ]);

    const optimizerData = {
      edges: network.edges.map(edge => ({
        from_node_id: Number(edge.from_node_id),
        to_node_id: Number(edge.to_node_id),
        distance_km: edge.distance_km == null
          ? null
          : Number(edge.distance_km),
        travel_time_minutes: edge.travel_time_minutes == null
          ? null
          : Number(edge.travel_time_minutes),
        is_passable: edge.is_passable,
      })),

      units: unitResult.rows.map(unit => ({
        unit_id: Number(unit.unit_id),
        current_node_id: Number(unit.current_node_id),
        capacity: Number(unit.capacity),
        status: unit.status,
      })),

      incidents: incidentResult.rows.map(item => ({
        incident_id: Number(item.incident_id),
        location_node_id: Number(item.location_node_id),
        affected_residents: Number(item.people_affected),
        urgency_level: item.urgency_level,
        status: item.status,
      })),
    };

    const optimizationResponse = await axios.post(
      'http://127.0.0.1:5001/optimize',
      optimizerData,
      { timeout: 10000 },
    );

    // 3. Return the saved incident and the fresh recommendations.
    return res.status(201).json({
      incident,
      recommendations: optimizationResponse.data,
    });
  } catch (error) {
    console.error(
      'Incident saved, but optimization failed:',
      error.response?.data || error.message,
    );

    return res.status(201).json({
      incident,
      recommendations: null,
      optimization_warning:
        'Incident was saved, but recommendations could not be generated. Please refresh or retry recommendations.',
    });
  }
}));


app.get('/api/units', requireDatabase, tableList(
  'rescue_unit u LEFT JOIN road_node n ON n.node_id = u.current_node_id',
  'u.unit_id, u.unit_type, u.current_node_id, u.capacity, u.status, n.node_type, n.latitude, n.longitude',
  'u.unit_id',
))

app.patch('/api/units/:id', requireDatabase, asyncRoute(async (req, res) => {
  const { status } = req.body
  if (!positiveId(req.params.id)) return res.status(400).json({ message: 'Unit id must be a positive integer' })
  if (!['Available', 'Deployed', 'Under maintenance'].includes(status)) return res.status(400).json({ message: 'Status must be Available, Deployed, or Under maintenance' })

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

app.get('/api/roads/nodes', requireDatabase, tableList(
  'road_node',
  'node_id, node_type, latitude, longitude',
  'node_id',
))

app.get('/api/roads/edges', requireDatabase, tableList(
  'road_edge',
  'edge_id, from_node_id, to_node_id, is_passable, distance_km',
  'edge_id',
))

app.patch('/api/roads/edges/:id', requireDatabase, asyncRoute(async (req, res) => {
  const { is_passable } = req.body
  if (!positiveId(req.params.id)) return res.status(400).json({ message: 'Edge id must be a positive integer' })
  if (typeof is_passable !== 'boolean') return res.status(400).json({ message: 'is_passable must be a boolean' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      'UPDATE road_edge SET is_passable = $1 WHERE edge_id = $2 RETURNING edge_id, from_node_id, to_node_id, is_passable, distance_km',
      [is_passable, Number(req.params.id)],
    )
    if (!rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ message: 'Road edge not found' })
    }
    const { rows: activeDispatches } = await client.query(`
      SELECT d.dispatch_id, i.incident_id, i.location_node_id, i.status AS incident_status,
        u.current_node_id, rt.edge_ids, rt.status AS route_status
      FROM dispatch d
      JOIN incident i ON i.incident_id = d.incident_id
      JOIN rescue_unit u ON u.unit_id = d.unit_id
      LEFT JOIN LATERAL (
        SELECT edge_ids, status
        FROM route
        WHERE route.dispatch_id = d.dispatch_id
        ORDER BY route_id DESC
        LIMIT 1
      ) rt ON TRUE
      WHERE i.status IN ('Assigned', 'In Progress')
    `)
    const network = await loadRoadNetwork(client)
    const reroutedDispatchIds = []
    const unreachableDispatchIds = []

    for (const dispatch of activeDispatches.rows) {
      if (!routeAffectedByEdge({ edge_ids: dispatch.edge_ids, status: dispatch.route_status }, req.params.id)) continue

      const path = shortestPath(network.graph, dispatch.current_node_id, dispatch.location_node_id)
      const routeStatus = path ? 'Active' : 'Unreachable'
      await client.query(
        'INSERT INTO route (dispatch_id, total_distance, node_ids, edge_ids, status) VALUES ($1, $2, $3, $4, $5)',
        [dispatch.dispatch_id, path?.distanceKm ?? 0, JSON.stringify(path?.nodeIds || []), JSON.stringify(path?.edgeIds || []), routeStatus],
      )
      if (path) reroutedDispatchIds.push(String(dispatch.dispatch_id))
      else unreachableDispatchIds.push(String(dispatch.dispatch_id))
    }

    const updatedBy = Number(req.body.updated_by || process.env.DEFAULT_USER_ID || 1)
    await createLog(client, updatedBy, `Updated road edge ${req.params.id} passability to ${is_passable}`)
    if (reroutedDispatchIds.length || unreachableDispatchIds.length) {
      await createLog(client, updatedBy, `Re-optimized ${reroutedDispatchIds.length} active route(s); ${unreachableDispatchIds.length} have no passable path`)
    }
    await client.query('COMMIT')
    res.json({ edge: rows[0], reroutedDispatchIds, unreachableDispatchIds })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}))

app.get('/api/dispatches', requireDatabase, asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT d.dispatch_id, d.unit_id, d.incident_id, d.assigned_by,
      i.urgency_level, i.status AS incident_status,
      rt.route_id, rt.total_distance, rt.node_ids, rt.edge_ids, rt.status AS route_status
    FROM dispatch d
    LEFT JOIN incident i ON i.incident_id = d.incident_id
    LEFT JOIN LATERAL (
      SELECT route_id, total_distance, node_ids, edge_ids, status
      FROM route
      WHERE route.dispatch_id = d.dispatch_id
      ORDER BY route_id DESC
      LIMIT 1
    ) rt ON TRUE
    ORDER BY d.dispatch_id DESC
  `)
  res.json({ dispatches: rows })
}))




app.get('/api/dispatches/recommendations', requireDatabase, asyncRoute(async (_req, res) => {
  const [unitResult, incidentResult, network] = await Promise.all([
    pool.query(
      "SELECT unit_id, current_node_id, capacity, status FROM rescue_unit WHERE status = 'Available' ORDER BY unit_id"
    ),
    pool.query(
      "SELECT incident_id, location_node_id, people_affected, urgency_level, status FROM incident WHERE status = 'Pending' ORDER BY incident_id"
    ),
    loadRoadNetwork(pool),
  ]);

  // Convert database records to the format expected by Python.
  const optimizerData = {
    edges: network.edges.map(edge => ({
      from_node_id: Number(edge.from_node_id),
      to_node_id: Number(edge.to_node_id),
      distance_km: edge.distance_km == null
        ? null
        : Number(edge.distance_km),
      travel_time_minutes: edge.travel_time_minutes == null
        ? null
        : Number(edge.travel_time_minutes),
      is_passable: edge.is_passable,
    })),

    units: unitResult.rows.map(unit => ({
      unit_id: Number(unit.unit_id),
      current_node_id: Number(unit.current_node_id),
      capacity: Number(unit.capacity),
      status: unit.status,
    })),

    incidents: incidentResult.rows.map(incident => ({
      incident_id: Number(incident.incident_id),
      location_node_id: Number(incident.location_node_id),
      affected_residents: Number(incident.people_affected),
      urgency_level: incident.urgency_level,
      status: incident.status,
    })),
  };

  // Ask the Python optimizer to calculate the assignments.
  const response = await axios.post(
    'http://127.0.0.1:5001/optimize',
    optimizerData,
    { timeout: 10000 }
  );

  res.json(response.data);
}));




app.post('/api/dispatches', requireDatabase, asyncRoute(async (req, res) => {
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
      'INSERT INTO route (dispatch_id, total_distance, node_ids, edge_ids, status) VALUES ($1, $2, $3, $4, $5) RETURNING route_id, dispatch_id, total_distance, node_ids, edge_ids, status',
      [dispatchRows[0].dispatch_id, path.distanceKm, JSON.stringify(path.nodeIds), JSON.stringify(path.edgeIds), 'Active'],
    )

    await client.query('UPDATE rescue_unit SET status = $1 WHERE unit_id = $2', ['Deployed', Number(unit_id)])
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

app.get('/api/logs', requireDatabase, asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT log_id, user_id, action_type FROM system_log ORDER BY log_id DESC LIMIT 100',
  )
  res.json({ logs: rows })
}))

app.get("/api/optimizer-test", async (req, res) => {
    try {
        const sampleData = {
            edges: [
                {
                    from_node_id: 1,
                    to_node_id: 2,
                    distance_km: 2.0,
                    travel_time_minutes: 4,
                    is_passable: true
                },
                {
                    from_node_id: 2,
                    to_node_id: 3,
                    distance_km: 1.5,
                    travel_time_minutes: 3,
                    is_passable: true
                },
                {
                    from_node_id: 3,
                    to_node_id: 2,
                    distance_km: 1.5,
                    travel_time_minutes: 3,
                    is_passable: true
                },
                {
                    from_node_id: 2,
                    to_node_id: 1,
                    distance_km: 2.0,
                    travel_time_minutes: 4,
                    is_passable: true
                },
                {
                    from_node_id: 1,
                    to_node_id: 3,
                    distance_km: 5.0,
                    
                    is_passable: true
                }
            ],

            units: [
                {
                    unit_id: 101,
                    current_node_id: 1,
                    capacity: 10,
                    status: "Available"
                },
                {
                    unit_id: 102,
                    current_node_id: 3,
                    capacity: 5,
                    status: "Available"
                }
            ],

            incidents: [
                {
                    incident_id: 201,
                    location_node_id: 3,
                    affected_residents: 8,
                    status: "Pending"
                },
                {
                    incident_id: 202,
                    location_node_id: 2,
                    affected_residents: 4,
                    status: "Pending"
                },
                {
                    incident_id: 203,
                    location_node_id: 1,
                    affected_residents: 20,
                    status: "Pending"
                }
            ]
        };

        const response = await axios.post(
            "http://127.0.0.1:5001/optimize",
            sampleData,
            { timeout: 10000 }
        );

        res.json({
            message: "Node.js successfully called the Python optimizer.",
            optimization: response.data
        });
    } catch (error) {
        console.error(
            "Optimizer request failed:",
            error.response?.data || error.message
        );

        res.status(502).json({
            error: "Could not get a result from the Python optimizer."
        });
    }
});



app.use((error, _req, res, _next) => {
  console.error(error)
  if (error.code === 'MISSING_EDGE_WEIGHTS') return res.status(503).json({ message: error.message })
  if (error.code === '23503') return res.status(400).json({ message: 'A referenced user, unit, incident, or node does not exist' })
  if (error.code === '23505') return res.status(409).json({ message: 'That record already exists' })
  if (error.code === '42P01' || error.code === '42703') {
    return res.status(500).json({ message: 'Database schema does not match the ERD expected by this API' })
  }
  res.status(500).json({ message: 'Internal server error' })
})

app.use((_req, res) => res.status(404).json({ message: 'API route not found' }))






const startServer = async () => {
  if (hasDatabaseConfig) {
    await pool.query('SELECT 1')
    app.listen(PORT, () => console.log(`Flood dispatch API listening on port ${PORT}`))
    return
  }

  app.listen(PORT, () => {
    console.log(`Flood dispatch API listening on port ${PORT} without a configured database`)
  })
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
