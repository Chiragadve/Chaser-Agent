import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createTask } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

/**
 * CreateTask Page
 * Form to create a new task with validation
 */
function CreateTask() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        title: '',
        assignee_name: '',
        assignee_email: '',
        due_date: '',
        priority: 'medium',
        slack_channel: ''
    });
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [submitError, setSubmitError] = useState(null);
    const [success, setSuccess] = useState(false);

    // Get minimum datetime (now)
    const getMinDateTime = () => {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        return now.toISOString().slice(0, 16);
    };

    // Handle input changes
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        // Clear field error when user types
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: null }));
        }
    };

    // Validate form
    const validateForm = () => {
        const newErrors = {};

        if (!formData.title.trim()) {
            newErrors.title = 'Task title is required';
        }

        if (!formData.assignee_name.trim()) {
            newErrors.assignee_name = 'Assignee name is required';
        }

        if (!formData.assignee_email.trim()) {
            newErrors.assignee_email = 'Assignee email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.assignee_email)) {
            newErrors.assignee_email = 'Please enter a valid email address';
        }

        if (!formData.due_date) {
            newErrors.due_date = 'Due date is required';
        } else if (new Date(formData.due_date) < new Date()) {
            newErrors.due_date = 'Due date must be in the future';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitError(null);

        if (!validateForm()) {
            return;
        }

        setLoading(true);

        try {
            await createTask({
                title: formData.title.trim(),
                assignee_name: formData.assignee_name.trim(),
                assignee_email: formData.assignee_email.trim(),
                due_date: new Date(formData.due_date).toISOString(),
                priority: formData.priority,
                slack_channel: formData.slack_channel.trim() || null
            });

            setSuccess(true);

            // Redirect after 2 seconds
            setTimeout(() => {
                navigate('/');
            }, 2000);

        } catch (err) {
            console.error('Error creating task:', err);
            setSubmitError(err.message || 'Failed to create task');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="form-page">
                <div className="success-message">
                    ✅ Task created successfully! A chaser reminder has been scheduled.
                    <br />
                    <small>Redirecting to dashboard...</small>
                </div>
            </div>
        );
    }

    return (
        <div className="form-page">
            <h1>Create New Task</h1>

            {submitError && <ErrorMessage message={submitError} onDismiss={() => setSubmitError(null)} />}

            <form onSubmit={handleSubmit} className="card">
                {/* Task Title */}
                <div className="form-group">
                    <label className="form-label" htmlFor="title">
                        Task Title *
                    </label>
                    <input
                        type="text"
                        id="title"
                        name="title"
                        className={`form-input ${errors.title ? 'error' : ''}`}
                        placeholder="Enter task title"
                        value={formData.title}
                        onChange={handleChange}
                        disabled={loading}
                        maxLength={500}
                    />
                    {errors.title && <div className="form-error">{errors.title}</div>}
                </div>

                {/* Assignee Name */}
                <div className="form-group">
                    <label className="form-label" htmlFor="assignee_name">
                        Assignee Name *
                    </label>
                    <input
                        type="text"
                        id="assignee_name"
                        name="assignee_name"
                        className={`form-input ${errors.assignee_name ? 'error' : ''}`}
                        placeholder="e.g., John Doe"
                        value={formData.assignee_name}
                        onChange={handleChange}
                        disabled={loading}
                        maxLength={255}
                    />
                    {errors.assignee_name && <div className="form-error">{errors.assignee_name}</div>}
                </div>

                {/* Assignee Email */}
                <div className="form-group">
                    <label className="form-label" htmlFor="assignee_email">
                        Assignee Email *
                    </label>
                    <input
                        type="email"
                        id="assignee_email"
                        name="assignee_email"
                        className={`form-input ${errors.assignee_email ? 'error' : ''}`}
                        placeholder="e.g., john@example.com"
                        value={formData.assignee_email}
                        onChange={handleChange}
                        disabled={loading}
                        maxLength={255}
                    />
                    {errors.assignee_email && <div className="form-error">{errors.assignee_email}</div>}
                </div>

                {/* Due Date */}
                <div className="form-group">
                    <label className="form-label" htmlFor="due_date">
                        Due Date & Time *
                    </label>
                    <input
                        type="datetime-local"
                        id="due_date"
                        name="due_date"
                        className={`form-input ${errors.due_date ? 'error' : ''}`}
                        value={formData.due_date}
                        onChange={handleChange}
                        disabled={loading}
                        min={getMinDateTime()}
                    />
                    {errors.due_date && <div className="form-error">{errors.due_date}</div>}
                    <small style={{ color: '#6B7280', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                        A reminder will be sent 1 hour before the due date
                    </small>
                </div>

                {/* Priority */}
                <div className="form-group">
                    <label className="form-label" htmlFor="priority">
                        Priority
                    </label>
                    <select
                        id="priority"
                        name="priority"
                        className="form-select"
                        value={formData.priority}
                        onChange={handleChange}
                        disabled={loading}
                    >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                    </select>
                </div>

                {/* Slack Channel (Optional) */}
                <div className="form-group">
                    <label className="form-label" htmlFor="slack_channel">
                        Slack Channel (Optional)
                    </label>
                    <input
                        type="text"
                        id="slack_channel"
                        name="slack_channel"
                        className="form-input"
                        placeholder="e.g., #project-alerts or project-alerts"
                        value={formData.slack_channel}
                        onChange={handleChange}
                        disabled={loading}
                        maxLength={100}
                    />
                    <small style={{ color: '#6B7280', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                        Leave empty to skip Slack notification. Bot must be in the channel.
                    </small>
                </div>

                {/* Form Actions */}
                <div className="form-actions">
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <LoadingSpinner /> Creating...
                            </>
                        ) : (
                            'Create Task'
                        )}
                    </button>
                    <Link to="/" className="btn btn-secondary">
                        Cancel
                    </Link>
                </div>
            </form>
        </div>
    );
}

export default CreateTask;
