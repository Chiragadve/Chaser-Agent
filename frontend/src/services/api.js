/**
 * API Service Layer
 * Handles all HTTP requests to the backend
 */

import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
    baseURL: 'http://localhost:3001/api',
    headers: {
        'Content-Type': 'application/json'
    },
    timeout: 30000 // Increased from 10s to 30s
});

// Request interceptor for retry logic
api.interceptors.request.use((config) => {
    config.retryCount = config.retryCount || 0;
    return config;
});

// Response interceptor for error handling with retry
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const config = error.config;

        // Retry once on timeout or network error
        if ((error.code === 'ECONNABORTED' || !error.response) && config.retryCount < 1) {
            config.retryCount += 1;
            console.warn('[API] Retrying request...', config.url);
            return api(config);
        }

        // Only log non-timeout errors to reduce console noise
        if (error.code !== 'ECONNABORTED') {
            console.error('[API Error]', error.response?.data || error.message);
        }
        throw error;
    }
);

/**
 * Create a new task
 * @param {Object} taskData - Task data { title, assignee_email, assignee_name, due_date, priority }
 * @returns {Promise<Object>} Created task
 */
export async function createTask(taskData) {
    try {
        const response = await api.post('/tasks', taskData);
        return response.data;
    } catch (error) {
        const message = error.response?.data?.error || 'Failed to create task';
        throw new Error(message);
    }
}

/**
 * Get all tasks
 * @returns {Promise<Array>} List of tasks
 */
export async function getTasks() {
    try {
        const response = await api.get('/tasks');
        return response.data;
    } catch (error) {
        const message = error.response?.data?.error || 'Failed to fetch tasks';
        throw new Error(message);
    }
}

/**
 * Get a single task by ID with chaser logs
 * @param {string} id - Task ID
 * @returns {Promise<Object>} Task with chaser history
 */
export async function getTask(id) {
    try {
        const response = await api.get(`/tasks/${id}`);
        return response.data;
    } catch (error) {
        if (error.response?.status === 404) {
            throw new Error('Task not found');
        }
        const message = error.response?.data?.error || 'Failed to fetch task';
        throw new Error(message);
    }
}

/**
 * Update a task
 * @param {string} id - Task ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated task
 */
export async function updateTask(id, updates) {
    try {
        const response = await api.patch(`/tasks/${id}`, updates);
        return response.data;
    } catch (error) {
        const message = error.response?.data?.error || 'Failed to update task';
        throw new Error(message);
    }
}

/**
 * Get upcoming chasers in the queue
 * @returns {Promise<Array>} List of upcoming chasers
 */
export async function getUpcomingChasers() {
    try {
        const response = await api.get('/queue/upcoming');
        return response.data;
    } catch (error) {
        const message = error.response?.data?.error || 'Failed to fetch upcoming chasers';
        throw new Error(message);
    }
}

/**
 * Get dashboard statistics
 * @returns {Promise<Object>} Stats { totalTasks, pendingTasks, chasersSentToday }
 */
export async function getStats() {
    try {
        const response = await api.get('/stats');
        return response.data;
    } catch (error) {
        const message = error.response?.data?.error || 'Failed to fetch stats';
        throw new Error(message);
    }
}

/**
 * Update task timeline and trigger Google Calendar update
 * @param {string} id - Task ID
 * @param {string} eventStart - New start datetime ISO string
 * @param {string} eventEnd - New end datetime ISO string
 * @returns {Promise<Object>} Result with updated task
 */
/**
 * Send a manual nudge for a task
 * @param {string} taskId - Task ID
 * @param {Object} channels - Channels to use { email, slack, sms, call }
 * @returns {Promise<Object>} Result
 */
export async function sendNudge(taskId, channels) {
    try {
        const response = await api.post('/nudges', {
            taskId,
            channels
        });
        return response.data;
    } catch (error) {
        const message = error.response?.data?.error || 'Failed to send nudge';
        throw new Error(message);
    }
}

export async function triggerTimelineUpdate(id, eventStart, eventEnd) {
    try {
        const response = await api.post(`/tasks/${id}/update-timeline`, {
            event_start: eventStart,
            event_end: eventEnd
        });
        return response.data;
    } catch (error) {
        const message = error.response?.data?.error || 'Failed to update timeline';
        throw new Error(message);
    }
}

export default api;
