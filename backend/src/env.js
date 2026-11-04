/**
 * Validates required environment variables at startup and exits immediately
 * with a clear message if any are missing — instead of the previous
 * behaviour, where a missing ADMIN_PASSWORD or DB_* var only surfaced as a
 * cryptic failure on the first request that needed it.
 */
const REQUIRED = ["ADMIN_PASSWORD", "ADMIN_JWT_SECRET", "DB_HOST", "DB_PORT", "DB_NAME", "DB_USER"];
// DB_PASSWORD is deliberately not required — a local Postgres install with
// trust auth for the current OS user has no password, and that's valid.

function validateEnv() {
  const missing = REQUIRED.filter(key => !process.env[key] || !String(process.env[key]).trim());
  if (missing.length) {
    console.error("❌ Missing required environment variable(s): " + missing.join(", "));
    console.error("   Check backend/.env against backend/.env.example, then restart.");
    process.exit(1);
  }
  if (process.env.ADMIN_JWT_SECRET.length < 16) {
    console.error("❌ ADMIN_JWT_SECRET is too short (needs 16+ characters). Generate one with:");
    console.error(`   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
    process.exit(1);
  }
}

module.exports = { validateEnv };
