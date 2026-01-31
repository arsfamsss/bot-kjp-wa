-- Add manual closing override columns (Long Term Close)
ALTER TABLE bot_settings 
ADD COLUMN IF NOT EXISTS manual_close_start TIMESTAMP WITH TIME ZONE NULL,
ADD COLUMN IF NOT EXISTS manual_close_end TIMESTAMP WITH TIME ZONE NULL;
