const express = require("express");
const carsDb = require("../carsDb");
const adminAuth = require("../middleware/adminAuth");
const logger = require("../logger");
const upload = require("../upload");
const { carSchema, stockSchema, parseOrErrors } = require("../schemas");

const router = express.Router();

/**
 * GET /api/cars — public. Returns in-stock cars only (what the website shows).
 * GET /api/cars?all=1 — admin only. Returns every car, in or out of stock.
 */
router.get("/", async (req, res) => {
  if (req.query.all) {
    return adminAuth(req, res, async () => {
      try {
        const cars = await carsDb.listCars({ inStockOnly: false });
        res.json({ ok: true, cars });
      } catch (err) {
        logger.error("Cars DB read failed", { error: err.message });
        res.status(500).json({ ok: false, error: "Failed to load inventory." });
      }
    });
  }
  try {
    const cars = await carsDb.listCars({ inStockOnly: true });
    res.json({ ok: true, cars });
  } catch (err) {
    logger.error("Cars DB read failed", { error: err.message });
    res.status(500).json({ ok: false, error: "Failed to load inventory." });
  }
});

/**
 * POST /api/cars — admin only. Adds a new car.
 */
router.post("/", adminAuth, async (req, res) => {
  const { data, errors } = parseOrErrors(carSchema, req.body);
  if (errors) return res.status(400).json({ ok: false, errors });
  try {
    const car = await carsDb.insertCar(data);
    res.status(201).json({ ok: true, car });
  } catch (err) {
    logger.error("Car insert failed", { error: err.message });
    const dup = /duplicate key/i.test(err.message);
    res.status(dup ? 409 : 500).json({ ok: false, error: dup ? "A car with that ID already exists." : "Failed to add car." });
  }
});

/**
 * PUT /api/cars/:id — admin only. Full update of a car's details.
 */
router.put("/:id", adminAuth, async (req, res) => {
  const { data, errors } = parseOrErrors(carSchema, req.body);
  if (errors) return res.status(400).json({ ok: false, errors });
  try {
    const car = await carsDb.updateCar(req.params.id, data);
    if (!car) return res.status(404).json({ ok: false, error: "Car not found." });
    res.json({ ok: true, car });
  } catch (err) {
    logger.error("Car update failed", { error: err.message });
    res.status(500).json({ ok: false, error: "Failed to update car." });
  }
});

/**
 * PATCH /api/cars/:id/stock — admin only. Body: { inStock: true|false }
 */
router.patch("/:id/stock", adminAuth, async (req, res) => {
  const { data, errors } = parseOrErrors(stockSchema, req.body);
  if (errors) return res.status(400).json({ ok: false, error: errors.inStock || "Invalid value." });
  try {
    const car = await carsDb.setStock(req.params.id, data.inStock);
    if (!car) return res.status(404).json({ ok: false, error: "Car not found." });
    res.json({ ok: true, car });
  } catch (err) {
    logger.error("Car stock update failed", { error: err.message });
    res.status(500).json({ ok: false, error: "Failed to update stock status." });
  }
});

/**
 * POST /api/cars/:id/image — admin only. multipart/form-data, one file in
 * the field "image" (JPG, PNG or WebP, max 5 MB). Replaces any previous photo.
 */
router.post("/:id/image", adminAuth, upload.receive, async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "No image file received." });
  try {
    const existing = await carsDb.getCar(req.params.id);
    if (!existing) return res.status(404).json({ ok: false, error: "Car not found." });
    const url = upload.saveBuffer(existing.id, req.file.buffer);
    const car = await carsDb.setImage(existing.id, url);
    upload.removeFile(existing.imageUrl);
    res.json({ ok: true, car });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ ok: false, error: err.message });
    logger.error("Car image upload failed", { error: err.message });
    res.status(500).json({ ok: false, error: "Failed to save image." });
  }
});

/**
 * DELETE /api/cars/:id/image — admin only. Removes the car's photo.
 */
router.delete("/:id/image", adminAuth, async (req, res) => {
  try {
    const existing = await carsDb.getCar(req.params.id);
    if (!existing) return res.status(404).json({ ok: false, error: "Car not found." });
    const car = await carsDb.setImage(existing.id, "");
    upload.removeFile(existing.imageUrl);
    res.json({ ok: true, car });
  } catch (err) {
    logger.error("Car image delete failed", { error: err.message });
    res.status(500).json({ ok: false, error: "Failed to remove image." });
  }
});

/**
 * DELETE /api/cars/:id — admin only. Removes a car from inventory.
 */
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const existing = await carsDb.getCar(req.params.id);
    const deleted = await carsDb.deleteCar(req.params.id);
    if (!deleted) return res.status(404).json({ ok: false, error: "Car not found." });
    if (existing) upload.removeFile(existing.imageUrl);
    res.json({ ok: true });
  } catch (err) {
    logger.error("Car delete failed", { error: err.message });
    res.status(500).json({ ok: false, error: "Failed to delete car." });
  }
});

module.exports = router;
