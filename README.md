# Chaser Agent

Chaser Agent is an automated task management and reminder system designed to ensure timely task completion. It leverages a modern full-stack architecture to schedule and dispatch email reminders, integrating seamlessly with external workflow automation tools.

## Architecture

The system is built as a distributed application with the following components:

- **Frontend**: A React-based single-page application (SPA) providing a dashboard for task management, creation, and tracking.
- **Backend**: A Node.js/Express REST API that handles business logic, task scheduling, and integration with the database and external services.
- **Database**: Supabase (PostgreSQL) for persistent storage of tasks, queues, and logs.
- **Scheduler**: A background service (cron) that monitors due dates and triggers reminder workflows.
- **Notification Service**: Integrates with Boltic.io for workflow automation to send emails via Gmail.

## Tech Stack

- **Frontend**: React 18, React Router v6, Axios
- **Backend**: Node.js, Express, node-cron
- **Database**: PostgreSQL (Supabase)
- **Infrastructure**: Boltic.io (Workflows/Webhooks)

## Prerequisites

- Node.js 18+
- npm or yarn
- Supabase project
- Boltic.io account
- Gmail account (for sender identity)

## Installation & Setup

### 1. Database Setup (Supabase)

Execute the `database/schema.sql` script in your Supabase SQL Editor to initialize the database schema. This will create the necessary tables (`tasks`, `chaser_queue`, `chaser_logs`) and indexes.

### 2. Backend Configuration

Navigate to the `backend` directory and install dependencies:

```bash
cd backend
npm install
```

Create a `.env` file in the `backend` directory with the following configuration:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
BOLTIC_WEBHOOK_URL=your_boltic_webhook_url
PORT=3001
FRONTEND_URL=http://localhost:3000
```

Start the backend server:

```bash
npm start
```

### 3. Frontend Configuration

Navigate to the `frontend` directory and install dependencies:

```bash
cd frontend
npm install
```

Start the development server:

```bash
npm start
```

The application will be available at `http://localhost:3000`.

## Features

- **Task Management**: Create, view, update, and track tasks with priority levels and due dates.
- **Automated Scheduling**: Automatically schedules reminders based on task due dates.
- **Multi-channel Support**: 
    - **Email Integration**: Automated reminders via Boltic/Gmail.
    - **Slack Integration**: Metadata support for Slack channels.
    - **SMS/Phone**: Database support for phone call and SMS configs.
- **Conflict Detection**: Google Calendar integration features for detecting schedule conflicts.
- **Operational Logging**: Comprehensive logging of all sent chasers and system actions.

## API Documentation

### Tasks

- `GET /api/tasks` - Retrieve all tasks
- `POST /api/tasks` - Create a new task
- `GET /api/tasks/:id` - Retrieve task details
- `PATCH /api/tasks/:id` - Update a task

### Queue & Statistics

- `GET /api/queue/upcoming` - Retrieve pending chaser queue
- `GET /api/stats` - Retrieve system statistics

### Webhooks

- `POST /api/webhooks/boltic/chaser-sent` - Callback for successful dispatch
- `POST /api/webhooks/boltic/chaser-failed` - Callback for failed dispatch

## License

MIT
