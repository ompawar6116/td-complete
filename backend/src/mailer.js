/**
 * Sends the "New Customer Inquiry" email over SMTP.
 *
 * Credentials come only from process.env (populated by dotenv from a local
 * .env file that is NOT committed to git — see .gitignore and .env.example).
 * Nothing in this file, or anywhere the browser can reach, contains a
 * password or API secret. If SMTP isn't configured yet, sending is skipped
 * and the inquiry is still saved — the frontend's own mailto: fallback
 * covers that gap during development.
 */
const nodemailer = require("nodemailer");
const logger = require("./logger");

let cachedTransporter = null;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  cachedTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: SMTP_SECURE === "true", // true for port 465, false for 587/STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  return cachedTransporter;
}

async function sendInquiryEmail(inquiry) {
  const transporter = getTransporter();
  if (!transporter) {
    logger.info("SMTP not configured — inquiry saved to the database only, no email sent.");
    return { sent: false, reason: "SMTP not configured" };
  }

  const to = process.env.BUSINESS_EMAIL || process.env.SMTP_USER;
  const subject = `New Customer Inquiry — ${inquiry.service}`;
  const text = [
    "New Customer Inquiry",
    `Name: ${inquiry.name}`,
    `Mobile: ${inquiry.phone}`,
    `Email: ${inquiry.email}`,
    `Interested Brand: ${inquiry.brand || "Not specified"}`,
    `Car Model: ${inquiry.model || "Not specified"}`,
    `Requirement: ${inquiry.service}`,
    `Preferred Date/Time: ${inquiry.preferred || "Not specified"}`,
    `Message: ${inquiry.message || "—"}`
  ].join("\n");

  const html = `
    <h2 style="font-family:sans-serif;">New Customer Inquiry</h2>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;">
      ${[
        ["Name", inquiry.name],
        ["Mobile", inquiry.phone],
        ["Email", inquiry.email],
        ["Interested Brand", inquiry.brand || "Not specified"],
        ["Car Model", inquiry.model || "Not specified"],
        ["Requirement", inquiry.service],
        ["Preferred Date/Time", inquiry.preferred || "Not specified"],
        ["Message", inquiry.message || "—"]
      ].map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666;">${escapeHtml(k)}</td><td style="padding:4px 0;"><strong>${escapeHtml(v)}</strong></td></tr>`).join("")}
    </table>
  `;

  await transporter.sendMail({
    from: `"TD Motors Website" <${process.env.SMTP_USER}>`,
    to,
    replyTo: inquiry.email,
    subject,
    text,
    html
  });
  return { sent: true };
}

module.exports = { sendInquiryEmail };
