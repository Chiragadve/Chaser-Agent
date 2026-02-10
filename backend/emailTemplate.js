/**
 * Email Template Generator
 * Generates HTML email content for chasers and nudges
 */

function generateEmailHtml(task, tier, timeRemainingText, frontendUrl) {
    const priority = (task.priority || 'medium').charAt(0).toUpperCase() + (task.priority || 'medium').slice(1);
    const dueDate = task.due_date ? new Date(task.due_date).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    }) : 'No due date';
    const taskLink = `${frontendUrl}/tasks/${task.id}`;

    // Tier definitions
    const tierConfig = {
        0: { // Manual Nudge
            subject: `👉 Nudge: ${task.title}`,
            intro: `Hi ${task.assignee_name || 'there'},`,
            message: "This is a friendly nudge about your task:"
        },
        1: { // Upcoming
            subject: `Upcoming: ${task.title} - Due in ${timeRemainingText}`,
            intro: `Hi ${task.assignee_name || 'there'},`,
            message: "This is a friendly reminder about your upcoming task:"
        },
        2: { // Reminder
            subject: `Reminder: ${task.title} - Due in ${timeRemainingText}`,
            intro: `Hi ${task.assignee_name || 'there'},`,
            message: `This is a reminder that your task is due in <strong>${timeRemainingText}</strong>. Please update your progress.`
        },
        3: { // Urgent
            subject: `⚠️ URGENT: ${task.title} - Only ${timeRemainingText} remaining!`,
            intro: `Hi ${task.assignee_name || 'there'},`,
            message: `This is an urgent reminder. Your task is due in <strong>${timeRemainingText}</strong>. Please prioritize this.`
        },
        4: { // Critical
            subject: `🚨 CRITICAL: ${task.title} - Immediate Action Required!`,
            intro: `Hi ${task.assignee_name || 'there'},`,
            message: `<strong>Critical Alert!</strong> Your task is due in <strong>${timeRemainingText}</strong>. Immediate action is required to avoid being overdue.`
        }
    };

    const config = tierConfig[tier] || tierConfig[0];

    const html = `
<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff; }
  .header { margin-bottom: 20px; border-bottom: 2px solid #4F46E5; padding-bottom: 10px; }
  .header h2 { color: #111827; margin: 0; font-size: 20px; }
  .task-details { background-color: #f3f4f6; padding: 20px; border-radius: 6px; margin: 24px 0; border-left: 4px solid #4F46E5; }
  .detail-row { margin-bottom: 12px; display: flex; align-items: flex-start; }
  .detail-row:last-child { margin-bottom: 0; }
  .label { font-weight: 700; width: 100px; color: #4b5563; flex-shrink: 0; }
  .value { color: #111827; font-weight: 500; }
  .btn { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; text-align: center; transition: background-color 0.2s; }
  .btn:hover { background-color: #4338ca; }
  .footer { margin-top: 40px; font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center; }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>${config.subject}</h2>
    </div>
    
    <p>${config.intro}</p>
    <p>${config.message}</p>
    
    <div class="task-details">
      <div class="detail-row">
        <span class="label">Task:</span>
        <span class="value">${task.title}</span>
      </div>
      <div class="detail-row">
        <span class="label">Priority:</span>
        <span class="value">${priority}</span>
      </div>
      <div class="detail-row">
        <span class="label">Due Date:</span>
        <span class="value">${dueDate}</span>
      </div>
    </div>
    
    <div style="text-align: center;">
        <a href="${taskLink}" class="btn">View Task</a>
    </div>
    
    <div class="footer">
      <p>Automated notification sent by Chaser Agent System</p>
    </div>
  </div>
</body>
</html>
    `;

    return { subject: config.subject, html };
}

module.exports = { generateEmailHtml };
