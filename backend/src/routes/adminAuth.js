const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const logger = require("../logger");

const router = express.Router();

// Brute-force protection: a handful of attempts per window, per IP.
// This is the endpoint most worth protecting — it's the one guarding
// everything else in /admin.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many login attempts. Please wait a few minutes and try again." }
});

// Constant-time comparison — avoids leaking, via response timing, how many
// leading characters of a guessed password were correct.
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * POST /api/admin/login — public (but rate-limited). Body: { password }
 * Returns a JWT valid for ADMIN_JWT_EXPIRES_IN (default 12h) on success.
 */
router.post("/login", loginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_JWT_SECRET) {
    return res.status(500).json({ ok: false, error: "Server misconfigured: ADMIN_PASSWORD / ADMIN_JWT_SECRET not set." });
  }
  if (!password || !safeEqual(password, process.env.ADMIN_PASSWORD)) {
    logger.warn("Admin login failed", { ip: req.ip });
    return res.status(401).json({ ok: false, error: "Incorrect password." });
  }
  const token = jwt.sign(
    { role: "admin" },
    process.env.ADMIN_JWT_SECRET,
    { expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || "12h" }
  );
  logger.info("Admin login succeeded", { ip: req.ip });
  res.json({ ok: true, token });
});

module.exports = router;
