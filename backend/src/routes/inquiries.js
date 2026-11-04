const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const db = require("../db");
const { sendInquiryEmail } = require("../mailer");
const adminAuth = require("../middleware/adminAuth");
const logger = require("../logger");
const { inquirySchema, statusSchema, parseOrErrors } = require("../schemas");

const router = express.Router();

// Public form submissions are rate-limited to blunt basic spam/abuse.
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many submissions from this address. Please try again later." }
});

/**
 * POST /api/inquiries — public. Validates, stores, emails the business.
 */
router.post("/", submitLimiter, async (req, res) => {
  const { data, errors } = parseOrErrors(inquirySchema, req.body);
  if (errors) return res.status(400).json({ ok: false, errors });

  const inquiry = {
    id: crypto.randomUUID(),
    ...data,
    status: "New",
    createdAt: new Date().toISOString()
  };

  try {
    await db.insert(inquiry);
  } catch (err) {
    logger.error("Inquiry DB insert failed", { error: err.message });
    return res.status(500).json({ ok: false, error: "Failed to save inquiry." });
  }

  let emailResult = { sent: false };
  try {
    emailResult = await sendInquiryEmail(inquiry);
  } catch (err) {
    logger.error("Inquiry email send failed", { error: err.message });
    emailResult = { sent: false, reason: err.message };
  }

  res.status(201).json({ ok: true, inquiry, email: emailResult });
});

/**
 * GET /api/inquiries — admin only. Newest first.
 */
router.get("/", adminAuth, async (req, res) => {
  try {
    const inquiries = await db.readAll();
    res.json({ ok: true, inquiries });
  } catch (err) {
    logger.error("Inquiry DB read failed", { error: err.message });
    res.status(500).json({ ok: false, error: "Failed to load inquiries." });
  }
});

/**
 * PATCH /api/inquiries/:id — admin only. Body: { status }
 */
router.patch("/:id", adminAuth, async (req, res) => {
  const { data, errors } = parseOrErrors(statusSchema, req.body);
  if (errors) return res.status(400).json({ ok: false, error: errors.status || "Invalid status." });
  try {
    const updated = await db.updateStatus(req.params.id, data.status);
    if (!updated) return res.status(404).json({ ok: false, error: "Inquiry not found." });
    res.json({ ok: true, inquiry: updated });
  } catch (err) {
    logger.error("Inquiry DB update failed", { error: err.message });
    res.status(500).json({ ok: false, error: "Failed to update inquiry." });
  }
});

module.exports = router;
