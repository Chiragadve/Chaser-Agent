-- Add escalation_tier column to chaser_queue table
ALTER TABLE chaser_queue ADD COLUMN IF NOT EXISTS escalation_tier INTEGER DEFAULT 1;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_chaser_queue_escalation_tier ON chaser_queue(escalation_tier);
