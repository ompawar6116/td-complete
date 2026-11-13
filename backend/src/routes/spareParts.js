const express = require("express");
const sparePartsDb = require("../sparePartsDb");
const adminAuth = require("../middleware/adminAuth");
const logger = require("../logger");
const { sparePartSchema, quantitySchema, parseOrErrors } = require("../schemas");
const { SPARE_PART_CATEGORIES } = require("../config");

const router = express.Router();

// Everything under /api/spare-parts is admin-only.
router.use(adminAuth);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A malformed id would make Postgres throw (invalid uuid) and look like a 500 —
// answer 404 instead, since no such part can exist.
router.param("id", (req, res, next, id) => {
  if (!UUID_RE.test(id)) return res.status(404).json({ ok: false, error: "Part not found." });
  next();
});

/**
 * GET /api/spare-parts — every part, plus the summary totals for the cards.
 */
router.get("/", async (req, res) => {
  try {
    const parts = await sparePartsDb.listParts();
    res.json({ ok: true, parts, summary: sparePartsDb.summarize(parts), categories: SPARE_PART_CATEGORIES });
  } catch (err) {
    logger.error("Spare parts read failed", { error: err.message });
    res.status(500).json({ ok: false, error: "Failed to load spare parts." });
  }
});

/**
 * POST /api/spare-parts — add a part.
 */
router.post("/", async (req, res) => {
  const { data, errors } = parseOrErrors(sparePartSchema, req.body);
  if (errors) return res.status(400).json({ ok: false, errors, error: Object.values(errors)[0] });
  try {
    const part = await sparePartsDb.insertPart(data);
    res.status(201).json({ ok: true, part });
  } catch (err) {
    logger.error("Spare part insert failed", { error: err.message });
    const dup = /duplicate key|unique/i.test(err.message);
    res.status(dup ? 409 : 500).json({ ok: false, error: dup ? "A part with that part number already exists." : "Failed to add part." });
  }
});

/**
 * PUT /api/spare-parts/:id — full update of a part's details.
 */
router.put("/:id", async (req, res) => {
  const { data, errors } = parseOrErrors(sparePartSchema, req.body);
  if (errors) return res.status(400).json({ ok: false, errors, error: Object.values(errors)[0] });
  try {
    const part = await sparePartsDb.updatePart(req.params.id, data);
    if (!part) return res.status(404).json({ ok: false, error: "Part not found." });
    res.json({ ok: true, part });
  } catch (err) {
    logger.error("Spare part update failed", { error: err.message });
    const dup = /duplicate key|unique/i.test(err.message);
    res.status(dup ? 409 : 500).json({ ok: false, error: dup ? "A part with that part number already exists." : "Failed to update part." });
  }
});

/**
 * PATCH /api/spare-parts/:id/quantity — set the quantity in stock. Body: { quantity }
 */
router.patch("/:id/quantity", async (req, res) => {
  const { data, errors } = parseOrErrors(quantitySchema, req.body);
  if (errors) return res.status(400).json({ ok: false, error: errors.quantity || "Invalid quantity." });
  try {
    const part = await sparePartsDb.setQuantity(req.params.id, data.quantity);
    if (!part) return res.status(404).json({ ok: false, error: "Part not found." });
    res.json({ ok: true, part });
  } catch (err) {
    logger.error("Spare part quantity update failed", { error: err.message });
    res.status(500).json({ ok: false, error: "Failed to update quantity." });
  }
});

/**
 * DELETE /api/spare-parts/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await sparePartsDb.deletePart(req.params.id);
    if (!deleted) return res.status(404).json({ ok: false, error: "Part not found." });
    res.json({ ok: true });
  } catch (err) {
    logger.error("Spare part delete failed", { error: err.message });
    res.status(500).json({ ok: false, error: "Failed to delete part." });
  }
});

module.exports = router;
