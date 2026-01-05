-- Create photos table for Cloudflare D1
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  name TEXT NOT NULL,
  message TEXT DEFAULT '',
  eventTag TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  taken_at TEXT,
  is_approved INTEGER DEFAULT 0
);

-- Create index for faster queries by eventTag
CREATE INDEX IF NOT EXISTS idx_eventTag ON photos(eventTag);

-- Create index for faster queries by timestamp (upload time)
CREATE INDEX IF NOT EXISTS idx_timestamp ON photos(timestamp);

-- Create index for chronological ordering by taken_at (photo capture time)
CREATE INDEX IF NOT EXISTS idx_taken_at ON photos(taken_at);

-- Create index for approval status filtering
CREATE INDEX IF NOT EXISTS idx_is_approved ON photos(is_approved);

-- Migration: Add taken_at column to existing table (run manually if needed)
-- ALTER TABLE photos ADD COLUMN taken_at TEXT;
-- Migration: Add is_approved column to existing table (run manually if needed)
-- ALTER TABLE photos ADD COLUMN is_approved INTEGER DEFAULT 0;
-- UPDATE photos SET is_approved = 1 WHERE is_approved IS NULL;
