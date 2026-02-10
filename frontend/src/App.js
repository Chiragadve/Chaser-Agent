import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import CreateTask from './pages/CreateTask';
import TaskDetail from './pages/TaskDetail';

function NotFound() {
    return (
        <div className="not-found">
            <h1>404</h1>
            <p>Page not found</p>
            <a href="/" className="btn btn-primary">Back to Dashboard</a>
        </div>
    );
}

function App() {
    return (
        <div className="app">
            <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/tasks/new" element={<CreateTask />} />
                <Route path="/tasks/:id" element={<TaskDetail />} />
                <Route path="*" element={<NotFound />} />
            </Routes>
        </div>
    );
}

export default App;
