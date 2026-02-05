-- ========================================
-- CHASER AGENT DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- ========================================

-- Table 1: tasks
-- Stores all tasks with their details
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  assignee_email VARCHAR(255) NOT NULL,
  assignee_name VARCHAR(255),
  due_date TIMESTAMPTZ NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  priority VARCHAR(20) DEFAULT 'medium',
  total_chasers_sent INTEGER DEFAULT 0,
  last_chaser_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 2: chaser_queue
-- Queue of scheduled reminder emails
CREATE TABLE chaser_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  recipient_email VARCHAR(255) NOT NULL,
  message_subject VARCHAR(500),
  message_body TEXT,
  sent_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 3: chaser_logs
-- History of all sent/failed emails
CREATE TABLE chaser_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id),
  queue_id UUID REFERENCES chaser_queue(id),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(50) NOT NULL,
  recipient_email VARCHAR(255),
  message_subject VARCHAR(500),
  message_body TEXT,
  boltic_execution_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_queue_scheduled ON chaser_queue(scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_queue_task ON chaser_queue(task_id);
CREATE INDEX idx_logs_task ON chaser_logs(task_id);

-- Success message
SELECT 'All tables created successfully!' as result;
