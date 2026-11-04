const express = require("express");
const { SERVICES, INQUIRY_STATUSES, CAR_CATEGORIES, CAR_CONDITIONS } = require("../config");

const router = express.Router();

/**
 * GET /api/config — public, read-only. Lets the frontend build its service
 * dropdown (and the admin panel its car category/condition selects) from
 * the exact same list the backend validates against, instead of a second
 * hardcoded copy that can drift out of sync.
 */
router.get("/", (req, res) => {
  res.json({
    ok: true,
    services: SERVICES,
    inquiryStatuses: INQUIRY_STATUSES,
    carCategories: CAR_CATEGORIES,
    carConditions: CAR_CONDITIONS
  });
});

module.exports = router;
