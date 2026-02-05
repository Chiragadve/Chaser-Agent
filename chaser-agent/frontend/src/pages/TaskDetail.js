import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getTask, updateTask } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/PriorityBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

/**
 * TaskDetail Page
 * Shows task details and chaser history with actions
 */
function TaskDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [task, setTask] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState(null);

    // Format date for display
    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    // Check if task is overdue
    const isOverdue = (task) => {
        if (!task || task.status === 'completed') return false;
        return new Date(task.due_date) < new Date();
    };

    // Fetch task data
    const fetchTask = useCallback(async () => {
        try {
            const data = await getTask(id);
            setTask(data);
            setError(null);
        } catch (err) {
            console.error('Error fetching task:', err);
            setError(err.message || 'Failed to load task');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchTask();
    }, [fetchTask]);

    // Handle mark complete
    const handleMarkComplete = async () => {
        setActionLoading(true);
        setSuccessMessage(null);

        try {
            const updatedTask = await updateTask(id, { status: 'completed' });
            setTask(updatedTask);
            setSuccessMessage('Task marked as completed! Pending chasers have been cancelled.');

            // Refresh to get updated chaser data
            setTimeout(fetchTask, 1000);
        } catch (err) {
            console.error('Error updating task:', err);
            setError(err.message || 'Failed to update task');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return <LoadingSpinner size="large" centered />;
    }

    if (error && !task) {
        return (
            <div className="detail-page">
                <ErrorMessage message={error} />
                <Link to="/" className="btn btn-secondary">
                    ← Back to Dashboard
                </Link>
            </div>
        );
    }

    if (!task) {
        return (
            <div className="detail-page">
                <ErrorMessage message="Task not found" />
                <Link to="/" className="btn btn-secondary">
                    ← Back to Dashboard
                </Link>
            </div>
        );
    }

    const displayStatus = isOverdue(task) ? 'overdue' : task.status;

    return (
        <div className="detail-page">
            {/* Header */}
            <div className="detail-header">
                <h1>{task.title}</h1>
                <div className="detail-badges">
                    <StatusBadge status={displayStatus} />
                    <PriorityBadge priority={task.priority} />
                </div>
            </div>

            {/* Messages */}
            {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}
            {successMessage && (
                <div className="success-message">{successMessage}</div>
            )}

            {/* Task Details */}
            <div className="detail-section">
                <h2>Task Details</h2>
                <div className="detail-grid">
                    <div className="detail-item">
                        <div className="detail-label">Assignee</div>
                        <div className="detail-value">
                            {task.assignee_name || '-'}
                            {task.assignee_email && (
                                <div style={{ fontSize: '12px', color: '#6B7280' }}>
                                    {task.assignee_email}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="detail-item">
                        <div className="detail-label">Due Date</div>
                        <div className="detail-value">{formatDate(task.due_date)}</div>
                    </div>
                    <div className="detail-item">
                        <div className="detail-label">Created</div>
                        <div className="detail-value">{formatDate(task.created_at)}</div>
                    </div>
                    <div className="detail-item">
                        <div className="detail-label">Last Updated</div>
                        <div className="detail-value">{formatDate(task.updated_at)}</div>
                    </div>
                    <div className="detail-item">
                        <div className="detail-label">Total Chasers Sent</div>
                        <div className="detail-value">{task.total_chasers_sent || 0}</div>
                    </div>
                    <div className="detail-item">
                        <div className="detail-label">Last Chaser Sent</div>
                        <div className="detail-value">
                            {task.last_chaser_sent_at ? formatDate(task.last_chaser_sent_at) : 'Never'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Pending Chasers */}
            {task.pending_chasers && task.pending_chasers.length > 0 && (
                <div className="detail-section">
                    <h2>Scheduled Chasers</h2>
                    <div className="table-wrapper">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Scheduled At</th>
                                    <th>Recipient</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {task.pending_chasers.map((chaser) => (
                                    <tr key={chaser.id}>
                                        <td>{formatDate(chaser.scheduled_at)}</td>
                                        <td>{chaser.recipient_email}</td>
                                        <td><StatusBadge status={chaser.status} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Chaser History */}
            <div className="detail-section">
                <h2>Chaser History</h2>
                {(!task.chaser_logs || task.chaser_logs.length === 0) ? (
                    <div className="empty-state">
                        No chasers sent yet
                    </div>
                ) : (
                    <div className="table-wrapper">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Sent At</th>
                                    <th>Status</th>
                                    <th>Recipient</th>
                                    <th>Subject</th>
                                </tr>
                            </thead>
                            <tbody>
                                {task.chaser_logs.map((log) => (
                                    <tr key={log.id}>
                                        <td>{formatDate(log.sent_at)}</td>
                                        <td><StatusBadge status={log.status} /></td>
                                        <td>{log.recipient_email}</td>
                                        <td>{log.message_subject || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="detail-actions">
                {task.status !== 'completed' && (
                    <button
                        className="btn btn-success"
                        onClick={handleMarkComplete}
                        disabled={actionLoading}
                    >
                        {actionLoading ? (
                            <>
                                <LoadingSpinner /> Updating...
                            </>
                        ) : (
                            '✓ Mark Complete'
                        )}
                    </button>
                )}
                <button
                    className="btn btn-secondary"
                    onClick={() => navigate('/')}
                >
                    ← Back to Dashboard
                </button>
            </div>
        </div>
    );
}

export default TaskDetail;
