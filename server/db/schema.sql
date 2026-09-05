-- Esquema de base de datos — Sistema de Reservas Umbral VR
-- SQLite. Para producción con más tráfico se puede migrar a Postgres/MySQL
-- manteniendo el mismo modelo de tablas.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS games (
  id          TEXT PRIMARY KEY,         -- slug: 'spatial', 'zombies', etc.
  title       TEXT NOT NULL,
  tag         TEXT NOT NULL,            -- ej: "PVP · FREE ROAM"
  cover_url   TEXT NOT NULL,
  featured    INTEGER NOT NULL DEFAULT 0, -- 1 = se destaca (Spatial Ops)
  active      INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Una reserva ocupa la arena completa durante el bloque de 40 minutos.
-- Por eso solo puede existir UNA reserva "activa" (pending u paid) por
-- fecha + hora. El índice único de abajo lo garantiza a nivel de base
-- de datos, evitando condiciones de carrera aunque lleguen dos personas
-- reservando el mismo instante al mismo tiempo.
CREATE TABLE IF NOT EXISTS bookings (
  id              TEXT PRIMARY KEY,        -- UUID
  game_id         TEXT NOT NULL REFERENCES games(id),
  booking_date    TEXT NOT NULL,           -- 'YYYY-MM-DD'
  start_time      TEXT NOT NULL,           -- 'HH:MM' (24h, bloques de 40min)
  players         INTEGER NOT NULL CHECK (players BETWEEN 1 AND 6),
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT NOT NULL,
  price_clp       INTEGER NOT NULL,        -- monto total en pesos chilenos
  status          TEXT NOT NULL DEFAULT 'pending_payment',
                  -- pending_payment | paid | expired | failed | cancelled
  tbk_token       TEXT,                    -- token de la transacción Webpay
  tbk_order_id    TEXT,                    -- buy_order enviado a Transbank
  tbk_auth_code   TEXT,                    -- código de autorización (pagado)
  confirmation_email_sent INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Solo un registro "vivo" (pending_payment o paid) puede ocupar un slot.
-- SQLite permite índices únicos parciales con condición WHERE.
CREATE UNIQUE INDEX IF NOT EXISTS idx_slot_unique
  ON bookings (booking_date, start_time)
  WHERE status IN ('pending_payment', 'paid');

CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings (booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);

-- Log simple de intentos de pago, útil para auditoría/soporte.
CREATE TABLE IF NOT EXISTS payment_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id  TEXT NOT NULL REFERENCES bookings(id),
  event       TEXT NOT NULL,   -- created | commit_ok | commit_failed | error
  raw_payload TEXT,            -- JSON de la respuesta de Transbank (auditoría)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
