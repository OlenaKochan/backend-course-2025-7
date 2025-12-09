CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  inventory_name TEXT NOT NULL,
  description TEXT,
  photo TEXT
);
