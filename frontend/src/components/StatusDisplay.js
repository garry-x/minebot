import React from 'react';

const StatusDisplay = ({ botStatus, position, inventory, logs, llmAdvice }) => {
  return (
    <div className="status-display">
      <h3>Bot Status</h3>
      <div className="status-item">
        <strong>Connection:</strong> 
        <span className={botStatus.connected ? 'connected' : 'disconnected'}>
          {botStatus.connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      <div className="status-item">
        <strong>Message:</strong> {botStatus.message || 'No status'}
      </div>
      
      <div className="status-item">
        <strong>Position:</strong> 
        ({position.x}, {position.y}, {position.z})
      </div>
      
      <div className="status-item">
        <strong>Inventory:</strong> {inventory.length} items
        {inventory.length > 0 && (
          <ul>
            {inventory.map((item, index) => (
              <li key={index}>
                {item.type}: {item.count || 1}
              </li>
            ))}
          </ul>
        )}
      </div>
      
      <div className="status-item">
        <strong>LLM Advice:</strong>
        <p style={{ fontStyle: 'italic', color: '#666' }}>
          {llmAdvice || 'No advice yet'}
        </p>
      </div>
      
      <div className="status-item">
        <strong>Activity Log:</strong>
        <div className="log-container">
          {logs.map((log, index) => (
            <div key={index} className={`log-entry ${log.type || ''}`}>
              <span className="timestamp">[{log.timestamp}]</span>
              <span className="text">{log.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StatusDisplay;