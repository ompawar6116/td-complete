const { z } = require("zod");
const { SERVICES, INQUIRY_STATUSES, CAR_CATEGORIES, CAR_CONDITIONS } = require("./config");

const inquirySchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  phone: z.string().trim().refine(
    v => /^[6-9]\d{9}$/.test(v.replace(/\D/g, "")),
    "Enter a valid 10-digit mobile number."
  ),
  email: z.string().trim().email("Enter a valid email address."),
  brand: z.string().trim().optional().default(""),
  model: z.string().trim().optional().default(""),
  service: z.enum(SERVICES, { errorMap: () => ({ message: "Select a valid service." }) }),
  preferred: z.string().trim().optional().default(""),
  message: z.string().trim().optional().default("")
});

const statusSchema = z.object({
  status: z.enum(INQUIRY_STATUSES, {
    errorMap: () => ({ message: `Status must be one of: ${INQUIRY_STATUSES.join(", ")}` })
  })
});

const carSchema = z.object({
  id: z.string().trim().optional(),
  brand: z.string().trim().min(1, "Brand is required."),
  name: z.string().trim().min(1, "Model name is required."),
  category: z.enum(CAR_CATEGORIES, { errorMap: () => ({ message: `Category must be one of: ${CAR_CATEGORIES.join(", ")}` }) }),
  condition: z.enum(CAR_CONDITIONS, { errorMap: () => ({ message: `Condition must be one of: ${CAR_CONDITIONS.join(", ")}` }) }).default("New"),
  price: z.string().trim().min(1, "Price is required."),
  fuel: z.string().trim().min(1, "Fuel is required."),
  transmission: z.string().trim().min(1, "Transmission is required."),
  engine: z.string().trim().min(1, "Engine is required."),
  mileage: z.string().trim().min(1, "Mileage / range is required."),
  seating: z.string().trim().min(1, "Seating is required."),
  safety: z.string().trim().min(1, "Safety is required."),
  desc: z.string().trim().optional().default(""),
  imageUrl: z.string().trim().optional().default(""),
  highlights: z.array(z.string()).optional().default([]),
  inStock: z.boolean().optional().default(true)
});

const stockSchema = z.object({
  inStock: z.boolean({ invalid_type_error: "inStock must be true or false." })
});

/**
 * Runs a Zod schema and, on failure, returns the same {field: message} shape
 * the frontend already expects from data.errors — so no frontend change was
 * needed when this replaced the old hand-rolled validate() functions.
 */
function parseOrErrors(schema, body) {
  const result = schema.safeParse(body || {});
  if (result.success) return { data: result.data, errors: null };
  const errors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] || "_";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { data: null, errors };
}

module.exports = { inquirySchema, statusSchema, carSchema, stockSchema, parseOrErrors };
