import React from 'react';
import './ConnectionStatus.css';

const ConnectionStatus = ({ connected }) => {
  return (
    <div className="connection-status-container">
      <div className="connection-status-title">Connection</div>
      <div className="connection-status-indicator">
        <div 
          className={`connection-status-dot ${connected ? 'connected' : 'disconnected'}`}
        ></div>
        <div className="connection-status-text">
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
    </div>
  );
};

export default ConnectionStatus;