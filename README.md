# TD Motors — Multi-Brand Showroom, Insurance & Finance

A full-stack website and back office for **TD Motors, Kharadi, Pune** — a business spanning a
multi-brand car showroom, vehicle insurance, and vehicle finance. Static frontend, a Postgres-backed
Express API, and an admin dashboard for managing both customer leads and car inventory.

---

## 1. Architecture

```
td-motors/
├── frontend/                      # static site — deploy anywhere (Netlify, Vercel, S3…)
│   ├── index.html                 # the whole site (cinematic scroll design; GSAP + Lenis bundled inline)
│   └── images/                    # hero/pinned-section photos + optional <car-id>.png fallbacks
├── backend/                       # Express API — deploy anywhere Node + Postgres run
│   ├── server.js                  # entry point: validate env → migrate → seed → listen
│   ├── package.json
│   ├── .env.example
│   ├── Dockerfile
│   ├── migrations/                # versioned SQL, applied in order — see §3
│   │   ├── 001_init_inquiries.sql
│   │   ├── 002_cars.sql
│   │   └── 003_cars_image_url.sql
│   ├── test/                      # node --test — no live DB required
│   │   ├── schemas.test.js
│   │   └── carsDb.test.js
│   ├── src/
│   │   ├── env.js                 # fail-fast startup validation
│   │   ├── config.js              # canonical option lists (services, categories…)
│   │   ├── schemas.js             # Zod validation for inquiries + cars
│   │   ├── logger.js              # structured logging, PII-redacting
│   │   ├── migrate.js             # migration runner
│   │   ├── db.js                  # Postgres: inquiries
│   │   ├── carsDb.js              # Postgres: car inventory
│   │   ├── upload.js              # car photo uploads (validated by file contents)
│   │   ├── mailer.js              # SMTP email on new inquiry
│   │   ├── middleware/adminAuth.js
│   │   └── routes/
│   │       ├── adminAuth.js       # POST /api/admin/login
│   │       ├── config.js          # GET  /api/config
│   │       ├── inquiries.js
│   │       └── cars.js
│   └── admin/                     # static dashboard, served by the API at /admin
│       ├── index.html
│       ├── admin.css
│       └── admin.js
├── docker-compose.yml             # Postgres + backend, one command
└── README.md
```

The frontend and backend are independently deployable — the frontend just needs to know the
backend's URL (`CONFIG.apiBaseUrl` in `frontend/js/script.js`).

| Layer | Choice | Why |
|---|---|---|
| Frontend | Plain HTML5 + CSS3 + vanilla JS, no build step | A content-driven site doesn't need a SPA framework; deployable to any static host. |
| Backend | Node.js + Express | Minimal, standard pairing with a JS frontend. |
| Database | **PostgreSQL**, via versioned SQL migrations | Both inquiries and car inventory are real, queryable, persistent data — not a JSON file or a hardcoded array. |
| Admin auth | Shared password → short-lived JWT | Password is sent once at login, not resent on every request; tokens expire (12h default). See §6. |
| Validation | **Zod** schemas, one canonical option list | Frontend and backend can no longer disagree about what a "valid service" or "valid car category" is — both read from `src/config.js` via `GET /api/config`. |
| Email | Nodemailer over SMTP | Works with Gmail App Passwords for dev, or any transactional provider (SendGrid, Postmark, SES) for production — same interface, just different env vars. |

---

## 2. Running it locally

### Prerequisites
- Node.js 18+
- A running Postgres instance (local install, Docker, or a hosted one)

### Backend
```bash
cd backend
npm install
cp .env.example .env
```
Edit `.env` — at minimum set:
- `ADMIN_PASSWORD` — the admin dashboard login
- `ADMIN_JWT_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` — your Postgres connection

Create the database once if it doesn't exist yet (`createdb td_motors`), then:
```bash
npm run dev
```
This validates your `.env`, runs any pending migrations, seeds the 10 example cars into an empty
inventory table, and starts on `http://localhost:4000`.

- `http://localhost:4000/api/health` → `{"ok":true,...}`
- `http://localhost:4000/admin` → log in with `ADMIN_PASSWORD`

### Frontend
```bash
cd frontend
npx serve .        # or: python3 -m http.server 5500
```
If you serve it on a port other than what's already in `CORS_ORIGIN` in `backend/.env`, add it there.

### Tests
```bash
cd backend
npm test           # validation logic — no live database needed
```

### Docker (Postgres + backend together)
```bash
cp backend/.env.example backend/.env   # fill in real values; set DB_HOST=db
docker compose up -d
```

---

## 3. Database & migrations

