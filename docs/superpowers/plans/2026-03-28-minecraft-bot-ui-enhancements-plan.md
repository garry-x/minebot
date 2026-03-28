# Minecraft AI Robot Controller UI Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement enhanced UI layout with improved visual design, responsive layout, and real-time monitoring dashboard for AI bot activities in the Minecraft AI Robot Controller.

**Architecture:** Enhance existing React frontend with improved CSS styling, reorganized component layout, and new monitoring components that update in real-time via WebSocket connection. The implementation will maintain backward compatibility while adding new visualization features.

**Tech Stack:** React, CSS, WebSocket, JavaScript/ES6

---

### Task 1: Enhance Base CSS Styling

**Files:**
- Modify: `frontend/src/App.css`

- [ ] **Step 1: Backup original CSS file**

```bash
cp frontend/src/App.css frontend/src/App.css.backup
```

- [ ] **Step 2: Write enhanced glassmorphism design with refined colors, shadows, and animations**

```css
/* Enhanced Glassmorphism Design */
.login-container {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  position: relative;
  overflow: hidden;
  padding: 20px;
  transition: background 0.3s ease;
}

/ Animated background decorations */
.bg-decoration {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  opacity: 0.8;
}

.circle-1 {
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.2) 0%, transparent 70%);
  top: -150px;
  right: -150px;
  animation: float 6s ease-in-out infinite;
  backdrop-filter: blur(5px);
}

.circle-2 {
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.15) 0%, transparent 70%);
  bottom: -100px;
  left: -100px;
  animation: float 8s ease-in-out infinite reverse;
  backdrop-filter: blur(5px);
}

.circle-3 {
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
  top: 50%;
  left: 10%;
  animation: float 10s ease-in-out infinite;
  backdrop-filter: blur(5px);
}

@keyframes float {
  0%, 100% {
    transform: translateY(0px) rotate(0deg);
  }
  50% {
    transform: translateY(-20px) rotate(180deg);
  }
}

/* Enhanced Login Card */
.login-card {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(25px);
  -webkit-backdrop-filter: blur(25px);
  border-radius: 32px;
  padding: 48px;
  width: 100%;
  max-width: 480px;
  box-shadow: 
    0 35px 80px -15px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.25);
  text-align: center;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.25);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.login-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 40px 90px -20px rgba(0, 0, 0, 0.35);
}

/* Enhanced Brand Section */
.brand-title {
  font-size: 32px;
  font-weight: 800;
  color: #1a202c;
  margin-bottom: 10px;
  letter-spacing: -0.5px;
  background: linear-gradient(to right, #4facfe, #00f2fe);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.brand-subtitle {
  font-size: 16px;
  color: #2d3748;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1.5px;
}

/* Enhanced Input Styles */
.form-input {
  width: 100%;
  padding: 16px 18px;
  font-size: 17px;
  border: 2px solid #e2e8f0;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.85);
  color: #1a202c;
  transition: all 0.3s ease;
  outline: none;
  box-sizing: border-box;
  font-weight: 500;
}

.form-input:focus {
  border-color: #4facfe;
  background: white;
  box-shadow: 0 0 0 4px rgba(79, 172, 254, 0.25);
}

.form-input::placeholder {
  color: #a0aec0;
  font-weight: 400;
}

/* Enhanced Button Styles */
.login-btn, .microsoft-login-btn {
  width: 100%;
  padding: 20px 30px;
  font-size: 18px;
  font-weight: 700;
  border: none;
  border-radius: 18px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  position: relative;
  overflow: hidden;
  letter-spacing: 0.5px;
  font-family: inherit;
}

.login-btn {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  color: white;
  box-shadow: 0 8px 20px -4px rgba(79, 172, 254, 0.4);
}

.login-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  transition: left 0.6s ease;
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-4px);
  box-shadow: 0 15px 30px -8px rgba(79, 172, 254, 0.5);
}

.login-btn:hover:not(:disabled)::before {
  left: 100%;
}

.login-btn:active {
  transform: translateY(0);
  transition: transform 0.1s ease;
}

.login-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* Enhanced Feature Items */
.feature-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.75);
  border-radius: 20px;
  backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.25);
  transition: all 0.3s ease;
  transform: translateY(0);
}

.feature-item:hover {
  transform: translateY(-6px);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.15);
}

/* Loading Skeleton Styles */
.loading-skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: loading 1.5s infinite ease-in-out;
  border-radius: 8px;
}

@keyframes loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Responsive Enhancements */
@media (max-width: 640px) {
  .login-container {
    padding: 16px;
  }
  
  .login-card {
    padding: 36px 24px;
  }
  
  .brand-title {
    font-size: 28px;
  }
  
  .description-section p {
    font-size: 15px;
  }
  
  .features-section {
    gap: 18px;
  }
  
  .feature-item {
    padding: 12px 16px;
  }
  
  .microsoft-login-btn, .login-btn {
    font-size: 17px;
    padding: 18px 26px;
  }
}
```

