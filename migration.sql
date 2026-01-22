-- Migration to support Multi-Location Registration
-- Run this in your Supabase SQL Editor

-- 1. Add 'tanggal_lahir' column to 'data_harian' table
ALTER TABLE data_harian
ADD COLUMN IF NOT EXISTS tanggal_lahir DATE DEFAULT NULL;

-- 2. Add 'lokasi' column to 'data_harian' table
ALTER TABLE data_harian
ADD COLUMN IF NOT EXISTS lokasi TEXT DEFAULT NULL;

-- 3. Add 'lokasi' column to 'log_pesan_wa' table (Optional, for debugging)
ALTER TABLE log_pesan_wa
ADD COLUMN IF NOT EXISTS lokasi TEXT DEFAULT NULL;

-- 4. Verify the changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'data_harian';
