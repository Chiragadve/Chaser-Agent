# 📬 Chaser Agent

Automated email reminder system for task management. Send timely reminders to assignees before task due dates using Boltic workflow automation.

## Overview

Chaser Agent is a full-stack application that:
1. Lets users create tasks with due dates and assignee emails
2. Automatically schedules reminder emails (1 hour before due date)
3. Uses Boltic workflows to send emails via Gmail
4. Tracks all sent reminders with delivery confirmation

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React App     │────▶│   Express API   │────▶│    Supabase     │
│   (Port 3000)   │◀────│   (Port 3001)   │◀────│   PostgreSQL    │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 │ Scheduler triggers
                                 ▼
                        ┌─────────────────┐
                        │  Boltic Webhook │
                        │   (Workflow)    │
                        └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │     Gmail       │
                        │  (Send Email)   │
                        └─────────────────┘
```

### Tech Stack

- **Frontend**: React 18, React Router v6, Axios
- **Backend**: Node.js, Express, node-cron
- **Database**: Supabase (PostgreSQL)
- **Automation**: Boltic workflows
- **Email**: Gmail (via Boltic)

---

## Prerequisites

Before you begin, ensure you have:
- [ ] Node.js 18+ installed
- [ ] Supabase account (free tier works)
- [ ] Boltic account (free tier works)
- [ ] Gmail account (for sending emails)

---

## Setup Instructions

### Part A: Supabase Setup

🛑 **EXTERNAL SETUP REQUIRED**

> Complete these steps at https://supabase.com before continuing.

**Step 1: Create Project**
1. Go to https://supabase.com
2. Click "Start your project" → Sign up/Login
3. Click "New Project"
4. Fill in:
   - **Name**: `chaser-agent`
   - **Database Password**: (choose a strong password, save it!)
   - **Region**: (choose closest to you)
5. Click "Create new project"
6. Wait 2-3 minutes for project initialization

**Step 2: Get Your Credentials**
1. Click ⚙️ **Settings** (gear icon) in the left sidebar
2. Click **API** under Configuration
3. Copy these values:
   - **Project URL** → This is your `SUPABASE_URL`
   - **service_role key** (under Project API keys) → This is your `SUPABASE_SERVICE_KEY`

> ⚠️ **IMPORTANT**: Keep the `service_role` key SECRET! Never commit it to git.

**Step 3: Create Database Tables**
1. Click **SQL Editor** in the left sidebar
2. Click **New query**
3. Paste the following SQL:

```sql
-- Table 1: tasks
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

-- Indexes for performance
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_queue_scheduled ON chaser_queue(scheduled_at) WHERE status = 'pending';
```

4. Click **Run** (or press Cmd/Ctrl + Enter)
5. Verify tables were created: Click **Table Editor** → You should see `tasks`, `chaser_queue`, `chaser_logs`

✅ **Supabase setup complete!**

---

### Part B: Backend Setup

1. Open terminal and navigate to the backend folder:
```bash
cd chaser-agent/backend
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Edit `.env` and add your Supabase credentials:
```
SUPABASE_URL=<paste your Project URL from Step A>
SUPABASE_SERVICE_KEY=<paste your service_role key from Step A>
BOLTIC_WEBHOOK_URL=<leave blank for now>
PORT=3001
FRONTEND_URL=http://localhost:3000
```

5. Start the backend (after Boltic setup is complete):
```bash
npm start
```

You should see:
```
[timestamp] 🚀 Chaser Agent Backend running on port 3001
[timestamp] ⏰ Starting chaser scheduler (runs every minute)
```

---

### Part C: Boltic Setup

🛑 **EXTERNAL SETUP REQUIRED**

> Complete these steps at https://boltic.io before continuing.

**Step 1: Create Account & Workflow**
1. Go to https://app.boltic.io
2. Sign up / Login
3. Click "+ New Workflow" or "Create Workflow"
4. Name it: `Email Chaser Sender`

**Step 2: Configure Webhook Trigger**
1. Add a trigger → Select **Webhook**
2. Copy the webhook URL shown (looks like: `https://app.boltic.io/webhooks/trigger/abc123xyz`)
3. 📝 **SAVE THIS URL** - you need it for your `.env` file

Configure test payload:
```json
{
  "queue_id": "test-123",
  "task_id": "test-456",
  "recipient_email": "YOUR_EMAIL@gmail.com",
  "recipient_name": "Test User",
  "subject": "Test Reminder",
  "body": "This is a test chaser email.",
  "task_link": "http://localhost:3000/tasks/test-456",
  "callback_url": "http://localhost:3001/api/webhooks/boltic/chaser-sent"
}
```

**Step 3: Add Email Step**
1. Click **+ Add Step** → Select **Gmail** (or Email → Send Email)
2. Connect your Gmail account (OAuth flow)
3. Configure:
   - **To**: `{{recipient_email}}`
   - **Subject**: `{{subject}}`
   - **Body**: `{{body}}`

