/**
 * Postgres-backed persistence for inquiries.
 *
 * Uses the "pg" driver directly (no ORM needed for a table this small).
 * The exported contract — readAll(), insert(inquiry), updateStatus(id, status) —
 * is what routes/inquiries.js calls; nothing else needs to know this is Postgres.
 *
 * Connection settings come from env vars (see backend/.env.example):
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 *
 * Schema is owned by backend/migrations/ + src/migrate.js, run once at
 * startup from server.js — this file no longer creates tables itself.
 */
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "td_motors",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || ""
});

// Map a DB row (snake_case) to the camelCase shape the rest of the app expects.
function toInquiry(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    brand: row.brand,
    model: row.model,
    service: row.service,
    preferred: row.preferred,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined
  };
}

async function readAll() {
  const { rows } = await pool.query(
    "SELECT * FROM inquiries ORDER BY created_at DESC"
  );
  return rows.map(toInquiry);
}

async function insert(inquiry) {
  const { rows } = await pool.query(
    `INSERT INTO inquiries
       (id, name, phone, email, brand, model, service, preferred, message, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      inquiry.id,
      inquiry.name,
      inquiry.phone,
      inquiry.email,
      inquiry.brand || "",
      inquiry.model || "",
      inquiry.service,
      inquiry.preferred || "",
      inquiry.message || "",
      inquiry.status || "New",
      inquiry.createdAt || new Date().toISOString()
    ]
  );
  return toInquiry(rows[0]);
}

async function updateStatus(id, status) {
  const { rows } = await pool.query(
    `UPDATE inquiries
       SET status = $2, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, status]
  );
  if (rows.length === 0) return null;
  return toInquiry(rows[0]);
}

module.exports = { pool, readAll, insert, updateStatus };
