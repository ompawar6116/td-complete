/**
 * A deliberately small migration runner — not node-pg-migrate or Knex.
 * Each file in backend/migrations/ is plain SQL, applied once, in filename
 * order, tracked in a schema_migrations table so it's never re-applied.
 *
 * This replaces the old approach (CREATE TABLE IF NOT EXISTS scattered
 * across db.js/carsDb.js, run on every boot) with something that can
 * safely evolve the schema over time: to change a column later, add a new
 * numbered .sql file — never edit an old one that's already shipped.
 *
 * Run automatically on server startup (see server.js), or by hand:
 *   npm run migrate
 */
const fs = require("fs");
const path = require("path");

// Load .env before requiring ./db below — the pool is constructed at
// require-time from process.env, so this must run first. server.js already
// calls dotenv.config() before requiring anything, but `npm run migrate`
// runs this file standalone, so it needs its own call, done unconditionally
// (not inside the require.main check) to cover both cases.
require("dotenv").config();

const { pool } = require("./db");
const logger = require("./logger");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const files = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort()
    : [];

  const { rows } = await pool.query("SELECT filename FROM schema_migrations");
  const applied = new Set(rows.map(r => r.filename));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      logger.info("Applied migration", { file });
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${err.message}`);
    } finally {
      client.release();
    }
  }

  if (files.length === applied.size) {
    logger.info("Database schema up to date", { migrations: files.length });
  }
}

// Allow `npm run migrate` to run this file directly, outside server startup.
if (require.main === module) {
  run()
    .then(() => { logger.info("Migrations complete."); process.exit(0); })
    .catch(err => { logger.error("Migration failed", { error: err.message }); process.exit(1); });
}

module.exports = { run };
