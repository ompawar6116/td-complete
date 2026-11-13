const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const db = require("../db");
const { sendInquiryEmail, sendReplyEmail } = require("../mailer");
const adminAuth = require("../middleware/adminAuth");
const logger = require("../logger");
const { inquirySchema, statusSchema, replySchema, parseOrErrors } = require("../schemas");

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/inquiries/:id/reply — admin only. Body: { message }
 *
 * Emails the message to the customer's address from the inquiry, saves it as
 * a reply (with whether the email went out), and moves a "New" inquiry to
 * "Contacted". If the email can't be sent the reply is still saved and the
 * response says so, so the admin can see it and try again.
 */
router.post("/:id/reply", adminAuth, async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ ok: false, error: "Inquiry not found." });
  const { data, errors } = parseOrErrors(replySchema, req.body);
  if (errors) return res.status(400).json({ ok: false, error: errors.message || "Invalid reply." });

  try {
    const inquiry = await db.getById(req.params.id);
    if (!inquiry) return res.status(404).json({ ok: false, error: "Inquiry not found." });

    let email = { sent: false };
    try {
      email = await sendReplyEmail(inquiry, data.message);
    } catch (err) {
      logger.error("Reply email send failed", { error: err.message });
      email = { sent: false, reason: err.message };
    }

    const reply = await db.insertReply({
      id: crypto.randomUUID(),
      inquiryId: inquiry.id,
      message: data.message,
      sentTo: inquiry.email,
      emailStatus: email.sent ? "sent" : (email.reason === "SMTP not configured" ? "skipped" : "failed"),
      emailError: email.sent ? "" : (email.reason || "")
    });

    let updated = inquiry;
    if (email.sent && inquiry.status === "New") {
      updated = (await db.updateStatus(inquiry.id, "Contacted")) || inquiry;
    }

    res.status(201).json({ ok: true, reply, inquiry: updated, email });
  } catch (err) {
    logger.error("Inquiry reply failed", { error: err.message });
    res.status(500).json({ ok: false, error: "Failed to save reply." });
  }
});

/**
 * GET /api/inquiries/:id/replies — admin only. Reply history, newest first.
 */
router.get("/:id/replies", adminAuth, async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ ok: false, error: "Inquiry not found." });
  try {
    const replies = await db.listReplies(req.params.id);
    res.json({ ok: true, replies });
  } catch (err) {
    logger.error("Inquiry replies read failed", { error: err.message });
    res.status(500).json({ ok: false, error: "Failed to load replies." });
  }
});

module.exports = router;
