/**
 * Bulk-attach car photos from a folder.
 *
 *   1. Put image files in backend/photos-to-import/ named after the car ID:
 *        tata-nexon.jpg   hyundai-creta.png   kia-seltos.webp ...
 *      (the ID is shown under each car's name in /admin -> Inventory)
 *   2. Run:  npm run import-photos
 *
 * Each matching car gets the photo (replacing any previous one). Files
 * that don't match a car are listed and left untouched.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const { pool } = require("../src/db");
const carsDb = require("../src/carsDb");
const upload = require("../src/upload");

const DIR = path.join(__dirname, "..", "photos-to-import");
const EXT = /\.(jpe?g|png|webp)$/i;

(async () => {
  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => EXT.test(f)) : [];
  if (!files.length) {
    console.log("No images found in backend/photos-to-import/. Add files named like tata-nexon.jpg and run again.");
    return;
  }
  let done = 0;
  for (const file of files) {
    const id = file.replace(EXT, "").toLowerCase();
    const car = await carsDb.getCar(id);
    if (!car) { console.log(`  skipped  ${file}  (no car with id "${id}")`); continue; }
    try {
      const url = upload.saveBuffer(car.id, fs.readFileSync(path.join(DIR, file)));
      await carsDb.setImage(car.id, url);
      upload.removeFile(car.imageUrl);
      console.log(`  added    ${file}  ->  ${car.brand} ${car.name}`);
      done++;
    } catch (err) {
      console.log(`  failed   ${file}  (${err.message})`);
    }
  }
  console.log(`Done. ${done} of ${files.length} photo(s) attached.`);
})().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => pool.end());