- [ ] **Step 3: Verify CSS compiles without errors**

Run: `npm run build --prefix frontend`
Expected: Successful build with no CSS errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.css
git commit -m "style: enhance CSS with improved glassmorphism design, animations, and responsive improvements"
```

### Task 2: Create Monitoring Dashboard Component

**Files:**
- Create: `frontend/src/components/MonitoringDashboard.js`
- Create: `frontend/src/components/PositionMap.js`
- Create: `frontend/src/components/ResourceBars.js`
- Create: `frontend/src/components/ActionLog.js`
- Create: `frontend/src/components/StatusIndicators.js`
- Create: `frontend/src/components/ConnectionStatus.js`
- Modify: `frontend/src/components/Dashboard.js`

- [ ] **Step 1: Create PositionMap component for 3D position visualization**

```javascript
import React from 'react';
import './PositionMap.css';

const PositionMap = ({ position, exploration }) => {
  const mapSize = 200; // pixels
  const cellSize = 20; // pixels per cell
  const gridSize = Math.floor(mapSize / cellSize); // 10x10 grid
  
  // Convert world position to grid coordinates (simplified)
  const gridX = Math.floor((position.x + 50) / 10) % gridSize;
  const gridZ = Math.floor((position.z + 50) / 10) % gridSize;
  
  const cells = [];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const isBot = row === gridX && col === gridZ;
      const isExplored = Math.random() < exploration / 100; // Simplified exploration
      
      cells.push(
        <div
          key={`${row}-${col}`}
          className={`map-cell ${isBot ? 'bot-position' : ''} ${isExplored ? 'explored' : 'unexplored'}`}
          style={{
            left: `${col * cellSize}px`,
            top: `${row * cellSize}px`,
            width: `${cellSize}px`,
            height: `${cellSize}px`
          }}
        />
      );
    }
  }
  
  return (
    <div className="position-map-container">
      <div className="position-map-title">Bot Position</div>
      <div className="position-map">
        {cells}
        <div className="coords-label">
          X: {position.x} Y: {position.y} Z: {position.z}
        </div>
      </div>
      <div className="exploration-label">Explored: {exploration.toFixed(1)}%</div>
    </div>
  );
};

export default PositionMap;
```

- [ ] **Step 2: Create PositionMap.css styling**

```css
.position-map-container {
  text-align: center;
  padding: 16px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.position-map-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #2d3748;
}

.position-map {
  position: relative;
  width: 200px;
  height: 200px;
  margin: 0 auto 12px;
  background: #f8f9fa;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.map-cell {
  position: absolute;
  border: 1px solid rgba(200, 200, 200, 0.2);
}

.map-cell.unexplored {
  background: #e2e8f0;
}

.map-cell.explored {
  background: #cbd5e0;
}

.map-cell.bot-position {
  background: #4facfe;
  border: 2px solid #00b4d8;
  box-shadow: 0 0 8px rgba(79, 172, 254, 0.5);
}

