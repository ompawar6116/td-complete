CREATE TABLE IF NOT EXISTS spare_parts (
  id                   UUID PRIMARY KEY,
  name                 TEXT NOT NULL,
  part_number          TEXT NOT NULL UNIQUE,
  category             TEXT NOT NULL,
  brand                TEXT NOT NULL DEFAULT '',
  compatible_with      TEXT NOT NULL DEFAULT '',
  price                NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantity             INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  low_stock_threshold  INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  description          TEXT NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_spare_parts_category ON spare_parts (category);
CREATE INDEX IF NOT EXISTS idx_spare_parts_created_at ON spare_parts (created_at DESC);
