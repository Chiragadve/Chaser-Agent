import React from 'react';

/**
 * StatusBadge Component
 * Displays a colored badge for task status
 */
function StatusBadge({ status }) {
    const getStatusClass = () => {
        switch (status?.toLowerCase()) {
            case 'pending':
                return 'badge-pending';
            case 'completed':
                return 'badge-completed';
            case 'overdue':
                return 'badge-overdue';
            case 'sent':
                return 'badge-sent';
            case 'triggered':
                return 'badge-triggered';
            case 'failed':
                return 'badge-failed';
            case 'cancelled':
                return 'badge-cancelled';
            default:
                return 'badge-pending';
        }
    };

    return (
        <span className={`badge ${getStatusClass()}`}>
            {status || 'unknown'}
        </span>
    );
}

export default StatusBadge;
