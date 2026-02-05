import React from 'react';

/**
 * ErrorMessage Component
 * Displays error messages in a styled box
 */
function ErrorMessage({ message, onDismiss }) {
    if (!message) return null;

    return (
        <div className="error-message">
            {message}
            {onDismiss && (
                <button
                    onClick={onDismiss}
                    style={{
                        float: 'right',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '16px'
                    }}
                >
                    ×
                </button>
            )}
        </div>
    );
}

export default ErrorMessage;
