const test = require("node:test");
const assert = require("node:assert/strict");

const { slugify } = require("../src/carsDb");

test("slugify combines brand and model into a URL-safe id", () => {
  assert.equal(slugify("Tata", "Nexon"), "tata-nexon");
});

test("slugify strips punctuation and collapses spaces", () => {
  assert.equal(slugify("Maruti Suzuki", "Baleno RS!"), "maruti-suzuki-baleno-rs");
});

test("slugify lowercases everything", () => {
  assert.equal(slugify("KIA", "SELTOS"), "kia-seltos");
});
