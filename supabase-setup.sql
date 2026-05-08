-- SCRAPIYX Database Setup
-- Run this in Supabase Dashboard > SQL Editor

-- 1. Create headlines table
CREATE TABLE IF NOT EXISTS headlines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create unique index on link to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS headlines_link_unique ON headlines(link);

-- 3. Create index on scraped_at for fast queries
CREATE INDEX IF NOT EXISTS headlines_scraped_at_idx ON headlines(scraped_at DESC);

-- 4. Enable Row Level Security
ALTER TABLE headlines ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies (in case re-running)
DROP POLICY IF EXISTS "Authenticated users can read headlines" ON headlines;
DROP POLICY IF EXISTS "Allow inserts" ON headlines;

-- 6. Policy: Authenticated users can read all headlines
CREATE POLICY "Authenticated users can read headlines"
  ON headlines
  FOR SELECT
  TO authenticated
  USING (true);

-- 7. Policy: Allow anon inserts (for the scraper)
CREATE POLICY "Allow inserts"
  ON headlines
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Done! Your table is ready.
