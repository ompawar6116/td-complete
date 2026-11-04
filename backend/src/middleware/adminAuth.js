/**
 * Admin auth, upgraded from the original design (which sent the raw
 * ADMIN_PASSWORD as a Bearer token on every single request — meaning the
 * shared password was retransmitted, and sat in sessionStorage, in plain
 * form, for the whole session).
 *
 * Now: the password is sent ONCE, to POST /api/admin/login (see
 * routes/adminAuth.js), which verifies it and issues a short-lived JWT.
 * Every other admin request carries that JWT instead of the password
 * itself, and it expires on its own (see ADMIN_JWT_EXPIRES_IN) — so a
 * captured token is worth less, and for less time, than a captured
 * password would be.
 *
 * This is still a single shared admin identity, not per-staff accounts —
 * that's an intentional scoping decision for "one shop, a couple of
 * staff, one shared login," named here rather than hidden. A multi-user
 * admin panel with individual accounts and audit trails would need a
 * users table and proper sessions instead.
 */
const jwt = require("jsonwebtoken");

module.exports = function adminAuth(req, res, next) {
  if (!process.env.ADMIN_JWT_SECRET) {
    return res.status(500).json({ ok: false, error: "Server misconfigured: ADMIN_JWT_SECRET is not set." });
  }
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, error: "Unauthorized." });
  }
  try {
    jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    next();
  } catch (err) {
    const message = err.name === "TokenExpiredError" ? "Session expired. Please log in again." : "Unauthorized.";
    res.status(401).json({ ok: false, error: message });
  }
};
