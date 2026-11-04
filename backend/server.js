/**
 * TD Motors — backend entry point.
 *
 * Responsibilities:
 *  - Accept inquiry submissions from the frontend (POST /api/inquiries)
 *  - Serve/manage car inventory (GET/POST/PUT/DELETE /api/cars)
 *  - Persist both to Postgres (src/db.js, src/carsDb.js)
 *  - Email the business inbox via SMTP (src/mailer.js) — credentials live
 *    only here, in server-side environment variables, never in any file
 *    the browser downloads.
 *  - Serve a small JWT-protected admin dashboard at /admin.
 *
 * Startup sequence: validate env -> run DB migrations -> seed cars if
 * empty -> start listening. Any failure in that chain exits with a clear
 * message instead of starting in a half-working state.
 *
 * Run with:  npm install && npm run dev   (see README.md for full setup)
 */
require("dotenv").config();
const { validateEnv } = require("./src/env");
validateEnv(); // exits the process immediately if misconfigured — do this first

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");

const logger = require("./src/logger");
const migrate = require("./src/migrate");
const carsDb = require("./src/carsDb");
const { pool } = require("./src/db");
const upload = require("./src/upload");

const inquiriesRouter = require("./src/routes/inquiries");
const carsRouter = require("./src/routes/cars");
const configRouter = require("./src/routes/config");
const adminAuthRouter = require("./src/routes/adminAuth");

const app = express();
const PORT = process.env.PORT || 4000;

// ---- Core middleware ----
app.use(helmet({
  // The admin dashboard is plain HTML/JS served same-origin with inline
  // event handlers removed, but keeping CSP permissive for now avoids
  // silently breaking the dashboard; tighten this once it's the only
  // thing served from /admin and audited for inline scripts.
  contentSecurityPolicy: false
}));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map(s => s.trim()) : "*"
  })
);
app.use(express.json());

// ---- Health check ----
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "td-motors-backend", time: new Date().toISOString() });
});

// ---- API routes ----
app.use("/api/admin", adminAuthRouter);   // POST /api/admin/login (public, rate-limited)
app.use("/api/config", configRouter);     // GET  /api/config      (public, read-only)
app.use("/api/inquiries", inquiriesRouter);
app.use("/api/cars", carsRouter);

// ---- Uploaded car photos. helmet defaults to "same-origin" for resource
// policy, which would stop the website (a different origin) from showing
// these images, so it is relaxed for this folder only. ----
app.use("/uploads", (req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}, express.static(upload.UPLOAD_DIR, { index: false, maxAge: "7d" }));

// ---- Admin dashboard (static, calls the API above with a bearer token) ----
app.use("/admin", express.static(path.join(__dirname, "admin")));

// ---- 404 fallback for unknown API routes ----
app.use("/api", (req, res) => {
  res.status(404).json({ ok: false, error: "Not found." });
});

// ---- Startup: migrate schema, seed inventory if empty, then listen ----
let server;
migrate.run()
  .then(() => carsDb.seedIfEmpty())
  .then(() => {
    server = app.listen(PORT, () => {
      logger.info("TD Motors backend listening", { port: PORT });
      console.log(`TD Motors backend listening on http://localhost:${PORT}`);
      console.log(`Admin dashboard:               http://localhost:${PORT}/admin`);
      if (!process.env.SMTP_HOST) {
        console.warn("⚠️  SMTP_* variables are not set — inquiries will be saved but no email will be sent. See .env.example.");
      }
    });
  })
  .catch(err => {
    logger.error("Startup failed", { error: err.message });
    console.error("❌ Could not migrate the database / start the server. Check DB_* vars in .env.");
    console.error(err.message);
    process.exit(1);
  });

// ---- Graceful shutdown: stop accepting new requests, then close the pool ----
function shutdown(signal) {
  logger.info("Shutting down", { signal });
  if (!server) return pool.end().then(() => process.exit(0));
  server.close(() => {
    pool.end().then(() => {
      logger.info("Shutdown complete.");
      process.exit(0);
    });
  });
  // Force-exit if something hangs during shutdown.
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
