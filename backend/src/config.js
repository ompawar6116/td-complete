/**
 * Single source of truth for the fixed option lists used across the app.
 *
 * Previously these lived twice — once as <option> tags in frontend/index.html,
 * once as a duplicate array in routes/inquiries.js — and could drift out of
 * sync (exactly what happened when Detailing/Workshop were replaced with
 * Insurance/Finance). Now they live here only. The frontend fetches them
 * from GET /api/config on load instead of hardcoding them, so backend and
 * frontend can never disagree again.
 */
const SERVICES = [
  "Car Inquiry", "Test Drive", "Car Insurance", "Insurance Renewal",
  "Insurance Claim Assistance", "Car Finance / Loan", "Detailing Studio", "Spare Parts", "General Inquiry"
];

const INQUIRY_STATUSES = ["New", "Contacted", "Follow-up", "Converted", "Closed"];

const CAR_CATEGORIES = ["SUV", "Sedan", "Hatchback", "Luxury", "Electric"];
const CAR_CONDITIONS = ["New", "Certified Pre-Owned"];

module.exports = { SERVICES, INQUIRY_STATUSES, CAR_CATEGORIES, CAR_CONDITIONS };