Schema lives in `backend/migrations/`, one plain-SQL file per change, applied in filename order and
tracked in a `schema_migrations` table so nothing is ever re-applied. This runs automatically on
every server startup (`server.js` → `src/migrate.js`), or by hand:
```bash
npm run migrate
```

**To change the schema later:** add a new numbered file (e.g. `004_add_something.sql`) — never edit
an already-shipped migration file, since that breaks anyone who already applied it.

`src/db.js` (inquiries) and `src/carsDb.js` (cars) each expose a small, explicit function contract
(`readAll`/`insert`/`updateStatus`, `listCars`/`insertCar`/`updateCar`/`setStock`/`deleteCar`) —
routes call these, never raw SQL directly, so the query logic stays in one place per table.

**Seeding:** `carsDb.seedIfEmpty()` loads 10 example cars into an empty `cars` table on first boot
only — it never overwrites inventory your client has since added, edited, or removed.

---

## 4. Email integration

Configured entirely through `backend/.env`:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-business-gmail@gmail.com
SMTP_PASS=your-16-character-app-password
BUSINESS_EMAIL=enquiries@tdmotors.in
```

**For development/testing**, a Gmail App Password works fine: turn on 2-Step Verification on the
business Gmail account, generate one at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords),
and use that (not the real account password) as `SMTP_PASS`.

**For production**, a transactional provider — SendGrid, Postmark, Amazon SES — is more reliable and
gives delivery tracking. All of them speak the same SMTP interface, so switching later means
changing these five env values, not any code.

**If SMTP isn't configured:** every inquiry still saves to Postgres and the API still responds
`201` — it just logs that no email was sent. A visitor's enquiry is never lost because of a mail
server that isn't set up yet.

---

## 5. WhatsApp integration

Every WhatsApp touchpoint calls the same `buildWaMessage()` / `waLink()` helpers in
`frontend/js/script.js`, opening `https://wa.me/<CONFIG.whatsappNumber>?text=...` — no WhatsApp
Business API account needed. The number lives in one place (`CONFIG.whatsappNumber`), so updating
it once updates every button site-wide.

---

## 6. Admin dashboard & authentication

`backend/admin/` is a static page served by the same Express app at `/admin`, with two tabs:

- **Inquiries** — list, filter by status, update status inline.
- **Inventory** — add, edit, delete cars, and toggle in-stock/out-of-stock — the way your client
  updates what's actually for sale, without touching code.

**How login works:** the dashboard sends the password once, to `POST /api/admin/login`, which
verifies it (constant-time comparison, rate-limited to 8 attempts/15min) and returns a JWT valid for
`ADMIN_JWT_EXPIRES_IN` (default 12h). Every other admin request sends that token, not the password —
so the password itself is never retransmitted or stored in the browser, and a captured token expires
on its own.

This is still a single shared admin identity, not per-staff accounts with an audit trail — a
deliberate scoping decision for "one shop, a couple of staff, one shared login," named here rather
than hidden. A multi-user version would need a `users` table and per-account sessions.

---

## 7. API reference

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | none | Liveness check. |
| GET | `/api/config` | none | Canonical option lists (services, statuses, car categories/conditions) — the frontend builds its dropdowns from this. |
| POST | `/api/admin/login` | none (rate-limited) | `{ password }` → `{ token }` valid for `ADMIN_JWT_EXPIRES_IN`. |
| POST | `/api/inquiries` | none (rate-limited) | `{ name, phone, email, brand?, model?, service, preferred?, message? }` → `201` + saved inquiry, or `400` with per-field errors. |
| GET | `/api/inquiries` | Bearer JWT | `{ inquiries: [...] }`, newest first. |
| PATCH | `/api/inquiries/:id` | Bearer JWT | `{ status }`. |
| GET | `/api/cars` | none | In-stock cars only — what the public site shows. |
| GET | `/api/cars?all=1` | Bearer JWT | Every car, in or out of stock. |
| POST | `/api/cars` | Bearer JWT | Add a car. |
| PUT | `/api/cars/:id` | Bearer JWT | Full update of a car. |
| PATCH | `/api/cars/:id/stock` | Bearer JWT | `{ inStock: true\|false }`. |
| DELETE | `/api/cars/:id` | Bearer JWT | Remove a car. |

Public POST endpoints are rate-limited via `express-rate-limit`.

---

## 8. Validation

**Frontend**: inline field validation on the inquiry form — required name, valid 10-digit Indian
mobile number, valid email, a selected service.

**Backend**: the same rules are re-checked server-side with **Zod** (`src/schemas.js`) — the API is
public, so client-side validation alone is never trusted. Errors come back as `{ field: message }`,
which the frontend already knows how to render inline.

