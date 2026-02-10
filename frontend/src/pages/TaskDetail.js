import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getTask, updateTask, triggerTimelineUpdate, sendNudge } from '../services/api';
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
    const [newDeadline, setNewDeadline] = useState('');
    const [recommendedDeadline, setRecommendedDeadline] = useState('');
    const [isRecommendedDeadline, setIsRecommendedDeadline] = useState(true);
    const [timelineLoading, setTimelineLoading] = useState(false);
    const [nudgeLoading, setNudgeLoading] = useState(false);

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

        // Use the latest conflict event's end time + 30 min as recommended deadline
        if (task?.conflict_end_time) {
            const conflictEnd = new Date(task.conflict_end_time);
            conflictEnd.setMinutes(conflictEnd.getMinutes() + 30); // Add 30 min buffer
            recommended = toLocalDatetime(conflictEnd.toISOString());
        } else if (task?.due_date) {
            // Fallback to current due_date
            recommended = toLocalDatetime(task.due_date);
        } else {
            // Fallback to 24 hours from now
            const tomorrow = new Date();
            tomorrow.setHours(tomorrow.getHours() + 24);
            recommended = toLocalDatetime(tomorrow.toISOString());
        }

        setRecommendedDeadline(recommended);
        setNewDeadline(recommended);
        setIsRecommendedDeadline(true);
        setShowTimelineModal(true);
    };

    // Handle deadline change
    const handleDeadlineChange = (e) => {
        const value = e.target.value;
        setNewDeadline(value);
        setIsRecommendedDeadline(value === recommendedDeadline);
    };

    // Handle timeline update submit
    const handleTimelineSubmit = async () => {
        if (!newDeadline) {
            setError('Please set a deadline');
            return;
        }

        setTimelineLoading(true);
        setError(null);

        try {
            const deadlineISO = new Date(newDeadline).toISOString();
            // Calendar event is 1 minute at deadline time
            const eventEndISO = new Date(new Date(newDeadline).getTime() + 60000).toISOString();

            console.log('📅 Triggering deadline update:', { taskId: id, deadline: deadlineISO });

            const result = await triggerTimelineUpdate(id, deadlineISO, eventEndISO);
            console.log('📅 Deadline update result:', result);

            setSuccessMessage('Deadline updated! Google Calendar sync triggered.');
            setShowTimelineModal(false);

            // Refresh task data
            setTimeout(fetchTask, 1000);
        } catch (err) {
            console.error('Error updating deadline:', err);
            setError(err.message || 'Failed to update deadline');
        } finally {
            setTimelineLoading(false);
        }
    };

    // Handle manual nudge
    const handleNudge = async () => {
        setNudgeLoading(true);
        setSuccessMessage(null);
        setError(null);

        try {
            await sendNudge(id, { email: true, slack: true });
            setSuccessMessage('👋 Nudge sent successfully via Email & Slack!');

            // Refresh chaser history after a delay
            setTimeout(fetchTask, 2000);
        } catch (err) {
            console.error('Error sending nudge:', err);
            setError(err.message || 'Failed to send nudge');
        } finally {
            setNudgeLoading(false);
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
                    className="btn btn-warning"
                    onClick={handleNudge}
                    disabled={nudgeLoading || actionLoading}
                    style={{ backgroundColor: '#F59E0B', borderColor: '#D97706', color: 'white' }}
                >
                    {nudgeLoading ? (
                        <>
                            <LoadingSpinner /> Nudging...
                        </>
                    ) : (
                        '👋 Nudge User'
                    )}
                </button>
                <button
                    className="btn btn-secondary"
                    onClick={() => navigate('/')}
                >
                    ← Back to Dashboard
                </button>
            </div>

            {/* Deadline Update Modal */}
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
                        <h2 style={{ marginTop: 0, marginBottom: '20px' }}>📅 Update Deadline</h2>

                        <div className="form-group" style={{ marginBottom: '24px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                                New Deadline
                                {isRecommendedDeadline && (
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
                                value={newDeadline}
                                onChange={handleDeadlineChange}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    border: '1px solid #D1D5DB',
                                    borderRadius: '8px',
                                    fontSize: '14px'
                                }}
                            />
                            <small style={{ color: '#6B7280', marginTop: '6px', display: 'block' }}>
                                Recommended based on your latest calendar commitments
                            </small>
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
                                disabled={timelineLoading || !newDeadline}
                            >
                                {timelineLoading ? (
                                    <>
                                        <LoadingSpinner /> Updating...
                                    </>
                                ) : (
                                    '📅 Update Deadline'
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
