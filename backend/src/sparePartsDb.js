/**
 * Postgres-backed CRUD for spare parts stock.
 *
 * Same contract style as carsDb.js: a small set of functions that
 * routes/spareParts.js calls. Schema lives in migrations/004_spare_parts.sql.
 *
 * Stock status is never stored — it is worked out from quantity and the
 * part's low-stock level every time (see stockStatus), so it can't drift
 * out of sync with the quantity.
 */
const crypto = require("crypto");
const { pool } = require("./db");

function stockStatus(quantity, lowStockThreshold) {
  if (quantity <= 0) return "Out of Stock";
  if (quantity <= lowStockThreshold) return "Low Stock";
  return "In Stock";
}

function toPart(row) {
  const quantity = Number(row.quantity);
  const lowStockThreshold = Number(row.low_stock_threshold);
  return {
    id: row.id,
    name: row.name,
    partNumber: row.part_number,
    category: row.category,
    brand: row.brand,
    compatibleWith: row.compatible_with,
    price: Number(row.price),
    quantity,
    lowStockThreshold,
    description: row.description,
    status: stockStatus(quantity, lowStockThreshold),
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined
  };
}

/** Totals shown on the cards at the top of the admin Spare Parts tab. */
function summarize(parts) {
  const summary = { totalParts: parts.length, totalUnits: 0, inStock: 0, lowStock: 0, outOfStock: 0, stockValue: 0 };
  for (const p of parts) {
    summary.totalUnits += p.quantity;
    summary.stockValue += p.quantity * p.price;
    if (p.status === "In Stock") summary.inStock++;
    else if (p.status === "Low Stock") summary.lowStock++;
    else summary.outOfStock++;
  }
  summary.stockValue = Math.round(summary.stockValue * 100) / 100;
  return summary;
}

async function listParts() {
  const { rows } = await pool.query("SELECT * FROM spare_parts ORDER BY name ASC");
  return rows.map(toPart);
}

async function getPart(id) {
  const { rows } = await pool.query("SELECT * FROM spare_parts WHERE id = $1", [id]);
  return rows[0] ? toPart(rows[0]) : null;
}

async function insertPart(p) {
  const { rows } = await pool.query(
    `INSERT INTO spare_parts
       (id, name, part_number, category, brand, compatible_with, price, quantity, low_stock_threshold, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [crypto.randomUUID(), p.name, p.partNumber, p.category, p.brand || "", p.compatibleWith || "",
     p.price, p.quantity, p.lowStockThreshold, p.description || ""]
  );
  return toPart(rows[0]);
}

async function updatePart(id, p) {
  const { rows } = await pool.query(
    `UPDATE spare_parts SET
       name = $2, part_number = $3, category = $4, brand = $5, compatible_with = $6,
       price = $7, quantity = $8, low_stock_threshold = $9, description = $10,
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, p.name, p.partNumber, p.category, p.brand || "", p.compatibleWith || "",
     p.price, p.quantity, p.lowStockThreshold, p.description || ""]
  );
  return rows[0] ? toPart(rows[0]) : null;
}

async function setQuantity(id, quantity) {
  const { rows } = await pool.query(
    "UPDATE spare_parts SET quantity = $2, updated_at = now() WHERE id = $1 RETURNING *",
    [id, quantity]
  );
  return rows[0] ? toPart(rows[0]) : null;
}

async function deletePart(id) {
  const { rowCount } = await pool.query("DELETE FROM spare_parts WHERE id = $1", [id]);
  return rowCount > 0;
}

module.exports = { stockStatus, summarize, listParts, getPart, insertPart, updatePart, setQuantity, deletePart };
