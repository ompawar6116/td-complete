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

/**
 * Builds the email a customer receives when the admin replies to their
 * inquiry. Pure function (no I/O) so it can be unit-tested.
 */
function buildReplyEmail(inquiry, message) {
  const subject = `Re: Your TD Motors inquiry — ${inquiry.service}`;
  const text = [
    `Hi ${inquiry.name},`,
    "",
    message,
    "",
    "Regards,",
    "TD Motors, Kharadi, Pune",
    "",
    "—",
    `You wrote to us about: ${inquiry.service}`,
    inquiry.message ? `Your message: ${inquiry.message}` : ""
  ].filter((line, i, arr) => !(line === "" && arr[i - 1] === "" )).join("\n");

  const html = `
    <div style="font-family:sans-serif;font-size:15px;line-height:1.55;color:#222;">
      <p>Hi ${escapeHtml(inquiry.name)},</p>
      <p>${escapeHtml(message).replace(/\r?\n/g, "<br>")}</p>
      <p>Regards,<br><strong>TD Motors</strong><br>Kharadi, Pune</p>
      <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">
      <p style="font-size:13px;color:#777;">You wrote to us about: ${escapeHtml(inquiry.service)}${inquiry.message ? `<br>Your message: ${escapeHtml(inquiry.message)}` : ""}</p>
    </div>
  `;
  return { subject, text, html };
}

/**
 * Emails the admin's reply to the customer who made the inquiry.
 * Returns { sent: true } or { sent: false, reason } — it never throws for
 * "SMTP not configured"; real send errors are thrown for the caller to log.
 */
async function sendReplyEmail(inquiry, message) {
  const transporter = getTransporter();
  if (!transporter) {
    logger.info("SMTP not configured — reply saved to the database only, no email sent.");
    return { sent: false, reason: "SMTP not configured" };
  }
  const { subject, text, html } = buildReplyEmail(inquiry, message);
  const businessEmail = process.env.BUSINESS_EMAIL || process.env.SMTP_USER;
  await transporter.sendMail({
    from: `"TD Motors" <${process.env.SMTP_USER}>`,
    to: inquiry.email,
    replyTo: businessEmail, // when the customer hits Reply, it goes to the business inbox
    subject,
    text,
    html
  });
  return { sent: true };
}

module.exports = { sendInquiryEmail, sendReplyEmail, buildReplyEmail };
