const test = require("node:test");
const assert = require("node:assert");
const { detectType, saveBuffer, removeFile, UPLOAD_DIR } = require("../src/upload");
const fs = require("fs");
const path = require("path");

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(8)]);

test("detectType recognises real JPG, PNG and WebP bytes", () => {
  assert.strictEqual(detectType(PNG), "png");
  assert.strictEqual(detectType(JPG), "jpg");
  assert.strictEqual(detectType(WEBP), "webp");
});

test("detectType rejects text, scripts and tiny buffers regardless of filename", () => {
  assert.strictEqual(detectType(Buffer.from("<script>alert(1)</script>")), null);
  assert.strictEqual(detectType(Buffer.from("GIF89a-not-allowed-here")), null);
  assert.strictEqual(detectType(Buffer.alloc(3)), null);
  assert.strictEqual(detectType(null), null);
});

test("saveBuffer writes a safely named file and rejects non-images", () => {
  const url = saveBuffer("Tata Nexon/../x", PNG);
  assert.match(url, /^\/uploads\/tata-nexon-x-\d+\.png$/);
  assert.ok(fs.existsSync(path.join(UPLOAD_DIR, path.basename(url))));
  assert.throws(() => saveBuffer("tata-nexon", Buffer.from("hello world, not an image")), /Only JPG, PNG or WebP/);
  removeFile(url);
});

test("removeFile ignores paths outside /uploads/", () => {
  assert.doesNotThrow(() => removeFile("https://example.com/a.png"));
  assert.doesNotThrow(() => removeFile("/etc/passwd"));
  assert.doesNotThrow(() => removeFile(""));
});
