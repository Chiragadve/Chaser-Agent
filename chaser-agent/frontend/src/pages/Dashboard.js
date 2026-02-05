import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getTasks, getUpcomingChasers, getStats } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import PriorityBadge from '../components/PriorityBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

/**
 * Dashboard Page
 * Main page showing tasks list, stats, and upcoming chasers
 */
function Dashboard() {
    const navigate = useNavigate();
    const [tasks, setTasks] = useState([]);
    const [upcomingChasers, setUpcomingChasers] = useState([]);
    const [stats, setStats] = useState({ totalTasks: 0, pendingTasks: 0, chasersSentToday: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

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

    // Calculate relative time for upcoming chasers
    const getRelativeTime = (dateString) => {
        if (!dateString) return '';
        const now = new Date();
        const scheduled = new Date(dateString);
        const diffMs = scheduled - now;

        if (diffMs < 0) return 'Overdue';

        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 60) return `In ${diffMins} minute${diffMins !== 1 ? 's' : ''}`;

        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `In ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;

        const diffDays = Math.floor(diffHours / 24);
        return `In ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    };

    // Check if task is overdue
    const isOverdue = (task) => {
        if (task.status === 'completed') return false;
        return new Date(task.due_date) < new Date();
    };

    // Fetch all data
    const fetchData = useCallback(async () => {
        try {
            const [tasksData, chasersData, statsData] = await Promise.all([
                getTasks(),
                getUpcomingChasers(),
                getStats()
            ]);
            setTasks(tasksData || []);
            setUpcomingChasers(chasersData || []);
            setStats(statsData || { totalTasks: 0, pendingTasks: 0, chasersSentToday: 0 });
            setError(null);
        } catch (err) {
            console.error('Error fetching dashboard data:', err);
            setError(err.message || 'Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial fetch and auto-refresh every 30 seconds
    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    if (loading) {
        return <LoadingSpinner size="large" centered />;
    }

    return (
        <>
            {/* Header */}
            <header className="header">
                <div className="header-content">
                    <h1>
                        <span>📬</span> Chaser Agent
                    </h1>
                    <Link to="/tasks/new" className="btn btn-primary">
                        + New Task
                    </Link>
                </div>
            </header>

            {/* Main Content */}
            <div className="dashboard-layout">
                {/* Main Section */}
                <main>
                    {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

                    {/* Stats Cards */}
                    <div className="stats-grid">
                        <div className="stat-card">
                            <div className="stat-label">Total Tasks</div>
                            <div className="stat-value">{stats.totalTasks}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Pending Tasks</div>
                            <div className="stat-value">{stats.pendingTasks}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Chasers Sent Today</div>
                            <div className="stat-value">{stats.chasersSentToday}</div>
                        </div>
                    </div>

                    {/* Tasks Table */}
                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title">Tasks</h2>
                        </div>

                        {tasks.length === 0 ? (
                            <div className="empty-state">
                                <p>No tasks yet. Create your first task to get started!</p>
                            </div>
                        ) : (
                            <div className="table-wrapper">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Title</th>
                                            <th>Assignee</th>
                                            <th>Due Date</th>
                                            <th>Status</th>
                                            <th>Priority</th>
                                            <th>Chasers</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tasks.map((task) => (
                                            <tr key={task.id}>
                                                <td>
                                                    <strong>{task.title}</strong>
                                                </td>
                                                <td>
                                                    <div>{task.assignee_name || '-'}</div>
                                                    <div style={{ fontSize: '12px', color: '#6B7280' }}>
                                                        {task.assignee_email}
                                                    </div>
                                                </td>
                                                <td>{formatDate(task.due_date)}</td>
                                                <td>
                                                    <StatusBadge status={isOverdue(task) ? 'overdue' : task.status} />
                                                </td>
                                                <td>
                                                    <PriorityBadge priority={task.priority} />
                                                </td>
                                                <td>
                                                    <span style={{ fontWeight: 500 }}>
                                                        {task.total_chasers_sent || 0} sent
                                                    </span>
                                                    {task.pending_chasers_count > 0 && (
                                                        <span style={{ color: '#6B7280', fontSize: '12px' }}>
                                                            {' '}({task.pending_chasers_count} pending)
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        onClick={() => navigate(`/tasks/${task.id}`)}
                                                    >
                                                        View
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </main>

                {/* Sidebar */}
                <aside className="sidebar">
                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title">⏰ Upcoming Chasers</h2>
                        </div>

                        {upcomingChasers.length === 0 ? (
                            <div className="empty-state">
                                No upcoming chasers scheduled
                            </div>
                        ) : (
                            <ul className="upcoming-list">
                                {upcomingChasers.map((chaser) => (
                                    <li key={chaser.id} className="upcoming-item">
                                        <div className="upcoming-time">
                                            {getRelativeTime(chaser.scheduled_at)}
                                        </div>
                                        <div className="upcoming-task">
                                            Remind {chaser.assignee_name || 'assignee'} about{' '}
                                            <strong>{chaser.task_title}</strong>
                                        </div>
                                        <div className="upcoming-assignee">
                                            {chaser.recipient_email}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </aside>
            </div>
        </>
    );
}

export default Dashboard;
