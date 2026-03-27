import React, { useState, useEffect } from 'react';
import BotControls from './BotControls';
import StatusDisplay from './StatusDisplay';
import io from 'socket.io-client';

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

  useEffect(() => {
    // Connect to WebSocket for real-time updates
    const socket = io(process.env.REACT_APP_API_URL || window.location.origin);
    
    socket.on('status_update', (data) => {
      setBotStatus(data.data);
      if (data.data.position) {
        setPosition(data.data.position);
      }
      if (data.data.inventory) {
        setInventory(data.data.inventory);
      }
      if (data.data.health !== undefined) {
        setHealth(data.data.health);
      }
      if (data.data.food !== undefined) {
        setFood(data.data.food);
      }
      if (data.data.experience !== undefined) {
        setExperience(data.data.experience);
      }
      if (data.data.gamemode !== undefined) {
        setGamemode(data.data.gamemode);
      }
      if (data.data.message) {
        setLogs(prev => [...prev, { 
          text: data.data.message, 
          timestamp: new Date().toLocaleTimeString() 
        }]);
        // Keep only last 50 logs
        if (logs.length > 50) setLogs(prev => prev.slice(-50));
      }
    });
    
    socket.on('llm_advice', (data) => {
      setLlmAdvice(data.advice);
    });
    
    return () => socket.disconnect();
  }, []);

  const handleStartBot = async () => {
    try {
      const response = await fetch('/api/bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          accessToken: user.accessToken // In real app, this would come from auth flow
        })
      });
      
      if (!response.ok) throw new Error('Failed to start bot');
      
      // In a real implementation, we'd get the botId and store it
    } catch (error) {
      setLogs(prev => [...prev, { 
        text: `Error starting bot: ${error.message}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'error'
      }]);
    }
  };

  const handleStopBot = async () => {
    // In a real implementation, we'd need the botId
    setLogs(prev => [...prev, { 
      text: 'Stopping bot...', 
      timestamp: new Date().toLocaleTimeString() 
    }]);
  };

  const handleGetLLMAdvice = async () => {
    try {
      const response = await fetch('/api/llm/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: `Bot at position (${position.x}, ${position.y}, ${position.z}) with ${inventory.length} items`,
          goal: 'Build a shelter and gather resources',
          current_state: { position, inventory, health, food, experience, gamemode }
        })
      });
      
      if (!response.ok) throw new Error('Failed to get LLM advice');
      
      const data = await response.json();
      // Advice would come via WebSocket in real implementation
      // For demo, we'll update state directly
      setLlmAdvice(data.advice);
    } catch (error) {
      setLogs(prev => [...prev, { 
        text: `Error getting LLM advice: ${error.message}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'error'
      }]);
    }
  };

  const handleStartAutomatic = async () => {
    try {
      const response = await fetch('/api/bot/automatic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          accessToken: user.accessToken,
          mode: 'survival'
        })
      });
      
      if (!response.ok) throw new Error('Failed to start automatic behavior');
      
      setLogs(prev => [...prev, { 
        text: 'Started automatic behavior', 
        timestamp: new Date().toLocaleTimeString(),
        type: 'success'
      }]);
    } catch (error) {
      setLogs(prev => [...prev, { 
        text: `Error starting automatic behavior: ${error.message}`, 
        timestamp: new Date().toLocaleTimeString(),
        type: 'error'
      }]);
    }
  };

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
          <StatusDisplay 
            botStatus={botStatus}
            position={position}
            inventory={inventory}
            logs={logs}
            llmAdvice={llmAdvice}
            health={health}
            food={food}
            experience={experience}
            gamemode={gamemode}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;