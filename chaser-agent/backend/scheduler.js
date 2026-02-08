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
          enable_call,
          calendar_event_id
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



                // Calendar event time windows
                const taskDueDateTime = chaser.tasks?.due_date ? new Date(chaser.tasks.due_date) : new Date();
                const eventStart = new Date(taskDueDateTime.getTime() - 30 * 60 * 1000); // 30 mins before due
                const eventEnd = new Date(taskDueDateTime.getTime() + 30 * 60 * 1000);   // 30 mins after due
                const eventCheckStart = new Date(taskDueDateTime.getTime() - 60 * 60 * 1000); // 1 hour before due
                const eventCheckEnd = new Date(taskDueDateTime.getTime() + 30 * 60 * 1000);   // 30 mins after due

                // Calculate escalation tier based on hours remaining
                const hoursRemaining = (taskDueDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
                let escalationTier;
                if (hoursRemaining <= 1) escalationTier = 4;
                else if (hoursRemaining <= 4) escalationTier = 3;
                else if (hoursRemaining <= 12) escalationTier = 2;
                else escalationTier = 1;

                // Format hours/minutes remaining for messages
                const timeRemainingText = hoursRemaining < 1
                    ? `${Math.round(hoursRemaining * 60)} minutes`
                    : `${Math.round(hoursRemaining)} hours`;

                // Tier-specific email subjects
                const emailSubjects = {
                    1: `Upcoming: ${chaser.tasks?.title} - Due in ${timeRemainingText}`,
                    2: `Reminder: ${chaser.tasks?.title} - Due in ${timeRemainingText}`,
                    3: `⚠️ Urgent: ${chaser.tasks?.title} - Only ${timeRemainingText} remaining!`,
                    4: `🚨 CRITICAL: ${chaser.tasks?.title} - Immediate Action Required!`
                };

                // Tier-specific Slack messages
                const slackMessages = {
                    1: `📋 *Upcoming Task*\n\nHey ${chaser.tasks?.assignee_name || 'there'}! 👋\n\nFriendly reminder about your task:\n\n📋 *Task:* ${chaser.tasks?.title}\n⚡ *Priority:* ${(chaser.tasks?.priority || 'medium').charAt(0).toUpperCase() + (chaser.tasks?.priority || 'medium').slice(1)}\n📅 *Due:* ${dueDate}\n\n<${frontendUrl}/tasks/${chaser.task_id}|🔗 View Task>`,
                    2: `🔔 *Task Reminder*\n\nHey ${chaser.tasks?.assignee_name || 'there'}! 👋\n\n*${timeRemainingText} remaining* for your task:\n\n📋 *Task:* ${chaser.tasks?.title}\n⚡ *Priority:* ${(chaser.tasks?.priority || 'medium').charAt(0).toUpperCase() + (chaser.tasks?.priority || 'medium').slice(1)}\n📅 *Due:* ${dueDate}\n\n<${frontendUrl}/tasks/${chaser.task_id}|🔗 View Task>`,
                    3: `⚠️ *URGENT - Action Required*\n\n@${chaser.tasks?.assignee_name || 'there'}\n\n*Only ${timeRemainingText} remaining!* Please attend to this task:\n\n📋 *Task:* ${chaser.tasks?.title}\n⚡ *Priority:* ${(chaser.tasks?.priority || 'medium').charAt(0).toUpperCase() + (chaser.tasks?.priority || 'medium').slice(1)}\n📅 *Due:* ${dueDate}\n\n<${frontendUrl}/tasks/${chaser.task_id}|🔗 View Task NOW>`,
                    4: `🚨 *CRITICAL ALERT*\n\n@${chaser.tasks?.assignee_name || 'there'}\n\n*ONLY ${timeRemainingText.toUpperCase()} REMAINING!*\nThis task will be OVERDUE soon!\n\n📋 *Task:* ${chaser.tasks?.title}\n⚡ *Priority:* ${(chaser.tasks?.priority || 'medium').charAt(0).toUpperCase() + (chaser.tasks?.priority || 'medium').slice(1)}\n📅 *Due:* ${dueDate}\n\n<${frontendUrl}/tasks/${chaser.task_id}|🔗 TAKE ACTION NOW>`
                };

                // Tier-specific SMS messages
                const smsMessages = {
                    1: `📋 Reminder: ${chaser.tasks?.title} due in ${timeRemainingText}.`,
                    2: `📋 Reminder: ${chaser.tasks?.title} due in ${timeRemainingText}. Please plan accordingly.`,
                    3: `⚠️ URGENT: ${chaser.tasks?.title} - Only ${timeRemainingText} remaining! Please attend to it.`,
                    4: `🚨 CRITICAL: ${chaser.tasks?.title} - Only ${timeRemainingText} left! Will be OVERDUE soon. Take action NOW!`
                };

                // Tier-specific phone call messages
                const callMessages = {
                    1: `Hello ${chaser.tasks?.assignee_name || 'there'}. This is a friendly reminder about your task: ${chaser.tasks?.title}. It is due in ${timeRemainingText}.`,
                    2: `Hello ${chaser.tasks?.assignee_name || 'there'}. Reminder: Your task ${chaser.tasks?.title} is due in ${timeRemainingText}. Please plan accordingly.`,
                    3: `Hello ${chaser.tasks?.assignee_name || 'there'}. Urgent reminder: Only ${timeRemainingText} remaining for your task: ${chaser.tasks?.title}. Please attend to it as soon as possible.`,
                    4: `ALERT! ${chaser.tasks?.assignee_name || 'there'}, this is a critical reminder. Only ${timeRemainingText} remaining for your task: ${chaser.tasks?.title}. It will be overdue soon. Please take action immediately.`
                };

                // Determine action_type: 'create' only if no calendar event exists yet
                const hasCalendarEvent = chaser.tasks?.calendar_event_id && chaser.tasks.calendar_event_id !== '';
                const actionType = hasCalendarEvent ? 'notify' : 'create';

                const payload = {
                    queue_id: chaser.id,
                    task_id: chaser.task_id,
                    action_type: actionType, // 'create' creates calendar event, 'notify' skips calendar creation
                    calendar_event_id: chaser.tasks?.calendar_event_id || null,
                    escalation_tier: escalationTier,
                    hours_remaining: hoursRemaining,
                    recipient_email: chaser.recipient_email,
                    recipient_name: chaser.tasks?.assignee_name || 'there',
                    recipient_phone: chaser.tasks?.phone_number || null,
                    enable_call: chaser.tasks?.enable_call || false,
                    subject: emailSubjects[escalationTier],
                    body: chaser.message_body || `This is a reminder about your task.`,
                    sms_message: smsMessages[escalationTier],
                    call_message: callMessages[escalationTier],
                    slack_message: slackMessages[escalationTier],
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
                    event_created_callback_url: `${backendUrl}/api/webhooks/boltic/calendar-created`,
                    // Current time for calendar busy check
                    current_time_start: new Date().toISOString(),
                    current_time_end: new Date(Date.now() + 60000).toISOString() // NOW + 1 minute
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
