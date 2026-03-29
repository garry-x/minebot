import React from 'react';
import './ActionLog.css';

const ActionLog = ({ logs }) => {
  return (
    <div className="action-log-container">
      <div className="action-log-title">Recent Actions</div>
      <div className="action-log-list">
        {logs.map((log, index) => (
          <div 
            key={index} 
            className={`action-log-item ${log.type}`}
          >
            <div className="action-time">{log.timestamp}</div>
            <div className="action-text">{log.text}</div>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="action-log-empty">No actions yet</div>
        )}
      </div>
    </div>
  );
};

export default ActionLog;