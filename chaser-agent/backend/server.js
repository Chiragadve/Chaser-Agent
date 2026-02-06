/**
 * Chaser Agent Backend Server
 * Express API for managing tasks and automated email reminders
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const scheduler = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Helper function for logging
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] ${message}`, data);
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
}

// Helper function for error responses
function errorResponse(res, statusCode, message) {
  log(`Error: ${message}`);
  return res.status(statusCode).json({ error: message });
}

// Email validation helper
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// ============================================
// API ENDPOINTS
// ============================================

/**
 * POST /api/tasks
 * Create a new task and schedule a chaser reminder
 */
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, assignee_email, assignee_name, due_date, priority, slack_channel } = req.body;

    // Validation
    if (!title || !title.trim()) {
      return errorResponse(res, 400, 'Task title is required');
    }
    if (!assignee_email || !isValidEmail(assignee_email)) {
      return errorResponse(res, 400, 'Valid assignee email is required');
    }
    if (!due_date) {
      return errorResponse(res, 400, 'Due date is required');
    }

    const dueDateTime = new Date(due_date);
    if (isNaN(dueDateTime.getTime())) {
      return errorResponse(res, 400, 'Invalid due date format');
    }

    // Clean slack channel (remove # if present, trim whitespace)
    const cleanSlackChannel = slack_channel
      ? slack_channel.trim().replace(/^#/, '')
      : null;

    // Insert task
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        title: title.trim(),
        assignee_email: assignee_email.trim().toLowerCase(),
        assignee_name: assignee_name?.trim() || null,
        due_date: dueDateTime.toISOString(),
        priority: priority || 'medium',
        status: 'pending',
        slack_channel: cleanSlackChannel
      })
      .select()
      .single();

    if (taskError) {
      log('Database error creating task:', taskError);
      return errorResponse(res, 500, 'Failed to create task');
    }

    // Calculate chaser scheduled time (1 hour before due date)
    const chaserScheduledAt = new Date(dueDateTime.getTime() - 60 * 60 * 1000);
    // Format scheduled time for email body
    const formattedDueDate = dueDateTime.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });

    // Calculate relative time for subject line
    const now = new Date();
    const diffMs = dueDateTime.getTime() - now.getTime();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    let relativeTime = 'Soon';
    if (diffDays >= 2) {
      relativeTime = `in ${diffDays} days`;
    } else if (diffDays === 1 || (diffHours >= 20 && diffHours < 48)) {
      relativeTime = 'Tomorrow';
    } else if (diffHours >= 2) {
      relativeTime = `in ${diffHours} hours`;
    } else if (diffHours === 1) {
      relativeTime = 'in 1 hour';
    } else {
      relativeTime = 'Very Soon';
    }

    const taskLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/tasks/${task.id}`;

    const messageSubject = `Reminder: ${task.title} – Due ${relativeTime}`;

    // Email body in HTML format for proper line breaks in email clients
    const priorityFormatted = (priority || 'medium').charAt(0).toUpperCase() + (priority || 'medium').slice(1);

    const messageBody = `
<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
  <p>Hi ${assignee_name || 'there'},</p>
  
  <p>This is a friendly reminder about your upcoming task:</p>
  
  <table style="margin: 16px 0; border-collapse: collapse;">
    <tr>
      <td style="padding: 8px 16px 8px 0; font-weight: bold;">Task:</td>
      <td style="padding: 8px 0;">${task.title}</td>
    </tr>
    <tr>
      <td style="padding: 8px 16px 8px 0; font-weight: bold;">Priority:</td>
      <td style="padding: 8px 0;">${priorityFormatted}</td>
    </tr>
    <tr>
      <td style="padding: 8px 16px 8px 0; font-weight: bold;">Due Date:</td>
      <td style="padding: 8px 0;">${formattedDueDate}</td>
    </tr>
  </table>
  
  <p>
    <a href="${taskLink}" style="display: inline-block; padding: 10px 20px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">
      View Task
    </a>
  </p>
  
  <p style="margin-top: 24px;">
    Best regards,<br>
    <strong>Email Chaser System</strong>
  </p>
