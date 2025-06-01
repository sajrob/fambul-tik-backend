// server.js

require("dotenv").config(); // Add this line at the very top of the file

const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
const port = 5000;

// PostgreSQL connection pool - now using environment variables
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Middleware
app.use(cors());
app.use(express.json());

// --- Routes ---

// Test DB connection
app.get("/test-db", async (req, res) => {
  try {
    const client = await pool.connect();
    res.status(200).send("Database connected successfully!");
    client.release();
  } catch (err) {
    console.error("Database connection error", err);
    res.status(500).send("Database connection failed");
  }
});

// Get all members - MODIFIED
app.get("/api/members", async (req, res) => {
  try {
    // Aligned with existing DB columns: middle_name, dob, dod, is_alive
    const result = await pool.query(
      "SELECT id, first_name, middle_name, last_name, dob, dod, is_alive FROM members ORDER BY first_name, last_name"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching members:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Add a new member - MODIFIED
app.post("/api/members", async (req, res) => {
  // Aligned with existing DB columns: middle_name, dob, dod, is_alive
  const { first_name, middle_name, last_name, dob, dod, is_alive } = req.body;
  try {
    const id = uuidv4(); // Generate a UUID for the new member
    const result = await pool.query(
      "INSERT INTO members (id, first_name, middle_name, last_name, dob, dod, is_alive) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [id, first_name, middle_name, last_name, dob, dod, is_alive]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error adding member:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update a member - MODIFIED
app.put("/api/members/:id", async (req, res) => {
  const { id } = req.params;
  // Aligned with existing DB columns: middle_name, dob, dod, is_alive
  const { first_name, middle_name, last_name, dob, dod, is_alive } = req.body;
  try {
    const result = await pool.query(
      "UPDATE members SET first_name = $1, middle_name = $2, last_name = $3, dob = $4, dod = $5, is_alive = $6 WHERE id = $7 RETURNING *",
      [first_name, middle_name, last_name, dob, dod, is_alive, id]
    );
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(404).json({ error: "Member not found" });
    }
  } catch (err) {
    console.error("Error updating member:", err);
    // Check for foreign key constraint violation
    if (err.code === "23503") {
      // PostgreSQL foreign key violation error code
      res.status(400).json({
        error:
          "Cannot delete member: This member is linked to one or more relationships. Please delete relationships first.",
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Delete a member
app.delete("/api/members/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM members WHERE id = $1 RETURNING *",
      [id]
    );
    if (result.rows.length > 0) {
      res.json({
        message: "Member deleted successfully",
        member: result.rows[0],
      });
    } else {
      res.status(404).json({ error: "Member not found" });
    }
  } catch (err) {
    console.error("Error deleting member:", err);
    // Check for foreign key constraint violation
    if (err.code === "23503") {
      // PostgreSQL foreign key violation error code
      res.status(400).json({
        error:
          "Cannot delete member: This member is linked to one or more relationships. Please delete relationships first.",
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Get all relationship types
app.get("/api/relationship_types", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, inverse_type_id FROM relationship_types ORDER BY name"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching relationship types:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all relationships (with member names and type name)
app.get("/api/relationships", async (req, res) => {
  try {
    const query = `
            SELECT
                r.id,
                r.member_id_1,
                m1.first_name AS member1_first_name,
                m1.last_name AS member1_last_name,
                r.relationship_type_id,
                rt.name AS relationship_type_name,
                rt.inverse_type_id, -- Include inverse_type_id
                r.member_id_2,
                m2.first_name AS member2_first_name,
                m2.last_name AS member2_last_name
            FROM
                relationships r
            JOIN
                members m1 ON r.member_id_1 = m1.id
            JOIN
                members m2 ON r.member_id_2 = m2.id
            JOIN
                relationship_types rt ON r.relationship_type_id = rt.id
            ORDER BY
                m1.first_name, rt.name, m2.first_name;
        `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching relationships:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Add a new relationship (and its inverse if applicable)
app.post("/api/relationships", async (req, res) => {
  const { member_id_1, relationship_type_id, member_id_2 } = req.body;
  let client; // Declare client outside try block for finally block access

  try {
    client = await pool.connect();
    await client.query("BEGIN"); // Start transaction

    // 1. Insert the primary relationship
    const primaryRelationshipId = uuidv4();
    await client.query(
      "INSERT INTO relationships (id, member_id_1, relationship_type_id, member_id_2) VALUES ($1, $2, $3, $4)",
      [primaryRelationshipId, member_id_1, relationship_type_id, member_id_2]
    );

    // 2. Check for inverse relationship type
    const typeResult = await client.query(
      "SELECT inverse_type_id FROM relationship_types WHERE id = $1",
      [relationship_type_id]
    );

    if (typeResult.rows.length > 0 && typeResult.rows[0].inverse_type_id) {
      const inverse_type_id = typeResult.rows[0].inverse_type_id;

      // Prevent creating inverse of self (e.g., Spouse is inverse of Spouse) if IDs are the same
      // And prevent creating duplicate inverse if the inverse relationship is already defined
      // This also prevents infinite loops if A->B and B->A are both set as inverses of each other
      if (
        inverse_type_id !== relationship_type_id ||
        member_id_1 !== member_id_2
      ) {
        // For self-inverse types like Spouse, Chosen Sibling, Sibling, Co-Wife, Cousin
        // Check if the inverse relationship already exists
        const existingInverse = await client.query(
          "SELECT id FROM relationships WHERE member_id_1 = $1 AND relationship_type_id = $2 AND member_id_2 = $3",
          [member_id_2, inverse_type_id, member_id_1]
        );

        if (existingInverse.rows.length === 0) {
          const inverseRelationshipId = uuidv4();
          await client.query(
            "INSERT INTO relationships (id, member_id_1, relationship_type_id, member_id_2) VALUES ($1, $2, $3, $4)",
            [inverseRelationshipId, member_id_2, inverse_type_id, member_id_1]
          );
          console.log(
            `Created inverse relationship: ${member_id_2} is ${inverse_type_id} of ${member_id_1}`
          );
        } else {
          console.log(
            `Inverse relationship already exists for ${member_id_2} as ${inverse_type_id} of ${member_id_1}. Skipping.`
          );
        }
      } else {
        console.log(
          `Relationship type ${relationship_type_id} is its own inverse and members are the same, skipping inverse creation.`
        );
      }
    } else {
      console.log(
        `No inverse type defined for relationship_type_id: ${relationship_type_id}`
      );
    }

    await client.query("COMMIT"); // Commit transaction
    res.status(201).json({ message: "Relationship(s) added successfully!" });
  } catch (err) {
    await client.query("ROLLBACK"); // Rollback on error
    console.error("Error adding relationship(s):", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    if (client) {
      client.release(); // Release client back to the pool
    }
  }
});

// Update a relationship
app.put("/api/relationships/:id", async (req, res) => {
  const { id } = req.params;
  const { member_id_1, relationship_type_id, member_id_2 } = req.body;
  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN"); // Start transaction

    // 1. Get the current relationship details (including old member_id_1, member_id_2, and relationship_type_id)
    // This is needed to potentially delete the old inverse if the relationship type changed
    const oldRelationshipQuery = await client.query(
      "SELECT member_id_1, member_id_2, relationship_type_id FROM relationships WHERE id = $1",
      [id]
    );
    const oldRel = oldRelationshipQuery.rows[0];

    if (!oldRel) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Relationship not found" });
    }

    // 2. Delete the old inverse relationship (if it existed and is different from the new one)
    const oldInverseTypeResult = await client.query(
      "SELECT inverse_type_id FROM relationship_types WHERE id = $1",
      [oldRel.relationship_type_id]
    );
    const oldInverseTypeId =
      oldInverseTypeResult.rows.length > 0
        ? oldInverseTypeResult.rows[0].inverse_type_id
        : null;

    if (oldInverseTypeId) {
      // Check if the old inverse itself was a self-inverse
      const isOldSelfInverse = oldInverseTypeId === oldRel.relationship_type_id;

      // Delete the old inverse, but only if it's not the primary relationship itself (in case of self-inverse where member IDs are swapped)
      if (!(isOldSelfInverse && oldRel.member_id_1 === oldRel.member_id_2)) {
        await client.query(
          "DELETE FROM relationships WHERE member_id_1 = $1 AND relationship_type_id = $2 AND member_id_2 = $3",
          [oldRel.member_id_2, oldInverseTypeId, oldRel.member_id_1]
        );
      }
    }

    // 3. Update the primary relationship
    const result = await client.query(
      "UPDATE relationships SET member_id_1 = $1, relationship_type_id = $2, member_id_2 = $3 WHERE id = $4 RETURNING *",
      [member_id_1, relationship_type_id, member_id_2, id]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Relationship not found" });
    }

    // 4. Create the new inverse relationship (if applicable)
    const newTypeResult = await client.query(
      "SELECT inverse_type_id FROM relationship_types WHERE id = $1",
      [relationship_type_id]
    );
    const newInverseTypeId =
      newTypeResult.rows.length > 0
        ? newTypeResult.rows[0].inverse_type_id
        : null;

    if (newInverseTypeId) {
      // Prevent creating inverse of self (e.g., Spouse is inverse of Spouse) if IDs are the same
      if (
        newInverseTypeId !== relationship_type_id ||
        member_id_1 !== member_id_2
      ) {
        const existingInverse = await client.query(
          "SELECT id FROM relationships WHERE member_id_1 = $1 AND relationship_type_id = $2 AND member_id_2 = $3",
          [member_id_2, newInverseTypeId, member_id_1]
        );

        if (existingInverse.rows.length === 0) {
          const inverseRelationshipId = uuidv4();
          await client.query(
            "INSERT INTO relationships (id, member_id_1, relationship_type_id, member_id_2) VALUES ($1, $2, $3, $4)",
            [inverseRelationshipId, member_id_2, newInverseTypeId, member_id_1]
          );
          console.log(
            `Created new inverse relationship: ${member_id_2} is ${newInverseTypeId} of ${member_id_1}`
          );
        } else {
          console.log(
            `New inverse relationship already exists for ${member_id_2} as ${newInverseTypeId} of ${member_id_1}. Skipping.`
          );
        }
      } else {
        console.log(
          `New relationship type ${relationship_type_id} is its own inverse and members are the same, skipping new inverse creation.`
        );
      }
    }

    await client.query("COMMIT"); // Commit transaction
    res.json(result.rows[0]);
  } catch (err) {
    if (client) {
      await client.query("ROLLBACK"); // Rollback on error
    }
    console.error("Error updating relationship:", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    if (client) {
      client.release(); // Release client back to the pool
    }
  }
});

// Delete a relationship (and its inverse if applicable)
app.delete("/api/relationships/:id", async (req, res) => {
  const { id } = req.params;
  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN"); // Start transaction

    // 1. Get the relationship details before deleting
    const relationshipResult = await client.query(
      "SELECT member_id_1, member_id_2, relationship_type_id FROM relationships WHERE id = $1",
      [id]
    );

    const relationshipToDelete = relationshipResult.rows[0];

    if (!relationshipToDelete) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Relationship not found" });
    }

    // 2. Delete the primary relationship
    await client.query("DELETE FROM relationships WHERE id = $1", [id]);

    // 3. Check for and delete the inverse relationship if it exists
    const typeResult = await client.query(
      "SELECT inverse_type_id FROM relationship_types WHERE id = $1",
      [relationshipToDelete.relationship_type_id]
    );
    const inverse_type_id =
      typeResult.rows.length > 0 ? typeResult.rows[0].inverse_type_id : null;

    if (inverse_type_id) {
      // Check if the inverse itself was a self-inverse
      const isSelfInverse =
        inverse_type_id === relationshipToDelete.relationship_type_id;

      // Only delete the inverse if it's not the primary relationship itself (in case of self-inverse where member IDs are swapped)
      if (
        !(
          isSelfInverse &&
          relationshipToDelete.member_id_1 === relationshipToDelete.member_id_2
        )
      ) {
        await client.query(
          "DELETE FROM relationships WHERE member_id_1 = $1 AND relationship_type_id = $2 AND member_id_2 = $3",
          [
            relationshipToDelete.member_id_2,
            inverse_type_id,
            relationshipToDelete.member_id_1,
          ]
        );
        console.log(
          `Deleted inverse relationship for: ${relationshipToDelete.member_id_2} is ${inverse_type_id} of ${relationshipToDelete.member_id_1}`
        );
      } else {
        console.log(
          `Relationship type ${relationshipToDelete.relationship_type_id} is its own inverse and members are the same, skipping inverse deletion.`
        );
      }
    }

    await client.query("COMMIT"); // Commit transaction
    res.json({ message: "Relationship(s) deleted successfully!" });
  } catch (err) {
    if (client) {
      await client.query("ROLLBACK"); // Rollback on error
    }
    console.error("Error deleting relationship(s):", err);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    if (client) {
      client.release(); // Release client back to the pool
    }
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