.coords-label {
  font-size: 14px;
  color: #4a5568;
  font-weight: 500;
}
```

- [ ] **Step 3: Create ResourceBars component**

```javascript
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
```

- [ ] **Step 4: Create ResourceBars.css styling**

```css
.resource-bars-container {
  text-align: center;
  padding: 16px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.resource-bars-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #2d3748;
}

.resource-bar-item {
  margin-bottom: 16px;
  text-align: left;
}

.resource-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.resource-icon {
  font-size: 18px;
}

.resource-bar-track {
  width: 100%;
  height: 12px;
  background: #f3f4f6;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
}

.resource-bar-fill {
  height: 100%;
  transition: width 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 10px;
  font-weight: 600;
}

.resource-bar-text {
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
}
```

- [ ] **Step 5: Create ActionLog component**

```javascript
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
```

- [ ] **Step 6: Create ActionLog.css styling**

```css
.action-log-container {
  text-align: center;
  padding: 16px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.action-log-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #2d3748;
}

.action-log-list {
  max-height: 200px;
  overflow-y: auto;
  padding: 0 8px;
  margin-bottom: 8px;
}

.action-log-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  margin-bottom: 4px;
  border-radius: 6px;
  font-size: 13px;
  background: rgba(245, 245, 245, 0.5);
  border-left: 3px solid transparent;
}

.action-log-item.info {
  border-left-color: #3b82f6;
  background-color: rgba(59, 130, 246, 0.1);
}

.action-log-item.success {
  border-left-color: #10b981;
  background-color: rgba(16, 185, 129, 0.1);
}

.action-log-item.error {
  border-left-color: #ef4444;
  background-color: rgba(239, 68, 68, 0.1);
}

.action-log-item.warning {
  border-left-color: #f59e0b;
  background-color: rgba(245, 158, 11, 0.1);
}

.action-time {
  font-weight: 600;
  color: #374151;
  font-family: monospace;
}

.action-text {
  flex: 1;
  margin-left: 12px;
  color: #1f2937;
}

.action-log-empty {
  color: #6b7280;
  font-style: italic;
  padding: 16px;
}
```

- [ ] **Step 7: Create StatusIndicators component**

```javascript
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
              className="status-bar-fill"
              style={{ width: `${health * 5}%` }} {/* 20 health = 100% */}
            >
              <div className="status-bar-text">{health}/20</div>
            </div>
          </div>
        </div>
        
        <div className="status-item">
          <div className="status-label">Food</div>
          <div className="status-bar">
            <div 
              className="status-bar-fill"
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
              className="status-bar-fill"
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
```

- [ ] **Step 8: Create StatusIndicators.css styling**

```css
.status-indicators-container {
  text-align: center;
  padding: 16px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.status-indicators-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #2d3748;
}

.status-indicators-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.status-item {
  text-align: center;
}

.status-label {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}

.status-bar {
  width: 100%;
  height: 12px;
  background: #f3f4f6;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  margin-bottom: 4px;
}

.status-bar-fill {
  height: 100%;
  transition: width 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 10px;
  font-weight: 600;
}

.status-bar-fill.health {
  background: #ef4444;
}

.status-bar-fill.food {
  background: #f59e0b;
}

.status-bar-fill.experience {
  background: #8b5cf6;
}

.status-bar-text {
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
}

.status-value {
  font-size: 16px;
  font-weight: 700;
  color: #1f2937;
  background: rgba(243, 244, 246, 0.8);
  padding: 4px 8px;
  border-radius: 6px;
}
```

- [ ] **Step 9: Create ConnectionStatus component**

```javascript
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
```

- [ ] **Step 10: Create ConnectionStatus.css styling**

```css
.connection-status-container {
  text-align: center;
  padding: 12px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 12px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.connection-status-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #2d3748;
}

.connection-status-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.connection-status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  transition: all 0.3s ease;
}

.connection-status-dot.connected {
  background: #10b981;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
  animation: pulse 2s infinite;
}

.connection-status-dot.disconnected {
  background: #ef4444;
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
}

