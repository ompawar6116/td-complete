CREATE TABLE IF NOT EXISTS cars (
  id            TEXT PRIMARY KEY,
  brand         TEXT NOT NULL,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  condition     TEXT NOT NULL DEFAULT 'New',
  price         TEXT NOT NULL,
  fuel          TEXT NOT NULL,
  transmission  TEXT NOT NULL,
  engine        TEXT NOT NULL,
  mileage       TEXT NOT NULL,
  seating       TEXT NOT NULL,
  safety        TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  highlights    JSONB NOT NULL DEFAULT '[]',
  in_stock      BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ
);
