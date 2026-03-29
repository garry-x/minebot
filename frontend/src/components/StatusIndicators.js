import React from 'react';
import './StatusIndicators.css';

const StatusIndicators = ({ health, food, experience, gamemode }) => {
  const xpPercentage = Math.min((experience / 1000) * 100, 100); // Assuming 1000 XP for level
  
  return (
    <div className="status-indicators-container">
      <div className="status-indicators-title">Status</div>
      <div className="status-indicators-grid">
        <div className="status-item">
          <div className="status-label">Health</div>
          <div className="status-bar">
            <div 
              className="status-bar-fill health"
              style={{ width: `${health * 5}%` }}
            >
              <div className="status-bar-text">{health}/20</div>
            </div>
          </div>
        </div>
        
        <div className="status-item">
          <div className="status-label">Food</div>
          <div className="status-bar">
            <div 
              className="status-bar-fill food"
              style={{ width: `${food * 5}%` }}
            >
              <div className="status-bar-text">{food}/20</div>
            </div>
          </div>
        </div>
        
        <div className="status-item">
          <div className="status-label">Experience</div>
          <div className="status-bar">
            <div 
              className="status-bar-fill experience"
              style={{ width: `${xpPercentage}%` }}
            >
              <div className="status-bar-text">{experience} XP</div>
            </div>
          </div>
        </div>
        
        <div className="status-item">
          <div className="status-label">Gamemode</div>
          <div className="status-value">{gamemode}</div>
        </div>
      </div>
    </div>
  );
};

export default StatusIndicators;