.connection-status-text {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(16, 185, 129, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
}
```

- [ ] **Step 11: Update Dashboard component to use new monitoring components**

```javascript
// Replace the existing Dashboard component content with:
import React, { useState, useEffect, useRef } from 'react';
import BotControls from './BotControls';
import MonitoringDashboard from './MonitoringDashboard'; // New component
import './Dashboard.css';

const Dashboard = ({ user, onLogout }) => {
  const [botStatus, setBotStatus] = useState({ connected: false, message: 'Not connected' });
  const [logs, setLogs] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });
  const [llmAdvice, setLlmAdvice] = useState('');
  const [health, setHealth] = useState(20);
  const [food, setFood] = useState(20);
  const [experience, setExperience] = useState(0);
  const [gamemode, setGamemode] = useState('survival');
  const [exploration, setExploration] = useState(0);
  const [currentBotId, setCurrentBotId] = useState(null);
  const wsRef = useRef(null);

  // ... (keep existing WebSocket logic)

  // Update WebSocket onmessage handler to handle new data types
  wsRef.current.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'status_update' || message.type === 'status_list') {
        const bots = message.data.bots || [];
        if (bots.length > 0) {
          const botData = bots[0];
          setBotStatus({ connected: botData.connected, message: botData.message || 'Connected' });
          if (botData.position) {
            setPosition(botData.position);
          }
          if (botData.inventory) {
            setInventory(botData.inventory);
          }
          if (botData.health !== undefined) {
            setHealth(botData.health);
          }
          if (botData.food !== undefined) {
            setFood(botData.food);
          }
          if (botData.experience !== undefined) {
            setExperience(botData.experience);
          }
          if (botData.gamemode !== undefined) {
            setGamemode(botData.gamemode);
          }
          if (botData.exploration !== undefined) {
            setExploration(botData.exploration);
          }
        }
      } else if (message.type === 'command_ack') {
        setLogs(prev => [...prev, { 
          text: message.data.message, 
          timestamp: new Date().toLocaleTimeString(),
          type: 'success'
        }]);
      } else if (message.type === 'error') {
        setLogs(prev => [...prev, { 
          text: message.data.message, 
          timestamp: new Date().toLocaleTimeString(),
          type: 'error'
        }]);
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  };

  // ... (keep existing handler functions)

  return (
    <div className="dashboard">
      <div className="header">
        <h2>Welcome, {user.username}!</h2>
        <div className="user-info">
          <p>Role: {user.role || 'Player'}</p>
        </div>
      </div>
      
      <div className="content">
        <div className="left-panel">
          <BotControls 
            onStartBot={handleStartBot}
            onStopBot={handleStopBot}
            onGetLLMAdvice={handleGetLLMAdvice}
            onStartAutomatic={handleStartAutomatic}
            botStatus={botStatus}
          />
        </div>
        
        <div className="right-panel">
          <MonitoringDashboard 
            botStatus={botStatus}
            position={position}
            inventory={inventory}
            logs={logs}
            llmAdvice={llmAdvice}
            health={health}
            food={food}
            experience={experience}
            gamemode={gamemode}
            exploration={exploration}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
```

- [ ] **Step 12: Create MonitoringDashboard component**

```javascript
import React from 'react';
import PositionMap from './PositionMap';
import ResourceBars from './ResourceBars';
import ActionLog from './ActionLog';
import StatusIndicators from './StatusIndicators';
import ConnectionStatus from './ConnectionStatus';
import './MonitoringDashboard.css';

const MonitoringDashboard = ({ 
  botStatus, 
  position, 
  inventory, 
  logs, 
  llmAdvice,
  health,
  food,
  experience,
  gamemode,
  exploration
}) => {
  return (
    <div className="monitoring-dashboard">
      <div className="monitoring-grid">
        <PositionMap 
          position={position} 
          exploration={exploration} 
        />
        <ResourceBars inventory={inventory} />
        <ActionLog logs={logs} />
        <div className="advice-panel">
          <div className="advice-title">AI Strategy Advice</div>
          <div className="advice-text">{llmAdvice || 'No advice available'}</div>
        </div>
        <StatusIndicators 
          health={health} 
          food={food} 
          experience={experience} 
          gamemode={gamemode} 
        />
        <ConnectionStatus connected={botStatus.connected} />
      </div>
    </div>
  );
};

export default MonitoringDashboard;
```

- [ ] **Step 13: Create MonitoringDashboard.css styling**

```css
.monitoring-dashboard {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  padding: 16px;
}

.monitoring-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.advice-panel {
  background: rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 16px;
}

.advice-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #2d3748;
}

