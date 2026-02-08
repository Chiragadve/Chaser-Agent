/**
 * Chaser Agent Backend Server
 * Express API for managing tasks and automated email reminders
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
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
    const { title, assignee_email, assignee_name, due_date, priority, slack_channel, phone_number, enable_call } = req.body;

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
        slack_channel: cleanSlackChannel,
        phone_number: phone_number?.trim() || null,
        enable_call: enable_call || false
      })
      .select()
      .single();

    if (taskError) {
      log('Database error creating task:', taskError);
      return errorResponse(res, 500, 'Failed to create task');
    }

    // IMMEDIATELY trigger Boltic to create calendar event
    const bolticWebhookUrl = process.env.BOLTIC_WEBHOOK_URL;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const backendUrl = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`;

    if (bolticWebhookUrl) {
      // Calendar event: 1 minute slot at due time for tracking
      const eventStart = new Date(dueDateTime.getTime());
      const eventEnd = new Date(dueDateTime.getTime() + 60 * 1000); // 1 minute duration

      const calendarPayload = {
        queue_id: `create-${task.id}-${Date.now()}`,
        task_id: task.id,
        action_type: 'create',
        escalation_tier: 0, // Special tier for initial creation
        hours_remaining: (dueDateTime.getTime() - Date.now()) / (1000 * 60 * 60),
        recipient_email: task.assignee_email,
        recipient_name: assignee_name || 'there',
        recipient_phone: phone_number || null,
        enable_call: false, // Don't call on creation
        subject: `Task Created: ${task.title}`,
        body: `Your task has been created and is due ${dueDateTime.toLocaleString()}.`,
        sms_message: '', // No SMS on creation
        call_message: '', // No call on creation
        slack_message: `📋 *New Task Created*\n\n📋 *Task:* ${task.title}\n⚡ *Priority:* ${(priority || 'medium').charAt(0).toUpperCase() + (priority || 'medium').slice(1)}\n📅 *Due:* ${dueDateTime.toLocaleString()}\n\n<${frontendUrl}/tasks/${task.id}|🔗 View Task>`,
        slack_channel: cleanSlackChannel,
        task_title: task.title,
        task_priority: priority || 'medium',
        task_due_date: dueDateTime.toLocaleString(),
        task_link: `${frontendUrl}/tasks/${task.id}`,
        callback_url: `${backendUrl}/api/webhooks/boltic/chaser-sent`,
        event_start: eventStart.toISOString(),
        event_end: eventEnd.toISOString(),
        event_check_start: eventStart.toISOString(),
        event_check_end: eventEnd.toISOString(),
        event_summary: `📋 Task Due: ${task.title}`,
        event_description: `Priority: ${(priority || 'medium').charAt(0).toUpperCase() + (priority || 'medium').slice(1)}\nAssignee: ${assignee_name || 'Unknown'}\n\nDue: ${dueDateTime.toLocaleString()}\n\nLink: ${frontendUrl}/tasks/${task.id}`,
        conflict_callback_url: `${backendUrl}/api/webhooks/boltic/calendar-conflict`,
        event_created_callback_url: `${backendUrl}/api/webhooks/boltic/calendar-created`,
        current_time_start: new Date().toISOString(),
        current_time_end: new Date(Date.now() + 60000).toISOString()
      };

      try {
        await axios.post(bolticWebhookUrl, calendarPayload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        });
        log(`✅ Immediate calendar event creation triggered for task: ${task.title}`);
      } catch (bolticError) {
        log('Warning: Failed to trigger immediate calendar creation:', bolticError.message);
      }
    }

    const now = new Date();

    // Calculate chaser scheduled times for 4-tier escalation
    // Tier 1: 24 hours before, Tier 2: 12 hours before, Tier 3: 4 hours before, Tier 4: 1 hour before
    const escalationTiers = [
      { tier: 1, hoursBeforeDue: 24, name: '24h reminder' },
      { tier: 2, hoursBeforeDue: 12, name: '12h reminder' },
      { tier: 3, hoursBeforeDue: 4, name: '4h urgent' },
      { tier: 4, hoursBeforeDue: 1, name: '1h critical' }
    ];

    // now was already declared above in the calendar section, reuse it
    const scheduledChasers = [];

    for (const tierConfig of escalationTiers) {
      const chaserTime = new Date(dueDateTime.getTime() - tierConfig.hoursBeforeDue * 60 * 60 * 1000);

      // Only schedule if the chaser time is in the future
      if (chaserTime > now) {
        scheduledChasers.push({
          task_id: task.id,
          scheduled_at: chaserTime.toISOString(),
          recipient_email: task.assignee_email,
          message_subject: `Tier ${tierConfig.tier}: ${task.title} - ${tierConfig.name}`,
          message_body: `Escalation tier ${tierConfig.tier} reminder`,
          status: 'pending',
          escalation_tier: tierConfig.tier
        });
      }
    }

    // If no future chasers (task due very soon), schedule one for now + 1 minute
    if (scheduledChasers.length === 0) {
      scheduledChasers.push({
        task_id: task.id,
        scheduled_at: new Date(now.getTime() + 60 * 1000).toISOString(),
        recipient_email: task.assignee_email,
        message_subject: `URGENT: ${task.title} - Due very soon!`,
        message_body: `Immediate reminder - task due very soon`,
        status: 'pending',
        escalation_tier: 4
      });
    }

    // Insert all chaser queue entries
    const { data: chaserQueues, error: chaserError } = await supabase
      .from('chaser_queue')
      .insert(scheduledChasers)
      .select();

    if (chaserError) {
      log('Error creating chaser queue entries:', chaserError);
      // Task was created, but chaser scheduling failed - log but don't fail
    } else {
      log(`Created task: ${task.id} with ${chaserQueues.length} escalation chasers scheduled`);
    }

    res.status(201).json({
      ...task,
      chasers_scheduled: scheduledChasers.length,
      first_chaser_at: scheduledChasers[0]?.scheduled_at
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

      // Trigger Boltic to delete calendar event if exists
      const bolticWebhookUrl = process.env.BOLTIC_WEBHOOK_URL;
      if (bolticWebhookUrl && existingTask.calendar_event_id) {
        const payload = {
          queue_id: `delete-${id}-${Date.now()}`,
          task_id: id,
          action_type: 'delete',
          calendar_event_id: existingTask.calendar_event_id,
          recipient_email: existingTask.assignee_email,
          recipient_name: existingTask.assignee_name || 'there',
          subject: `Completed: ${existingTask.title}`,
          body: `Great job! Your task "${existingTask.title}" has been marked as complete.`,
          sms_message: `✅ Completed: ${existingTask.title}`,
          slack_message: `✅ *Task Completed*\n📋 *Task:* ${existingTask.title}`,
          slack_channel: existingTask.slack_channel || null,
          task_title: existingTask.title,
          event_start: new Date().toISOString(),
          event_end: new Date().toISOString(),
          event_check_start: new Date().toISOString(),
          event_check_end: new Date().toISOString(),
          event_summary: 'SKIP',
          event_description: 'SKIP',
          conflict_callback_url: `${process.env.BACKEND_PUBLIC_URL || 'http://localhost:3001'}/api/webhooks/boltic/calendar-conflict`,
          event_created_callback_url: `${process.env.BACKEND_PUBLIC_URL || 'http://localhost:3001'}/api/webhooks/boltic/calendar-event-created`
        };

        try {
          await axios.post(bolticWebhookUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          });
          log(`✅ Boltic delete webhook triggered for task: ${existingTask.title}`);
        } catch (bolticError) {
          log('Warning: Failed to trigger Boltic delete webhook:', bolticError.message);
        }
      }
    }

    res.json(updatedTask);

  } catch (error) {
    log('Unexpected error in PATCH /api/tasks/:id:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
});

/**
 * POST /api/tasks/:id/update-timeline
 * Update task timeline and trigger Boltic to update Google Calendar
 */
