-- ========================================
-- SLACK CHANNEL MIGRATION
-- Run this in Supabase SQL Editor
-- ========================================

-- Add slack_channel column to tasks table
ALTER TABLE tasks ADD COLUMN slack_channel VARCHAR(100);

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tasks' AND column_name = 'slack_channel';