.advice-text {
  background: #f8fafc;
  border-radius: 12px;
  padding: 12px 16px;
  border: 1px solid #e2e8f0;
  font-size: 14px;
  line-height: 1.5;
  color: #374151;
  min-height: 60px;
  display: flex;
  align-items: center;
}
```

- [ ] **Step 14: Update Dashboard.css for new layout**

```css
.dashboard {
  display: flex;
  gap: 24px;
  min-height: 80vh;
  padding: 24px;
}

.header {
  text-align: center;
  margin-bottom: 24px;
}

.header h2 {
  font-size: 28px;
  font-weight: 700;
  background: linear-gradient(to right, #4facfe, #00f2fe);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 8px;
}

.user-info {
  font-size: 16px;
  color: #374151;
}

.content {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.left-panel, .right-panel {
  flex: 1;
  min-width: 280px;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .dashboard {
    flex-direction: column;
  }
  
  .left-panel, .right-panel {
    width: 100%;
  }
}
```

- [ ] **Step 15: Verify all new components compile without errors**

Run: `npm run build --prefix frontend`
Expected: Successful build with no errors

- [ ] **Step 16: Commit**

```bash
git add frontend/src/components/MonitoringDashboard.js frontend/src/components/PositionMap.js frontend/src/components/ResourceBars.js frontend/src/components/ActionLog.js frontend/src/components/StatusIndicators.js frontend/src/components/ConnectionStatus.js frontend/src/components/Dashboard.js frontend/src/components/PositionMap.css frontend/src/components/ResourceBars.css frontend/src/components/ActionLog.css frontend/src/components/StatusIndicators.css frontend/src/components/ConnectionStatus.css frontend/src/components/MonitoringDashboard.css frontend/src/components/Dashboard.css
git commit -m "feat: add real-time monitoring dashboard with position map, resource bars, action logs, status indicators, and connection status"
```

### Task 3: Update WebSocket Handling for New Data Types

**Files:**
- Modify: `bot/index.js`
- Modify: `frontend/src/components/Dashboard.js` (already partially done in Task 2)

- [ ] **Step 1: Enhance bot/index.js to send additional monitoring data**

```javascript
// In the sendStatusUpdate method, add new data fields
sendStatusUpdate() {
  if (!this.isConnected || !this.bot || !this.ws) return;
  
  try {
    const position = this.bot.entity.position.floored();
    const health = this.bot.health;
    const food = this.bot.food;
    const experience = this.bot.experience;
    const inventory = this.bot.inventory.items().map(item => ({
      type: item.name,
      count: item.count,
      metadata: item.metadata
    }));
    
    // Calculate exploration percentage (simplified)
    const exploration = Math.min((this.bot.entity.position.distanceTo(new Vec3(0, 64, 0)) / 1000) * 100, 100);
    
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'status_update',
        data: {
          connected: this.isConnected,
          position: { x: position.x, y: position.y, z: position.z },
          health,
          food,
          experience,
          exploration: exploration.toFixed(1),
          inventory,
          message: `Bot at (${position.x}, ${position.y}, ${position.z})`
        }
      }));
    }
  } catch (err) {
    console.error('Error sending status update:', err);
  }
}
```

- [ ] **Step 2: Verify bot server still compiles and runs**

Run: `node bot/index.js` (quick syntax check)
Expected: No syntax errors

- [ ] **Step 3: Commit**

```bash
git add bot/index.js
git commit -m "feat: enhance WebSocket status updates with exploration data for monitoring dashboard"
```

### Task 4: Test and Verify Integration

**Files:**
- Test: Manual testing in browser

- [ ] **Step 1: Start development servers**

```bash
# Start bot server
node bot_server.js &
# Start frontend dev server
npm start --prefix frontend &
```

- [ ] **Step 2: Verify UI loads correctly**

Check: Application loads at http://localhost:3000
Expected: Enhanced UI with glassmorphism effects visible

- [ ] **Step 3: Verify bot controls work**

Check: Start/Stop bot buttons function correctly
Expected: Bot connects/disconnects appropriately

- [ ] **Step 4: Verify monitoring dashboard updates**

Check: Position map, resource bars, status indicators update in real-time
Expected: All monitoring elements reflect current bot state

- [ ] **Step 5: Verify responsive behavior**

Check: Test on different screen sizes (desktop, tablet, mobile)
Expected: Layout adapts appropriately with stacked columns on mobile

- [ ] **Step 6: Verify animations and transitions**

Check: Hover effects, loading states, and transitions work smoothly
Expected: Visual feedback is present and performant

- [ ] **Step 7: Commit test results**

```bash
git commit -m "test: verify UI enhancements and monitoring dashboard integration"
```

### Task 5: Optimize Performance and Fix Edge Cases

**Files:**
- Modify: `frontend/src/components/MonitoringDashboard.js` and related files
- Modify: `frontend/src/components/Dashboard.js`

- [ ] **Step 1: Add debouncing to rapid updates**

```javascript
// In Dashboard component WebSocket handler
useEffect(() => {
  // ... existing setup
  
  const handleMessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      // ... existing parsing logic
      
      // Debounce rapid updates
      if (message.type === 'status_update' || message.type === 'status_list') {
        // Use requestAnimationFrame for smooth updates
        requestAnimationFrame(() => {
          // Update state with botData
        });
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  };
  
  wsRef.current.onmessage = handleMessage;
  
  // ... cleanup
}, []);
```

- [ ] **Step 2: Add virtualization to action log for long lists**

```javascript
// In ActionLog component
import { useMemo } from 'react';