**Step 4: Add Callback Step**
1. Click **+ Add Step** → Select **HTTP Request**
2. Configure:
   - **Method**: POST
   - **URL**: `{{callback_url}}`
   - **Headers**: `Content-Type: application/json`
   - **Body**:
```json
{
  "queue_id": "{{queue_id}}",
  "status": "sent",
  "sent_at": "{{$now}}",
  "boltic_execution_id": "{{$execution_id}}"
}
```

**Step 5: Test & Activate**
1. Click **Test** with the test payload
2. Verify:
   - ✅ Email received in your inbox
   - ✅ Backend console shows callback (if running)
3. Click **Save** and **Activate**

**Step 6: Update Backend**
1. Add the webhook URL to `backend/.env`:
```
BOLTIC_WEBHOOK_URL=<paste webhook URL>
```
2. Restart backend: `npm start`

✅ **Boltic setup complete!**

---

### Part D: Frontend Setup

1. Open a new terminal and navigate to frontend:
```bash
cd chaser-agent/frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Browser should open http://localhost:3000

✅ **Frontend setup complete!**

---

## Testing the Full Flow

Follow this complete test scenario:

### 1. Create a Test Task
1. Open http://localhost:3000
2. Click **+ New Task**
3. Fill in:
   - **Title**: "Test Budget Review"
   - **Assignee Name**: "John Doe"
   - **Assignee Email**: YOUR_EMAIL@gmail.com (use your real email!)
   - **Due Date**: Set to 1.5 hours from now
   - **Priority**: High
4. Click **Create Task**

### 2. Verify Task Creation
- Should see success message
- Should redirect to dashboard
- Task should appear in the table
- Check "Upcoming Chasers" widget - should show reminder

### 3. Wait for Chaser Execution
- Wait until the scheduled time (30 minutes before due date)
- Or for faster testing, modify `scheduler.js` to run every 10 seconds

### 4. Verify Email Sent
✅ Check backend console for:
```
[timestamp] 🔄 Checking for chasers to send...
[timestamp] ✅ Triggered chaser for task: Test Budget Review
```

✅ Check your email inbox for the reminder

### 5. Verify Dashboard Update
- Refresh the dashboard
- Task should show "1 sent" in Chasers column
- Click **View** on the task
- Chaser History should show the sent entry

### 6. Test Mark Complete
- Click **Mark Complete**
- Status should change to "Completed"
- Any pending chasers should be cancelled

🎉 **Success! All systems working!**

---

## Troubleshooting

### Backend won't start
- ✓ Check `.env` file has correct values
- ✓ Run `npm install`
- ✓ Verify Supabase project is active (not paused)

### Can't connect to Supabase
- ✓ Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in `.env`
- ✓ Check Supabase project status in dashboard
- ✓ Test by viewing Table Editor in Supabase

### Boltic webhook not triggering
- ✓ Check `BOLTIC_WEBHOOK_URL` in `.env` is correct
- ✓ Test webhook manually in Boltic interface
- ✓ Verify workflow is activated

### Email not sending
- ✓ Check Gmail account is connected in Boltic
- ✓ Test email step in Boltic
- ✓ Look for errors in Boltic execution logs

### Scheduler not running
- ✓ Check backend console for scheduler messages
- ✓ Verify `chaser_queue` has pending items in Supabase
- ✓ Check `scheduled_at` is in the past

### Frontend can't fetch tasks
- ✓ Check backend is running on port 3001
- ✓ Check browser console (F12) for errors
- ✓ Verify CORS is enabled (check backend console)
- ✓ Test: http://localhost:3001/api/health

---

## Project Structure

```
chaser-agent/
├── backend/
│   ├── server.js          # Express API + endpoints
│   ├── scheduler.js        # Cron job for chaser queue
│   ├── package.json
│   ├── .env.example
│   └── .gitignore
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── StatusBadge.js
│   │   │   ├── PriorityBadge.js
│   │   │   ├── LoadingSpinner.js
│   │   │   └── ErrorMessage.js
│   │   ├── pages/
│   │   │   ├── Dashboard.js
│   │   │   ├── CreateTask.js
│   │   │   └── TaskDetail.js
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── App.js
│   │   ├── App.css
│   │   └── index.js
│   ├── package.json
│   └── .gitignore
└── README.md
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List all tasks |
| POST | `/api/tasks` | Create new task |
| GET | `/api/tasks/:id` | Get task details |
| PATCH | `/api/tasks/:id` | Update task |
| GET | `/api/queue/upcoming` | Get upcoming chasers |
| GET | `/api/stats` | Get dashboard stats |
| GET | `/api/health` | Health check |
| POST | `/api/webhooks/boltic/chaser-sent` | Boltic success callback |
| POST | `/api/webhooks/boltic/chaser-failed` | Boltic failure callback |

---

## License

MIT
