import React from 'react';

/**
 * LoadingSpinner Component
 * Simple spinner for loading states
 */
function LoadingSpinner({ size = 'default', centered = false }) {
    const spinnerClass = size === 'large' ? 'loading-spinner spinner-lg' : 'loading-spinner';

    if (centered) {
        return (
            <div className="loading-container">
                <div className={spinnerClass}></div>
            </div>
        );
    }

    return <div className={spinnerClass}></div>;
}

export default LoadingSpinner;
