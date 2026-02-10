import React from 'react';

/**
 * PriorityBadge Component
 * Displays a colored badge for task priority
 */
function PriorityBadge({ priority }) {
    const getPriorityClass = () => {
        switch (priority?.toLowerCase()) {
            case 'high':
                return 'badge-high';
            case 'medium':
                return 'badge-medium';
            case 'low':
                return 'badge-low';
            default:
                return 'badge-medium';
        }
    };

    return (
        <span className={`badge ${getPriorityClass()}`}>
            {priority || 'medium'}
        </span>
    );
}

export default PriorityBadge;
