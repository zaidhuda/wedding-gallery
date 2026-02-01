-- Create photos table for Cloudflare D1
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_key TEXT NOT NULL,
  name TEXT NOT NULL,
  message TEXT DEFAULT '',
  event_tag TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  taken_at TEXT,
  is_approved INTEGER DEFAULT 0,
  token TEXT,
  width INTEGER,
  height INTEGER
);

-- Create index for faster queries by event_tag
CREATE INDEX IF NOT EXISTS idx_event_tag ON photos(event_tag);

-- Create index for faster queries by timestamp (upload time)
CREATE INDEX IF NOT EXISTS idx_timestamp ON photos(timestamp);

-- Create index for chronological ordering by taken_at (photo capture time)
CREATE INDEX IF NOT EXISTS idx_taken_at ON photos(taken_at);

-- Create index for approval status filtering
CREATE INDEX IF NOT EXISTS idx_is_approved ON photos(is_approved);

-- Create index for token lookups (for edit window feature)
CREATE INDEX IF NOT EXISTS idx_token ON photos(token);

-- Create index for object key lookups
CREATE INDEX IF NOT EXISTS idx_object_key ON photos(object_key);

-- Migration: Add taken_at column to existing table (run manually if needed)
-- ALTER TABLE photos ADD COLUMN taken_at TEXT;
-- Migration: Add is_approved column to existing table (run manually if needed)
-- ALTER TABLE photos ADD COLUMN is_approved INTEGER DEFAULT 0;
-- UPDATE photos SET is_approved = 1 WHERE is_approved IS NULL;
-- Migration: Add token column to existing table (run manually if needed)
-- ALTER TABLE photos ADD COLUMN token TEXT;
-- Migration: Add width/height columns to existing table (run manually if needed)
-- ALTER TABLE photos ADD COLUMN width INTEGER;
-- ALTER TABLE photos ADD COLUMN height INTEGER;
