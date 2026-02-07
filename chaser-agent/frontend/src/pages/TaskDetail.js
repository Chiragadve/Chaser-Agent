import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getTask, updateTask, triggerTimelineUpdate } from '../services/api';
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

    // Timeline update modal state
    const [showTimelineModal, setShowTimelineModal] = useState(false);
    const [timelineStart, setTimelineStart] = useState('');
    const [timelineEnd, setTimelineEnd] = useState('');
    const [isRecommendedStart, setIsRecommendedStart] = useState(true);
    const [recommendedStart, setRecommendedStart] = useState('');
    const [timelineLoading, setTimelineLoading] = useState(false);

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

    // Log calendar conflict info to console for debugging
    useEffect(() => {
        if (task) {
            if (task.has_conflict) {
                console.warn('📅 CALENDAR CONFLICT DETECTED:', {
                    task_id: task.id,
                    task_title: task.title,
                    has_conflict: task.has_conflict,
                    conflict_with: task.conflict_with
                });
            } else {
                console.log('✅ No calendar conflicts for task:', task.title);
            }
        }
    }, [task]);

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

    // Get datetime in local format for input
    const toLocalDatetime = (isoString) => {
        if (!isoString) return '';
        const date = new Date(isoString);
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        return date.toISOString().slice(0, 16);
    };

    // Open timeline update modal
    const handleOpenTimelineModal = () => {
        let recommended;

        // Use the latest conflict event's end time as recommended start
        if (task?.conflict_end_time) {
            // Use the stored conflict end time (latest calendar event deadline)
            recommended = toLocalDatetime(task.conflict_end_time);
        } else {
            // Fallback to task due_date if no conflict data
            const taskDue = task?.due_date ? new Date(task.due_date) : new Date();
            recommended = toLocalDatetime(taskDue.toISOString());
        }

        setRecommendedStart(recommended);
        setTimelineStart(recommended);
        setTimelineEnd('');
        setIsRecommendedStart(true);
        setShowTimelineModal(true);
    };

    // Handle start time change
    const handleStartChange = (e) => {
        const value = e.target.value;
        setTimelineStart(value);
        setIsRecommendedStart(value === recommendedStart);
    };

    // Handle timeline update submit
    const handleTimelineSubmit = async () => {
        if (!timelineStart || !timelineEnd) {
            setError('Please fill in both start and end times');
            return;
        }

        setTimelineLoading(true);
        setError(null);

        try {
            const startISO = new Date(timelineStart).toISOString();
            const endISO = new Date(timelineEnd).toISOString();

            console.log('📅 Triggering timeline update:', { taskId: id, startISO, endISO });

            const result = await triggerTimelineUpdate(id, startISO, endISO);
            console.log('📅 Timeline update result:', result);

            setSuccessMessage('Timeline updated! Google Calendar sync triggered.');
            setShowTimelineModal(false);

            // Refresh task data
            setTimeout(fetchTask, 1000);
        } catch (err) {
            console.error('Error updating timeline:', err);
            setError(err.message || 'Failed to update timeline');
        } finally {
            setTimelineLoading(false);
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

            {/* Calendar Conflict Warning */}
            {task.has_conflict && (
                <div style={{
                    background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                    border: '1px solid #F59E0B',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px'
                }}>
                    <span style={{ fontSize: '24px' }}>⚠️</span>
                    <div>
                        <div style={{ fontWeight: '600', color: '#92400E', marginBottom: '4px' }}>
                            Calendar Conflict Detected
                        </div>
                        <div style={{ color: '#B45309', fontSize: '14px' }}>
                            This task's time slot conflicts with: <strong>{task.conflict_with}</strong>
                        </div>
                    </div>
                </div>
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
                    {task.slack_channel && (
                        <div className="detail-item">
                            <div className="detail-label">Slack Channel</div>
                            <div className="detail-value">#{task.slack_channel}</div>
                        </div>
                    )}
                    <div className="detail-item">
                        <div className="detail-label">Conflicting Task</div>
                        <div className="detail-value" style={{
                            color: task.has_conflict ? '#DC2626' : '#10B981',
                            fontWeight: '500'
                        }}>
                            {task.has_conflict ? (
                                <span>⚠️ {task.conflict_with || 'Unknown conflict'}</span>
                            ) : (
                                <span>✅ No conflicts</span>
                            )}
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
                {task.calendar_event_id && task.status !== 'completed' && (
                    <button
                        className="btn btn-primary"
                        onClick={handleOpenTimelineModal}
                        disabled={actionLoading}
                    >
                        📅 Update Task Timeline
                    </button>
                )}
                <button
                    className="btn btn-secondary"
                    onClick={() => navigate('/')}
                >
                    ← Back to Dashboard
                </button>
            </div>

            {/* Timeline Update Modal */}
            {showTimelineModal && (
                <div className="modal-overlay" onClick={() => setShowTimelineModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{
                        background: 'white',
                        borderRadius: '12px',
                        padding: '24px',
                        maxWidth: '450px',
                        width: '90%',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    }}>
                        <h2 style={{ marginTop: 0, marginBottom: '20px' }}>📅 Update Task Timeline</h2>

                        <div className="form-group" style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                                Start Time
                                {isRecommendedStart && (
                                    <span style={{
                                        marginLeft: '8px',
                                        fontSize: '12px',
                                        color: '#059669',
                                        background: '#D1FAE5',
                                        padding: '2px 8px',
                                        borderRadius: '4px'
                                    }}>
                                        Recommended
                                    </span>
                                )}
                            </label>
                            <input
                                type="datetime-local"
                                value={timelineStart}
                                onChange={handleStartChange}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    border: '1px solid #D1D5DB',
                                    borderRadius: '8px',
                                    fontSize: '14px'
                                }}
                            />
                        </div>

                        <div className="form-group" style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                                Deadline (End Time)
                            </label>
                            <input
                                type="datetime-local"
                                value={timelineEnd}
                                onChange={(e) => setTimelineEnd(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    border: '1px solid #D1D5DB',
                                    borderRadius: '8px',
                                    fontSize: '14px'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowTimelineModal(false)}
                                disabled={timelineLoading}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleTimelineSubmit}
                                disabled={timelineLoading || !timelineStart || !timelineEnd}
                            >
                                {timelineLoading ? (
                                    <>
                                        <LoadingSpinner /> Updating...
                                    </>
                                ) : (
                                    '📅 Update Calendar'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TaskDetail;
