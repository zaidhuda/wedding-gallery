-- Create photos table for Cloudflare D1
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  name TEXT NOT NULL,
  message TEXT DEFAULT '',
  eventTag TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

-- Create index for faster queries by eventTag
CREATE INDEX IF NOT EXISTS idx_eventTag ON photos(eventTag);

-- Create index for faster queries by timestamp
CREATE INDEX IF NOT EXISTS idx_timestamp ON photos(timestamp);