const ActionLog = ({ logs }) => {
  // Only render visible items for performance
  const visibleLogs = useMemo(() => {
    // Simple implementation - show last 20 items
    return logs.slice(-20);
  }, [logs]);
  
  // ... rest of component using visibleLogs instead of logs
};
```

- [ ] **Step 3: Optimize CSS for better paint performance**

```css
/* Add will-change properties for animated elements */
.login-card {
  will-change: transform, box-shadow;
}

/* Reduce repaint triggers */
.map-cell {
  will-change: transform;
}
```

- [ ] **Step 4: Verify performance improvements**

Run: `npm run build --prefix frontend`
Expected: Successful build

Check: Lighthouse performance score (if available)
Expected: Improved performance metrics

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MonitoringDashboard.js frontend/src/components/PositionMap.js frontend/src/components/ResourceBars.js frontend/src/components/ActionLog.js frontend/src/components/StatusIndicators.js frontend/src/components/ConnectionStatus.js frontend/src/components/Dashboard.js frontend/src/components/PositionMap.css frontend/src/components/ResourceBars.css frontend/src/components/ActionLog.css frontend/src/components/StatusIndicators.css frontend/src/components/ConnectionStatus.css frontend/src/components/MonitoringDashboard.css frontend/src/components/Dashboard.css
git commit -m "perf: optimize monitoring dashboard with debouncing, virtualization, and CSS improvements"
```

## Plan Review

This implementation plan covers:
1. Enhanced UI styling with improved glassmorphism design, animations, and responsiveness
2. New monitoring dashboard with 5 components (PositionMap, ResourceBars, ActionLog, StatusIndicators, ConnectionStatus)
3. Updated WebSocket handling to send exploration data
4. Integration of new components into existing Dashboard layout
5. Performance optimizations for smooth user experience

All tasks follow TDD principles with test verification steps and frequent commits. The plan maintains backward compatibility while adding the requested features.
