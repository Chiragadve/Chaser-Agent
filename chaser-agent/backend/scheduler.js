/**
 * Chaser Agent Background Scheduler
 * Runs every minute to process pending chaser reminders
 */

const cron = require('node-cron');
const axios = require('axios');

let supabaseClient = null;

// Helper function for logging
function log(message, data = null) {
    const timestamp = new Date().toISOString();
    if (data) {
        console.log(`[${timestamp}] [SCHEDULER] ${message}`, data);
    } else {
        console.log(`[${timestamp}] [SCHEDULER] ${message}`);
    }
}

/**
 * Process pending chasers that are due to be sent
 */
async function processPendingChasers() {
    if (!supabaseClient) {
        log('⚠️ Supabase client not initialized');
        return;
    }

    const bolticWebhookUrl = process.env.BOLTIC_WEBHOOK_URL;
    if (!bolticWebhookUrl) {
        log('⚠️ BOLTIC_WEBHOOK_URL not configured - skipping chaser processing');
        return;
    }

    try {
        const now = new Date().toISOString();

        // Query pending chasers that are due
        const { data: pendingChasers, error } = await supabaseClient
            .from('chaser_queue')
            .select(`
        *,
        tasks (
          id,
          title,
          assignee_name,
          assignee_email,
          due_date,
          status,
          priority,
          slack_channel,
          phone_number,
          enable_call
        )
      `)
            .eq('status', 'pending')
            .lte('scheduled_at', now)
            .order('scheduled_at', { ascending: true })
            .limit(5);

        if (error) {
            log('❌ Error fetching pending chasers:', error);
            return;
        }

        if (!pendingChasers || pendingChasers.length === 0) {
            log('📭 No pending chasers to process');
            return;
        }

        log(`📬 Found ${pendingChasers.length} chaser(s) to process`);

        // Process each chaser
        for (const chaser of pendingChasers) {
            // Skip if task is already completed
            if (chaser.tasks?.status === 'completed') {
                log(`⏭️ Skipping chaser for completed task: ${chaser.tasks.title}`);
                await supabaseClient
                    .from('chaser_queue')
                    .update({ status: 'cancelled' })
                    .eq('id', chaser.id);
                continue;
            }

            try {
                // Prepare payload for Boltic
                const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                // Use public URL for Boltic callbacks (ngrok when testing locally)
                const backendUrl = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`;

                // Format due date for display
                const dueDate = chaser.tasks?.due_date
                    ? new Date(chaser.tasks.due_date).toLocaleString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                    })
                    : 'Soon';

                // Create Slack-formatted message using mrkdwn
                const slackMessage = `🔔 *Task Reminder*

Hey ${chaser.tasks?.assignee_name || 'there'}! 👋

This is a friendly reminder about your upcoming task:

📋 *Task:* ${chaser.tasks?.title || 'Untitled Task'}
⚡ *Priority:* ${(chaser.tasks?.priority || 'medium').charAt(0).toUpperCase() + (chaser.tasks?.priority || 'medium').slice(1)}
📅 *Due Date:* ${dueDate}

<${frontendUrl}/tasks/${chaser.task_id}|🔗 View Task>

_Best regards,_
*Chaser Agent*`;

                // Build SMS message
                const smsMessage = `📋 Reminder: ${chaser.tasks?.title || 'Task'} is due ${dueDate}. Priority: ${(chaser.tasks?.priority || 'medium').charAt(0).toUpperCase() + (chaser.tasks?.priority || 'medium').slice(1)}.`;

                // Build TTS call message
                const callMessage = `Hello ${chaser.tasks?.assignee_name || 'there'}. This is a reminder from Chaser Agent about your task: ${chaser.tasks?.title || 'Task'}. It is due ${dueDate}. The priority is ${(chaser.tasks?.priority || 'medium').charAt(0).toUpperCase() + (chaser.tasks?.priority || 'medium').slice(1)}.`;

                // Calendar event time windows
                const taskDueDateTime = chaser.tasks?.due_date ? new Date(chaser.tasks.due_date) : new Date();
                const eventStart = new Date(taskDueDateTime.getTime() - 30 * 60 * 1000); // 30 mins before due
                const eventEnd = new Date(taskDueDateTime.getTime() + 30 * 60 * 1000);   // 30 mins after due
                const eventCheckStart = new Date(taskDueDateTime.getTime() - 60 * 60 * 1000); // 1 hour before due
                const eventCheckEnd = new Date(taskDueDateTime.getTime() + 30 * 60 * 1000);   // 30 mins after due

                const payload = {
                    queue_id: chaser.id,
                    task_id: chaser.task_id,
                    action_type: 'create', // For conditional calendar event creation
                    recipient_email: chaser.recipient_email,
                    recipient_name: chaser.tasks?.assignee_name || 'there',
                    recipient_phone: chaser.tasks?.phone_number || null,
                    enable_call: chaser.tasks?.enable_call || false,
                    subject: chaser.message_subject || `Reminder: ${chaser.tasks?.title || 'Task'} due soon`,
                    body: chaser.message_body || `This is a reminder about your task.`,
                    sms_message: smsMessage,
                    call_message: callMessage,
                    slack_message: slackMessage,
                    slack_channel: chaser.tasks?.slack_channel || null,
                    task_title: chaser.tasks?.title || 'Task',
                    task_priority: chaser.tasks?.priority || 'medium',
                    task_due_date: dueDate,
                    task_link: `${frontendUrl}/tasks/${chaser.task_id}`,
                    callback_url: `${backendUrl}/api/webhooks/boltic/chaser-sent`,
                    // Calendar conflict detection params
                    event_start: eventStart.toISOString(),
                    event_end: eventEnd.toISOString(),
                    event_check_start: eventCheckStart.toISOString(),
                    event_check_end: eventCheckEnd.toISOString(),
                    event_summary: `Task: ${chaser.tasks?.title || 'Task'}`,
                    event_description: `Priority: ${(chaser.tasks?.priority || 'medium').charAt(0).toUpperCase() + (chaser.tasks?.priority || 'medium').slice(1)}\nAssignee: ${chaser.tasks?.assignee_name || 'Unknown'}\n\nDue: ${dueDate}`,
                    conflict_callback_url: `${backendUrl}/api/webhooks/boltic/calendar-conflict`,
                    event_created_callback_url: `${backendUrl}/api/webhooks/boltic/calendar-created`
                };

                log(`🚀 Triggering Boltic webhook for task: ${chaser.tasks?.title}`);

                // Send to Boltic webhook
                const response = await axios.post(bolticWebhookUrl, payload, {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000 // 10 second timeout
                });

                log(`✅ Boltic webhook triggered successfully for task: ${chaser.tasks?.title}`);

                // Update chaser_queue status to 'triggered'
                const { error: updateError } = await supabaseClient
                    .from('chaser_queue')
                    .update({
                        status: 'triggered',
                        last_attempt_at: new Date().toISOString()
                    })
                    .eq('id', chaser.id);

                if (updateError) {
                    log('⚠️ Error updating chaser status to triggered:', updateError);
                }

            } catch (webhookError) {
                log(`❌ Failed to trigger Boltic webhook for task: ${chaser.tasks?.title}`,
                    webhookError.message);

                // Update attempt timestamp but keep status as pending for retry
                await supabaseClient
                    .from('chaser_queue')
                    .update({
                        last_attempt_at: new Date().toISOString()
                    })
                    .eq('id', chaser.id);
            }
        }

    } catch (error) {
        log('❌ Unexpected error in scheduler:', error);
    }
}

/**
 * Start the scheduler
 * @param {object} supabase - Supabase client instance
 */
function start(supabase) {
    supabaseClient = supabase;

    log('⏰ Starting chaser scheduler (runs every minute)');

    // Run every minute
    cron.schedule('* * * * *', () => {
        log('🔄 Checking for chasers to send...');
        processPendingChasers();
    });

    // Also run immediately on startup after a short delay
    setTimeout(() => {
        log('🔄 Initial check for pending chasers...');
        processPendingChasers();
    }, 5000);
}

module.exports = {
    start,
    processPendingChasers
};
