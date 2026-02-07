-- Google Calendar Conflict Detection - Database Migration
-- Run this in Supabase SQL Editor
-- Add columns for calendar conflict tracking and event sync
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS has_conflict BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS conflict_with TEXT,
ADD COLUMN IF NOT EXISTS conflict_end_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;

-- Add index for conflict queries
CREATE INDEX IF NOT EXISTS idx_tasks_has_conflict ON public.tasks(has_conflict) WHERE has_conflict = true;

-- Verify columns were added
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'tasks' 
AND column_name IN ('has_conflict', 'conflict_with');
