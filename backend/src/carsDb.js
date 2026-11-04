/**
 * Postgres-backed CRUD for car inventory.
 *
 * Mirrors the shape db.js uses for inquiries: a small, explicit function
 * contract (listCars/getCar/insertCar/updateCar/deleteCar) that routes/cars.js
 * calls, so nothing else in the app needs to know this is Postgres under
 * the hood.
 *
 * Schema is owned by backend/migrations/ + src/migrate.js (run from
 * server.js on startup) — this file only reads/writes rows.
 * seedIfEmpty() loads the original hardcoded showroom list ONCE, only if
 * the table is completely empty — so it never overwrites real inventory
 * your client has since added, edited or removed.
 */
const { pool } = require("./db");
const logger = require("./logger");

const SEED_CARS = [
  { id:"tata-nexon", brand:"Tata", name:"Nexon", category:"SUV", condition:"New", price:"₹8.5L – ₹14.5L", fuel:"Petrol / Diesel", transmission:"Manual / AMT", engine:"1.2L Turbo Petrol / 1.5L Diesel", mileage:"17–24 km/l", seating:"5", safety:"5-star GNCAP, 6 airbags, ESC", description:"India's best-selling compact SUV — tight turning radius, a 5-star safety rating and a cabin that feels a size bigger than it looks.", highlights:["5-star GNCAP","Segment-first sunroof","Connected car tech"] },
  { id:"tata-harrier", brand:"Tata", name:"Harrier", category:"SUV", condition:"New", price:"₹15L – ₹24L", fuel:"Diesel", transmission:"Manual / Automatic", engine:"2.0L Kryotec Diesel", mileage:"14–16 km/l", seating:"5", safety:"5-star GNCAP, 6 airbags, terrain modes", description:"A full-size road presence with a JLR-derived platform underneath — built for long Pune–Mumbai runs as comfortably as the daily commute.", highlights:["Panoramic sunroof","Terrain response modes","ADAS on top trims"] },
  { id:"hyundai-creta", brand:"Hyundai", name:"Creta", category:"SUV", condition:"New", price:"₹11L – ₹20L", fuel:"Petrol / Diesel", transmission:"Manual / CVT / Automatic", engine:"1.5L Petrol / 1.5L Diesel", mileage:"16–21 km/l", seating:"5", safety:"6 airbags, ESC, all-wheel disc brakes", description:"The segment benchmark — a refined ride, a feature list that undercuts rivals twice its price, and resale value that holds up.", highlights:["Ventilated seats","Bose sound system","ADAS Level 2"] },
  { id:"hyundai-verna", brand:"Hyundai", name:"Verna", category:"Sedan", condition:"New", price:"₹11L – ₹17L", fuel:"Petrol", transmission:"Manual / Automatic", engine:"1.5L NA / 1.5L Turbo", mileage:"18–20 km/l", seating:"5", safety:"6 airbags, ESC, hill-assist", description:"A sedan that photographs like it costs more — sharp creases, a digital cockpit, and a turbo option for the days you're in a hurry.", highlights:["Digital cluster + HUD","Turbo-petrol option","Ventilated front seats"] },
  { id:"mahindra-scorpio-n", brand:"Mahindra", name:"Scorpio-N", category:"SUV", condition:"New", price:"₹13.5L – ₹24L", fuel:"Diesel / Petrol", transmission:"Manual / Automatic", engine:"2.2L Diesel / 2.0L Petrol", mileage:"13–16 km/l", seating:"7", safety:"5-star GNCAP, 6 airbags", description:"Body-on-frame toughness with a cabin that's finally caught up — the pick for families who need three rows and don't mind rough roads.", highlights:["7-seat layout","4WD on select trims","5-star GNCAP"] },
  { id:"maruti-baleno", brand:"Maruti Suzuki", name:"Baleno", category:"Hatchback", condition:"New", price:"₹6.6L – ₹9.9L", fuel:"Petrol", transmission:"Manual / AMT", engine:"1.2L Petrol", mileage:"22–24 km/l", seating:"5", safety:"6 airbags, ESC", description:"Premium hatchback space with a boot bigger than most sedans in its price band — and Maruti's service network behind it.", highlights:["Head-up display","Arkamys sound tuning","Low running cost"] },
  { id:"maruti-swift", brand:"Maruti Suzuki", name:"Swift", category:"Hatchback", condition:"Certified Pre-Owned", price:"₹6L – ₹9L", fuel:"Petrol", transmission:"Manual / AMT", engine:"1.2L Z-Series Petrol", mileage:"25 km/l", seating:"5", safety:"Dual airbags, ABS, ESC", description:"Certified pre-owned, 100-point inspected — the go-anywhere hatch that's easy to park in Kharadi traffic and cheap to run.", highlights:["100-point inspected","1-yr warranty included","Fresh service history"] },
  { id:"kia-seltos", brand:"Kia", name:"Seltos", category:"SUV", condition:"New", price:"₹11L – ₹20L", fuel:"Petrol / Diesel", transmission:"Manual / CVT / DCT", engine:"1.5L Petrol / 1.5L Diesel", mileage:"16–20 km/l", seating:"5", safety:"6 airbags, ESC, TPMS", description:"Sharper to drive than most in its class, with a cabin design that still feels current several years after launch.", highlights:["Bose 8-speaker audio","360° camera","Turbo-DCT option"] },
  { id:"toyota-camry", brand:"Toyota", name:"Camry Hybrid", category:"Luxury", condition:"New", price:"₹46L", fuel:"Petrol Hybrid", transmission:"Automatic (e-CVT)", engine:"2.5L Hybrid", mileage:"23 km/l", seating:"5", safety:"7 airbags, Toyota Safety Sense", description:"A flagship sedan that runs on electric power around town and returns hybrid mileage on the highway — quiet, composed, low-maintenance.", highlights:["Executive rear seat","Toyota Safety Sense","Hybrid running costs"] },
  { id:"tata-nexon-ev", brand:"Tata", name:"Nexon EV", category:"Electric", condition:"New", price:"₹14.5L – ₹19.5L", fuel:"Electric", transmission:"Automatic (single-speed)", engine:"Electric motor, 40–45 kWh battery", mileage:"325–465 km range (claimed)", seating:"5", safety:"5-star GNCAP, 6 airbags", description:"The EV that made electric mainstream in India — usable range, DC fast charging, and Tata's growing service network.", highlights:["DC fast charging","325–465 km range","Low running cost"] }
];

