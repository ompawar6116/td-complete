/**
 * Car photo uploads.
 *
 * Files are validated by their real content (magic bytes), not the
 * filename or the browser-reported type, saved under UPLOAD_DIR
 * (default backend/uploads) and referenced from cars.image_url as a
 * relative path like "/uploads/tata-nexon-1730000000000.jpg". The
 * frontend prefixes that with the API address.
 */
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const UPLOAD_DIR = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(__dirname, "..", "uploads");
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/** Returns "jpg" | "png" | "webp", or null if the bytes are not one of those. */
function detectType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

const parser = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } }).single("image");

/** Express middleware: parses one multipart file field named "image". */
function receive(req, res, next) {
  parser(req, res, err => {
    if (!err) return next();
    const msg = err.code === "LIMIT_FILE_SIZE" ? "Image is too large (max 5 MB)." : "Upload failed. Send one image in the 'image' field.";
    res.status(400).json({ ok: false, error: msg });
  });
}

/** Validates + writes the image, returns its public path ("/uploads/..."). Throws {status:400} if not a real image. */
function saveBuffer(carId, buf) {
  const type = detectType(buf);
  if (!type) {
    const e = new Error("Only JPG, PNG or WebP images are allowed.");
    e.status = 400;
    throw e;
  }
  const safeId = String(carId).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/(^-|-$)/g, "") || "car";
  const name = `${safeId}-${Date.now()}.${type}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return "/uploads/" + name;
}

/** Best-effort delete of a previously saved image (only ever touches files inside UPLOAD_DIR). */
function removeFile(url) {
  if (!url || !String(url).startsWith("/uploads/")) return;
  fs.unlink(path.join(UPLOAD_DIR, path.basename(url)), () => {});
}

module.exports = { UPLOAD_DIR, MAX_BYTES, detectType, receive, saveBuffer, removeFile };
