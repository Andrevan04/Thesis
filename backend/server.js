
const fs = require("fs");

const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// ===============================
// PostgreSQL Connection
// ===============================

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync("./ca.pem").toString()
  }
});

// ===============================
// Basic Test Route
// ===============================

app.get("/", (req, res) => {
  res.json({
    message: "Server is running!"
  });
});

// ===============================
// Test Database Connection
// ===============================

app.get("/api/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      message: "PostgreSQL connected!",
      time: result.rows[0].now
    });
  } catch (error) {
    console.error("Database error:", error);

    res.status(500).json({
      message: "Database connection failed"
    });
  }
});

// ===============================
// GET INCIDENTS
// ===============================

app.get("/api/test-route", (req, res) => {
  res.json({
    message: "TEST ROUTE IS WORKING"
  });
});

app.get("/api/test-db-2", async (req, res) => {
  try {
    const result = await pool.query("SELECT 1 AS test");

    res.json({
      message: "Database query works!",
      result: result.rows
    });
  } catch (error) {
    console.error("DATABASE ERROR:", error);

    res.status(500).json({
      message: "Database query failed",
      error: error.message,
      code: error.code
    });
  }
});

app.get("/api/incidents", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM incident
      ORDER BY incident_id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching incidents:", error);

    res.status(500).json({
      message: "Failed to fetch incidents"
    });
  }
});

app.get("/api/nodes", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM road_node
      ORDER BY node_id
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching road nodes:", error);

    res.status(500).json({
      message: "Failed to fetch road nodes",
      error: error.message
    });
  }
});



// ===============================
// GET RESCUE UNITS
// ===============================

app.get("/api/units", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM rescue_unit
      ORDER BY unit_id
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching rescue units:", error);

    res.status(500).json({
      message: "Failed to fetch rescue units"
    });
  }
});

// ===============================
// GET ROAD NODES
// ===============================

app.get("/api/incidents", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM incident
      ORDER BY incident_id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching incidents:", error);

    res.status(500).json({
      message: "Failed to fetch incidents",
      error: error.message
    });
  }
});

// ===============================
// GET ROAD EDGES
// ===============================

app.get("/api/edges", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM road_edge
      ORDER BY edge_id
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching road edges:", error);

    res.status(500).json({
      message: "Failed to fetch road edges"
    });
  }
});

// ===============================
// GET DISPATCHES
// ===============================

app.get("/api/dispatches", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM dispatch
      ORDER BY dispatch_id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching dispatches:", error);

    res.status(500).json({
      message: "Failed to fetch dispatches"
    });
  }
});

// ===============================
// GET SYSTEM LOGS
// ===============================

app.get("/api/logs", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM system_log
      ORDER BY log_id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching system logs:", error);

    res.status(500).json({
      message: "Failed to fetch system logs"
    });
  }
});

// ===============================
// Start Server
// ===============================

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});