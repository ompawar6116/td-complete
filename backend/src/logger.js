/**
 * A deliberately small structured logger — not pino/winston. For a
 * single-process app this size, JSON lines to stdout with levels and PII
 * redaction covers the real need (searchable logs, no plaintext customer
 * data on error) without adding a dependency and its config surface.
 * If this app grows into multiple services or needs log shipping/alerting,
 * swap this file for pino — nothing else would need to change, since
 * every call site just does logger.info(...)/logger.error(...).
 */
const REDACT_KEYS = new Set(["email", "phone", "password", "pass", "token", "authorization"]);

function redact(meta) {
  if (!meta || typeof meta !== "object") return meta;
  const out = Array.isArray(meta) ? [] : {};
  for (const [k, v] of Object.entries(meta)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      out[k] = "[redacted]";
    } else if (v && typeof v === "object") {
      out[k] = redact(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function line(level, msg, meta) {
  const entry = { level, msg, time: new Date().toISOString(), ...(meta ? redact(meta) : {}) };
  const out = JSON.stringify(entry);
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

module.exports = {
  info: (msg, meta) => line("info", msg, meta),
  warn: (msg, meta) => line("warn", msg, meta),
  error: (msg, meta) => line("error", msg, meta)
};
