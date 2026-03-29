import React from 'react';
import './ResourceBars.css';

const ResourceBars = ({ inventory }) => {
  const resources = [
    { name: 'Wood', icon: '🌳', color: '#8b5e3c', max: 64 },
    { name: 'Stone', icon: '🪨', color: '#64748b', max: 64 },
    { name: 'Food', icon: '🍖', color: '#f59e0b', max: 20 },
    { name: 'Health', icon: '❤️', color: '#ef4444', max: 20 }
  ];
  
  return (
    <div className="resource-bars-container">
      <div className="resource-bars-title">Resources</div>
      {resources.map((resource) => {
        const amount = inventory.find(item => item.type.toLowerCase() === resource.name.toLowerCase())?.count || 0;
        const percentage = Math.min((amount / resource.max) * 100, 100);
        
        return (
          <div key={resource.name} className="resource-bar-item">
            <div className="resource-label">
              <span className="resource-icon">{resource.icon}</span>
              <span>{resource.name}</span>
            </div>
            <div className="resource-bar-track">
              <div 
                className="resource-bar-fill" 
                style={{ width: `${percentage}%`, backgroundColor: resource.color }}
              >
                <div className="resource-bar-text">{amount}/{resource.max}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ResourceBars;