app.post('/api/tasks/:id/update-timeline', async (req, res) => {
  try {
    const { id } = req.params;
    const { event_start, event_end } = req.body;

    log('Received update-timeline request:', { id, event_start, event_end });

    if (!event_start || !event_end) {
      return errorResponse(res, 400, 'event_start and event_end are required');
    }

    // Fetch the task to get calendar_event_id
    const { data: task, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !task) {
      log('Task not found:', fetchError);
      return errorResponse(res, 404, 'Task not found');
    }

    if (!task.calendar_event_id) {
      return errorResponse(res, 400, 'Task does not have a calendar event to update. Create a chaser first.');
    }

    // Update task due_date
    const { data: updatedTask, error: updateError } = await supabase
      .from('tasks')
      .update({
        due_date: event_end,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      log('Error updating task:', updateError);
      return errorResponse(res, 500, 'Failed to update task');
    }

    // Trigger Boltic webhook with action_type 'update'
    const bolticWebhookUrl = process.env.BOLTIC_WEBHOOK_URL;
    const backendUrl = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    if (bolticWebhookUrl) {
      const dueDate = new Date(event_end).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });

      const payload = {
        queue_id: `update-${id}-${Date.now()}`,
        task_id: id,
        action_type: 'update', // This tells Boltic to update instead of create
        calendar_event_id: task.calendar_event_id,
        recipient_email: task.assignee_email,
        recipient_name: task.assignee_name || 'there',
        recipient_phone: task.phone_number || null,
        enable_call: false, // No calls for updates
        subject: `Updated: ${task.title}`,
        body: `Your task "${task.title}" has been rescheduled to ${dueDate}.`,
        sms_message: `📋 Update: ${task.title} rescheduled to ${dueDate}.`,
        call_message: null,
        slack_message: `🔄 *Task Updated*\n📋 *Task:* ${task.title}\n📅 *New Due:* ${dueDate}`,
        slack_channel: task.slack_channel || null,
        task_title: task.title,
        task_priority: task.priority || 'medium',
        task_due_date: dueDate,
        task_link: `${frontendUrl}/tasks/${id}`,
        callback_url: `${backendUrl}/api/webhooks/boltic/chaser-sent`,
        event_start: event_start,
        event_end: event_end,
        event_check_start: event_start,
        event_check_end: event_end,
        event_summary: `Task: ${task.title}`,
        event_description: `Priority: ${(task.priority || 'medium').charAt(0).toUpperCase() + (task.priority || 'medium').slice(1)}\nAssignee: ${task.assignee_name || 'Unknown'}\n\nDue: ${dueDate}`,
        conflict_callback_url: `${backendUrl}/api/webhooks/boltic/calendar-conflict`,
        event_created_callback_url: `${backendUrl}/api/webhooks/boltic/calendar-created`
      };

      try {
        await axios.post(bolticWebhookUrl, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        });
        log(`✅ Boltic update webhook triggered for task: ${task.title}`);
      } catch (bolticError) {
        log('Warning: Failed to trigger Boltic webhook:', bolticError.message);
        // Don't fail the request, task was still updated
      }
    }

    res.json({ success: true, task: updatedTask, message: 'Timeline updated and calendar sync triggered' });

  } catch (error) {
    log('Unexpected error in POST /api/tasks/:id/update-timeline:', error);
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
 * POST /api/webhooks/boltic/calendar-conflict
 * Boltic callback when calendar conflict is detected
 */
app.post('/api/webhooks/boltic/calendar-conflict', async (req, res) => {
  try {
    const { task_id, has_conflict, conflict_with, conflict_end_time } = req.body;

    log('📅 Received calendar-conflict webhook:', { task_id, has_conflict, conflict_with, conflict_end_time });

    if (!task_id) {
      return errorResponse(res, 400, 'task_id is required');
    }

    // Update task with conflict info
    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        has_conflict: has_conflict || false,
        conflict_with: conflict_with || null,
        conflict_end_time: conflict_end_time || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', task_id);

    if (updateError) {
      log('Error updating task with conflict info:', updateError);
      return errorResponse(res, 500, 'Failed to update task');
    }

    if (has_conflict) {
      log(`⚠️ Calendar conflict detected for task ${task_id}: ${conflict_with}`);
    } else {
      log(`✅ No calendar conflicts for task ${task_id}`);
    }

    res.json({ success: true, has_conflict, conflict_with });

  } catch (error) {
    log('Unexpected error in POST /api/webhooks/boltic/calendar-conflict:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
});

/**
 * POST /api/webhooks/boltic/calendar-created
 * Boltic callback when calendar event is created - saves the event ID for future updates
 */
app.post('/api/webhooks/boltic/calendar-created', async (req, res) => {
  try {
    const { task_id, calendar_event_id } = req.body;

    log('📅 Received calendar-created webhook:', { task_id, calendar_event_id });

    if (!task_id || !calendar_event_id) {
      return errorResponse(res, 400, 'task_id and calendar_event_id are required');
    }

    // Update task with the calendar event ID
    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        calendar_event_id: calendar_event_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', task_id);

    if (updateError) {
      log('Error updating task with calendar_event_id:', updateError);
      return errorResponse(res, 500, 'Failed to save calendar event ID');
    }

    console.log(`✅ Calendar event ID saved for task ${task_id}: ${calendar_event_id}`);
    res.json({ success: true, task_id, calendar_event_id });

  } catch (error) {
    log('Unexpected error in POST /api/webhooks/boltic/calendar-created:', error);
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