async function seedIfEmpty() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM cars");
  if (rows[0].n > 0) return;
  for (const c of SEED_CARS) {
    await pool.query(
      `INSERT INTO cars (id, brand, name, category, condition, price, fuel, transmission, engine, mileage, seating, safety, description, highlights)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [c.id, c.brand, c.name, c.category, c.condition, c.price, c.fuel, c.transmission, c.engine, c.mileage, c.seating, c.safety, c.description, JSON.stringify(c.highlights)]
    );
  }
  logger.info("Seeded cars into an empty table", { count: SEED_CARS.length });
}

function toCar(row) {
  return {
    id: row.id,
    brand: row.brand,
    name: row.name,
    category: row.category,
    condition: row.condition,
    price: row.price,
    fuel: row.fuel,
    transmission: row.transmission,
    engine: row.engine,
    mileage: row.mileage,
    seating: row.seating,
    safety: row.safety,
    desc: row.description,
    highlights: row.highlights || [],
    imageUrl: row.image_url || "",
    inStock: row.in_stock,
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined
  };
}

async function listCars({ inStockOnly } = {}) {
  const { rows } = await pool.query(
    inStockOnly
      ? "SELECT * FROM cars WHERE in_stock = true ORDER BY created_at DESC"
      : "SELECT * FROM cars ORDER BY created_at DESC"
  );
  return rows.map(toCar);
}

async function getCar(id) {
  const { rows } = await pool.query("SELECT * FROM cars WHERE id = $1", [id]);
  return rows[0] ? toCar(rows[0]) : null;
}

function slugify(brand, name) {
  return `${brand}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function insertCar(car) {
  const id = car.id && car.id.trim() ? car.id.trim() : slugify(car.brand, car.name);
  const { rows } = await pool.query(
    `INSERT INTO cars (id, brand, name, category, condition, price, fuel, transmission, engine, mileage, seating, safety, description, highlights, in_stock, image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      id, car.brand, car.name, car.category, car.condition || "New", car.price,
      car.fuel, car.transmission, car.engine, car.mileage, car.seating, car.safety,
      car.desc || "", JSON.stringify(car.highlights || []), car.inStock !== false, car.imageUrl || ""
    ]
  );
  return toCar(rows[0]);
}

async function updateCar(id, car) {
  const { rows } = await pool.query(
    `UPDATE cars SET
       brand = $2, name = $3, category = $4, condition = $5, price = $6,
       fuel = $7, transmission = $8, engine = $9, mileage = $10, seating = $11,
       safety = $12, description = $13, highlights = $14, in_stock = $15,
       image_url = $16, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      id, car.brand, car.name, car.category, car.condition || "New", car.price,
      car.fuel, car.transmission, car.engine, car.mileage, car.seating, car.safety,
      car.desc || "", JSON.stringify(car.highlights || []), car.inStock !== false, car.imageUrl || ""
    ]
  );
  return rows[0] ? toCar(rows[0]) : null;
}

async function setStock(id, inStock) {
  const { rows } = await pool.query(
    "UPDATE cars SET in_stock = $2, updated_at = now() WHERE id = $1 RETURNING *",
    [id, inStock]
  );
  return rows[0] ? toCar(rows[0]) : null;
}

async function setImage(id, url) {
  const { rows } = await pool.query(
    "UPDATE cars SET image_url = $2, updated_at = now() WHERE id = $1 RETURNING *",
    [id, url]
  );
  return rows[0] ? toCar(rows[0]) : null;
}

async function deleteCar(id) {
  const { rowCount } = await pool.query("DELETE FROM cars WHERE id = $1", [id]);
  return rowCount > 0;
}

module.exports = { seedIfEmpty, listCars, getCar, insertCar, updateCar, setStock, setImage, deleteCar, slugify };
