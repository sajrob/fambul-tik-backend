require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");

const app = express();
const port = 5000;

// Database connection pool
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Test database connection
pool.connect((err, client, done) => {
  if (err) {
    console.error("Database connection error:", err.stack);
    return;
  }
  console.log("Successfully connected to the PostgreSQL database!");
  client.release();
});

// Middleware to parse JSON bodies from incoming requests
app.use(express.json());
app.use(cors());

// Basic welcome route
app.get("/", (req, res) => {
  res.send("Welcome to the Fambul Tik Backend API!");
});

// --- API Endpoints for Members ---

// POST /api/members - Add a new family member
app.post("/api/members", async (req, res) => {
  const { first_name, middle_name, last_name, dob, dod, is_alive } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO members (first_name, middle_name, last_name, dob, dod, is_alive) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [first_name, middle_name, last_name, dob, dod, is_alive]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error adding member:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/members - Get all family members
app.get("/api/members", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM members ORDER BY first_name, last_name"
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching members:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/members/:id - Get a single family member by ID
app.get("/api/members/:id", async (req, res) => {
  const { id } = req.params; // ID is expected as UUID string from URL
  try {
    const result = await pool.query("SELECT * FROM members WHERE id = $1", [
      id,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Member not found" });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching member by ID:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// DELETE /api/members/:id - Delete a family member
app.delete("/api/members/:id", async (req, res) => {
  const { id } = req.params; // ID is expected as UUID string from URL
  try {
    const result = await pool.query(
      "DELETE FROM members WHERE id = $1 RETURNING *",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Member not found" });
    }
    // For a DELETE, a 204 No Content is often used, or 200 OK with a confirmation message.
    // Let's use 200 OK with a message for clearer frontend feedback.
    res.status(200).json({
      message: "Member deleted successfully",
      deletedMember: result.rows[0],
    });
  } catch (err) {
    console.error("Error deleting member:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PUT /api/members/:id - Update a family member
app.put("/api/members/:id", async (req, res) => {
  const { id } = req.params; // ID is expected as UUID string from URL
  const { first_name, middle_name, last_name, dob, dod, is_alive } = req.body;
  try {
    const result = await pool.query(
      `UPDATE members
       SET first_name = $1, middle_name = $2, last_name = $3, dob = $4, dod = $5, is_alive = $6
       WHERE id = $7
       RETURNING *`,
      [first_name, middle_name, last_name, dob, dod, is_alive, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Member not found" });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Error updating member:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// --- API Endpoints for Relationship Types ---

// POST /api/relationship_types - Add a new relationship type
app.post("/api/relationship_types", async (req, res) => {
  const { name, is_standard } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO relationship_types (name, is_standard) VALUES ($1, $2) RETURNING *",
      [name, is_standard]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error adding relationship type:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/relationship_types - Get all relationship types
app.get("/api/relationship_types", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, is_standard FROM relationship_types ORDER BY name"
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching relationship types:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/relationship_types/:id - Get a single relationship type by ID
app.get("/api/relationship_types/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "SELECT id, name, is_standard FROM relationship_types WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Relationship type not found" });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching relationship type by ID:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// PUT /api/relationship_types/:id - Update a relationship type
app.put("/api/relationship_types/:id", async (req, res) => {
  const { id } = req.params;
  const { name, is_standard } = req.body;
  try {
    const result = await pool.query(
      "UPDATE relationship_types SET name = COALESCE($1, name), is_standard = COALESCE($2, is_standard) WHERE id = $3 RETURNING *",
      [name, is_standard, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Relationship type not found" });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Error updating relationship type:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// DELETE /api/relationship_types/:id - Delete a relationship type
app.delete("/api/relationship_types/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM relationship_types WHERE id = $1 RETURNING *",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Relationship type not found" });
    }
    res.status(204).send(); // No content for successful delete
  } catch (err) {
    console.error("Error deleting relationship type:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// --- API Endpoints for Relationships ---

// POST /api/relationships - Add a new relationship between two members
app.post("/api/relationships", async (req, res) => {
  // All IDs are now expected as UUID strings from the frontend
  const { member_id_1, member_id_2, relationship_type_id } = req.body;
  try {
    // Basic validation: ensure member_id_1 and member_id_2 are different
    if (member_id_1 === member_id_2) {
      return res.status(400).json({
        error: "Cannot create a relationship with the same member ID.",
      });
    }

    const result = await pool.query(
      "INSERT INTO relationships (member_id_1, member_id_2, relationship_type_id) VALUES ($1, $2, $3) RETURNING *",
      [member_id_1, member_id_2, relationship_type_id]
    );
    res.status(201).json(result.rows[0]); // Return the newly created relationship
  } catch (err) {
    console.error("Error adding relationship:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/relationships - Get all relationships
app.get("/api/relationships", async (req, res) => {
  try {
    // Using LEFT JOINs to be robust if some relationships have missing member data
    const result = await pool.query(`
      SELECT
          r.id,
          r.member_id_1,
          m1.first_name AS member_1_first_name,
          m1.middle_name AS member_1_middle_name,
          m1.last_name AS member_1_last_name,
          r.member_id_2,
          m2.first_name AS member_2_first_name,
          m2.middle_name AS member_2_middle_name,
          m2.last_name AS member_2_last_name,
          r.relationship_type_id,
          rt.name AS relationship_type_name
      FROM relationships r
      LEFT JOIN members m1 ON r.member_id_1 = m1.id
      LEFT JOIN members m2 ON r.member_id_2 = m2.id
      LEFT JOIN relationship_types rt ON r.relationship_type_id = rt.id
      ORDER BY r.id
    `);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching all relationships:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/relationships/:memberId - Get all relationships for a specific member
app.get("/api/relationships/:memberId", async (req, res) => {
  const { memberId } = req.params; // Expecting UUID string from URL
  try {
    const result = await pool.query(
      `
      SELECT
          r.id,
          r.member_id_1,
          m1.first_name AS member_1_first_name,
          m1.middle_name AS member_1_middle_name,
          m1.last_name AS member_1_last_name,
          r.member_id_2,
          m2.first_name AS member_2_first_name,
          m2.middle_name AS member_2_middle_name,
          m2.last_name AS member_2_last_name,
          r.relationship_type_id,
          rt.name AS relationship_type_name
      FROM relationships r
      LEFT JOIN members m1 ON r.member_id_1 = m1.id
      LEFT JOIN members m2 ON r.member_id_2 = m2.id
      LEFT JOIN relationship_types rt ON r.relationship_type_id = rt.id
      WHERE r.member_id_1 = $1 OR r.member_id_2 = $1
      ORDER BY r.id
    `,
      [memberId]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(
      `Error fetching relationships for member ${memberId}:`,
      err.message
    );
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Start the server
app.listen(port, () => {
  console.log(` --> Server is running on http://localhost:${port}`);
});
