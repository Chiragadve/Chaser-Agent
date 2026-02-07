-- Phone/SMS Integration - Database Migration
-- Run this in Supabase SQL Editor

-- Add columns for phone call and SMS notifications
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS phone_number TEXT,
ADD COLUMN IF NOT EXISTS enable_call BOOLEAN DEFAULT false;

-- Verify columns were added
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'tasks' 
AND column_name IN ('phone_number', 'enable_call');
