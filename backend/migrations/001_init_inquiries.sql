CREATE TABLE IF NOT EXISTS inquiries (
  id          UUID PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  email       TEXT NOT NULL,
  brand       TEXT DEFAULT '',
  model       TEXT DEFAULT '',
  service     TEXT NOT NULL,
  preferred   TEXT DEFAULT '',
  message     TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'New',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON inquiries (created_at DESC);
