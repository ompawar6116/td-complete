const test = require("node:test");
const assert = require("node:assert/strict");

const { inquirySchema, statusSchema, carSchema, stockSchema, parseOrErrors } = require("../src/schemas");

test("inquirySchema accepts a valid submission", () => {
  const { data, errors } = parseOrErrors(inquirySchema, {
    name: "Ananya R.",
    phone: "9876543210",
    email: "ananya@example.com",
    service: "Test Drive"
  });
  assert.equal(errors, null);
  assert.equal(data.name, "Ananya R.");
  assert.equal(data.phone, "9876543210");
});

test("inquirySchema rejects a missing name", () => {
  const { errors } = parseOrErrors(inquirySchema, {
    name: "",
    phone: "9876543210",
    email: "a@b.com",
    service: "Test Drive"
  });
  assert.ok(errors && errors.name);
});

test("inquirySchema rejects an invalid phone number", () => {
  const { errors } = parseOrErrors(inquirySchema, {
    name: "A",
    phone: "12345",
    email: "a@b.com",
    service: "Test Drive"
  });
  assert.ok(errors && errors.phone);
});

test("inquirySchema rejects a phone starting with 0-5 (not a valid Indian mobile prefix)", () => {
  const { errors } = parseOrErrors(inquirySchema, {
    name: "A",
    phone: "5123456789",
    email: "a@b.com",
    service: "Test Drive"
  });
  assert.ok(errors && errors.phone);
});

test("inquirySchema rejects an invalid email", () => {
  const { errors } = parseOrErrors(inquirySchema, {
    name: "A",
    phone: "9876543210",
    email: "not-an-email",
    service: "Test Drive"
  });
  assert.ok(errors && errors.email);
});

test("inquirySchema rejects a service not in the canonical list", () => {
  const { errors } = parseOrErrors(inquirySchema, {
    name: "A",
    phone: "9876543210",
    email: "a@b.com",
    service: "Car Detailing" // dropped when the business scope changed
  });
  assert.ok(errors && errors.service);
});

test("statusSchema accepts a known status and rejects an unknown one", () => {
  assert.equal(parseOrErrors(statusSchema, { status: "Contacted" }).errors, null);
  assert.ok(parseOrErrors(statusSchema, { status: "Bogus" }).errors);
});

test("carSchema requires the core fields", () => {
  const { errors } = parseOrErrors(carSchema, { brand: "Tata" });
  assert.ok(errors && errors.name);
  assert.ok(errors && errors.price);
});

test("carSchema accepts a fully-formed car and defaults condition/inStock/highlights", () => {
  const { data, errors } = parseOrErrors(carSchema, {
    brand: "Tata", name: "Nexon", category: "SUV", price: "₹8.5L",
    fuel: "Petrol", transmission: "Manual", engine: "1.2L", mileage: "20 km/l",
    seating: "5", safety: "6 airbags"
  });
  assert.equal(errors, null);
  assert.equal(data.condition, "New");
  assert.equal(data.inStock, true);
  assert.deepEqual(data.highlights, []);
});

test("carSchema rejects a category outside the fixed list", () => {
  const { errors } = parseOrErrors(carSchema, {
    brand: "Tata", name: "Nexon", category: "Truck", price: "₹8.5L",
    fuel: "Petrol", transmission: "Manual", engine: "1.2L", mileage: "20 km/l",
    seating: "5", safety: "6 airbags"
  });
  assert.ok(errors && errors.category);
});

test("stockSchema requires a boolean", () => {
  assert.equal(parseOrErrors(stockSchema, { inStock: true }).errors, null);
  assert.ok(parseOrErrors(stockSchema, { inStock: "yes" }).errors);
});