Both frontend and backend service/category/condition lists are generated from one place
(`src/config.js`, exposed at `GET /api/config`) — they cannot drift out of sync with each other.

---

## 9. Security notes

- Admin auth: JWT-based login, rate-limited, constant-time password comparison (see §6).
- `helmet` sets standard security headers on every response.
- All user-submitted content is HTML-escaped before rendering in the admin dashboard or in the
  notification email — no stored-XSS via a car/inquiry field.
- Public write endpoints (`POST /api/inquiries`) are rate-limited per IP.
- Startup fails fast (`src/env.js`) with a clear message if required env vars are missing, rather
  than starting in a half-configured state.
- Graceful shutdown on `SIGTERM`/`SIGINT` closes the HTTP server and the Postgres pool cleanly.

**Known, deliberate scope limits** (fine for a single dealership, worth knowing about):
- One shared admin login, not per-staff accounts with audit trails.
- No CAPTCHA on the public inquiry form — rate limiting only.
- Car fields (`price`, `mileage`, `seating`, etc.) are free-text strings, not typed/numeric — fine
  for display, not yet sortable/filterable by range.

---

## 10. Testing

```bash
cd backend
npm test
```
Runs `node --test` over `backend/test/` — validation logic (`schemas.js`) and the car-ID `slugify()`
helper, with no live database required. This covers the rules most likely to silently drift (e.g. the
service list, phone/email format) rather than full integration coverage.

---

## 11. Deployment

**Docker (recommended):**
```bash
cp backend/.env.example backend/.env   # fill in real values; DB_HOST=db
docker compose up -d
```
Brings up Postgres and the backend together, with the schema migrating automatically on first boot.

**Manual:**
- **Backend:** any Node host with a reachable Postgres (Render, Railway, Fly.io, a VPS). Set the env
  vars from `.env.example` in that host's dashboard — never commit a real `.env`. Set `CORS_ORIGIN`
  to the deployed frontend's exact domain.
- **Frontend:** any static host (Netlify, Vercel, S3 + CloudFront, GitHub Pages). Set
  `CONFIG.apiBaseUrl` (`frontend/js/script.js`) to the deployed backend's URL first.

---

## 12. Working on this project (git workflow)

This is a real git repository — commit your changes instead of re-downloading/re-zipping the whole
folder for each change (a re-zip loses `.env`, since it's gitignored on purpose — never commit real
credentials).

```bash
git add -A
git commit -m "describe what changed"
```

To push to GitHub/GitLab: create an empty repo there, then
```bash
git remote add origin <your-repo-url>
git push -u origin main
```

---

## 13. Content note

Car specifications, pricing bands, and testimonials are realistic placeholder content pending real
inventory data and photography. Business contact details (`CONFIG` block at the top of
`frontend/js/script.js`) are placeholders except the phone number and Instagram handle, which are
real. Add real car photos via the admin dashboard's "Image URL" field on each car (falls back to
placeholder line-art if left blank) — see `cars.image_url` in the schema.


---

## Car photos — three ways to add them

Every car on the site shows, in this order: its uploaded photo, then `frontend/images/<car-id>.png`, then a branded placeholder.

1. **Admin dashboard (recommended for the client).** `/admin` → Inventory → Edit (or Add Car) → *Car photo* → choose a JPG/PNG/WebP (max 5 MB) → Save Car. A transparent-background PNG looks best. "Remove photo" clears it.
2. **Bulk import from a folder.** Put files named after the car ID (shown under each car's name in Inventory, e.g. `tata-nexon.jpg`) in `backend/photos-to-import/`, then run `npm run import-photos` from `backend/`. Matching cars get the photo; anything unmatched is listed and skipped.
3. **Static fallback.** Save `frontend/images/<car-id>.png`. No server or database change needed, but the client can't change these from admin.

Uploaded files are validated by their real contents (JPG/PNG/WebP only), stored in `backend/uploads/` (override with `UPLOAD_DIR`), and served at `/uploads/…`. API: `POST /api/cars/:id/image` (multipart field `image`) and `DELETE /api/cars/:id/image`, both admin-only. **In production, keep `uploads/` on persistent storage** (a Docker volume or mounted disk) so photos survive redeploys, and set `CORS_ORIGIN` to your site's address.

## Running locally

```
cd backend && cp .env.example .env     # fill in DB_* and ADMIN_* values
npm install && npm run dev             # API + admin on http://localhost:4000 (/admin)
cd ../frontend && npx serve .          # website on http://localhost:3000
```
`CORS_ORIGIN` in `backend/.env` must include `http://localhost:3000`.
