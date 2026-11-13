const test = require("node:test");
const assert = require("node:assert/strict");

const { sparePartSchema, quantitySchema, replySchema, parseOrErrors } = require("../src/schemas");
const { stockStatus, summarize } = require("../src/sparePartsDb");
const { buildReplyEmail } = require("../src/mailer");

const validPart = {
  name: "Front brake pad set",
  partNumber: "BP-1021",
  category: "Brakes",
  price: "1850.50",
  quantity: "12"
};

// ---- schemas ----

test("sparePartSchema accepts a valid part and converts number strings", () => {
  const { data, errors } = parseOrErrors(sparePartSchema, validPart);
  assert.equal(errors, null);
  assert.equal(data.price, 1850.5);
  assert.equal(data.quantity, 12);
  assert.equal(data.lowStockThreshold, 5);
  assert.equal(data.brand, "");
});

test("sparePartSchema rejects a missing part number", () => {
  const { errors } = parseOrErrors(sparePartSchema, { ...validPart, partNumber: "  " });
  assert.ok(errors && errors.partNumber);
});

test("sparePartSchema rejects an unknown category", () => {
  const { errors } = parseOrErrors(sparePartSchema, { ...validPart, category: "Snacks" });
  assert.ok(errors && errors.category);
});

test("sparePartSchema rejects negative or fractional quantity", () => {
  assert.ok(parseOrErrors(sparePartSchema, { ...validPart, quantity: "-1" }).errors.quantity);
  assert.ok(parseOrErrors(sparePartSchema, { ...validPart, quantity: "2.5" }).errors.quantity);
});

test("sparePartSchema rejects a negative price", () => {
  assert.ok(parseOrErrors(sparePartSchema, { ...validPart, price: "-10" }).errors.price);
});

test("quantitySchema only accepts whole numbers of 0 or more", () => {
  assert.equal(parseOrErrors(quantitySchema, { quantity: 0 }).errors, null);
  assert.ok(parseOrErrors(quantitySchema, { quantity: -1 }).errors.quantity);
  assert.ok(parseOrErrors(quantitySchema, { quantity: "3" }).errors.quantity);
});

test("replySchema trims and rejects an empty reply", () => {
  assert.equal(parseOrErrors(replySchema, { message: "  Hello  " }).data.message, "Hello");
  assert.ok(parseOrErrors(replySchema, { message: "   " }).errors.message);
  assert.ok(parseOrErrors(replySchema, {}).errors.message);
});

// ---- stock status + summary ----

test("stockStatus: 0 is out, at or below the low level is low, above is in stock", () => {
  assert.equal(stockStatus(0, 5), "Out of Stock");
  assert.equal(stockStatus(1, 5), "Low Stock");
  assert.equal(stockStatus(5, 5), "Low Stock");
  assert.equal(stockStatus(6, 5), "In Stock");
});

test("summarize totals parts, units, status counts and stock value", () => {
  const parts = [
    { quantity: 10, price: 100, status: "In Stock" },
    { quantity: 2, price: 50.5, status: "Low Stock" },
    { quantity: 0, price: 999, status: "Out of Stock" }
  ];
  assert.deepEqual(summarize(parts), {
    totalParts: 3, totalUnits: 12, inStock: 1, lowStock: 1, outOfStock: 1, stockValue: 1101
  });
});

// ---- reply email ----

test("buildReplyEmail greets the customer, includes the reply and escapes HTML", () => {
  const { subject, text, html } = buildReplyEmail(
    { name: "Ananya <b>", service: "Test Drive", message: "Can I come Sunday?" },
    "Yes, Sunday 11am works.\nSee you then <script>"
  );
  assert.equal(subject, "Re: Your TD Motors inquiry — Test Drive");
  assert.match(text, /^Hi Ananya <b>,/);
  assert.match(text, /Yes, Sunday 11am works\./);
  assert.match(html, /Ananya &lt;b&gt;/);
  assert.match(html, /<br>See you then &lt;script&gt;/);
  assert.ok(!html.includes("<script>"));
});