</div>
`.trim();

    // Insert chaser queue entry
    const { data: chaserQueue, error: chaserError } = await supabase
      .from('chaser_queue')
      .insert({
        task_id: task.id,
        scheduled_at: chaserScheduledAt.toISOString(),
        recipient_email: task.assignee_email,
        message_subject: messageSubject,
        message_body: messageBody,
        status: 'pending'
      })
      .select()
      .single();

    if (chaserError) {
      log('Error creating chaser queue entry:', chaserError);
      // Task was created, but chaser scheduling failed - log but don't fail
    }

    log(`Created task: ${task.id} with chaser scheduled at ${chaserScheduledAt.toISOString()}`);

    res.status(201).json({
      ...task,
      chaser_scheduled_at: chaserScheduledAt.toISOString()
    });

  } catch (error) {
    log('Unexpected error in POST /api/tasks:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
});

/**
 * GET /api/tasks
 * Fetch all tasks with pending chaser count
 */
app.get('/api/tasks', async (req, res) => {
  try {
    // Fetch all tasks
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (tasksError) {
      log('Database error fetching tasks:', tasksError);
      return errorResponse(res, 500, 'Failed to fetch tasks');
    }

    // Fetch pending chaser counts for each task
    const tasksWithChaserCount = await Promise.all(
      tasks.map(async (task) => {
        const { count } = await supabase
          .from('chaser_queue')
          .select('*', { count: 'exact', head: true })
          .eq('task_id', task.id)
          .eq('status', 'pending');

        return {
          ...task,
          pending_chasers_count: count || 0
        };
      })
    );

    res.json(tasksWithChaserCount);

  } catch (error) {
    log('Unexpected error in GET /api/tasks:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
});

/**
 * GET /api/tasks/:id
 * Fetch single task with chaser logs
 */
app.get('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch task
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (taskError || !task) {
      return errorResponse(res, 404, 'Task not found');
    }

    // Fetch chaser logs for this task
    const { data: chaserLogs, error: logsError } = await supabase
      .from('chaser_logs')
      .select('*')
      .eq('task_id', id)
      .order('sent_at', { ascending: false });

    if (logsError) {
      log('Error fetching chaser logs:', logsError);
    }

    // Fetch pending chasers
    const { data: pendingChasers } = await supabase
      .from('chaser_queue')
      .select('*')
      .eq('task_id', id)
      .eq('status', 'pending');

    res.json({
      ...task,
      chaser_logs: chaserLogs || [],
      pending_chasers: pendingChasers || []
    });

  } catch (error) {
    log('Unexpected error in GET /api/tasks/:id:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
});

/**
 * PATCH /api/tasks/:id
 * Update task (status, due_date, etc.)
 */
app.patch('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check if task exists
    const { data: existingTask, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingTask) {
      return errorResponse(res, 404, 'Task not found');
    }

    // Prepare update data
    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (updates.title) updateData.title = updates.title.trim();
    if (updates.status) updateData.status = updates.status;
    if (updates.priority) updateData.priority = updates.priority;
    if (updates.due_date) updateData.due_date = new Date(updates.due_date).toISOString();
    if (updates.assignee_email) updateData.assignee_email = updates.assignee_email.trim().toLowerCase();
    if (updates.assignee_name !== undefined) updateData.assignee_name = updates.assignee_name?.trim() || null;

    // Update task
    const { data: updatedTask, error: updateError } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      log('Database error updating task:', updateError);
      return errorResponse(res, 500, 'Failed to update task');
    }

    // If status changed to 'completed', cancel pending chasers
    if (updates.status === 'completed') {
      const { error: cancelError } = await supabase
        .from('chaser_queue')
        .update({ status: 'cancelled' })
        .eq('task_id', id)
        .eq('status', 'pending');

      if (cancelError) {
        log('Error cancelling pending chasers:', cancelError);
      } else {
        log(`Cancelled pending chasers for completed task: ${id}`);
      }
    }

    res.json(updatedTask);

  } catch (error) {
    log('Unexpected error in PATCH /api/tasks/:id:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
});

/**
 * GET /api/queue/upcoming
 * Fetch next 5 upcoming pending chasers
 */
app.get('/api/queue/upcoming', async (req, res) => {
  try {
    const { data: upcomingChasers, error } = await supabase
      .from('chaser_queue')
      .select(`
        *,
        tasks (
          id,
          title,
          assignee_name,
          assignee_email,
          due_date
        )
      `)
      .eq('status', 'pending')
      .order('scheduled_at', { ascending: true })
      .limit(5);

    if (error) {
      log('Database error fetching upcoming chasers:', error);
      return errorResponse(res, 500, 'Failed to fetch upcoming chasers');
    }

    // Format response for frontend
    const formattedChasers = upcomingChasers.map(chaser => ({
      id: chaser.id,
      task_id: chaser.task_id,
      scheduled_at: chaser.scheduled_at,
      recipient_email: chaser.recipient_email,
      message_subject: chaser.message_subject,
      task_title: chaser.tasks?.title || 'Unknown Task',
      assignee_name: chaser.tasks?.assignee_name,
      due_date: chaser.tasks?.due_date
    }));

    res.json(formattedChasers);

  } catch (error) {
    log('Unexpected error in GET /api/queue/upcoming:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
});

/**
 * POST /api/webhooks/boltic/chaser-sent
 * Boltic callback when email successfully sent
 */
app.post('/api/webhooks/boltic/chaser-sent', async (req, res) => {
  try {
    const { queue_id, status, sent_at, boltic_execution_id } = req.body;

    log('Received chaser-sent webhook:', { queue_id, status, boltic_execution_id });

    if (!queue_id) {
      return errorResponse(res, 400, 'queue_id is required');
    }

    // Fetch the queue entry
    const { data: queueEntry, error: fetchError } = await supabase
      .from('chaser_queue')
      .select('*')
      .eq('id', queue_id)
      .single();

    if (fetchError || !queueEntry) {
      log('Queue entry not found:', queue_id);
      return errorResponse(res, 404, 'Queue entry not found');
    }

    const sentTimestamp = sent_at ? new Date(sent_at).toISOString() : new Date().toISOString();

    // Update chaser_queue
    const { error: updateQueueError } = await supabase
      .from('chaser_queue')
      .update({
        status: 'sent',
        sent_at: sentTimestamp
      })
      .eq('id', queue_id);

    if (updateQueueError) {
      log('Error updating queue entry:', updateQueueError);
    }

    // Insert into chaser_logs
    const { error: logError } = await supabase
      .from('chaser_logs')
      .insert({
        task_id: queueEntry.task_id,
        queue_id: queue_id,
        sent_at: sentTimestamp,
        status: 'sent',
        recipient_email: queueEntry.recipient_email,
        message_subject: queueEntry.message_subject,
        message_body: queueEntry.message_body,
        boltic_execution_id: boltic_execution_id || null
      });

    if (logError) {
      log('Error creating chaser log:', logError);
    }

    // Update task counters
    const { error: updateTaskError } = await supabase
      .from('tasks')
      .update({
        total_chasers_sent: supabase.rpc ? undefined : 1, // Will be incremented via raw SQL below
        last_chaser_sent_at: sentTimestamp,
        updated_at: new Date().toISOString()
      })
      .eq('id', queueEntry.task_id);

    // Increment total_chasers_sent using raw update
    await supabase.rpc('increment_chaser_count', { task_uuid: queueEntry.task_id }).catch(() => {
      // If RPC doesn't exist, use a direct update
      supabase
        .from('tasks')
        .select('total_chasers_sent')
        .eq('id', queueEntry.task_id)
        .single()
        .then(({ data }) => {
          if (data) {
            supabase
              .from('tasks')
              .update({ total_chasers_sent: (data.total_chasers_sent || 0) + 1 })
              .eq('id', queueEntry.task_id);
          }
        });
    });

    log(`✅ Chaser sent successfully for task: ${queueEntry.task_id}`);

    res.json({ success: true });

  } catch (error) {
    log('Unexpected error in POST /api/webhooks/boltic/chaser-sent:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
});

/**
 * POST /api/webhooks/boltic/chaser-failed
 * Boltic callback when email fails
 */
app.post('/api/webhooks/boltic/chaser-failed', async (req, res) => {
  try {
    const { queue_id, error_message } = req.body;

    log('Received chaser-failed webhook:', { queue_id, error_message });

    if (!queue_id) {
      return errorResponse(res, 400, 'queue_id is required');
    }

    // Fetch the queue entry
    const { data: queueEntry, error: fetchError } = await supabase
      .from('chaser_queue')
      .select('*')
      .eq('id', queue_id)
      .single();

    if (fetchError || !queueEntry) {
      log('Queue entry not found:', queue_id);
      return errorResponse(res, 404, 'Queue entry not found');
    }

    // Update chaser_queue
    const { error: updateQueueError } = await supabase
      .from('chaser_queue')
      .update({
        status: 'failed',
        last_attempt_at: new Date().toISOString()
      })
      .eq('id', queue_id);

    if (updateQueueError) {
      log('Error updating queue entry:', updateQueueError);
    }

    // Insert into chaser_logs
    const { error: logError } = await supabase
      .from('chaser_logs')
      .insert({
        task_id: queueEntry.task_id,
        queue_id: queue_id,
        sent_at: new Date().toISOString(),
        status: 'failed',
        recipient_email: queueEntry.recipient_email,
        message_subject: queueEntry.message_subject,
        message_body: `${queueEntry.message_body}\n\n[ERROR: ${error_message || 'Unknown error'}]`
      });

    if (logError) {
      log('Error creating chaser log:', logError);
    }

    log(`❌ Chaser failed for task: ${queueEntry.task_id} - ${error_message}`);

    res.json({ success: true });

  } catch (error) {
    log('Unexpected error in POST /api/webhooks/boltic/chaser-failed:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
});

/**
 * GET /api/stats
 * Get dashboard statistics
 */
app.get('/api/stats', async (req, res) => {
  try {
    // Total tasks count
    const { count: totalTasks } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true });

    // Pending tasks count
    const { count: pendingTasks } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Chasers sent today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: chasersSentToday } = await supabase
      .from('chaser_logs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today.toISOString())
      .eq('status', 'sent');

    res.json({
      totalTasks: totalTasks || 0,
      pendingTasks: pendingTasks || 0,
      chasersSentToday: chasersSentToday || 0
    });

  } catch (error) {
    log('Unexpected error in GET /api/stats:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  log('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  log(`🚀 Chaser Agent Backend running on port ${PORT}`);
  log(`📡 CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);

  // Start the scheduler
  scheduler.start(supabase);
});

module.exports = app;
